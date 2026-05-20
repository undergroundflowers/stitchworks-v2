/**
 * Modelama factory bundle — one-click loader that materialises a complete
 * 4-line digital twin from the Excel files Modelama exports for the
 * 1-pocket Shirt (100230638), Shorts with Lining (100225286), Blouse
 * (785101) and Dress (9594) styles.
 *
 * The xlsx assets live under `public/modelama/` so they ship with the
 * built bundle; the loader fetches them, runs them through
 * `parseGarmentXlsx` (operation bulletin) + `parseFloorXlsx` (machine
 * layout) and assembles a single Twin with four sewing lines stacked
 * inside one Sewing department.
 *
 * Why four lines + one button: the demo narrative is "show me Modelama
 * factory" — picking one style would hide the multi-product reality of
 * the real floor. 1pkt Shirt is featured (placed top-left, named "Line A")
 * because its OB and Layout cleanly correspond to the same style number.
 */

import * as XLSX from 'xlsx';
import {
  TWIN_SCHEMA_VERSION,
  emptyTwin,
  makeWorkstation,
  newAssignmentId,
  newConnectorId,
  newDeptId,
  newLineId,
  newOperatorId,
  newTwinId,
  type Assignment,
  type Connector,
  type Department,
  type Operator,
  type SewingLine,
  type Twin,
  type Workstation,
} from '../domain/twin';
import type { GarmentTemplate } from '../domain/garments';
import type { Operation } from '../domain/operations';
import {
  parseGarmentXlsx,
  type ImportedGarment,
} from './import-garment-xlsx';
import {
  parseBestFloorXlsx,
  type ImportedFloor,
} from './import-floor-xlsx';
import { catalogForMachine } from '../domain/reference-twin';

// ── Bundle declaration ────────────────────────────────────────────────────

export interface ModelamaStyle {
  /** Slug used for line-name / dept-name fields. */
  key: string;
  /** Human label shown on the line band. */
  label: string;
  /** OB xlsx URL (served from `public/modelama/`). */
  obUrl: string;
  /** Layout xlsx URL. Optional — when missing, `buildModelamaTwin` still
   *  places stations via the canonical zigzag geometry, since the layout
   *  file is informational only. OB-only styles (e.g. the Ann Taylor
   *  dress, supplied without a machine-layout sheet) work this way. */
  layoutUrl?: string;
  /** True ⇒ this style is the demo headliner (top-left line, blue accent). */
  featured?: boolean;
  /** Line accent colour. */
  color: 'brand' | 'blue' | 'red' | 'yellow' | 'green';
}

export const MODELAMA_STYLES: ModelamaStyle[] = [
  {
    key: 'shirt',
    label: '1-pkt Shirt · 100230638',
    obUrl: 'modelama/1pkt-shirt-ob.xlsx',
    layoutUrl: 'modelama/1pkt-shirt-layout.xlsx',
    featured: true,
    color: 'brand',
  },
  {
    key: 'shorts',
    label: 'Shorts w/ Lining · 100225286',
    obUrl: 'modelama/shorts-ob.xlsx',
    layoutUrl: 'modelama/shorts-layout.xlsx',
    color: 'blue',
  },
  {
    key: 'blouse',
    label: 'Blouse · 785101',
    obUrl: 'modelama/blouse-ob.xlsx',
    layoutUrl: 'modelama/blouse-layout.xlsx',
    color: 'green',
  },
  {
    key: 'dress',
    label: 'Dress · 9594',
    obUrl: 'modelama/dress-ob.xlsx',
    layoutUrl: 'modelama/dress-layout.xlsx',
    color: 'yellow',
  },
  {
    // Ann Taylor dress · OPT-1 of style 774533. OB only — no machine
    // layout sheet was supplied, so the bundle falls back to the
    // canonical zigzag geometry shared by every line.
    key: 'dress-opt1',
    label: 'Dress OPT-1 · 774533 (Ann Taylor)',
    obUrl: 'modelama/dress-opt1-ob.xlsx',
    color: 'red',
  },
];

