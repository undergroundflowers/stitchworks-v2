/**
 * Pilot Factory 1.0 — a sandbox sewing factory used to study line replacement.
 *
 * Modelling principles followed here:
 *   • A factory is a collection of departments. The pilot focuses on a single
 *     SEWING DEPARTMENT — the most material-intensive department on the floor.
 *   • A department contains operations performed on material. Each operation
 *     happens at a workstation, facilitated by workforce and resources.
 *   • A sewing floor is organised into production lines. Each line manufactures
 *     a particular product following its own operation breakdown bulletin.
 *   • Material moves through the line on flow connectors (intra-department
 *     flow): Bundle IN → op 1 → op 2 → … → op N → Bundle OUT.
 *   • Workforce is split into static workers (operators bound to a specific
 *     station) and mobile workers (supervisors, helpers that float). Resources
 *     (WIP racks) are placed once per line and shared across stations.
 *
 * The twin built here is a faithful PBS line — every workstation carries the
 * real operation from the chosen garment's bulletin, the correct machine
 * fixture, an operator, and is wired to the next op with a flow connector.
 */

import {
  TWIN_SCHEMA_VERSION,
  makeWorkstation,
  newConnectorId,
  newDeptId,
  newLineId,
  newTwinId,
  type Connector,
  type Department,
  type SewingLine,
  type Twin,
  type Workstation,
} from './twin';
import { GARMENT_TEMPLATES } from './garments';
import type { OperationCategory } from './operations';

// ============================================================================
// PUBLIC NAMES
// ============================================================================

export const PILOT_FACTORY_NAME = 'Pilot Factory 1.0';

/** Default bundle size for the pilot lines. PBS bundles of 20 are typical for
 *  knit T-shirt assembly. Overridable per line via PilotLineSpec.bundleSize. */
const PILOT_BUNDLE_SIZE = 20;

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

/** Number of operations laid out per zig-zag sub-row before wrapping. */
const OPS_PER_SUBROW = 10;

/** Horizontal spacing between consecutive sewing stations (in grid cells). */
const STATION_X_STEP = 2;

/** y-offset from a station to the operator placed behind it. */
const OPERATOR_Y_OFFSET = 2;

/** Total y-cells consumed by one sub-row (station + operator + buffer). */
const SUBROW_HEIGHT = 4;

/** y-offset from a sub-row to the next sub-row in the same line. */
const SUBROW_GAP = 0;

/** x position of Bundle IN at the head of every line. */
const BUNDLE_IN_X = 0;

/** Buffer cells between the last sewing station and Bundle OUT. */
const BUNDLE_OUT_PAD = 2;

// ============================================================================
// SEED SPECS
// ============================================================================

export interface PilotLineSpec {
  /** Short label, e.g. "Line 1". Used in workstation names and labels. */
  name: string;
  /** Garment template id (key in GARMENT_TEMPLATES). */
  garmentId: string;
  /** Optional bundle-size override. Defaults to PILOT_BUNDLE_SIZE. */
  bundleSize?: number;
}

/** The two seed lines that ship with Pilot Factory 1.0. */
export const PILOT_SEED_LINES: PilotLineSpec[] = [
  { name: 'Line 1', garmentId: 'tshirt' },
  { name: 'Line 2', garmentId: 'polo' },
];

// ============================================================================
// FIXTURE MAPPING
// ============================================================================

/** Map a machine code from the garment bulletin to the iso-catalog fixture id
 *  that represents it on the Builder canvas. */
function fixtureIdFromMachine(machineCode: string): string {
  switch (machineCode) {
    case '4OL':
    case '5OL':
    case '3OL':
      return 'a_4ol';
    case 'FL':
      return 'a_flatlock';
    case 'PRESS':
      return 'a_iron_inline';
    case 'INSP':
      return 'a_inspect_table';
    case 'MNL':
      return 'fx_qctab';
    case 'FUSE':
      return 'a_snls';
    case 'SNL':
    case 'DNL':
    case 'FB':
    case 'KS':
    case 'BT':
    case 'BH':
    case 'BS':
    default:
      return 'a_snls';
  }
}

/** Map an operation category to the operator archetype that staffs it. */
function operatorIdForCategory(category: OperationCategory): string {
  switch (category) {
    case 'inspection':
      return 'op_qc';
    case 'pressing':
    case 'fusing':
      return 'op_helper';
    case 'manual':
      return 'op_helper';
    case 'sewing':
    default:
      return 'op_sewer';
  }
}

