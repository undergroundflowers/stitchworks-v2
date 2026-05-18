/**
 * Twin model — the canonical entity schema for a Stitchworks digital twin.
 *
 * Architecture (locked 2026-05-07):
 *   • Two surfaces: Factory Builder (authoring) + Simulation (playback).
 *   • Two drawable layers (have geometry on the canvas):
 *       1. Department — zoned regions of the factory floor.
 *       2. Workstation — physical equipment placed inside a department
 *                        (sewing machine, cutting table, rack, …).
 *   • Three lenses (overlays on the same scene; no own geometry):
 *       Operations · Resources · KPIs.
 *     Lenses are attached as attribute groups on each workstation; toggling
 *     a lens decorates the canvas but never changes the underlying data.
 *   • Scenario = full fork of a Twin (deep clone of layout + entities +
 *     parameters). Compare-view is a tree-diff, not a parameter delta.
 *
 * This file is *pure data + pure logic*. No React, no DOM, no zustand.
 * It is consumable from the simulation engine, page components, and the
 * project file format.
 *
 * Schema versioning:
 *   - `TWIN_SCHEMA_VERSION` is the on-disk version of the Twin payload.
 *   - It is independent of `PROJECT_SCHEMA_VERSION` in store/project.ts —
 *     the project store will embed a twin payload and migrate the project
 *     wrapper separately.
 */

import {
  ISO_FIXTURE_CATALOG,
  defaultPropsFor,
  type IsoFixtureProps,
} from './iso';
import {
  pmlKindFromFixtureId,
  type PmlBlockOverride,
  type PmlBlockParams,
} from './pml';

// ============================================================================
// SCHEMA
// ============================================================================

export const TWIN_SCHEMA_VERSION = 6 as const;
export type TwinSchemaVersion = typeof TWIN_SCHEMA_VERSION;

// ============================================================================
// GEOMETRY
// ============================================================================

/** World coordinates in cells (1 cell = ISO_TILE on the iso canvas). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned rectangle in world cells. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Rotation = 0 | 90 | 180 | 270;

// ============================================================================
// DRAWABLE LAYER 1 — DEPARTMENT
// ============================================================================

/** Department-typed colour key. Maps to design-token names via the UI; the
 *  twin payload only stores the key so token changes don't break files. */
export type DepartmentColorKey =
  | 'fabric'
  | 'thread'
  | 'brand'
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'cream';

export interface Department {
  id: string;
  name: string;
  /** Department-purpose tag — drives default lens overlays and the catalogue
   *  filter in the palette. Free-string so users can author novel ones. */
  kind: string;
  color: DepartmentColorKey;
  /** Axis-aligned bounds in world cells. v1 is rect-only; polygon is a
   *  future extension that bumps TWIN_SCHEMA_VERSION. */
  bounds: Rect;
  notes?: string;
}

// ============================================================================
// LENS ATTRIBUTES — attached to every Workstation
// ============================================================================

/** OPERATIONS lens — what is happening at this workstation.
 *  References, not denormalised copies, so changes to the operation
 *  catalogue propagate. */
export interface OperationAttrs {
  /** Catalogue op id (operations.ts / DEPT_SUBOPS / garment-bulletin op).
   *  null = the workstation exists physically but no op is assigned yet. */
  opId: string | null;
  /** Garment template the op runs against, when relevant (sew/cut/finish). */
  garmentId?: string;
  /** Bundle size used at this station; falls back to the garment's default. */
  bundleSize?: number;
  /** Free-form override for "what's stored / what's cut / what's pressed".
   *  Only meaningful when opId is null (storage racks, generic tables, etc.). */
  freeText?: string;
}

/** RESOURCES lens — what feeds the operation. */
export interface ResourceAttrs {
  /** How many workers this station expects to run. */
  workersRequired: number;
  /** Worker archetype id (catalog ref). null = "any operator". */
  workerArchetypeId: string | null;
  /** Per-cycle material consumption, e.g. { fabric_m: 0.4, thread_m: 1.2 }. */
  materialsPerCycle: Record<string, number>;
  /** Catalogue machine id (DEPT_MACHINE_CATALOG.id), when the workstation IS
   *  a machine. Null for tables / racks / pure storage. */
  machineId: string | null;
  /** Energy draw in kW; falls back to the catalogue value. */
  powerKw?: number;
}