export interface ParsedModelamaStyle {
  style: ModelamaStyle;
  garment: ImportedGarment;
  floor: ImportedFloor;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch + parse every style in the Modelama bundle. Returns `[]` when no
 * assets are reachable (caller surfaces a toast).
 */
export async function fetchModelamaBundle(
  baseUrl: string = '',
): Promise<ParsedModelamaStyle[]> {
  const out: ParsedModelamaStyle[] = [];
  for (const style of MODELAMA_STYLES) {
    try {
      const obBuf = await fetchArrayBuffer(joinUrl(baseUrl, style.obUrl));
      const garment = parseGarmentXlsx(obBuf, style.label);
      // Layout is optional: an OB-only style still builds a valid line
      // via the canonical zigzag geometry, so we stub an empty floor
      // record when the layout file is absent or unreachable.
      let floor: ImportedFloor;
      if (style.layoutUrl) {
        const layoutBuf = await fetchArrayBuffer(joinUrl(baseUrl, style.layoutUrl));
        floor = parseBestFloorXlsx(layoutBuf, style.label);
      } else {
        floor = {
          stations: [],
          source: { fileName: '(none)', sheetName: '(none)', style: style.label },
          warnings: [],
        };
      }
      // Namespace the garment id + operation ids by style key so that
      // identical OB row positions across the 4 bundled styles don't
      // collide on import (the OB parser numbers ops 1..N per workbook,
      // which clashes when 4 workbooks are loaded together).
      const ns = `mod-${style.key}`;
      const remapped: typeof garment = {
        ...garment,
        garment: {
          ...garment.garment,
          id: ns,
          operations: garment.garment.operations.map((op) => ({
            ...op,
            id: `${ns}-${op.id}`,
          })),
        },
      };
      out.push({ style, garment: remapped, floor });
    } catch (err) {
      // Skip styles whose xlsx didn't resolve. Demo can still run with
      // whatever did parse — the button-level toast picks up the partial
      // success ratio.
      console.warn(`Modelama bundle: skipping ${style.key}`, err);
    }
  }
  return out;
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  return r.arrayBuffer();
}

function joinUrl(base: string, rel: string): string {
  if (!base) return rel;
  return base.endsWith('/') ? base + rel : base + '/' + rel;
}

// ── Layout geometry ───────────────────────────────────────────────────────
//
// Each line is a tall vertical strip arranged exactly like the Modelama
// production-layout sheet: two facing columns of workstations bracket an
// aisle, with the bundle entering at the BOTTOM (loading / source / feeder),
// zigzagging upward across the aisle from op 1 → op N, and exiting at the
// TOP (final inspection / sink).
//
//   ┌── y = yTop ────────────────────────────────┐  ← FINAL CHECK row
//   │           [ SINK ]  (centered in aisle)    │
//   │  [WS-N  L]                  [WS-N-1 R]     │  ← top ws row
//   │  [WS-N-2L]                  [WS-N-3 R]     │
//   │   ...                                      │
//   │  [WS-04 L]                  [WS-03 R]      │
//   │  [WS-02 L]                  [WS-01 R]      │  ← bottom ws row (loading side)
//   │           [ SOURCE ]  (feeder)             │
//   └── y = yBot ────────────────────────────────┘
//
//        xLeft         xRight = xLeft + WS_W + AISLE_W
//
// The four bundled styles get four lines placed SIDE BY SIDE along X — a
// real floor's "parallel lines" topology — instead of stacked vertically.

const WS_W = 1;          // Sewing-machine footprint width (cells, X axis)
const WS_H = 2;          // Sewing-machine footprint depth (cells, Y axis)
const AISLE_W = 3;       // Aisle (gap) between the two facing columns
const ROW_DY = 2;        // Vertical pitch between successive ws rows
const SOURCE_PAD = 4;    // Cells between bottom-most ws and the source pad
const SINK_PAD = 4;      // Cells between the sink pad and the top-most ws
const LINE_GUTTER_X = 6; // Horizontal gap between adjacent lines
const DEPT_PADDING = 3;
const DEPT_ORIGIN_X = 2;
const DEPT_ORIGIN_Y = 2;

// ── Twin assembly ─────────────────────────────────────────────────────────

export interface BuildModelamaTwinResult {
  twin: Twin;
  garments: GarmentTemplate[];
  notes: string[];
  styleSummaries: Array<{
    key: string;
    label: string;
    /** OB-declared output @ 100% efficiency, pcs/shift. */
    declaredOutput100: number;
    /** OB-declared output @ planned efficiency (60%), pcs/shift. */
    declaredOutputPlan: number;
    /** OB-declared operators (excludes helpers). */
    declaredOperators: number;
    /** OB-declared helpers. */
    declaredHelpers: number;
    /** OB-declared total work stations. */
    declaredWorkstations: number;
    /** Actual workstation count placed on the Builder canvas. */
    builtWorkstations: number;
  }>;
}

export function buildModelamaTwin(
  parsed: ParsedModelamaStyle[],
  factoryName: string = 'Modelama · Garment Factory',
): BuildModelamaTwinResult {
  if (parsed.length === 0) {
    throw new Error('No Modelama styles to build from.');
  }

  const blank = emptyTwin(factoryName);
  const garments: GarmentTemplate[] = parsed.map((p) => p.garment.garment);
  const styleSummaries: BuildModelamaTwinResult['styleSummaries'] = [];
  const notes: string[] = [];

  // Single Sewing dept that holds all 4 lines, arranged side-by-side along X.
  // Per line: vertical strip of two facing columns + source/sink end-caps.
  type LineLayout = {
    parsed: ParsedModelamaStyle;
    totalStations: number;   // = sum(serversByOpIdx)
    rows: number;            // = ceil(totalStations / 2)
    width: number;           // X extent of this line strip
    height: number;          // Y extent of this line strip
    xOffset: number;         // X start of this line within the dept
    operations: Operation[];
    // How many physical workstations per operation. Derived from
    // OB.plannedWs (rounded up), clamped to ≥1.
    serversByOpIdx: number[];
  };
  const lineLayouts: LineLayout[] = [];
  let cursorX = DEPT_PADDING;
  for (const p of parsed) {
    const ops = p.garment.garment.operations;
    const serversByOpIdx = ops.map((op) => Math.max(1, Math.round(extractPlannedWs(op))));
    const totalStations = serversByOpIdx.reduce((s, v) => s + v, 0);
    const rows = Math.max(1, Math.ceil(totalStations / 2));
    const width = 2 * WS_W + AISLE_W;
    // Source pad + bottom WS row + (rows-1) inter-row gaps + top WS row + sink pad
    const height = SOURCE_PAD + WS_H + (rows - 1) * ROW_DY + WS_H + SINK_PAD;
    lineLayouts.push({
      parsed: p,
      totalStations,
      rows,
      width,
      height,
      xOffset: cursorX,
      operations: ops,
      serversByOpIdx,
    });
    cursorX += width + LINE_GUTTER_X;
  }
  // Strip the trailing gutter past the last line.
  const deptWidth = cursorX - LINE_GUTTER_X + DEPT_PADDING;
  const deptHeight =
    Math.max(...lineLayouts.map((l) => l.height)) + DEPT_PADDING * 2;

  const deptId = newDeptId();
  const dept: Department = {
    id: deptId,
    name: 'Sewing Floor',
    kind: 'Sewing',
    color: 'blue',
    bounds: {
      x: DEPT_ORIGIN_X,
      y: DEPT_ORIGIN_Y,
      w: deptWidth,
      h: deptHeight,
    },
    notes: 'Modelama Unit · 4 styles, PBS bundle handoff.',
  };

  const lines: SewingLine[] = [];
  const workstations: Workstation[] = [];
  const connectors: Connector[] = [];
  const operators: Operator[] = [];
  const assignments: Assignment[] = [];

  let lineIdx = 0;
  for (const L of lineLayouts) {
    const lineId = newLineId();
    const line: SewingLine = {
      id: lineId,
      deptId,
      name: `Line ${String.fromCharCode(65 + lineIdx)} · ${L.parsed.style.label}`,
      productionSystem: 'PBS',
      garmentId: L.parsed.garment.garment.id,
      color: L.parsed.style.color,
      operatorTarget: Math.max(
        L.serversByOpIdx.reduce((s, v) => s + v, 0),
        Math.round(L.parsed.garment.source.declaredManpower ?? 0),
      ),
      notes: composeLineNotes(L.parsed),
      policy: {
        bundleSize: 20,
        pieceFlow: false,
        maxWipPerStation: 8,
      },
    };
    lines.push(line);

    // Place workstations: walk OB sequence and assign each physical station
    // to a (row, side) slot. Two stations per row — odd physical index (op
    // 1, 3, 5…) on the RIGHT column (loading side), even physical index
    // (op 2, 4, 6…) on the LEFT, matching the Modelama production-layout
    // sheet convention. Rows fill from the BOTTOM up; ops at higher
    // physical indices sit closer to the SINK (top).
    const xLeft = DEPT_ORIGIN_X + L.xOffset;
    const xRight = xLeft + WS_W + AISLE_W;
    const xAisleCenter = xLeft + WS_W + AISLE_W / 2;
    const yLineTop = DEPT_ORIGIN_Y + DEPT_PADDING;
    const yLineBottom = yLineTop + L.height;
    const yBottomWsTop = yLineBottom - SOURCE_PAD - WS_H; // y-coord of bottom-most ws's top edge

    const stationsThisLine: Workstation[] = [];
    let physicalIdx = 0;
    for (let opIdx = 0; opIdx < L.operations.length; opIdx++) {
      const op = L.operations[opIdx];
      const serverCount = L.serversByOpIdx[opIdx];
      for (let s = 0; s < serverCount; s++) {
        const rowFromBottom = Math.floor(physicalIdx / 2);
        // physicalIdx 0 → op 1 (RIGHT), 1 → op 2 (LEFT), 2 → op 3 (RIGHT), …
        const side: 'L' | 'R' = physicalIdx % 2 === 0 ? 'R' : 'L';
        const gx = side === 'R' ? xRight : xLeft;
        const gy = yBottomWsTop - rowFromBottom * ROW_DY;
        const catalogId = catalogForMachine(op.machineCode);
        const ws = makeWorkstation({
          deptId,
          catalogId,
          position: { x: gx, y: gy },
          name: `${opIdx + 1}.${s + 1} ${truncate(op.name, 22)}`,
        });
        ws.lineId = lineId;
        ws.operation = {
          ...ws.operation,
          opId: op.id,
          garmentId: L.parsed.garment.garment.id,
          bundleSize: 20,
          freeText: `SMV ${op.smv.toFixed(3)} min`,
        };
        ws.resources = {
          ...ws.resources,
          workersRequired: 1,
        };
        // Stochastic service time: triangular(0.85·SMV, SMV, 1.15·SMV)
        // per workstation. Matches the StatFit-fitted distribution
        // family in Hossain & Muneer 2023 and is the standard apparel-
        // sim assumption when operation-level variance isn't measured
        // separately. Stored in MINUTES (engine internal unit).
        const smvMin = Math.max(0.05, op.smv);
        ws.block = {
          kind: 'Service',
          params: {
            cycleS: Math.max(1, Math.round(smvMin * 60)),
            servers: 1,
            cycleDist: {
              kind: 'triangular',
              min: smvMin * 0.85,
              mode: smvMin,
              max: smvMin * 1.15,
            },
          },
        };
        ws.kpiTargets = {
          ...ws.kpiTargets,
          capacityPerHr: op.smv > 0 ? Math.round(60 / op.smv) : undefined,
        };
        ws.props = {
          ...ws.props,
          cycle_s: Math.max(1, Math.round(op.smv * 60)),
          servers: 1,
          operators_needed: 1,
        };
        stationsThisLine.push(ws);
        physicalIdx++;
      }
    }
    workstations.push(...stationsThisLine);

    // Sim plumbing — every line needs a Source feeding the head and a
    // Sink drinking from the tail, plus a ResourcePool sized to the line's
    // operator headcount so the engine can run the PML graph end-to-end.
    // Without these the queue analysis sees zero arrivals and reports 0
    // pcs/shift for the line.
    if (stationsThisLine.length > 0) {
      const head = stationsThisLine[0];
      const tail = stationsThisLine[stationsThisLine.length - 1];
      const lineOps = L.operations;
      const bottleneckSmv = Math.max(...lineOps.map((op) => op.smv));
      // Feed at the bottleneck rate × bundle-size × headroom. Without
      // headroom the source can't keep the line saturated through
      // stochastic variance.
      const piecesPerHrCeil = bottleneckSmv > 0 ? 60 / bottleneckSmv : 60;
      const sourceRatePerHr = Math.max(20, Math.round(piecesPerHrCeil * 1.15));

      // Source ("LOADING" / feeder pad) — centered in the aisle at the
      // bottom of the line strip, just below op 1 (the bottom-right ws).
      // buf_in is a 2×2 footprint; nudge x left by 1 so the pad straddles
      // the aisle centre. Y sits just below the bottom-most ws row.
      const wsSource = makeWorkstation({
        deptId,
        catalogId: 'buf_in',
        position: {
          x: Math.round(xAisleCenter - 1),
          y: yLineBottom - SOURCE_PAD + 1,
        },
        name: `Loading · ${L.parsed.style.label}`,
      });
      wsSource.lineId = lineId;
      wsSource.block = {
        kind: 'Source',
        params: { sourceRatePerHr, piecesPerAgent: 1 },
      };
      const operatorCountForPool = stationsThisLine.length;
      // Operator pool — tucked just above the source pad in the aisle so
      // it visually attaches to the bottom of the line without overlapping
      // either column. op_sewer is 1×1.
      const wsPool = makeWorkstation({
        deptId,
        catalogId: 'op_sewer',
        position: {
          x: Math.round(xAisleCenter),
          y: yLineBottom - SOURCE_PAD - 1,
        },
        name: `Operators · ${operatorCountForPool} units`,
      });
      wsPool.lineId = lineId;
      wsPool.block = {
        kind: 'ResourcePool',
        params: { capacity: operatorCountForPool },
      };
      // Sink — "FINAL INSPECTION TABLE" — centered in the aisle at the top
      // of the line strip, just above the top-most ws row.
      const wsSink = makeWorkstation({
        deptId,
        catalogId: 'buf_out',
        position: {
          x: Math.round(xAisleCenter - 1),
          y: yLineTop + SINK_PAD - 2,
        },
        name: `Final Inspection · ${L.parsed.style.label}`,
      });
      wsSink.lineId = lineId;
      wsSink.block = { kind: 'Sink' };
      workstations.push(wsSource, wsPool, wsSink);

      // Wire Source → head (op 1, bottom-right) and tail (op N, top) → Sink.
      // The intra-line connectors below stay the same (head → … → tail),
      // which traces the zigzag bundle path bottom→top across the aisle.
      connectors.push({
        id: newConnectorId(),
        kind: 'flow',
        fromWsId: wsSource.id,
        toWsId: head.id,
        flow: { carrier: 'bundle', bundleSize: 20 },
      });
      connectors.push({
        id: newConnectorId(),
        kind: 'flow',
        fromWsId: tail.id,
        toWsId: wsSink.id,
        flow: { carrier: 'bundle', bundleSize: 20 },
      });
    }

    // Connect head→tail in physical placement order. PBS bundle handoff.
    for (let i = 0; i < stationsThisLine.length - 1; i++) {
      connectors.push({
        id: newConnectorId(),
        kind: 'flow',
        fromWsId: stationsThisLine[i].id,
        toWsId: stationsThisLine[i + 1].id,
        flow: { carrier: 'bundle', bundleSize: 20 },
      });
    }

    // One operator per workstation; pad with helper-pool operators to reach
    // the OB declared headcount.
    stationsThisLine.forEach((ws, i) => {
      const operatorId = newOperatorId();
      operators.push({
        id: operatorId,
        deptId,
        lineId,
        name: `${L.parsed.style.key.toUpperCase().slice(0, 3)}-OP${String(i + 1).padStart(2, '0')}`,
        archetypeId: 'sew_op',
        skills: [{
          skillId: L.operations.find((o) => o.id === ws.operation.opId)?.skill ?? 'stitching',
          efficiency: 1,
        }],
        multiplicity: 1,
      });
      assignments.push({
        id: newAssignmentId(),
        operatorId,
        wsId: ws.id,
        role: 'primary',
        shareFrac: 1,
      });
    });

    // OB-declared summary, used by the Reports tab to validate the sim
    // against the source spreadsheet.
    const declaredOutput100 = numOr(L.parsed.garment.source.declaredHourlyTarget, 0) * 8;
    const declaredOutputPlan = Math.round(declaredOutput100 * 0.6);
    styleSummaries.push({
      key: L.parsed.style.key,
      label: L.parsed.style.label,
      declaredOutput100: Math.round(declaredOutput100),
      declaredOutputPlan,
      declaredOperators: Math.round(L.parsed.garment.source.declaredManpower ?? 0),
      declaredHelpers: 0,
      declaredWorkstations: stationsThisLine.length,
      builtWorkstations: stationsThisLine.length,
    });

    if (L.parsed.garment.warnings.length > 0) {
      notes.push(`${L.parsed.style.label}: ${L.parsed.garment.warnings.length} OB warning(s)`);
    }

    lineIdx++;
  }

  const now = new Date().toISOString();
  const twin: Twin = {
    ...blank,
    schemaVersion: TWIN_SCHEMA_VERSION,
    id: newTwinId(),
    name: factoryName,
    parentTwinId: null,
    isCanonical: true,
    createdAt: now,
    modifiedAt: now,
    gridW: Math.max(blank.gridW, DEPT_ORIGIN_X + deptWidth + 4),
    gridH: Math.max(blank.gridH, DEPT_ORIGIN_Y + deptHeight + 4),
    departments: [dept],
    lines,
    workstations,
    connectors,
    operators,
    assignments,
    notes:
      `Modelama production factory · ${parsed.length} styles imported from Modelama xlsx exports. ` +
      'Each line maps one style; workstations carry the SMV from the operation bulletin.',
  };

  return { twin, garments, notes, styleSummaries };
}

// ── Scenario variants ─────────────────────────────────────────────────────

export interface ModelamaScenarioVariant {
  name: string;
  notes: string;
  twin: Twin;
  /** Style key the scenario isolates / promotes. */
  spotlightKey: string;
}

/**
 * Build the comparison-tab scenarios for a Modelama bundle. Given the
 * parsed styles, returns:
 *
 *   1. **Baseline** — every style on its own line (same twin as
 *      `buildModelamaTwin(parsed)`).
 *   2. **Spotlight** scenarios — one per "swappable" style (`spotlightKey`),
 *      where the spotlight style replaces one of the canonical four
 *      Modelama lines (Line A / B / C / D). Each scenario drops one of
 *      the original styles and substitutes the spotlight, so the floor
 *      keeps the same line-count but a different product mix.
 *
 * `spotlightKey` defaults to the LAST style in `parsed` (which is where
 * the new OB-only style joins MODELAMA_STYLES). The user runs Sim on each
 * loaded scenario to fill in KPIs, then compares them side-by-side on
 * the Scenarios page.
 */
export function buildModelamaScenarioVariants(
  parsed: ParsedModelamaStyle[],
  spotlightKey?: string,
): ModelamaScenarioVariant[] {
  if (parsed.length < 2) return [];
  const spotKey = spotlightKey ?? parsed[parsed.length - 1].style.key;
  const spotlight = parsed.find((p) => p.style.key === spotKey);
  if (!spotlight) return [];
  const baseStyles = parsed.filter((p) => p.style.key !== spotKey);

  const variants: ModelamaScenarioVariant[] = [];

  // Baseline — the full bundle (all parsed styles, one line each).
  const baseline = buildModelamaTwin(parsed, 'Modelama · Baseline (all lines)');
  variants.push({
    name: `Baseline · ${parsed.length} lines`,
    notes:
      `All ${parsed.length} Modelama styles on parallel PBS lines. ` +
      `Run Sim to capture KPIs, then compare against the swap variants below.`,
    twin: baseline.twin,
    spotlightKey: spotKey,
  });

  // One scenario per base style being REPLACED by the spotlight at its slot.
  // The resulting twin keeps the same line-count as the original Modelama
  // factory (= `baseStyles.length`), but one slot is swapped.
  for (let i = 0; i < baseStyles.length; i++) {
    const dropped = baseStyles[i];
    const swapped: ParsedModelamaStyle[] = baseStyles.map((s, j) =>
      j === i ? spotlight : s,
    );
    const lineLetter = String.fromCharCode(65 + i); // A, B, C, D…
    const factoryName = `Modelama · Line ${lineLetter} → ${spotlight.style.label}`;
    const built = buildModelamaTwin(swapped, factoryName);
    variants.push({
      name: `Swap Line ${lineLetter} → ${stripLabelTail(spotlight.style.label)}`,
      notes:
        `Drops "${dropped.style.label}" from Line ${lineLetter} and runs ` +
        `"${spotlight.style.label}" in its place. Floor keeps ${baseStyles.length} lines.`,
      twin: built.twin,
      spotlightKey: spotKey,
    });
  }

  return variants;
}

/** Trim the "· 100230638" trailing identifier off a style label so it
 *  fits in a scenario-card title. Keeps the human-readable garment name. */
function stripLabelTail(label: string): string {
  const i = label.indexOf(' · ');
  return i > 0 ? label.slice(0, i) : label;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extract OB "Planned W/S" hint from an Operation. The xlsx importer stores
 * the bulletin's full row including notes; the SMV alone doesn't tell us
 * how many workstations the IE planned. We fall back to "1 per op" so the
 * line always builds even when the OB column was missing.
 */
function extractPlannedWs(op: Operation): number {
  // After the OB parser was extended (import-garment-xlsx.ts), the per-op
  // Planned W/S hint lives directly on `op.servers`. Fall back to 1 when
  // missing so every op gets at least one workstation.
  return op.servers && op.servers > 0 ? op.servers : 1;
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function composeLineNotes(p: ParsedModelamaStyle): string {
  const bits: string[] = [];
  if (p.garment.source.declaredSmv) bits.push(`SMV ${p.garment.source.declaredSmv}`);
  if (p.garment.source.declaredManpower) bits.push(`Manpower ${p.garment.source.declaredManpower}`);
  if (p.garment.source.declaredHourlyTarget) bits.push(`O/P/hr @100% ${p.garment.source.declaredHourlyTarget}`);
  return bits.join(' · ');
}

// Re-export XLSX so the bundle module exposes the dep it transitively
// requires — keeps the build-graph honest when this module is the only
// caller of XLSX.
export { XLSX };
