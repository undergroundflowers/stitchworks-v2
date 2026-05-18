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
  /** Replication-averaged history — same length as firstHistory, with each
   *  field (produced, wip, throughputPerHr) averaged across all N runs at
   *  the matching sample index. With N=1 this is identical to firstHistory.
   *  Lets charts surface an expected-shape curve instead of a single
   *  potentially-noisy trace. */
  averagedHistory: HistoryPoint[];
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
  const allHistories: HistoryPoint[][] = [];

  for (let i = 0; i < n; i++) {
    const sim = new Sim({ ...config, randomSeed: config.randomSeed + i });
    sim.runUntil(simMinutes);
    const snap = sim.snapshot();
    if (i === 0) {
      firstHistory = snap.history;
      firstStations = snap.stations;
    }
    allHistories.push(snap.history);
    // Efficiency = SAM consumed / available operator minutes.
    // ASSUMES: (a) SMV is per-piece (engine now enforces this in
    // beginService, where bundle.pieces × per-piece SMV gives bundle
    // service time), and (b) every piece traverses every operation
    // exactly once — i.e. linear bulletin, no parallel paths or skips.
    // If routing branches are added later, switch to a per-station sum:
    //   samConsumed = Σ_station (produced_station × station.smv)
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
    averagedHistory: averageHistories(allHistories),
    firstStations,
  };
}

/**
 * Pointwise average across N replication history series. All replications
 * sample at the same cadence (engine fixed at every 5 sim-minutes), so we
 * align by index up to the shortest series' length. With N=1 this returns
 * the single series unchanged.
 */
function averageHistories(histories: HistoryPoint[][]): HistoryPoint[] {
  if (histories.length === 0) return [];
  if (histories.length === 1) return histories[0];
  const minLen = histories.reduce((m, h) => Math.min(m, h.length), histories[0].length);
  const out: HistoryPoint[] = [];
  for (let i = 0; i < minLen; i++) {
    let prod = 0, wip = 0, tput = 0;
    for (const h of histories) {
      prod += h[i].produced;
      wip += h[i].wip;
      tput += h[i].throughputPerHr;
    }
    out.push({
      time: histories[0][i].time,
      produced: prod / histories.length,
      wip: wip / histories.length,
      throughputPerHr: tput / histories.length,
    });
  }
  return out;
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}