/** KPI lens — split into authored *targets* and the most-recent *observed*
 *  values from a sim run. Targets persist with the twin; observed values
 *  are recomputed every run and travel with the SimRun, mirrored here for
 *  fast lens rendering. */
export interface KpiTargetAttrs {
  capacityPerHr?: number;
  efficiencyPct?: number;
  utilizationPct?: number;
  /** Authored notes about KPI intent (e.g. "stretch goal post-rebalance"). */
  notes?: string;
}

export interface KpiObservedAttrs {
  /** ISO timestamp of the run that produced these values. */
  capturedAt: string;
  /** Run id (SimRun.id) — lets the inspector deep-link to the run. */
  runId: string;
  capacityPerHr: number;
  efficiencyPct: number;
  utilizationPct: number;
  /** True if this station was the bottleneck in the captured run. */
  bottleneck: boolean;
}

// ============================================================================
// CONNECTORS — directed links between workstations that define flow
// ============================================================================

/** A connector's *meaning*. The geometry is identical for all kinds; only the
 *  rendering tint and the inspector label differ.
 *   • flow      — material/garment progresses from → to.
 *   • operator  — operator role moves from station to station (e.g. floater).
 *   • material  — feeder/raw-material supply path. */
export type ConnectorKind = 'flow' | 'operator' | 'material';

export interface Connector {
  id: string;
  kind: ConnectorKind;
  /** Source workstation id. */
  fromWsId: string;
  /** Target workstation id. */
  toWsId: string;
  /** Optional caption shown on the arrow. */
  label?: string;
  /** Specific OUTPUT port id on the source block this wire leaves from
   *  (e.g. `'out'`, `'pass'`, `'fail'`). When omitted, renderers + the
   *  sim engine fall back to the source block's first output port. */
  fromPort?: string;
  /** Specific INPUT port id on the target block this wire enters
   *  (e.g. `'in'`, `'in1'`). When omitted, falls back to the target
   *  block's first input port. */
  toPort?: string;
}

// ============================================================================
// DRAWABLE LAYER 2 — WORKSTATION
// ============================================================================

export interface Workstation {
  id: string;
  /** Department this workstation belongs to (Department.id). Required —
   *  every workstation lives inside a department. */
  deptId: string;
  /** Catalogue id from ISO_FIXTURE_CATALOG. Drives the sprite + footprint. */
  catalogId: string;
  /** Display name. Defaults to the catalogue label at create time. */
  name: string;
  /** Top-left position of the catalogue footprint, in world cells. */
  position: Vec2;
  rotation: Rotation;
  /** Optional per-workstation footprint override. When present, supersedes
   *  the catalogue fixture's `w` / `d` / `h`. Values are decimal — `w` and
   *  `d` are in world cells, `h` is in altitude units. Authored from the
   *  Inspector's transform fields. */
  size?: { w: number; d: number; h: number };
  /** Free-form physical / cost / reliability props seeded from
   *  `defaultPropsFor(catalogId)`. Engineer-grade fields the user can edit. */
  props: IsoFixtureProps;

  // ── Lens attributes ────────────────────────────────────────────────────────
  operation: OperationAttrs;
  resources: ResourceAttrs;
  kpiTargets: KpiTargetAttrs;
  /** Populated by the simulation engine after each run; absent until the
   *  first run or after the twin is forked into a fresh scenario. */
  kpiObserved?: KpiObservedAttrs;

  /** Optional Process Modeling Library block override. When present, the
   *  block kind + ports replace the catalog-default that would otherwise
   *  be inferred from `catalogId`. Authored from the Inspector's PROCESS
   *  BLOCK section. Resolve via `getBlockSpec(ws)` from `domain/pml.ts`
   *  rather than reading this field directly — that helper handles the
   *  fallback to the catalog default in one place. */
  block?: PmlBlockOverride;
}

// ============================================================================
// THE TWIN
// ============================================================================

export interface Twin {
  schemaVersion: TwinSchemaVersion;
  id: string;
  name: string;
  /** Parent twin id, if this twin was forked from another. null = canonical. */
  parentTwinId: string | null;
  /** True for the project's master twin authored in Factory Builder; false
   *  for scenario forks derived from it. Exactly one twin in a project
   *  should have isCanonical = true. */
  isCanonical: boolean;
  createdAt: string;
  modifiedAt: string;
  /** World grid extent — the canvas size. */
  gridW: number;
  gridH: number;
  departments: Department[];
  workstations: Workstation[];
  /** Directed flow/operator/material links between workstations. Edge geometry
   *  is computed from the source + target workstation footprints; this list
   *  stores only the topology. */
  connectors: Connector[];
  notes?: string;
}

