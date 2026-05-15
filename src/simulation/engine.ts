/**
 * Discrete-event simulation engine for an apparel sewing line.
 *
 * Model — every operation in a garment bulletin is a "station" with N
 * parallel servers (operators on identical machines). Bundles arrive at
 * the head of the line, queue at each station, get processed, and route to
 * the next operation. When a bundle finishes the last operation, it sinks;
 * lead-time and throughput are recorded.
 *
 * Queueing theory — the line is an open tandem network. Each station is
 * classified in Kendall–Lee notation (M/M/c, M/D/1, M/G/1, M/Ek/1, M/M/c/N,
 * etc.) based on its service distribution, server count, and buffer cap.
 * `simulation/queueing.ts` computes closed-form ρ, Lq, Wq, L, W per station
 * against the observed λ for cross-validation against simulated KPIs.
 *
 * Stochasticism — interarrival times are exponential (Poisson arrivals).
 * Service times are sampled from a per-station distribution defined in
 * `simulation/distributions.ts` (default: uniform ±15 %, Sommerfeld 1990
 * baseline, preserves pre-queueing-theory behaviour).
 *
 * Finite capacity — if a station has a `capacity` < Infinity, bundles
 * arriving when `inSystem ≥ capacity` balk and are dropped. This matches
 * Naidu's "loss system" assumption (Model II / VIII). For apparel reality
 * the more accurate model is "blocking" (upstream server stalls until
 * downstream has space) — TODO for a future iteration.
 *
 * Time unit — the engine is unit-agnostic. `this.time` advances in whatever
 * unit `SimConfig.modelTimeUnit` declares (default 'minute'). All durations
 * in `SimConfig` (op SMV, arrival rate) are denominated in the same unit.
 * Hardcoded `/60` ratios for hour-rate KPIs are routed through
 * `unitToSeconds(unit)` so changing the unit doesn't break per-hour stats.
 * Per the *Big Book of Simulation Modelling* (AnyLogic Ch. 16), this is
 * "model time" — virtual, advances by event-jumps, independent of wall clock.
 *
 * SMV semantics — per-piece (apparel industry convention). A bundle of N
 * pieces at SMV s minutes occupies the station for N × s × variance for
 * the bundle. The per-bundle scaling is applied once in `beginService`.
 */

import type { Operation } from '../domain';
import { MinHeap, mulberry32 } from './priority-queue';
import {
  defaultDist,
  sample,
  scaleDist,
  type ServiceDist,
} from './distributions';
import {
  analyticalKpis,
  classify,
  type AnalyticalKpis,
  type KendallNotation,
  type QueueDiscipline,
} from './queueing';
import { unitToSeconds, type ModelTimeUnit } from './timeUnit';

export interface SimConfig {
  garmentTemplateId: string;
  operations: Operation[];
  /** Number of parallel operators on each operation, indexed identically. */
  stationServers: number[];
  /** Pieces per bundle — affects throughput per arrival but not SMV. */
  bundleSize: number;
  /** Bundle arrivals per hour. Tune to keep the line loaded. */
  arrivalRatePerHour: number;
  /** Coefficient of variation around the SMV mean for the legacy uniform
   *  default. Per-station distributions in `serviceDistributions` override
   *  this for any station that supplies one. */
  smvVariance: number;
  randomSeed: number;
  /**
   * Optional per-operation efficiency multiplier (e.g. 0.85 for an operator
   * running at 85 % of standard). Service time = SMV / efficiency. Missing
   * entries default to 1.0. Sourced from the project's skill matrix.
   */
  opEfficiency?: Record<string, number>;
  /** Per-station service-time distribution. Parallel to `stationServers`.
   *  Entries may be undefined; undefined ⇒ legacy uniform default. */
  serviceDistributions?: (ServiceDist | undefined)[];
  /** Per-station system capacity (queue + in-service). Missing entry or
   *  undefined ⇒ unbounded. */
  stationCapacities?: (number | undefined)[];
  /** Per-station queue discipline. Missing entry or undefined ⇒ FCFS. */
  queueDisciplines?: (QueueDiscipline | undefined)[];
  /**
   * Engine time unit. Every duration in this config (`op.smv`, `arrivalRatePerHour`'s
   * denominator, etc.) is denominated in the same unit. The unit is reported back
   * via `snapshot()` so consumers know how to display `state.time`. Default
   * (when omitted) is `'minute'` — preserves existing semantics for old configs.
   */
  modelTimeUnit?: ModelTimeUnit;
}

