/**
 * Model builder — twin → SimConfig. Lets the user simulate the factory they
 * authored in Factory Builder instead of an idealised line synthesised from a
 * raw garment template. Mirrors `buildSimConfig` (model.ts) in output shape so
 * `useSim` consumes the result with no engine changes.
 *
 * Inputs we read from the twin:
 *   • workstations[] — each with operation.opId, operation.bundleSize,
 *     resources.workersRequired, position, rotation.
 *   • connectors[] (kind='flow') — directed topology that determines the
 *     operation order when present. Otherwise we fall back to the garment
 *     template's natural precedence / array order.
 *
 * Multi-server collapse — multiple workstations on the same opId become one
 * engine station with N parallel servers. Their workersRequired counts seed
 * the page operator pool; positions are averaged for the renderer overlay.
 */

import type { GarmentTemplate, Operation } from '../domain';
import type { Twin, Workstation } from '../domain/twin';
import type { SimConfig } from './engine';
import type { ServiceDist, QueueDiscipline } from './index';
import type { ModelTimeUnit } from './timeUnit';

export interface SkippedWorkstation {
  wsId: string;
  name: string;
  reason: 'no-op-id' | 'unresolved-op-id';
}

/** Block.kind values that are wired into the engine as parameters (Source =
 *  arrival rate, ResourcePool = operator pool, Sink = drain) rather than
 *  ticking stations. These are part of the simulation by design and must not
 *  be reported as "skipped" — that's a user-error signal. */
const NON_SERVICE_BLOCK_KINDS = new Set([
  'Source',
  'Sink',
  'ResourcePool',
  'Queue',
  'Hold',
  'Wait',
  'Seize',
  'Release',
  'SelectOutput',
  'SelectOutput5',
]);

export interface InfraWorkstation {
  wsId: string;
  name: string;
  /** What role the block plays in the engine wiring. */
  role: 'Source' | 'Sink' | 'ResourcePool' | 'Queue' | 'Hold' | 'Wait' | 'Seize' | 'Release' | 'SelectOutput' | 'SelectOutput5';
}

/** Per-opId aggregation: which workstations, mean position, summed workers. */
export interface TwinStationMeta {
  opId: string;
  wsIds: string[];
  /** Mean grid position across the workstations on this op. */
  gx: number;
  gy: number;
  /** Pre-aggregation workers requested in Builder. */
  workersRequested: number;
}

export interface BuildFromTwinMeta {
  /** Workstations that participated in the simulation, in operation order. */
  simulatedWsIds: string[];
  /** Workstations dropped because of a user error (no opId on a Service block,
   *  or an opId that doesn't resolve in the chosen garment). */
  skipped: SkippedWorkstation[];
  /** Non-Service blocks that are wired into the engine as parameters rather
   *  than ticking stations: Source feeds arrivals, ResourcePool seeds the
   *  operator pool, Sink drains finished pieces, etc. These are intentional
   *  parts of the simulation, not dropped workstations. */
  infrastructure: InfraWorkstation[];
  /** Default operator-pool size — sum of workersRequired across simulated ws. */
  seedOperators: number;
  /** Default bundle-size — rounded mean across simulated ws' operation.bundleSize. */
  seedBundleSize: number;
  /** How the operation sequence was derived. */
  topologySource: 'connectors' | 'opIdPrecedence';
  /** Per-engine-station extras the renderer needs to honour Builder positions. */
  stations: TwinStationMeta[];
  /** Garment template chosen as the dominant context for this run. */
  garment: GarmentTemplate;
  /** True when the chosen garment was inferred from a workstation pin (a
   *  workstation carries `operation.garmentId`). False when no workstation
   *  pinned a garment and the run fell back to the project default — in that
   *  case the UI's GARMENT dropdown is still a meaningful knob. */
  garmentPinned: boolean;
}

export interface BuildFromTwinOptions {
  /** Active twin from `useTwin(selectActiveTwin)`. */
  twin: Twin;
  /** Map of all known garment templates (built-in + project edits). */
  garmentsById: Record<string, GarmentTemplate>;
  /** Fallback garment when a workstation didn't pin one. */
  defaultGarmentId: string;
  /** Per-op efficiency map from `efficiencyFromSkillMatrix`. */
  opEfficiency?: Record<string, number>;
  modelTimeUnit?: ModelTimeUnit;
  smvVariance?: number;
  randomSeed?: number;
  arrivalRatePerHour?: number;
}

export interface BuildFromTwinResult {
  config: SimConfig;
  meta: BuildFromTwinMeta;
}