// ============================================================================
// LAYOUT MATH
// ============================================================================

/**
 * Compute the grid position of the n-th operation in a line laid out as a
 * zig-zag: row 0 left-to-right, row 1 right-to-left, row 2 left-to-right.
 * Stations sit on the station row; the operator behind each station sits on
 * the row OPERATOR_Y_OFFSET cells deeper. */
function layoutOpPosition(
  opIndex: number,
  lineYBase: number,
): { x: number; y: number; operatorY: number } {
  const subrow = Math.floor(opIndex / OPS_PER_SUBROW);
  const indexInRow = opIndex % OPS_PER_SUBROW;
  const leftToRight = subrow % 2 === 0;
  const colIndex = leftToRight ? indexInRow : OPS_PER_SUBROW - 1 - indexInRow;
  const x = 2 + colIndex * STATION_X_STEP;
  const y = lineYBase + subrow * (SUBROW_HEIGHT + SUBROW_GAP);
  return { x, y, operatorY: y + OPERATOR_Y_OFFSET };
}

/** Total y-cells consumed by a line carrying `opCount` operations. */
function lineHeight(opCount: number): number {
  const subrows = Math.max(1, Math.ceil(opCount / OPS_PER_SUBROW));
  return subrows * (SUBROW_HEIGHT + SUBROW_GAP) - SUBROW_GAP;
}

// ============================================================================
// CORE BUILDER
// ============================================================================

interface BuildLineOutput {
  line: SewingLine;
  workstations: Workstation[];
  connectors: Connector[];
}

/**
 * Build one production line: every operation in the garment's bulletin gets a
 * workstation, an operator workstation, and a flow connector to the next op.
 * Bundle IN sits at the head, Bundle OUT at the tail of the last sub-row. */
