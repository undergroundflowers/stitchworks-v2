/**
 * Shared "blank draft factory + seeded sewing line" builder.
 *
 * Used by the Orders ("Build in Builder") and Simulation ("Edit in Builder")
 * flows to spin up a fresh, isolated Factory Builder draft in a new browser
 * tab without touching the user's canonical factory.
 *
 * The result is a fully-populated Twin with:
 *   - One Sewing department sized for the operation count.
 *   - One SewingLine carrying the order's garment / production system /
 *     operator target.
 *   - One Workstation per operation in the garment's bulletin, placed in a
 *     snaking row, wired to the line, with the operation id, machine catalog
 *     id and cycle-time props already authored. The user lands on a
 *     simulatable line they can refine — not an empty canvas.
 *
 * The mapping from machine code (DNL, SNL, 4OL, …) to iso-catalog id reuses
 * `catalogForMachine` from `domain/reference-twin.ts` so a draft line looks
 * visually identical to a reference-paper line.
 */

import {
  emptyTwin,
  makeWorkstation,
  newConnectorId,
  newDeptId,
  newLineId,
  type Connector,
  type Department,
  type DepartmentColorKey,
  type ProductionSystemKey,
  type SewingLine,
  type Twin,
} from '../domain/twin';
import type { GarmentTemplate } from '../domain/garments';
import { catalogForMachine } from '../domain/reference-twin';

/** How wide the workstation grid can grow before wrapping to a new row. */
const STATIONS_PER_ROW = 7;
/** Horizontal spacing between adjacent workstations, in cells. */
const STATION_DX = 3;
/** Vertical spacing between rows of workstations, in cells. */
const ROW_DY = 4;

export interface DraftLineSeed {
  /** Display name used for the draft factory and the seeded SewingLine. */
  draftName: string;
  /** Production system the line is paced by — mapped from the order's
   *  wider `ProductionSystem` set onto the Builder's narrower key set
   *  by the caller. */
  productionSystem: ProductionSystemKey;
  /** Garment template the line should produce. When supplied, the helper
   *  auto-places one workstation per operation in the bulletin. */
  garment?: GarmentTemplate;
  /** Operator target rolled up onto the SewingLine entity. */
  operatorTarget: number;
  /** Accent colour for the line — defaults to `'brand'`. */
  color?: DepartmentColorKey;
  /** Free-form notes (PO number, deadline) recorded on the line. */
  notes?: string;
}

export interface DraftBuildResult {
  twin: Twin;
  deptId: string;
  lineId: string;
}

/**
 * Build the blank-but-seeded twin. Returns the twin plus the ids the caller
 * needs to deep-link the Builder into the right selection on mount.
 */
export function buildSeededDraftTwin(seed: DraftLineSeed): DraftBuildResult {
  const ops = seed.garment?.operations ?? [];
  const rowCount = Math.max(1, Math.ceil(ops.length / STATIONS_PER_ROW));

  // Size the dept so the workstation grid fits, with a small gutter for the
  // dept's own label and future user-added stations.
  const deptOriginX = 2;
  const deptOriginY = 2;
  const deptW = Math.max(18, STATIONS_PER_ROW * STATION_DX + 4);
  const deptH = Math.max(10, rowCount * ROW_DY + 4);

  const blank = emptyTwin(`Draft · ${seed.draftName}`);
  const deptId = newDeptId();
  const lineId = newLineId();

  const dept: Department = {
    id: deptId,
    name: 'Sewing Floor',
    kind: 'Sewing',
    color: 'blue',
    bounds: { x: deptOriginX, y: deptOriginY, w: deptW, h: deptH },
    notes: `Seeded for ${seed.draftName}.`,
  };
  const line: SewingLine = {
    id: lineId,
    deptId,
    name: seed.draftName,
    productionSystem: seed.productionSystem,
    garmentId: seed.garment?.id,
    color: seed.color ?? 'brand',
    operatorTarget: seed.operatorTarget,
    notes: seed.notes,
  };

  // Auto-place one workstation per operation in a snaking grid inside the
  // dept's interior. Each station is wired to the line and pre-authored
  // with the op's catalog machine, cycle time and PML Service block so the
  // Builder canvas renders a recognisable sewing line on first paint.
  const workstations = ops.map((op, i) => {
    const row = Math.floor(i / STATIONS_PER_ROW);
    const col = i % STATIONS_PER_ROW;
    const colInRow = row % 2 === 0 ? col : STATIONS_PER_ROW - 1 - col;
    const x = deptOriginX + 2 + colInRow * STATION_DX;
    const y = deptOriginY + 2 + row * ROW_DY;
    const catalogId = catalogForMachine(op.machineCode);
    const ws = makeWorkstation({
      deptId,
      catalogId,
      position: { x, y },
      name: `${i + 1}. ${op.name}`,
    });
    ws.lineId = lineId;
    ws.operation = {
      ...ws.operation,
      opId: op.id,
      garmentId: seed.garment?.id,
      bundleSize: seed.garment?.defaultBundleSize,
      freeText: `SMV ${op.smv.toFixed(3)} min`,
    };
    ws.block = {
      kind: 'Service',
      params: {
        cycleS: Math.max(1, Math.round(op.smv * 60)),
        servers: 1,
      },
    };
    ws.kpiTargets = {
      ...ws.kpiTargets,
      capacityPerHr: op.smv > 0 ? Math.round(60 / op.smv) : undefined,
    };
    ws.props = {
      ...ws.props,
      cycle_s: Math.round(op.smv * 60),
      servers: 1,
    };
    return ws;
  });

  // Wire each station to its successor with a flow connector so the line
  // reads as a sequential production flow on the PML / LOGIC views and the
  // engine can route bundles end-to-end without the user having to drag
  // arrows. We do NOT add an explicit Source / Sink — the user can drop
  // those later from the BLOCKS palette if they want a closed graph.
  const connectors: Connector[] = [];
  for (let i = 0; i < workstations.length - 1; i++) {
    connectors.push({
      id: newConnectorId(),
      kind: 'flow',
      fromWsId: workstations[i].id,
      toWsId: workstations[i + 1].id,
    });
  }

  return {
    twin: {
      ...blank,
      gridW: Math.max(blank.gridW, deptOriginX + deptW + 4),
      gridH: Math.max(blank.gridH, deptOriginY + deptH + 4),
      departments: [dept],
      lines: [line],
      workstations,
      connectors,
    },
    deptId,
    lineId,
  };
}