/**
 * Build a runnable SimConfig from the twin's workstations and connectors.
 *
 * Throws when the twin has no workstation that resolves to a known operation
 * — the caller (Builder button / LiveSim) should guard against this with a
 * disabled-state tooltip or an empty-state panel.
 */
export function buildSimConfigFromTwin(opts: BuildFromTwinOptions): BuildFromTwinResult {
  const { twin, garmentsById, defaultGarmentId } = opts;

  // ── Step 1: pick the dominant garment ─────────────────────────────────
  // When multiple workstations reference different garmentIds, the most-
  // common wins; ties fall back to the default. The engine is single-product
  // by design — one garment per run is honest to the current capability.
  const garmentCounts = new Map<string, number>();
  for (const ws of twin.workstations) {
    const gid = ws.operation.garmentId;
    if (gid && garmentsById[gid]) {
      garmentCounts.set(gid, (garmentCounts.get(gid) ?? 0) + 1);
    }
  }
  let chosenGarmentId = defaultGarmentId;
  let bestCount = 0;
  for (const [gid, count] of garmentCounts) {
    if (count > bestCount) {
      bestCount = count;
      chosenGarmentId = gid;
    }
  }
  const garment =
    garmentsById[chosenGarmentId] ?? garmentsById[defaultGarmentId];
  if (!garment) {
    throw new Error(`buildSimConfigFromTwin: no garment template found (chosen=${chosenGarmentId}, default=${defaultGarmentId})`);
  }
  const opById: Record<string, Operation> = {};
  for (const op of garment.operations) opById[op.id] = op;

  // ── Step 2: classify each workstation ─────────────────────────────────
  // - kept: a Service block whose opId resolves in the chosen garment.
  // - infrastructure: Source / Sink / ResourcePool / Queue / etc — these
  //   are part of the engine wiring (arrival rate, operator pool, drain),
  //   not ticking stations, so they're never expected to have an opId.
  // - skipped: a Service block where the user forgot to assign an opId,
  //   or the assigned op belongs to a different garment template.
  const kept: Workstation[] = [];
  const infrastructure: InfraWorkstation[] = [];
  const skipped: SkippedWorkstation[] = [];
  for (const ws of twin.workstations) {
    const blockKind = ws.block?.kind;
    if (blockKind && NON_SERVICE_BLOCK_KINDS.has(blockKind)) {
      infrastructure.push({
        wsId: ws.id,
        name: ws.name,
        role: blockKind as InfraWorkstation['role'],
      });
      continue;
    }
    if (!ws.operation.opId) {
      skipped.push({ wsId: ws.id, name: ws.name, reason: 'no-op-id' });
      continue;
    }
    if (!opById[ws.operation.opId]) {
      skipped.push({ wsId: ws.id, name: ws.name, reason: 'unresolved-op-id' });
      continue;
    }
    kept.push(ws);
  }

  if (kept.length === 0) {
    throw new Error('buildSimConfigFromTwin: no simulatable workstations (assign an operation to at least one workstation in Builder).');
  }

  // ── Step 3: group by opId, average positions, sum workers ─────────────
  const byOpId = new Map<string, Workstation[]>();
  for (const ws of kept) {
    const opId = ws.operation.opId!;
    const arr = byOpId.get(opId) ?? [];
    arr.push(ws);
    byOpId.set(opId, arr);
  }

  // ── Step 4: determine operation order ─────────────────────────────────
  // Connector path wins when any flow edge exists in the twin. Otherwise
  // fall back to the garment template's array order (which already
  // encodes `precedes`/`follows`).
  const flowEdges = twin.connectors.filter((c) => c.kind === 'flow');
  let orderedOpIds: string[];
  let topologySource: 'connectors' | 'opIdPrecedence';
  if (flowEdges.length > 0) {
    orderedOpIds = topoSortByConnectors(kept, flowEdges, byOpId);
    topologySource = 'connectors';
  } else {
    // Filter the garment's natural operation list down to the opIds the user
    // actually placed. Preserves the bulletin's precedence implicitly.
    orderedOpIds = garment.operations
      .map((o) => o.id)
      .filter((id) => byOpId.has(id));
    topologySource = 'opIdPrecedence';
  }

  // ── Step 5: build engine arrays in operation order ────────────────────
  const operations: Operation[] = [];
  const stationServers: number[] = [];
  const stations: TwinStationMeta[] = [];
  const serviceDistributions: (ServiceDist | undefined)[] = [];
  const stationCapacities: (number | undefined)[] = [];
  const queueDisciplines: (QueueDiscipline | undefined)[] = [];

  let totalWorkers = 0;
  const bundleSizeSamples: number[] = [];

  for (const opId of orderedOpIds) {
    const op = opById[opId];
    const wsList = byOpId.get(opId) ?? [];
    if (wsList.length === 0) continue;

    operations.push(op);
    stationServers.push(wsList.length);

    let workersAtOp = 0;
    let sumX = 0;
    let sumY = 0;
    for (const ws of wsList) {
      const w = ws.resources.workersRequired ?? 1;
      workersAtOp += w;
      sumX += ws.position.x;
      sumY += ws.position.y;
      const bs = ws.operation.bundleSize;
      if (bs && bs > 0) bundleSizeSamples.push(bs);
    }
    totalWorkers += workersAtOp;
    stations.push({
      opId,
      wsIds: wsList.map((w) => w.id),
      gx: sumX / wsList.length,
      gy: sumY / wsList.length,
      workersRequested: workersAtOp,
    });

    serviceDistributions.push(op.serviceDistribution);
    stationCapacities.push(op.queueCapacity);
    queueDisciplines.push(op.queueDiscipline);
  }

  // ── Step 6: arrival rate from bottleneck cycle, honouring efficiency ──
  const eff = (id: string) => opts.opEfficiency?.[id] ?? 1;
  const effSmv = (id: string, smv: number) => (eff(id) > 0 ? smv / eff(id) : smv);
  const bottleneckCycle = Math.max(
    ...operations.map((op, i) => effSmv(op.id, op.smv) / stationServers[i]),
  );
  const seedBundleSize =
    bundleSizeSamples.length > 0
      ? Math.max(1, Math.round(bundleSizeSamples.reduce((s, v) => s + v, 0) / bundleSizeSamples.length))
      : garment.defaultBundleSize;
  const piecesPerHour = bottleneckCycle > 0 ? 60 / bottleneckCycle : 0;
  const bundlesPerHour = piecesPerHour / Math.max(1, seedBundleSize);
  const arrivalRatePerHour = opts.arrivalRatePerHour ?? bundlesPerHour * 1.1;

  const config: SimConfig = {
    garmentTemplateId: garment.id,
    operations,
    stationServers,
    bundleSize: seedBundleSize,
    arrivalRatePerHour,
    smvVariance: opts.smvVariance ?? 0.15,
    randomSeed: opts.randomSeed ?? 42,
    opEfficiency: opts.opEfficiency,
    serviceDistributions,
    stationCapacities,
    queueDisciplines,
    modelTimeUnit: opts.modelTimeUnit ?? 'minute',
  };

  const meta: BuildFromTwinMeta = {
    simulatedWsIds: kept.map((w) => w.id),
    skipped,
    infrastructure,
    seedOperators: totalWorkers,
    seedBundleSize,
    topologySource,
    stations,
    garment,
    garmentPinned: bestCount > 0,
  };

  return { config, meta };
}

