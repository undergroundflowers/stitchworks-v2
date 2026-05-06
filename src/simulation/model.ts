/**
 * Model builder — converts a garment template + operator count into a
 * SimConfig the engine can run. Distributes operators across operations
 * proportional to SMV (so high-SMV ops get multiple parallel servers),
 * then sets the arrival rate to match the bottleneck-driven throughput
 * with a small headroom so the line stays loaded.
 */

import type { GarmentTemplate } from '../domain';
import type { SimConfig } from './engine';

export interface BuildModelOptions {
  garment: GarmentTemplate;
  operators: number;
  bundleSize?: number;
  arrivalRatePerHour?: number;
  smvVariance?: number;
  randomSeed?: number;
  /**
   * Per-operation efficiency multiplier. Pass a value derived from the
   * project's skill matrix so the sim respects each operator's actual
   * proficiency on the operations they're running.
   */
  opEfficiency?: Record<string, number>;
}

export function buildSimConfig(opts: BuildModelOptions): SimConfig {
  const { garment, operators } = opts;
  const ops = garment.operations;
  if (ops.length === 0) {
    throw new Error(`Garment ${garment.id} has no operations`);
  }

  // Initial allocation: every op gets at least one server, then high-SMV ops
  // pick up additional servers proportional to their share of total SMV.
  const stationServers = ops.map(() => 1);
  let remaining = Math.max(0, operators - ops.length);
  const totalSmv = ops.reduce((s, o) => s + o.smv, 0);

  // Greedy: while remaining > 0, give the next operator to the station with
  // the highest current load per server. This converges to LPT-balanced.
  while (remaining > 0) {
    let bestIdx = 0;
    let bestLoad = ops[0].smv / stationServers[0];
    for (let i = 1; i < ops.length; i++) {
      const load = ops[i].smv / stationServers[i];
      if (load > bestLoad) {
        bestLoad = load;
        bestIdx = i;
      }
    }
    stationServers[bestIdx]++;
    remaining--;
  }

  // If operators < ops.length, we ran with all-ones above. The line is then
  // under-staffed (some ops will be bottlenecks); that's OK and reflects
  // reality if the user asked for a too-small crew.
  void totalSmv;

  // Bottleneck cycle time accounts for per-op efficiency from the skill matrix.
  const eff = (opId: string) => opts.opEfficiency?.[opId] ?? 1;
  const effectiveSmv = (opId: string, base: number) => (eff(opId) > 0 ? base / eff(opId) : base);
  const bottleneckCycle = Math.max(
    ...ops.map((op, i) => effectiveSmv(op.id, op.smv) / stationServers[i]),
  );
  const piecesPerHour = bottleneckCycle > 0 ? 60 / bottleneckCycle : 0;
  const bundleSize = opts.bundleSize ?? garment.defaultBundleSize;
  const bundlesPerHour = piecesPerHour / Math.max(1, bundleSize);
  // 10 % headroom keeps the head of the line loaded.
  const arrivalRatePerHour = opts.arrivalRatePerHour ?? bundlesPerHour * 1.1;

  return {
    garmentTemplateId: garment.id,
    operations: ops,
    stationServers,
    bundleSize,
    arrivalRatePerHour,
    smvVariance: opts.smvVariance ?? 0.15,
    randomSeed: opts.randomSeed ?? 42,
    opEfficiency: opts.opEfficiency,
  };
}

/**
 * Build the per-operation efficiency map from a project's skill matrix.
 * For each operation, takes the mean skill efficiency across all operators
 * whose matrix entry for that op is > 0. Operations no operator can perform
 * stay at 1.0 (defer to the engine's default rather than block the line).
 */
export function efficiencyFromSkillMatrix(
  matrix: Record<string, Record<string, number>>,
  ops: GarmentTemplate['operations'],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const op of ops) {
    const samples: number[] = [];
    for (const operatorId of Object.keys(matrix)) {
      const eff = matrix[operatorId]?.[op.id];
      if (eff && eff > 0) samples.push(eff);
    }
    if (samples.length > 0) {
      out[op.id] = samples.reduce((s, v) => s + v, 0) / samples.length;
    }
  }
  return out;
}
