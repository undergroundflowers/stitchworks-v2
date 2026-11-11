/**
 * KPIs for one line of the LIVE run, read at the shared clock's playhead.
 *
 * Reports used to run its own batch of full-shift replications on a fixed
 * seed, so it showed a finished 480-minute shift while the Run tab was still
 * at minute 100, and never the run the user was watching. This reads the same
 * session the Run tab animates instead: every figure is "so far".
 *
 * It returns the `AggregateKpis` shape the report already renders, as a
 * single run — n = 1 and every std 0 — so one live run has no ± to show.
 */

import type { GarmentTemplate } from '../domain';
import {
  hourlyTarget,
  oee as oeeKpi,
  performanceFromThroughput,
  onStandardPerformance,
  offStandardLossPct as offStandardLossKpi,
  labourProductivity as labourProductivityKpi,
  totalSam,
} from '../domain/kpi';
import type { AggregateKpis } from './replications';
import type { SimRunSlot } from './useSimSession';

export function liveAggregate(
  slot: SimRunSlot,
  opts: { garment?: GarmentTemplate; operators: number },
): AggregateKpis {
  const state = slot.state;
  const elapsedMin = state.time;
  const operators = opts.operators;
  const one = (mean: number) => ({ mean, std: 0 });

  const produced = state.producedPieces;
  const throughputPerHr = elapsedMin > 0 ? (produced / elapsedMin) * 60 : 0;
  const clockedMin = operators * elapsedMin;
  // SAM consumed ≈ Σ(station output · SMV) — same approximation the batch
  // runner used, so a finished live run and an old report agree.
  const samConsumed = state.stations.reduce((s, st) => s + st.produced * st.smv, 0);
  const efficiencyPct = clockedMin > 0 ? (samConsumed / clockedMin) * 100 : 0;
  const bottleneck = state.stations[state.bottleneckOpIndex];

  const sam = opts.garment ? totalSam(opts.garment.operations) : 0;
  const bottleneckSmv = bottleneck?.smv ?? 0;
  const oeePerformance = performanceFromThroughput({
    actualPph: throughputPerHr,
    theoreticalPph: bottleneckSmv > 0 ? hourlyTarget(bottleneckSmv) : 0,
  });
  // First-pass yield is only tallied for the run as a whole, not per sample,
  // so quality is the whole-run figure rather than a to-date one.
  const oeeQuality = slot.result?.firstPassYield ?? 1;

  return {
    n: 1,
    producedPieces: one(produced),
    throughputPerHr: one(throughputPerHr),
    efficiencyPct: one(efficiencyPct),
    meanLeadTime: one(state.meanLeadTime),
    utilization: one(state.utilization),
    wipBundles: one(state.totalArrivals - state.produced),
    oee: one(oeeKpi({ performance: oeePerformance, quality: oeeQuality })),
    oeePerformance: one(oeePerformance),
    oeeQuality: one(oeeQuality),
    onStandardPct: one(
      sam > 0 && clockedMin > 0
        ? onStandardPerformance({ producedPieces: produced, sam, clockedMinutes: clockedMin })
        : 0,
    ),
    offStandardLossPct: one(
      clockedMin > 0
        ? offStandardLossKpi({ clockedMinutes: clockedMin, earnedMinutes: produced * sam })
        : 0,
    ),
    labourProductivity: one(
      elapsedMin > 0
        ? labourProductivityKpi({ producedPieces: produced, operators, hours: elapsedMin / 60 })
        : 0,
    ),
    demandTaktGap: one(0),
    bottleneckOpName: bottleneck?.opName ?? '—',
    bottleneckQueue: bottleneck?.queueLen ?? 0,
    replications: [],
    firstHistory: slot.history,
    averagedHistory: slot.history,
    firstStations: state.stations,
  };
}