/**
 * Topological sort of the kept workstations' opIds by flow connectors.
 * Collapses workstation-level edges to opId-level edges, then Kahn-sorts.
 * On a cycle (or disconnected sub-graphs) we fall back to garment-template
 * array order for the unplaced opIds so the run still proceeds.
 */
function topoSortByConnectors(
  kept: Workstation[],
  flowEdges: { fromWsId: string; toWsId: string }[],
  byOpId: Map<string, Workstation[]>,
): string[] {
  const wsToOp = new Map<string, string>();
  for (const ws of kept) wsToOp.set(ws.id, ws.operation.opId!);

  // Build a unique opId-level edge set, skipping self-loops.
  const adj = new Map<string, Set<string>>();
  const inDeg = new Map<string, number>();
  for (const op of byOpId.keys()) {
    adj.set(op, new Set());
    inDeg.set(op, 0);
  }
  for (const e of flowEdges) {
    const from = wsToOp.get(e.fromWsId);
    const to = wsToOp.get(e.toWsId);
    if (!from || !to || from === to) continue;
    const set = adj.get(from)!;
    if (!set.has(to)) {
      set.add(to);
      inDeg.set(to, (inDeg.get(to) ?? 0) + 1);
    }
  }

  // Kahn's algorithm — process nodes with in-degree 0, peel back.
  const queue: string[] = [];
  for (const [op, deg] of inDeg) if (deg === 0) queue.push(op);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const op = queue.shift()!;
    ordered.push(op);
    for (const next of adj.get(op) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  // Cycle remnant — append any unprocessed opIds in their natural order so
  // the run doesn't drop stations silently.
  if (ordered.length < byOpId.size) {
    for (const op of byOpId.keys()) {
      if (!ordered.includes(op)) ordered.push(op);
    }
  }
  return ordered;
}