// ============================================================================
// SCENARIO + RUN
// ============================================================================

/** Aggregate sim output for the whole twin. Per-station observed values
 *  live on Workstation.kpiObserved. */
export interface ScenarioKpis {
  producedPieces: number;
  throughputPerHr: number;
  efficiencyPct: number;
  meanLeadTime: number;
  utilization: number;
  wipBundles: number;
  bottleneckOpName: string;
  bottleneckQueue: number;
  /** Number of replications behind these means. 1 = single-seed. */
  replicationCount?: number;
  std?: {
    producedPieces: number;
    throughputPerHr: number;
    efficiencyPct: number;
    meanLeadTime: number;
    utilization: number;
    wipBundles: number;
  };
}

export interface SimRun {
  id: string;
  /** Scenario whose twin was simulated. */
  scenarioId: string;
  startedAt: string;
  /** Simulated duration in seconds (NOT wall-clock). */
  simDurationS: number;
  seed: number;
  kpis: ScenarioKpis;
}

/** A scenario IS a forked twin plus authored intent (name, notes) and a
 *  history of sim runs against that twin. The twin payload is a full deep
 *  clone of the canonical twin at fork time — by design, a scenario is an
 *  independent factory once forked. */
export interface Scenario {
  id: string;
  name: string;
  notes?: string;
  createdAt: string;
  modifiedAt: string;
  twin: Twin;
  runs: SimRun[];
}

// ============================================================================
// ID GENERATION
// ============================================================================

/** Compact, mostly-monotonic id with a type prefix. Deterministic enough
 *  for debug logs, random enough to avoid collision in fast-fork loops. */
