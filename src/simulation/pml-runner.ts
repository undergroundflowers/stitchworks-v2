/**
 * PML runner — bridge between the twin store and `pml-engine.ts`.
 *
 * Responsibilities:
 *   1. Build engine inputs from the active twin.
 *   2. Run the sim.
 *   3. Write per-station observed KPIs back via `useTwin.setKpiObserved`.
 *   4. Surface a flat `RunReport` for the caller (toast + warnings).
 *
 * Kept separate from the engine so the engine has zero zustand awareness
 * and can be unit-tested or driven from a worker without dragging in the
 * React app's stores.
 */

import { runPmlSim, type PmlSimResult } from './pml-engine';
import type { Twin } from '../domain/twin';
import type { KpiObservedAttrs } from '../domain/twin';
import { newRunId } from '../domain/twin';

export interface RunPmlOnTwinOpts {
  /** Simulated minutes — defaults to one 8h shift. */
  durationMin?: number;
  /** RNG seed — defaults to a fresh value derived from Date.now(). */
  seed?: number;
  /** Sampling period in MINUTES for the timeseries that backs LiveSim
   *  playback. Default 1 min. Set to 0 to skip sampling (saves memory
   *  for replication harnesses that don't render the run). */
  samplePeriodMin?: number;
  /** Optional callback invoked once per workstation that has observed
   *  values from the run. The Builder passes the twin store's
   *  `setKpiObserved` action here so per-block KPIs land on the live
   *  twin. Pass `undefined` (or omit) to skip the write-back — useful
   *  for replication harnesses that aggregate across many runs. */
  writeKpiObserved?: (wsId: string, observed: KpiObservedAttrs) => void;
}

export interface RunReport {
  /** Wall-clock milliseconds the sim took on this machine. */
  wallMs: number;
  durationMin: number;
  totalProduced: number;
  throughputPerHr: number;
  meanLeadTimeMin: number;
  bottleneckName: string | null;
  warnings: string[];
  /** Engine result kept around so the caller can inspect per-block obs. */
  raw: PmlSimResult;
}

/**
 * Run the PML sim on a specific twin payload and (optionally) write
 * per-block observed KPIs back through the caller-supplied write hook.
 * Decoupling the store write means the runner has no hidden dependency
 * on `useTwin` — the caller decides which store instance receives the
 * results, which sidesteps Vite's "module-instance-per-import-path"
 * footgun for dev-time tests.
 */
export function runPmlOnTwin(twin: Twin, opts: RunPmlOnTwinOpts = {}): RunReport {
  const durationMin = opts.durationMin ?? 480;
  const seed = opts.seed ?? ((Date.now() & 0xffffffff) | 1);
  const samplePeriodMin = opts.samplePeriodMin ?? 1;
  const t0 = performance.now();
  const result = runPmlSim({ twin, durationMin, seed, samplePeriodMin });
  const wallMs = performance.now() - t0;

  if (opts.writeKpiObserved) {
    const capturedAt = new Date().toISOString();
    const runId = newRunId();
    for (const ws of twin.workstations) {
      const obs = result.blocks.get(ws.id);
      if (!obs) continue;
      const kpi: KpiObservedAttrs = {
        capturedAt,
        runId,
        capacityPerHr: round1(obs.throughputPerHr),
        efficiencyPct: ws.kpiTargets.capacityPerHr
          ? round1((obs.throughputPerHr / ws.kpiTargets.capacityPerHr) * 100)
          : 100,
        defectPct: 0, // SelectOutput captures pass/fail per-block, not per-station
        utilizationPct: round1(obs.utilization * 100),
        bottleneck: obs.bottleneck,
      };
      opts.writeKpiObserved(ws.id, kpi);
    }
  }

  const bottleneckWs = result.bottleneckWsId
    ? twin.workstations.find((w) => w.id === result.bottleneckWsId) ?? null
    : null;

  return {
    wallMs,
    durationMin,
    totalProduced: result.totalProduced,
    throughputPerHr: round1(result.throughputPerHr),
    meanLeadTimeMin: round1(result.meanLeadTimeMin),
    bottleneckName: bottleneckWs?.name ?? null,
    warnings: result.warnings,
    raw: result,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