export interface StationView {
  /** Operation id this station runs. */
  opId: string;
  opCode?: string;
  opName: string;
  /** Machine type — the canonical asset key. Drives the visual sprite/colour
   *  in the ISO/TOP/LOGIC views via `MACHINE_CATALOG[machineCode]`. */
  machineCode: string;
  smv: number;
  serversTotal: number;
  /** Servers currently busy. */
  busy: number;
  /** Bundles waiting in queue. */
  queueLen: number;
  /** Bundles completed at this station so far. */
  produced: number;
  /** Cumulative busy minutes across all servers. */
  totalBusyTime: number;
  /** 0..1, derived from totalBusyTime / (serversTotal · time). */
  utilization: number;
  // ── Queueing-theory layer ──────────────────────────────────────────────
  /** Kendall–Lee classification of this station. */
  notation: KendallNotation;
  /** Effective service distribution after efficiency scaling. */
  serviceDist: ServiceDist;
  /** System capacity for this station (Infinity if unbounded). */
  capacity: number;
  /** Bundles offered to this station (queue + service + balked). */
  arrivals: number;
  /** Bundles rejected because system was full. 0 for infinite-buffer. */
  balked: number;
  /** Observed arrival rate λ (per hour) — arrivals / (time in hours). */
  lambda: number;
  /** Analytical KPIs against the observed λ and the station's μ. */
  analytical: AnalyticalKpis;
  /** ρ < 1 (infinite buffer) or always-true (finite buffer). */
  isStable: boolean;
}

export interface HistoryPoint {
  time: number;        // sim minutes
  produced: number;    // bundles sunk
  wip: number;         // bundles in flight
  throughputPerHr: number;
}

/**
 * Per-station time-series sample. Parallel to `HistoryPoint` but emitted for
 * each station every 5 sim-minutes. Drives the four queueing-theory plots
 * (operator saturation, bundles at station, bundle wait, bundles waiting).
 */
export interface StationHistoryPoint {
  time: number;        // model-time units (same as `SimState.time`)
  utilization: number; // cumulative ρ̂ = totalBusyTime / (c · t)
  inSystem: number;    // L̂ = busy + queue.length (instantaneous)
  queueLen: number;    // L̂q = queue.length (instantaneous)
  meanWqMin: number;   // Ŵq running average across served bundles, minutes
}

export interface SimState {
  time: number;
  produced: number;
  producedPieces: number;
  totalArrivals: number;
  meanLeadTime: number;
  utilization: number;
  bottleneckOpIndex: number;
  stations: StationView[];
  history: HistoryPoint[];
  /** Per-station time-series, parallel to `stations`. Sampled every 5 sim-min. */
  stationHistory: StationHistoryPoint[][];
  /** Rolling event log for the LiveSim feed. Newest first. Capped at 60. */
  events: { time: number; tag: 'OUT' | 'IN' | 'STARVE' | 'BLOCK'; msg: string }[];
}

interface BundleRec {
  id: number;
  pieces: number;
  arrivedAt: number;
  currentOpIndex: number;
}

/**
 * Queue entry — carries the bundle id plus enough metadata for non-FCFS
 * disciplines (Priority) and for computing per-bundle wait time when popped.
 * `priority` is optional; Phase 3 sets it from the active order's rush flag.
 */
interface QueueEntry {
  id: number;
  enqueuedAt: number;
  priority?: number;
}

interface StationRec {
  op: Operation;
  serversTotal: number;
  serversFree: number;
  queue: QueueEntry[];
  produced: number;
  totalBusyTime: number;
  /** Effective per-bundle service distribution after efficiency scaling. */
  serviceDist: ServiceDist;
  /** System capacity (queue + in-service). Infinity for unbounded. */
  capacity: number;
  discipline: QueueDiscipline;
  /** Bundles ever offered to this station (admitted + balked). */
  arrivals: number;
  /** Bundles rejected because the system was at capacity. */
  balked: number;
}

