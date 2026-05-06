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

  // Bottleneck cycle time = max(op.smv / serversAt(op)).
  const bottleneckCycle = Math.max(
    ...ops.map((op, i) => op.smv / stationServers[i]),
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
  };
}