function newId(prefix: string): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${t}-${r}`;
}

export const newDeptId = () => newId('dept');
export const newWorkstationId = () => newId('ws');
export const newTwinId = () => newId('twin');
export const newScenarioId = () => newId('scn');
export const newRunId = () => newId('run');
export const newConnectorId = () => newId('cn');

// ============================================================================
// FACTORIES
// ============================================================================

/** Create a fresh empty twin. Used as the starting point for a brand-new
 *  project; the canvas will render the empty grid until the user drops the
 *  first department from the palette. */
export function emptyTwin(name: string = 'Untitled factory'): Twin {
  const now = new Date().toISOString();
  return {
    schemaVersion: TWIN_SCHEMA_VERSION,
    id: newTwinId(),
    name,
    parentTwinId: null,
    isCanonical: true,
    createdAt: now,
    modifiedAt: now,
    gridW: 36,
    gridH: 28,
    departments: [],
    workstations: [],
    connectors: [],
  };
}

/**
 * Bring a Twin payload up to the current schema. Used by the persist
 * middleware migration and by importers. Additive only — never strips
 * fields the current code can handle.
 */
export function normalizeTwin(input: unknown): Twin {
  const t = (input ?? {}) as Partial<Twin> & Record<string, unknown>;
  return {
    schemaVersion: TWIN_SCHEMA_VERSION,
    id: t.id ?? newTwinId(),
    name: t.name ?? 'Untitled factory',
    parentTwinId: (t.parentTwinId ?? null) as string | null,
    isCanonical: t.isCanonical ?? true,
    createdAt: t.createdAt ?? new Date().toISOString(),
    modifiedAt: t.modifiedAt ?? new Date().toISOString(),
    gridW: t.gridW ?? 36,
    gridH: t.gridH ?? 28,
    departments: t.departments ?? [],
    workstations: t.workstations ?? [],
    connectors: t.connectors ?? [],
    notes: t.notes,
  };
}

/**
 * Build the "Pachyatap Demo Apparel Co." factory — a fully-populated canonical
 * twin used to seed a fresh project so that the Builder and the Live Floor are
 * never empty in a demo. Lays out a five-department T-shirt factory on a
 * 36×26 grid: Storage, Cutting, QC at the top; Sewing line and Finishing
 * across the bottom. Every sewing station is wired to a real op id from the
 * built-in `tshirt` garment so the Operations lens reads correctly.
 */
export function buildDemoTwin(name: string = 'Demo Apparel Co.'): Twin {
  const now = new Date().toISOString();
  const dStore  = newDeptId();
  const dCut    = newDeptId();
  const dQc     = newDeptId();
  const dSew    = newDeptId();
  const dFinish = newDeptId();

  const departments: Department[] = [
    { id: dStore,  name: 'Storage',     kind: 'Storage',   color: 'cream',  bounds: { x: 1,  y: 1, w: 8,  h: 6  }, notes: 'Inbound fabric rolls + finished-goods staging.' },
    { id: dCut,    name: 'Cutting',     kind: 'Cutting',   color: 'green',  bounds: { x: 10, y: 1, w: 14, h: 6  }, notes: 'Spread + auto-cut + bundle.' },
    { id: dQc,     name: 'QC Bay',      kind: 'QC',        color: 'red',    bounds: { x: 25, y: 1, w: 9,  h: 6  }, notes: '4-point fabric inspection + audit.' },
    { id: dSew,    name: 'Sewing Line', kind: 'Sewing',    color: 'blue',   bounds: { x: 1,  y: 8, w: 23, h: 14 }, notes: 'T-shirt assembly · 8 stations · PBS.' },
    { id: dFinish, name: 'Finishing',   kind: 'Finishing', color: 'yellow', bounds: { x: 25, y: 8, w: 9,  h: 14 }, notes: 'Press · pack · dispatch.' },
  ];

  type WsSeed = {
    deptId: string;
    catalogId: string;
    position: Vec2;
    name: string;
    /** Optional Operations-lens binding to a tshirt op + bundle size. */
    op?: { opId: string; bundleSize?: number };
  };

  const seeds: WsSeed[] = [
    // ── STORAGE ────────────────────────────────────────────────────────────
    { deptId: dStore, catalogId: 'a_fabric_rack', position: { x: 2, y: 2 }, name: 'Fabric Rack A' },
    { deptId: dStore, catalogId: 'a_fabric_rack', position: { x: 2, y: 4 }, name: 'Fabric Rack B' },
    { deptId: dStore, catalogId: 'mh_forklift',   position: { x: 7, y: 3 }, name: 'Forklift FL-01' },

    // ── CUTTING ────────────────────────────────────────────────────────────
    { deptId: dCut, catalogId: 'a_spread_auto',    position: { x: 11, y: 2 }, name: 'Auto Spreader SP-01' },
    { deptId: dCut, catalogId: 'a_cnc_cutter',     position: { x: 11, y: 4 }, name: 'CNC Cutter CC-01' },
    { deptId: dCut, catalogId: 'op_cutter',        position: { x: 17, y: 4 }, name: 'Cutter — Anu' },
    { deptId: dCut, catalogId: 'a_bundle_trolley', position: { x: 19, y: 4 }, name: 'Bundle Trolley T-01' },
    { deptId: dCut, catalogId: 'op_helper',        position: { x: 21, y: 4 }, name: 'Bundler — Ravi' },

    // ── QC ─────────────────────────────────────────────────────────────────
    { deptId: dQc, catalogId: 'a_inspect_table', position: { x: 26, y: 2 }, name: '4-Point Inspect IT-01' },
    { deptId: dQc, catalogId: 'fx_qctab',        position: { x: 26, y: 4 }, name: 'Audit Table QT-01' },
    { deptId: dQc, catalogId: 'op_qc',           position: { x: 29, y: 4 }, name: 'QC — Priya' },
    { deptId: dQc, catalogId: 'buf_in',          position: { x: 31, y: 2 }, name: 'Cut-bundle IN' },
    { deptId: dQc, catalogId: 'buf_out',         position: { x: 31, y: 4 }, name: 'Audit OUT' },

    // ── SEWING — 8-station T-shirt line + buffers + iron + WIP racks ───────
    { deptId: dSew, catalogId: 'buf_in',      position: { x: 1,  y: 9 },  name: 'Bundle IN' },
    { deptId: dSew, catalogId: 'a_4ol',       position: { x: 4,  y: 9 },  name: 'Shoulder OL-01',     op: { opId: 'ts-07', bundleSize: 20 } },
    { deptId: dSew, catalogId: 'a_snls',      position: { x: 6,  y: 9 },  name: 'Neck Rib Tack SN-01', op: { opId: 'ts-09', bundleSize: 20 } },
    { deptId: dSew, catalogId: 'a_4ol',       position: { x: 8,  y: 9 },  name: 'Neck Rib OL-02',     op: { opId: 'ts-10', bundleSize: 20 } },
    { deptId: dSew, catalogId: 'a_flatlock',  position: { x: 10, y: 9 },  name: 'Sleeve Hem FL-01',   op: { opId: 'ts-17', bundleSize: 20 } },
    { deptId: dSew, catalogId: 'a_4ol',       position: { x: 12, y: 9 },  name: 'Sleeve OL-03',       op: { opId: 'ts-19', bundleSize: 20 } },
    { deptId: dSew, catalogId: 'a_4ol',       position: { x: 14, y: 9 },  name: 'Side Seam OL-04',    op: { opId: 'ts-21', bundleSize: 20 } },
    { deptId: dSew, catalogId: 'a_flatlock',  position: { x: 16, y: 9 },  name: 'Body Hem FL-02',     op: { opId: 'ts-23', bundleSize: 20 } },
    { deptId: dSew, catalogId: 'a_snls',      position: { x: 18, y: 9 },  name: 'Care Label SN-02',   op: { opId: 'ts-01', bundleSize: 20 } },
    { deptId: dSew, catalogId: 'a_iron_inline', position: { x: 20, y: 9 }, name: 'Inline Iron IR-01' },
    { deptId: dSew, catalogId: 'buf_out',     position: { x: 22, y: 9 },  name: 'Bundle OUT' },

    // Operators in front of each machine
    { deptId: dSew, catalogId: 'op_sewer', position: { x: 4,  y: 12 }, name: 'OPR-01 · Lakshmi' },
    { deptId: dSew, catalogId: 'op_sewer', position: { x: 6,  y: 12 }, name: 'OPR-02 · Suman' },
    { deptId: dSew, catalogId: 'op_sewer', position: { x: 8,  y: 12 }, name: 'OPR-03 · Geetha' },
    { deptId: dSew, catalogId: 'op_sewer', position: { x: 10, y: 12 }, name: 'OPR-04 · Kala' },
    { deptId: dSew, catalogId: 'op_sewer', position: { x: 12, y: 12 }, name: 'OPR-05 · Manju' },
    { deptId: dSew, catalogId: 'op_sewer', position: { x: 14, y: 12 }, name: 'OPR-06 · Devi' },
    { deptId: dSew, catalogId: 'op_sewer', position: { x: 16, y: 12 }, name: 'OPR-07 · Sita' },
    { deptId: dSew, catalogId: 'op_sewer', position: { x: 18, y: 12 }, name: 'OPR-08 · Roja' },
    { deptId: dSew, catalogId: 'op_helper', position: { x: 20, y: 12 }, name: 'Iron — Mohan' },

    // WIP racks behind operators
    { deptId: dSew, catalogId: 'a_wip_rack', position: { x: 4,  y: 14 }, name: 'WIP Rack 1' },
    { deptId: dSew, catalogId: 'a_wip_rack', position: { x: 10, y: 14 }, name: 'WIP Rack 2' },
    { deptId: dSew, catalogId: 'a_wip_rack', position: { x: 16, y: 14 }, name: 'WIP Rack 3' },

    // Conveyor along the bottom of the line
    { deptId: dSew, catalogId: 'conv_str', position: { x: 3,  y: 17 }, name: 'Conveyor C1' },
    { deptId: dSew, catalogId: 'conv_str', position: { x: 7,  y: 17 }, name: 'Conveyor C2' },
    { deptId: dSew, catalogId: 'conv_str', position: { x: 11, y: 17 }, name: 'Conveyor C3' },
    { deptId: dSew, catalogId: 'conv_str', position: { x: 15, y: 17 }, name: 'Conveyor C4' },
    { deptId: dSew, catalogId: 'conv_str', position: { x: 19, y: 17 }, name: 'Conveyor C5' },

    { deptId: dSew, catalogId: 'op_super', position: { x: 12, y: 19 }, name: 'Supervisor — Arjun' },

    // ── FINISHING ──────────────────────────────────────────────────────────
    { deptId: dFinish, catalogId: 'a_iron_inline', position: { x: 26, y: 9 },  name: 'Press IR-A' },
    { deptId: dFinish, catalogId: 'a_iron_inline', position: { x: 29, y: 9 },  name: 'Press IR-B' },
    { deptId: dFinish, catalogId: 'op_sewer',      position: { x: 26, y: 11 }, name: 'Presser — Bala' },
    { deptId: dFinish, catalogId: 'op_sewer',      position: { x: 29, y: 11 }, name: 'Presser — Hari' },
    { deptId: dFinish, catalogId: 'fx_pack',       position: { x: 26, y: 13 }, name: 'Pack Bench P-1' },
    { deptId: dFinish, catalogId: 'fx_pack',       position: { x: 26, y: 15 }, name: 'Pack Bench P-2' },
    { deptId: dFinish, catalogId: 'op_helper',     position: { x: 30, y: 13 }, name: 'Packer — Vinod' },
    { deptId: dFinish, catalogId: 'op_helper',     position: { x: 30, y: 15 }, name: 'Packer — Asha' },
    { deptId: dFinish, catalogId: 'buf_out',       position: { x: 26, y: 17 }, name: 'Finished Goods OUT' },
    { deptId: dFinish, catalogId: 'mh_forklift',   position: { x: 32, y: 17 }, name: 'Forklift FL-02' },
  ];

  const workstations: Workstation[] = seeds.map((s) => {
    const w = makeWorkstation({
      deptId: s.deptId,
      catalogId: s.catalogId,
      position: s.position,
      name: s.name,
    });
    if (s.op) {
      w.operation = {
        ...w.operation,
        opId: s.op.opId,
        garmentId: 'tshirt',
        bundleSize: s.op.bundleSize,
      };
    }
    return w;
  });

  return {
    schemaVersion: TWIN_SCHEMA_VERSION,
    id: newTwinId(),
    name,
    parentTwinId: null,
    isCanonical: true,
    createdAt: now,
    modifiedAt: now,
    gridW: 36,
    gridH: 26,
    departments,
    workstations,
    connectors: [],
    notes: 'Demo factory — T-shirt line, PBS, single shift. Use as a starting point.',
  };
}

/** Build a workstation with sane lens defaults. The catalogue id must
 *  resolve — call sites are expected to pass a known fixture id.
 *
 *  `blockParams` lets the caller seed the PML block's authored parameters
 *  at create time — used by the BLOCKS palette to apply apparel-preset
 *  defaults (e.g. Bundle source → `ratePerHr: 30`). Ignored when the
 *  catalogId doesn't resolve to a PML primitive. */
export function makeWorkstation(input: {
  deptId: string;
  catalogId: string;
  position: Vec2;
  rotation?: Rotation;
  name?: string;
  blockParams?: Partial<PmlBlockParams>;
}): Workstation {
  const fixture = ISO_FIXTURE_CATALOG.find((f) => f.id === input.catalogId);
  const fallbackName = fixture?.label ?? input.catalogId;
  const seedProps = defaultPropsFor(input.catalogId);

  // Heuristic resource defaults from the catalogue category. The user can
  // override these in the inspector; we just want a plausible starting point.
  const cat = fixture?.cat;
  const isMachine = cat === 'sew' || cat === 'cut';
  const workersRequired =
    typeof seedProps.operators_needed === 'number'
      ? (seedProps.operators_needed as number)
      : isMachine
        ? 1
        : 0;
  const powerKw =
    typeof seedProps.power_kw === 'number' ? (seedProps.power_kw as number) : undefined;

  // If the fixture is a PML primitive (`pml_*` id), auto-stamp the matching
  // block kind so the new workstation lands as e.g. a real Source / Queue /
  // SelectOutput on first drop — no Inspector round-trip needed.
  const pmlKind = pmlKindFromFixtureId(input.catalogId);

  return {
    id: newWorkstationId(),
    deptId: input.deptId,
    catalogId: input.catalogId,
    name: input.name ?? fallbackName,
    position: { x: input.position.x, y: input.position.y },
    rotation: input.rotation ?? 0,
    props: { ...seedProps },
    operation: { opId: null },
    resources: {
      workersRequired,
      workerArchetypeId: null,
      materialsPerCycle: {},
      machineId: isMachine ? input.catalogId : null,
      powerKw,
    },
    kpiTargets: {},
    block: pmlKind
      ? {
          kind: pmlKind,
          ...(input.blockParams ? { params: { ...input.blockParams } } : {}),
        }
      : undefined,
  };
}

// ============================================================================
// FORK
// ============================================================================

/**
 * Deep-clone a twin, assigning fresh ids for the twin, every department, and
 * every workstation. Inter-entity references (workstation.deptId) are
 * remapped to point at the new dept ids so the clone is internally consistent.
 *
 * Observed KPIs are intentionally dropped — a fresh fork has not been
 * simulated yet. KPI *targets* are preserved (authored intent travels with
 * the fork).
 */
export function forkTwin(
  source: Twin,
  options: { name: string; notes?: string },
): Twin {
  const now = new Date().toISOString();
  const deptIdMap = new Map<string, string>();
  for (const d of source.departments) deptIdMap.set(d.id, newDeptId());

  const departments: Department[] = source.departments.map((d) => ({
    ...d,
    id: deptIdMap.get(d.id)!,
    bounds: { ...d.bounds },
  }));

  // Map old → new workstation ids so connectors can be remapped.
  const wsIdMap = new Map<string, string>();
  const workstations: Workstation[] = source.workstations.map((w) => {
    const newWsId = newWorkstationId();
    wsIdMap.set(w.id, newWsId);
    return {
      ...w,
      id: newWsId,
      deptId: deptIdMap.get(w.deptId) ?? w.deptId,
      position: { ...w.position },
      props: { ...w.props },
      operation: { ...w.operation },
      resources: {
        ...w.resources,
        materialsPerCycle: { ...w.resources.materialsPerCycle },
      },
      kpiTargets: { ...w.kpiTargets },
      // Observed values do not survive a fork.
      kpiObserved: undefined,
      // Block overrides DO travel — a forked scenario should keep the
      // user's authored block kind / port topology / sim params.
      block: w.block
        ? {
            kind: w.block.kind,
            inputs: w.block.inputs ? w.block.inputs.map((p) => ({ ...p })) : undefined,
            outputs: w.block.outputs ? w.block.outputs.map((p) => ({ ...p })) : undefined,
            params: w.block.params ? { ...w.block.params } : undefined,
          }
        : undefined,
    };
  });

  const connectors: Connector[] = (source.connectors ?? [])
    // Drop connectors whose endpoints didn't survive (shouldn't happen for a
    // consistent twin, but be defensive against stale state).
    .filter((c) => wsIdMap.has(c.fromWsId) && wsIdMap.has(c.toWsId))
    .map((c) => ({
      ...c,
      id: newConnectorId(),
      fromWsId: wsIdMap.get(c.fromWsId)!,
      toWsId: wsIdMap.get(c.toWsId)!,
    }));

  return {
    schemaVersion: TWIN_SCHEMA_VERSION,
    id: newTwinId(),
    name: options.name,
    parentTwinId: source.id,
    isCanonical: false,
    createdAt: now,
    modifiedAt: now,
    gridW: source.gridW,
    gridH: source.gridH,
    departments,
    workstations,
    connectors,
    notes: options.notes,
  };
}

/** Create a scenario by forking the canonical twin. */
export function createScenario(input: {
  source: Twin;
  name: string;
  notes?: string;
}): Scenario {
  const now = new Date().toISOString();
  return {
    id: newScenarioId(),
    name: input.name,
    notes: input.notes,
    createdAt: now,
    modifiedAt: now,
    twin: forkTwin(input.source, { name: input.name, notes: input.notes }),
    runs: [],
  };
}

// ============================================================================
// VALIDATION — cheap structural checks, not exhaustive
// ============================================================================

/** Returns the list of structural errors, empty if the twin is internally
 *  consistent. Callers (importers, tests) should treat a non-empty return
 *  as "do not load this twin." */
export function validateTwin(twin: Twin): string[] {
  const errs: string[] = [];
  // All shipped versions are readable — older saves get normalized at load
  // time. Cast to number so the union-narrowed literal type doesn't make
  // the equality check tautological at compile time.
  const ver = twin.schemaVersion as number;
  if (ver !== 1 && ver !== 2 && ver !== 3 && ver !== 4 && ver !== 5 && ver !== (TWIN_SCHEMA_VERSION as number)) {
    errs.push(
      `Unknown twin schemaVersion ${twin.schemaVersion}; expected 1, 2, 3, 4, 5, or ${TWIN_SCHEMA_VERSION}`,
    );
  }
  const deptIds = new Set(twin.departments.map((d) => d.id));
  for (const w of twin.workstations) {
    if (!deptIds.has(w.deptId)) {
      errs.push(`Workstation ${w.id} references missing department ${w.deptId}`);
    }
  }
  // Duplicate ids
  const seen = new Set<string>();
  for (const d of twin.departments) {
    if (seen.has(d.id)) errs.push(`Duplicate department id ${d.id}`);
    seen.add(d.id);
  }
  for (const w of twin.workstations) {
    if (seen.has(w.id)) errs.push(`Duplicate id ${w.id} (workstation)`);
    seen.add(w.id);
  }
  const wsIds = new Set(twin.workstations.map((w) => w.id));
  for (const c of twin.connectors ?? []) {
    if (!wsIds.has(c.fromWsId)) {
      errs.push(`Connector ${c.id} references missing source workstation ${c.fromWsId}`);
    }
    if (!wsIds.has(c.toWsId)) {
      errs.push(`Connector ${c.id} references missing target workstation ${c.toWsId}`);
    }
  }
  return errs;
}

// ============================================================================
// LEGACY MIGRATION — floors+lines (project schema v1) → Twin
// ============================================================================

/** Minimal subset of the legacy FactoryStructure we know how to read. */
export interface LegacyFactoryShape {
  floors: Array<{ id: string; name: string; description?: string; color: string }>;
  lines: Array<{
    id: string;
    name: string;
    floorId: string;
    garmentTemplateId: string;
    operators: number;
    productionSystem: string;
  }>;
}

/**
 * Convert the v1 floors+lines structure into a Twin. Each floor becomes a
 * Department laid out as a horizontal strip; each line becomes a small
 * cluster of workstations (a sewing machine, an operator stand, a buffer)
 * placed inside its parent department.
 *
 * This is a one-way bridge so existing local-storage data isn't lost when
 * we wire the twin model into the project store. The result is intentionally
 * coarse — the user is expected to flesh out the layout in Factory Builder
 * after migration.
 */
export function migrateLegacyFactoryToTwin(
  legacy: LegacyFactoryShape,
  projectName: string = 'Migrated factory',
): Twin {
  const now = new Date().toISOString();
  const stripH = 7; // each floor strip is 7 cells deep
  const gap = 1;
  let cursorY = 1;

  const departments: Department[] = legacy.floors.map((f) => {
    const dept: Department = {
      id: newDeptId(),
      name: f.name,
      kind: f.description ?? f.name,
      color: (f.color as DepartmentColorKey) ?? 'cream',
      bounds: { x: 1, y: cursorY, w: 30, h: stripH },
      notes: f.description,
    };
    cursorY += stripH + gap;
    return dept;
  });

  // Map legacy floorId → new dept id, preserving order so we can place lines.
  const floorIdToDept = new Map<string, Department>();
  legacy.floors.forEach((f, i) => floorIdToDept.set(f.id, departments[i]));

  const workstations: Workstation[] = [];
  // Per-dept cursor for tiling lines left → right.
  const cursorByDept = new Map<string, number>(
    departments.map((d) => [d.id, d.bounds.x + 1]),
  );

  for (const line of legacy.lines) {
    const dept = floorIdToDept.get(line.floorId);
    if (!dept) continue;
    const x = cursorByDept.get(dept.id) ?? dept.bounds.x + 1;
    const y = dept.bounds.y + 1;

    // Pick a sensible fixture per production system.
    const sewFixture =
      line.productionSystem === 'modular' ? 'mach_over' : 'mach_ssm';

    workstations.push(
      makeWorkstation({
        deptId: dept.id,
        catalogId: sewFixture,
        position: { x, y },
        name: `${line.name} · sewing`,
      }),
    );
    workstations.push(
      makeWorkstation({
        deptId: dept.id,
        catalogId: 'op_sewer',
        position: { x, y: y + 2 },
        name: `${line.name} · operator`,
      }),
    );
    workstations.push(
      makeWorkstation({
        deptId: dept.id,
        catalogId: 'buf_in',
        position: { x: x + 1, y: y + 3 },
        name: `${line.name} · buffer`,
      }),
    );

    cursorByDept.set(dept.id, x + 3);
  }

  return {
    schemaVersion: TWIN_SCHEMA_VERSION,
    id: newTwinId(),
    name: projectName,
    parentTwinId: null,
    isCanonical: true,
    createdAt: now,
    modifiedAt: now,
    gridW: 36,
    gridH: Math.max(28, cursorY),
    departments,
    workstations,
    connectors: [],
    notes: 'Auto-migrated from legacy floors+lines structure',
  };
}