type SimEvent =
  | { time: number; kind: 'arrival' }
  | { time: number; kind: 'opEnd'; bundleId: number; opIndex: number };

export class Sim {
  config: SimConfig;
  private pq: MinHeap<SimEvent>;
  private rng: () => number;
  private nextBundleId = 1;
  private bundles = new Map<number, BundleRec>();
  private stations: StationRec[] = [];
  private produced = 0;
  private producedPieces = 0;
  private totalLeadTime = 0;
  private totalArrivals = 0;
  private history: HistoryPoint[] = [];
  /** Per-station ring buffer of time-series samples, parallel to `stations`. */
  private stationHistory: StationHistoryPoint[][] = [];
  /** Running Σ of per-bundle queue waits, one per station. Drives Ŵq(t). */
  private stationWqSum: number[] = [];
  /** Count of bundles whose wait we've sampled, one per station. */
  private stationWqCount: number[] = [];
  private events: SimState['events'] = [];
  private time = 0;
  private nextHistorySample = 0;

  constructor(config: SimConfig) {
    this.config = config;
    this.pq = new MinHeap<SimEvent>((a, b) => a.time - b.time);
    this.rng = mulberry32(config.randomSeed);
    this.reset();
  }

  reset(): void {
    this.pq.clear();
    this.rng = mulberry32(this.config.randomSeed);
    this.nextBundleId = 1;
    this.bundles.clear();
    this.stations = this.config.operations.map((op, i) => {
      const servers = this.config.stationServers[i] ?? 1;
      const baseDist = this.config.serviceDistributions?.[i]
        ?? defaultUniformDist(op.smv, this.config.smvVariance);
      const eff = this.config.opEfficiency?.[op.id];
      // Effective service time = base / efficiency. We scale the *mean* of the
      // distribution (variance scales with mean² in normal/erlang, and
      // proportionally in uniform — see scaleDist).
      const serviceDist = eff && eff > 0 ? scaleDist(baseDist, 1 / eff) : baseDist;
      const capacity = this.config.stationCapacities?.[i] ?? Infinity;
      const discipline = this.config.queueDisciplines?.[i] ?? 'FCFS';
      return {
        op,
        serversTotal: servers,
        serversFree: servers,
        queue: [],
        produced: 0,
        totalBusyTime: 0,
        serviceDist,
        capacity,
        discipline,
        arrivals: 0,
        balked: 0,
      };
    });
    this.produced = 0;
    this.producedPieces = 0;
    this.totalLeadTime = 0;
    this.totalArrivals = 0;
    this.history = [];
    this.stationHistory = this.config.operations.map(() => []);
    this.stationWqSum = this.config.operations.map(() => 0);
    this.stationWqCount = this.config.operations.map(() => 0);
    this.events = [];
    this.time = 0;
    this.nextHistorySample = 5;
    this.pq.push({ time: 0, kind: 'arrival' });
  }

  /**
   * Advance simulation time to `target` minutes, processing every event
   * scheduled in between in time order. Idempotent for `target <= time`.
   */
  runUntil(target: number): void {
    while (!this.pq.isEmpty()) {
      const next = this.pq.peek();
      if (!next || next.time > target) break;
      this.pq.pop();
      this.time = next.time;
      this.process(next);
      // Sample history opportunistically — every 5 sim minutes.
      while (this.time >= this.nextHistorySample) {
        this.recordHistory(this.nextHistorySample);
        this.nextHistorySample += 5;
      }
    }
    if (this.time < target) this.time = target;
    while (this.time >= this.nextHistorySample) {
      this.recordHistory(this.nextHistorySample);
      this.nextHistorySample += 5;
    }
  }

  /**
   * Number of model-time units that equal one real hour. Used to translate
   * the engine's unit-agnostic `this.time` into per-hour rates for the UI.
   * With `modelTimeUnit = 'minute'`, this is 60.
   */
  private unitsPerHour(): number {
    const unit = this.config.modelTimeUnit ?? 'minute';
    return 3600 / unitToSeconds(unit);
  }

