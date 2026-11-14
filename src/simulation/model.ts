/**
 * Model builder — converts a garment template + operator count into a
 * SimConfig the engine can run. Distributes operators across operations
 * proportional to SMV (so high-SMV ops get multiple parallel servers),
 * then sets the arrival rate to match the bottleneck-driven throughput
 * with a small headroom so the line stays loaded.
 */

import type { GarmentTemplate } from '../domain';
import type { SimConfig } from './sim-state';
import type { ServiceDist, QueueDiscipline } from './index';
import type { ModelTimeUnit } from './timeUnit';
import { DEFAULT_LINE_POLICY } from '../domain/twin';

export interface BuildModelOptions {
  garment: GarmentTemplate;
  operators: number;
  bundleSize?: number;
  arrivalRatePerHour?: number;
  smvVariance?: number;
  randomSeed?: number;
  /**
   * Engine time unit — what one tick of `state.time` represents. Defaults
   * to 'minute' (matches the SMV unit in the apparel domain). Pass the
   * project's `time.modelTimeUnit` to keep UI labels honest.
   */
  modelTimeUnit?: ModelTimeUnit;
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

  const bottleneckCycle = Math.max(...ops.map((op, i) => op.smv / stationServers[i]));
  const piecesPerHour = bottleneckCycle > 0 ? 60 / bottleneckCycle : 0;
  const bundleSize = opts.bundleSize ?? DEFAULT_LINE_POLICY.bundleSize;
  const bundlesPerHour = piecesPerHour / Math.max(1, bundleSize);
  // 10 % headroom keeps the head of the line loaded.
  const arrivalRatePerHour = opts.arrivalRatePerHour ?? bundlesPerHour * 1.1;

  // Queueing-theory overrides per station — extracted from the operation
  // record. The engine treats undefined entries as "use the default".
  const serviceDistributions: (ServiceDist | undefined)[] = ops.map(
    (op) => op.serviceDistribution,
  );
  const stationCapacities: (number | undefined)[] = ops.map(
    (op) => op.queueCapacity,
  );
  const queueDisciplines: (QueueDiscipline | undefined)[] = ops.map(
    (op) => op.queueDiscipline,
  );

  return {
    garmentTemplateId: garment.id,
    operations: ops,
    stationServers,
    bundleSize,
    arrivalRatePerHour,
    smvVariance: opts.smvVariance ?? 0.15,
    randomSeed: opts.randomSeed ?? 42,
    serviceDistributions,
    stationCapacities,
    queueDisciplines,
    modelTimeUnit: opts.modelTimeUnit ?? 'minute',
  };
}
