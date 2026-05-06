/**
 * Discrete-event simulation engine for an apparel sewing line.
 *
 * Model — every operation in a garment bulletin is a "station" with N
 * parallel servers (operators on identical machines). Bundles arrive at
 * the head of the line, queue at each station, get processed for SMV
 * minutes, and route to the next operation. When a bundle finishes the
 * last operation, it sinks; lead-time and throughput are recorded.
 *
 * Stochasticism — service times are sampled around the operation's SMV
 * with ±15 % uniform variance (Sommerfeld 1990 baseline). Inter-arrival
 * times are exponential.
 *
 * Time unit — minutes throughout. The hook in useSim.ts maps wall-clock
 * to sim time at a configurable speed multiplier.
 */

import type { Operation } from '../domain';
import { MinHeap, mulberry32 } from './priority-queue';

export interface SimConfig {
  garmentTemplateId: string;
  operations: Operation[];
  /** Number of parallel operators on each operation, indexed identically. */
  stationServers: number[];
  /** Pieces per bundle — affects throughput per arrival but not SMV. */
  bundleSize: number;
  /** Bundle arrivals per hour. Tune to keep the line loaded. */
  arrivalRatePerHour: number;
  /** Coefficient of variation around the SMV mean (0 = deterministic). */
  smvVariance: number;
  randomSeed: number;
  /**
   * Optional per-operation efficiency multiplier (e.g. 0.85 for an operator
   * running at 85 % of standard). Service time = SMV / efficiency. Missing
   * entries default to 1.0. Sourced from the project's skill matrix.
   */
  opEfficiency?: Record<string, number>;
}

export interface StationView {
  /** Operation id this station runs. */
  opId: string;
  opCode?: string;
  opName: string;
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
  /** 0..1, derived. */
  utilization: number;
}

export interface HistoryPoint {
  time: number;        // sim minutes
  produced: number;    // bundles sunk
  wip: number;         // bundles in flight
  throughputPerHr: number;
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
  /** Rolling event log for the LiveSim feed. Newest first. Capped at 60. */
  events: { time: number; tag: 'OUT' | 'IN' | 'STARVE' | 'BLOCK'; msg: string }[];
}

interface BundleRec {
  id: number;
  pieces: number;
  arrivedAt: number;
  currentOpIndex: number;
}

interface StationRec {
  op: Operation;
  serversTotal: number;
  serversFree: number;
  queue: number[];
  produced: number;
  totalBusyTime: number;
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
    this.stations = this.config.operations.map((op, i) => ({
      op,
      serversTotal: this.config.stationServers[i] ?? 1,
      serversFree: this.config.stationServers[i] ?? 1,
      queue: [],
      produced: 0,
      totalBusyTime: 0,
    }));
    this.produced = 0;
    this.producedPieces = 0;
    this.totalLeadTime = 0;
    this.totalArrivals = 0;
    this.history = [];
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

  snapshot(): SimState {
    const stations: StationView[] = this.stations.map((st, i) => ({
      opId: st.op.id,
      opCode: st.op.code,
      opName: st.op.name,
      smv: st.op.smv,
      serversTotal: st.serversTotal,
      busy: st.serversTotal - st.serversFree,
      queueLen: st.queue.length,
      produced: st.produced,
      totalBusyTime: st.totalBusyTime,
      utilization:
        this.time > 0 ? st.totalBusyTime / (st.serversTotal * this.time) : 0,
      _idx: i,
    } as StationView & { _idx: number }));

    let bottleneckOpIndex = 0;
    let worst = -1;
    stations.forEach((s, i) => {
      const score = s.queueLen + s.busy / Math.max(1, s.serversTotal);
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
    const meanInter = 60 / Math.max(0.0001, this.config.arrivalRatePerHour);
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

    // Pull next queued bundle on this station, if any.
    if (station.queue.length > 0) {
      const nextId = station.queue.shift();
      if (nextId !== undefined) {
        const next = this.bundles.get(nextId);
        if (next) this.beginService(station, next, opIndex);
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
    if (station.serversFree > 0) {
      this.beginService(station, bundle, opIdx);
    } else {
      station.queue.push(bundle.id);
    }
  }

  private beginService(station: StationRec, bundle: BundleRec, opIndex: number): void {
    station.serversFree--;
    const v = this.config.smvVariance;
    const factor = v > 0 ? 1 + (this.rng() * 2 - 1) * v : 1;
    const eff = this.config.opEfficiency?.[station.op.id];
    const effective = eff && eff > 0 ? station.op.smv / eff : station.op.smv;
    const dur = Math.max(0.001, effective * factor);
    station.totalBusyTime += dur;
    this.pq.push({
      time: this.time + dur,
      kind: 'opEnd',
      bundleId: bundle.id,
      opIndex,
    });
  }

  private recordHistory(t: number): void {
    const tHr = t / 60;
    const throughputPerHr = tHr > 0 ? this.produced / tHr : 0;
    this.history.push({
      time: t,
      produced: this.produced,
      wip: this.bundles.size,
      throughputPerHr,
    });
    if (this.history.length > 240) this.history.shift();
  }

  private logEvent(tag: SimState['events'][number]['tag'], msg: string): void {
    this.events.unshift({ time: this.time, tag, msg });
    if (this.events.length > 60) this.events.length = 60;
  }
}