  snapshot(): SimState {
    const timeHours = this.time / this.unitsPerHour();
    const stations: StationView[] = this.stations.map((st) => {
      const capacity = st.capacity;
      const notation = classify(st.serviceDist, st.serversTotal, capacity, st.discipline);
      const lambda = timeHours > 0 ? st.arrivals / timeHours : 0;
      const analytical = analyticalKpis(notation, lambda, st.serviceDist);
      const utilization =
        this.time > 0 ? st.totalBusyTime / (st.serversTotal * this.time) : 0;
      return {
        opId: st.op.id,
        opCode: st.op.code,
        opName: st.op.name,
        machineCode: st.op.machineCode,
        smv: st.op.smv,
        serversTotal: st.serversTotal,
        busy: st.serversTotal - st.serversFree,
        queueLen: st.queue.length,
        produced: st.produced,
        totalBusyTime: st.totalBusyTime,
        utilization,
        notation,
        serviceDist: st.serviceDist,
        capacity,
        arrivals: st.arrivals,
        balked: st.balked,
        lambda,
        analytical,
        isStable: analytical.isStable,
      };
    });

    let bottleneckOpIndex = 0;
    let worst = -1;
    stations.forEach((s, i) => {
      // Bottleneck = highest ρ (analytical traffic intensity). Falls back to
      // queue length when ρ is unavailable (e.g. very early in the run).
      const score = Number.isFinite(s.analytical.rho) && s.analytical.rho > 0
        ? s.analytical.rho
        : s.queueLen + s.busy / Math.max(1, s.serversTotal);
      if (score > worst) {
        worst = score;
        bottleneckOpIndex = i;
      }
    });

    const totalServerTime = this.stations.reduce(
      (s, st) => s + st.serversTotal * this.time,
      0,
    );
    const totalBusy = this.stations.reduce((s, st) => s + st.totalBusyTime, 0);
    const utilization = totalServerTime > 0 ? totalBusy / totalServerTime : 0;

    return {
      time: this.time,
      produced: this.produced,
      producedPieces: this.producedPieces,
      totalArrivals: this.totalArrivals,
      meanLeadTime: this.produced > 0 ? this.totalLeadTime / this.produced : 0,
      utilization,
      bottleneckOpIndex,
      stations,
      history: this.history.slice(),
      stationHistory: this.stationHistory.map((arr) => arr.slice()),
      events: this.events.slice(0, 30),
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private process(ev: SimEvent): void {
    if (ev.kind === 'arrival') this.handleArrival();
    else this.handleOpEnd(ev.bundleId, ev.opIndex);
  }

  private handleArrival(): void {
    const id = this.nextBundleId++;
    const bundle: BundleRec = {
      id,
      pieces: this.config.bundleSize,
      arrivedAt: this.time,
      currentOpIndex: 0,
    };
    this.bundles.set(id, bundle);
    this.totalArrivals++;
    this.routeNext(bundle);

    // Schedule next arrival (exponential interarrival).
    // `arrivalRatePerHour` is per real hour; convert to model-time-units by
    // dividing into the number of model-time-units in one hour.
    const meanInter = this.unitsPerHour() / Math.max(0.0001, this.config.arrivalRatePerHour);
    const u = Math.max(1e-6, this.rng());
    const dt = -Math.log(u) * meanInter;
    this.pq.push({ time: this.time + dt, kind: 'arrival' });
  }

  private handleOpEnd(bundleId: number, opIndex: number): void {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return;
    const station = this.stations[opIndex];
    station.serversFree++;
    station.produced++;

    // Pull next queued bundle on this station, if any. Engine is FCFS today;
    // Phase 3 will dispatch on `station.discipline` (SIRO / Priority).
    if (station.queue.length > 0) {
      const entry = station.queue.shift();
      if (entry !== undefined) {
        const next = this.bundles.get(entry.id);
        if (next) {
          this.stationWqSum[opIndex] += this.time - entry.enqueuedAt;
          this.stationWqCount[opIndex]++;
          this.beginService(station, next, opIndex);
        }
      }
    }

    // Move the finished bundle to its next operation.
    bundle.currentOpIndex++;
    this.routeNext(bundle);
  }

  private routeNext(bundle: BundleRec): void {
    const opIdx = bundle.currentOpIndex;
    if (opIdx >= this.config.operations.length) {
      // Sink.
      this.produced++;
      this.producedPieces += bundle.pieces;
      this.totalLeadTime += this.time - bundle.arrivedAt;
      this.bundles.delete(bundle.id);
      this.logEvent('OUT', `+${bundle.pieces} pcs (bundle #${bundle.id})`);
      return;
    }
    const station = this.stations[opIdx];
    station.arrivals++;

    // Balking — bundle arrives when system at capacity. Drop it.
    const inSystem = (station.serversTotal - station.serversFree) + station.queue.length;
    if (inSystem >= station.capacity) {
      station.balked++;
      this.bundles.delete(bundle.id);
      this.logEvent('BLOCK', `Balked at ${station.op.name} (bundle #${bundle.id})`);
      return;
    }

    if (station.serversFree > 0) {
      // Direct to service — wait = 0, but count it so the mean reflects all
      // served bundles (otherwise Ŵq is biased upward by ignoring no-wait flow).
      this.stationWqCount[opIdx]++;
      this.beginService(station, bundle, opIdx);
    } else {
      station.queue.push({ id: bundle.id, enqueuedAt: this.time });
    }
  }

  private beginService(station: StationRec, bundle: BundleRec, opIndex: number): void {
    station.serversFree--;
    // SMV is per-piece (apparel industry convention). A bundle of N pieces
    // therefore occupies the station for N × sampled-per-piece-time. The
    // distribution mean equals `op.smv` directly (no double-scaling); the
    // bundle factor is applied here once.
    const perPiece = Math.max(0.001, sample(station.serviceDist, this.rng));
    const dur = perPiece * Math.max(1, bundle.pieces);
    station.totalBusyTime += dur;
    this.pq.push({
      time: this.time + dur,
      kind: 'opEnd',
      bundleId: bundle.id,
      opIndex,
    });
  }

  private recordHistory(t: number): void {
    const tHr = t / this.unitsPerHour();
    const throughputPerHr = tHr > 0 ? this.produced / tHr : 0;
    this.history.push({
      time: t,
      produced: this.produced,
      wip: this.bundles.size,
      throughputPerHr,
    });
    if (this.history.length > 240) this.history.shift();

    // Per-station time-series sample. Ŵq is the running mean queue wait;
    // converted to MINUTES so the UI label "Ŵq (min)" reads honestly
    // regardless of `modelTimeUnit`. inSystem / queueLen are instantaneous.
    const minutesPerUnit = unitToSeconds(this.config.modelTimeUnit ?? 'minute') / 60;
    this.stations.forEach((st, i) => {
      const wqCount = this.stationWqCount[i] || 0;
      const wqSumUnits = this.stationWqSum[i] || 0;
      const meanWqMin = wqCount > 0 ? (wqSumUnits / wqCount) * minutesPerUnit : 0;
      const busy = st.serversTotal - st.serversFree;
      const sample: StationHistoryPoint = {
        time: t,
        utilization: t > 0 ? st.totalBusyTime / (st.serversTotal * t) : 0,
        inSystem: busy + st.queue.length,
        queueLen: st.queue.length,
        meanWqMin,
      };
      const arr = this.stationHistory[i];
      arr.push(sample);
      if (arr.length > 240) arr.shift();
    });
  }

  private logEvent(tag: SimState['events'][number]['tag'], msg: string): void {
    this.events.unshift({ time: this.time, tag, msg });
    if (this.events.length > 60) this.events.length = 60;
  }
}

/** Legacy uniform distribution used when no per-station distribution is set.
 *  Honours the line-wide `smvVariance` knob so older configs behave identically. */
function defaultUniformDist(smv: number, variance: number): ServiceDist {
  if (variance == null || variance <= 0) return defaultDist(smv);
  return { kind: 'uniform', mean: Math.max(0.001, smv), variance };
}

// Re-export the queueing types so callers (UI components, store, replications)
// can `import { ... } from '../simulation'` without grabbing the inner modules
// directly.
export type { ServiceDist } from './distributions';
export type { KendallNotation, AnalyticalKpis, QueueDiscipline } from './queueing';