function buildLine(opts: {
  deptId: string;
  spec: PilotLineSpec;
  yBase: number;
  accent: 'blue' | 'brand';
}): BuildLineOutput {
  const garment = GARMENT_TEMPLATES[opts.spec.garmentId];
  if (!garment) {
    throw new Error(`buildLine: unknown garment "${opts.spec.garmentId}"`);
  }
  const lineId = newLineId();
  const bundleSize = opts.spec.bundleSize ?? PILOT_BUNDLE_SIZE;
  const operatorTarget = garment.operations.filter(
    (o) => o.category === 'sewing' || o.category === 'manual',
  ).length;

  const line: SewingLine = {
    id: lineId,
    deptId: opts.deptId,
    name: `${opts.spec.name} · ${garment.name}`,
    productionSystem: 'PBS',
    garmentId: garment.id,
    color: opts.accent === 'blue' ? 'blue' : 'brand',
    operatorTarget,
    notes: `${garment.operations.length}-operation PBS line, bundle ${bundleSize}, ${operatorTarget} operators.`,
  };

  const stations: Workstation[] = [];
  const operators: Workstation[] = [];
  const connectors: Connector[] = [];

  // Bundle IN at the head of sub-row 0.
  // Explicitly tag as a PML Source with a bundle-aware emission rate.
  // Without this, the catalog inference still picks Source (per the
  // pml.ts CATALOG_TO_BLOCK map) but `getBlockParams` falls back to
  // 60 agents/hr × 1 piece/agent — i.e. 60 pcs/hr — which becomes the
  // global bottleneck for every line regardless of its garment / SMV.
  // The result was that Line 1 (T-shirt) and Line 2 (Polo) both
  // bottomed out at the same 339 pcs/shift even though their per-op
  // SMVs differ. Sizing the Source from the line's bottleneck cycle
  // makes sewing capacity the real bottleneck.
  const bottleneckSmvMin = Math.max(
    1e-3,
    ...garment.operations.map((o) => o.smv),
  );
  const lineMaxPcsPerHr = 60 / bottleneckSmvMin; // 1 server per op
  // 1.5× safety so the line is never starved; rounded up to whole bundles.
  const bundleRatePerHr = Math.max(
    1,
    Math.ceil((lineMaxPcsPerHr / bundleSize) * 1.5),
  );

  const bundleIn = makeWorkstation({
    deptId: opts.deptId,
    catalogId: 'buf_in',
    position: { x: BUNDLE_IN_X, y: opts.yBase },
    name: `${opts.spec.name} · Bundle IN`,
  });
  bundleIn.lineId = lineId;
  bundleIn.block = {
    kind: 'Source',
    params: {
      sourceRatePerHr: bundleRatePerHr,
      piecesPerAgent: bundleSize,
    },
  };
  stations.push(bundleIn);

  // One workstation per operation in the bulletin order.
  let prevSewingWsId: string = bundleIn.id;
  const opStations: Workstation[] = [];
  garment.operations.forEach((op, idx) => {
    const pos = layoutOpPosition(idx, opts.yBase);
    const fixtureId = fixtureIdFromMachine(op.machineCode);
    const ws = makeWorkstation({
      deptId: opts.deptId,
      catalogId: fixtureId,
      position: { x: pos.x, y: pos.y },
      name: `${opts.spec.name} · ${op.name}`,
    });
    ws.lineId = lineId;
    ws.operation = {
      opId: op.id,
      garmentId: garment.id,
      bundleSize,
    };
    ws.resources = {
      ...ws.resources,
      workersRequired: 1,
      machineId: fixtureId,
    };
    // Pin the Service cycle to the operation's SMV (× bundleSize, because
    // one engine "agent" carries a full bundle of pieces). Without this,
    // getBlockParams falls back to the catalog's generic `cycle_s` (35s
    // for any sewing machine), which makes every line run at the same
    // tempo regardless of which garment it's stitching — Line 1 (T-shirt)
    // and Line 2 (Polo) come out with identical throughput. SMV is in
    // minutes-per-piece, so the agent's bundle-level cycle is
    // smv × bundleSize × 60 seconds.
    ws.block = {
      kind: 'Service',
      params: {
        cycleS: Math.max(1, Math.round(op.smv * bundleSize * 60)),
        servers: Math.max(1, Math.round(op.servers ?? 1)),
      },
    };
    stations.push(ws);
    opStations.push(ws);

    // Static operator placed BEHIND the machine (deeper into the floor).
    const operatorFixture = operatorIdForCategory(op.category);
    const operator = makeWorkstation({
      deptId: opts.deptId,
      catalogId: operatorFixture,
      position: { x: pos.x, y: pos.operatorY },
      name: `${opts.spec.name} · OPR-${String(idx + 1).padStart(2, '0')}`,
    });
    operator.lineId = lineId;
    operators.push(operator);

    // Flow connector from the previous station to this one.
    connectors.push({
      id: newConnectorId(),
      kind: 'flow',
      fromWsId: prevSewingWsId,
      toWsId: ws.id,
    });
    prevSewingWsId = ws.id;
  });

  // Bundle OUT at the tail. Place it past the last operation's column on the
  // same sub-row so the closing connector reads as a clean exit.
  const lastIdx = garment.operations.length - 1;
  const lastPos = layoutOpPosition(lastIdx, opts.yBase);
  const lastSubrow = Math.floor(lastIdx / OPS_PER_SUBROW);
  const lastWentLeftToRight = lastSubrow % 2 === 0;
  const outX = lastWentLeftToRight
    ? lastPos.x + BUNDLE_OUT_PAD
    : lastPos.x - BUNDLE_OUT_PAD;
  const bundleOut = makeWorkstation({
    deptId: opts.deptId,
    catalogId: 'buf_out',
    position: { x: Math.max(0, outX), y: lastPos.y },
    name: `${opts.spec.name} · Bundle OUT`,
  });
  bundleOut.lineId = lineId;
  bundleOut.block = { kind: 'Sink' };
  stations.push(bundleOut);
  connectors.push({
    id: newConnectorId(),
    kind: 'flow',
    fromWsId: prevSewingWsId,
    toWsId: bundleOut.id,
  });

  // ── Workforce extras: one supervisor (mobile) per line. ─────────────────
  // Placed between the first and second sub-row to read as "overseeing".
  const supervisor = makeWorkstation({
    deptId: opts.deptId,
    catalogId: 'op_super',
    position: {
      x: OPS_PER_SUBROW * STATION_X_STEP / 2 + 1,
      y: opts.yBase + SUBROW_HEIGHT - 1,
    },
    name: `${opts.spec.name} · Supervisor`,
  });
  supervisor.lineId = lineId;

  // ── Resources: a WIP rack at the head of the line and another at the tail.
  const wipHead = makeWorkstation({
    deptId: opts.deptId,
    catalogId: 'a_wip_rack',
    position: { x: 1, y: opts.yBase + OPERATOR_Y_OFFSET + 1 },
    name: `${opts.spec.name} · WIP rack · head`,
  });
  wipHead.lineId = lineId;
  const wipTail = makeWorkstation({
    deptId: opts.deptId,
    catalogId: 'a_wip_rack',
    position: { x: Math.max(0, outX - 1), y: lastPos.y + OPERATOR_Y_OFFSET + 1 },
    name: `${opts.spec.name} · WIP rack · tail`,
  });
  wipTail.lineId = lineId;

  return {
    line,
    workstations: [...stations, ...operators, supervisor, wipHead, wipTail],
    connectors,
  };
}

