/**
 * Replication runner — runs the same SimConfig N times with different
 * seeds and returns mean + standard deviation for each KPI. Lets the UI
 * report point estimates *and* uncertainty ranges (Sommerfeld 1990
 * baseline says ~15 % per-op stochasticism, so single-seed runs can be
 * 10–20 % off the long-run mean).
 *
 * Each replication is a deterministic full-shift run, executed
 * synchronously. With N = 10 and a 480-min shift, total wall-clock is
 * usually well under a second on the kind of bulletins we ship.
 */

import { Sim, type SimConfig, type HistoryPoint, type StationView } from './engine';

export interface ReplicationResult {
  seed: number;
  producedPieces: number;
  throughputPerHr: number;
  efficiencyPct: number;
  meanLeadTime: number;
  utilization: number;
  wipBundles: number;
  bottleneckOpName: string;
  bottleneckQueue: number;
}

export interface AggregateKpis {
  /** Number of replications. */
  n: number;
  producedPieces:    { mean: number; std: number };
  throughputPerHr:   { mean: number; std: number };
  efficiencyPct:     { mean: number; std: number };
  meanLeadTime:      { mean: number; std: number };
  utilization:       { mean: number; std: number };
  wipBundles:        { mean: number; std: number };
  /** Bottleneck name + queue from the run that produced the median throughput. */
  bottleneckOpName: string;
  bottleneckQueue: number;
  /** Raw per-replication results, kept for charts and CSV export. */
  replications: ReplicationResult[];
  /** History from the first replication so the page can still chart output-over-time. */
  firstHistory: HistoryPoint[];
  /** Stations from the first replication. */
  firstStations: StationView[];
}

/**
 * Run `replications` independent shifts of `config` for `simMinutes`
 * sim-minutes each. Each replication uses `config.randomSeed + i`.
 */
export function runReplications(opts: {
  config: SimConfig;
  replications: number;
  simMinutes: number;
}): AggregateKpis {
  const { config, replications, simMinutes } = opts;
  const n = Math.max(1, Math.floor(replications));
  const samples: ReplicationResult[] = [];
  let firstHistory: HistoryPoint[] = [];
  let firstStations: StationView[] = [];

  for (let i = 0; i < n; i++) {
    const sim = new Sim({ ...config, randomSeed: config.randomSeed + i });
    sim.runUntil(simMinutes);
    const snap = sim.snapshot();
    if (i === 0) {
      firstHistory = snap.history;
      firstStations = snap.stations;
    }
    const samConsumed = snap.producedPieces *
      config.operations.reduce((s, o) => s + o.smv, 0);
    const operators = config.stationServers.reduce((s, c) => s + c, 0);
    const efficiencyPct = operators > 0
      ? (samConsumed / (operators * simMinutes)) * 100
      : 0;
    const throughputPerHr = simMinutes > 0
      ? (snap.producedPieces / simMinutes) * 60
      : 0;
    const wipBundles = snap.totalArrivals - snap.produced;
    const bottleneck = snap.stations[snap.bottleneckOpIndex];
    samples.push({
      seed: config.randomSeed + i,
      producedPieces:   snap.producedPieces,
      throughputPerHr,
      efficiencyPct,
      meanLeadTime:     snap.meanLeadTime,
      utilization:      snap.utilization,
      wipBundles,
      bottleneckOpName: bottleneck?.opName ?? '—',
      bottleneckQueue:  bottleneck?.queueLen ?? 0,
    });
  }

  // Pick the bottleneck label from the median-throughput replication —
  // this is more representative than min or max.
  const sortedByThroughput = [...samples].sort(
    (a, b) => a.throughputPerHr - b.throughputPerHr,
  );
  const median = sortedByThroughput[Math.floor(sortedByThroughput.length / 2)];

  return {
    n,
    producedPieces:  meanStd(samples.map((s) => s.producedPieces)),
    throughputPerHr: meanStd(samples.map((s) => s.throughputPerHr)),
    efficiencyPct:   meanStd(samples.map((s) => s.efficiencyPct)),
    meanLeadTime:    meanStd(samples.map((s) => s.meanLeadTime)),
    utilization:     meanStd(samples.map((s) => s.utilization)),
    wipBundles:      meanStd(samples.map((s) => s.wipBundles)),
    bottleneckOpName: median.bottleneckOpName,
    bottleneckQueue:  median.bottleneckQueue,
    replications: samples,
    firstHistory,
    firstStations,
  };
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}