/**
 * Build the Pilot Factory canonical twin. Pass a `specs` array to choose which
 * garments run on Line 1 / Line 2 — defaults to the seed lines (T-shirt + Polo).
 * Each line is laid out with its full operation bulletin, an operator behind
 * every station, and flow connectors chaining the whole bulletin.
 */
export function buildPilotFactoryTwin(
  specs: PilotLineSpec[] = PILOT_SEED_LINES,
): Twin {
  const now = new Date().toISOString();
  const dSew = newDeptId();

  // Compute total grid extent from the actual line heights so the canvas is
  // never clipped if a heavier garment (e.g. polo with 30 ops) lands on a line.
  const lineHeights = specs.map((s) => {
    const g = GARMENT_TEMPLATES[s.garmentId];
    return g ? lineHeight(g.operations.length) : SUBROW_HEIGHT;
  });
  const lineYBases: number[] = [];
  let cursorY = 2;
  for (const h of lineHeights) {
    lineYBases.push(cursorY);
    cursorY += h + 3; // 3-cell gap between lines for the aisle / supervisor
  }

  const totalHeight = cursorY + 2;
  const gridW = 28;
  const gridH = Math.max(28, totalHeight + 2);

  const departments: Department[] = [
    {
      id: dSew,
      name: 'Sewing Department',
      kind: 'Sewing',
      color: 'blue',
      bounds: { x: 0, y: 1, w: gridW - 2, h: totalHeight - 1 },
      notes:
        'Pilot sewing floor — two PBS production lines, full operation bulletin, ' +
        'one operator per workstation, flow connectors wire each line end-to-end.',
    },
  ];

  const lines: SewingLine[] = [];
  const workstations: Workstation[] = [];
  const connectors: Connector[] = [];

  specs.forEach((spec, idx) => {
    const built = buildLine({
      deptId: dSew,
      spec,
      yBase: lineYBases[idx],
      accent: idx === 0 ? 'blue' : 'brand',
    });
    lines.push(built.line);
    workstations.push(...built.workstations);
    connectors.push(...built.connectors);
  });

  return {
    schemaVersion: TWIN_SCHEMA_VERSION,
    id: newTwinId(),
    name: PILOT_FACTORY_NAME,
    parentTwinId: null,
    isCanonical: true,
    createdAt: now,
    modifiedAt: now,
    gridW,
    gridH,
    departments,
    lines,
    workstations,
    connectors,
    notes:
      'Pilot Factory 1.0 — single Sewing Department with two complete PBS production lines.',
  };
}

// ============================================================================
// RETOOLED VARIANTS (for scenario forks)
// ============================================================================

/**
 * Build a retooled variant where one of the two pilot lines has been swapped
 * to a new garment. The retooled line gets a fresh full-bulletin layout; the
 * untouched line keeps its seed garment. The resulting twin is marked as a
 * scenario (isCanonical=false, parentTwinId set by the caller).
 */
export function buildRetooledPilotTwin(input: {
  baseSpecs?: PilotLineSpec[];
  lineIndexToReplace: 0 | 1;
  newGarmentId: string;
  parentTwinId: string | null;
}): Twin {
  const base = input.baseSpecs ?? PILOT_SEED_LINES;
  const specs: PilotLineSpec[] = base.map((s, i) =>
    i === input.lineIndexToReplace ? { ...s, garmentId: input.newGarmentId } : s,
  );
  const twin = buildPilotFactoryTwin(specs);
  twin.parentTwinId = input.parentTwinId;
  twin.isCanonical = false;
  return twin;
}

/** Helper for the wizard UI — what the line cards should say. */
export function describePilotLineSpec(spec: PilotLineSpec): {
  garmentName: string;
  opCount: number;
  totalSmv: number;
  hourlyTarget100: number;
} {
  const garment = GARMENT_TEMPLATES[spec.garmentId];
  if (!garment) {
    return { garmentName: spec.garmentId, opCount: 0, totalSmv: 0, hourlyTarget100: 0 };
  }
  return {
    garmentName: garment.name,
    opCount: garment.operations.length,
    totalSmv: garment.totalSmv,
    hourlyTarget100: garment.hourlyTarget100,
  };
}
