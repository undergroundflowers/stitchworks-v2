/**
 * Project store — the single source of truth for everything the user
 * "owns" inside Stitchworks: factory metadata, the garment library and
 * saved scenarios. Persisted to IndexedDB automatically via
 * zustand/middleware/persist.
 *
 * The shape is versioned (`schemaVersion`); future migrations bump the
 * version and add a `migrate` step in the persist config.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { normalizeStationType, type GarmentTemplate, type Operation, type StationType } from '../domain';
import { indexedDbStorage } from './storage/indexedDbStorage';
import type { ModelTimeUnit } from '../simulation/timeUnit';
import type { Twin } from '../domain/twin';

/**
 * Schema version.
 *   v2 — introduced the `time` slice (model-time-unit, start date, real-time
 *        scale); see `TimeSettings`.
 *   v3 — sewing-lines pivot. Dropped the asset-library slices (machine /
 *        worker / product edits, customs, hidden flags and uploaded images).
 *        The migration deletes those keys outright so IndexedDB payloads
 *        actually shrink rather than carrying dead maps forever.
 *   v4 — user-authored station types.
 *   v5 — dropped `orders`. The Orders wizard and the whole production-order
 *        model went away; demand moved to a `demandPerDay` target on the
 *        sewing line itself (since removed as well — the app has no demand
 *        input today). The migration deletes the key so saved payloads stop
 *        carrying order drafts nothing can read.
 *   v6 — dropped `selectedProductionSystem`, and `productionSystem` off the
 *        legacy `Line` seed. Production systems (PBS / modular / UPS /
 *        synchro / straight) are out of scope until the app models them
 *        properly; the key is deleted so a saved payload stops pinning a
 *        choice nothing reads.
 *   v8 — dropped the skill matrix, operator name overrides and the per-line
 *        `operators` headcount on the legacy factory seed. Efficiency is a
 *        property of the station (or its line) on the twin now, and the
 *        headcount is whatever the stations on the floor add up to; the
 *        matrix was a roster of invented operators averaged back into one
 *        number per operation, and the headcount fed only that roster.
 */
export const PROJECT_SCHEMA_VERSION = 8 as const;

export interface ProjectMeta {
  name: string;
  factory: string;
  createdAt: string;
  modifiedAt: string;
}

/** Display preferences. Persisted with the project so they roam with
 *  an exported `.swproj` file. Render sites must consume these (see
 *  `lib/format.ts`); never hardcode date formatting. */
export interface UnitsPrefs {
  length: 'Meters' | 'Yards';
  samDisplay: 'Minutes' | 'Seconds';
  dateFormat: 'DD/MM' | 'MM/DD' | 'YYYY-MM-DD';
}

const defaultUnits: UnitsPrefs = {
  length: 'Meters',
  samDisplay: 'Minutes',
  dateFormat: 'YYYY-MM-DD',
};

/**
 * Time semantics for the simulation. Per *Big Book of Simulation Modelling*
 * (AnyLogic, Ch. 16), three time concepts must be modelled independently:
 *
 *   - Model time:    virtual sim clock, advances in event-jumps inside the
 *                    engine. Numeric, measured in `modelTimeUnit`.
 *   - Calendar time: model time projected onto a real `Date` via
 *                    `date(t) = startDate + t × modelTimeUnit`.
 *   - Wall time:     the user's device clock. Bound to model time only
 *                    during playback, via `realTimeScale`.
 *
 * `UnitsPrefs` above stays a *display-formatting* struct (length, date
 * format). `TimeSettings` here is *semantics* that affects what the numbers
 * actually mean.
 */
export interface TimeSettings {
  /** What one tick of engine `time` represents. Default `'minute'`. */
  modelTimeUnit: ModelTimeUnit;
  /** ISO datetime that maps to engine `t = 0`. Drives every calendar
   *  projection. Default = project's `createdAt`. */
  startDate: string;
  /** Shift start time-of-day, expressed as minutes-of-day (0..1439).
   *  Used by the calendar overlay; default 480 = 08:00. */
  shiftStartMinuteOfDay: number;
  /** Shift duration in MINUTES. Real-world human concept, so kept in
   *  minutes regardless of `modelTimeUnit`. Default 480 = 8 h. */
  shiftDurationMin: number;
  /**
   * Playback pacing: model-time-units per ONE real second.
   * Examples (with `modelTimeUnit = 'minute'`):
   *   1   ⇒ 1 model-min per real-sec  (true real time)
   *   60  ⇒ 60 model-min per real-sec (1 model-hour per real-second)
   *   480 ⇒ full 8-hr shift in 1 real second
   * Default 1.
   */
  realTimeScale: number;
}

function defaultTimeSettings(createdAtISO?: string): TimeSettings {
  return {
    modelTimeUnit: 'minute',
    startDate: createdAtISO ?? new Date().toISOString(),
    shiftStartMinuteOfDay: 8 * 60,
    shiftDurationMin: 480,
    realTimeScale: 1,
  };
}

/**
 * Stored time settings laid over the defaults.
 *
 * Also drops `executionMode`, a field older saves and `.swproj` files carry.
 * It chose between paced playback and a "virtual" mode that jumped straight
 * to the end of the shift; that mode is gone, so playback is always paced and
 * a project saved with it on must not keep the dead key.
 */
function timeSettingsFrom(createdAtISO: string | undefined, stored: unknown): TimeSettings {
  const { executionMode: _removed, ...rest } = (stored ?? {}) as Partial<TimeSettings> & {
    executionMode?: unknown;
  };
  void _removed;
  return { ...defaultTimeSettings(createdAtISO), ...rest };
}

/**
 * A floor inside the factory. Floors group lines (e.g. one floor for
 * Sewing, one for Cutting, one for Finishing). Used by the Factory Twin
 * to render the tree + zoom levels.
 */
export interface Floor {
  id: string;
  name: string;
  description: string;
  /** Token colour key used by the tree + heat overlay. */
  color: string;
}

/**
 * One production line inside one floor. Each line has its own garment,
 * crew size and production system, so a factory can run multiple
 * heterogeneous lines in parallel. KPIs are cached from the most-recent
 * sim run on this line (computed by the Factory Twin's "Run line" action).
 */
export interface Line {
  id: string;
  name: string;
  floorId: string;
  garmentTemplateId: string;
  lastKpis?: ScenarioKpis;
  /** Wall-clock when lastKpis was captured. */
  lastRunAt?: string;
}

export interface FactoryStructure {
  floors: Floor[];
  lines: Line[];
}

/**
 * A saved factory configuration + the KPI snapshot from the run that
 * captured it. Compared side-by-side on the Scenarios page.
 */
export interface ScenarioKpis {
  producedPieces: number;
  throughputPerHr: number;
  efficiencyPct: number;
  meanLeadTime: number;
  utilization: number;
  wipBundles: number;
  bottleneckOpName: string;
  bottleneckQueue: number;
  /** Number of replications behind these means. 1 = single-seed run. */
  replicationCount?: number;
  /** OEE two-factor product (Performance × Quality), 0..1. Machine
   *  availability is out of scope, so the Availability factor is omitted. */
  oee?: number;
  oeePerformance?: number;
  oeeQuality?: number;
  /** On-standard performance % — alias of BSI in lean vocabulary. */
  onStandardPct?: number;
  /** Off-standard loss % = (clocked - earned) / clocked × 100. */
  offStandardLossPct?: number;
  /** Pieces produced per operator-hour. */
  labourProductivity?: number;
  /** Actual pph - demand pph; signed. */
  demandTaktGap?: number;
  /** Intrinsic balance ratio ÷ dynamic balance ratio. */
  intrinsicVsDynamicRatio?: number;
  /** Per-KPI standard deviation across replications, when available. */
  std?: {
    producedPieces: number;
    throughputPerHr: number;
    efficiencyPct: number;
    meanLeadTime: number;
    utilization: number;
    wipBundles: number;
    oee?: number;
    onStandardPct?: number;
    labourProductivity?: number;
    demandTaktGap?: number;
  };
}

export interface Scenario {
  id: string;
  name: string;
  notes?: string;
  createdAt: string;
  /** What was being modelled. */
  config: {
    garmentTemplateId: string;
    operators: number;
    /** Snapshot of the active twin at save time. Lets a scenario carry its
     *  own factory layout (lines, workstations, connectors) so loading R1
     *  vs R2 swaps the floor, not just the per-garment config. Optional
     *  for backward compatibility — older scenarios saved without this
     *  field still load (they just don't restore a layout). */
    twin?: Twin;
  };
  /** Results from the run that produced this snapshot. */
  kpis: ScenarioKpis;
}

export interface ProjectState {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  meta: ProjectMeta;

  /** The project's working production system. Drives bundleSize in the sim
   *  and is surfaced in the LiveSim HUD so the user can confirm their layout
   *  choice is being honoured. */

  scenarios: Scenario[];

  /** Multi-line factory structure consumed by the Factory Twin. */
  factory: FactoryStructure;

  /**
   * User edits to garment templates — per-garment overrides that shadow
   * the built-in `GARMENT_TEMPLATES`. Editing a built-in (e.g. SMV change)
   * clones it into here. Custom garments created from scratch live here
   * too (with ids that don't collide with built-ins).
   */
  garmentEdits: Record<string, GarmentTemplate>;

  /**
   * Station types the user authored — the palette sections beyond the
   * built-in sewing machines. Project-scoped on purpose: a type is made for
   * the floor being modelled, and because the factory library snapshots the
   * whole project state, a saved factory carries its types with it.
   */
  stationTypes: StationType[];

  /**
   * IDs of built-in garments the user has explicitly removed from the
   * library. They stay resolvable in `byId` (so factory workstations that
   * still reference them don't crash), but disappear from the picker list.
   * Removing a built-in also drops its edit — restoring later returns the
   * clean catalog defaults.
   */
  hiddenGarmentIds: Record<string, true>;

  /** Display preferences set from the Settings page. Render sites read
   *  these to format currency, dates, distances and SAM. */
  units: UnitsPrefs;

  /** Time semantics: model-time-unit, calendar anchor, execution mode and
   *  real-time scale. See `TimeSettings`. */
  time: TimeSettings;

  // ── Mutators ─────────────────────────────────────────────────────────────
  rename: (name: string) => void;
  /** Patch one unit/format preference. The Settings page calls this from
   *  each toggle's onChange. */
  setUnit: <K extends keyof UnitsPrefs>(key: K, value: UnitsPrefs[K]) => void;
  /** Patch one time-semantics field. */
  setTime: <K extends keyof TimeSettings>(key: K, value: TimeSettings[K]) => void;

  /** Save a scenario from the current state + a freshly-captured KPI run.
   *  When `twin` is supplied, the scenario stores a deep clone of the
   *  active factory layout so Load can restore it side-by-side with
   *  the per-garment config. */
  saveScenario: (input: {
    name: string;
    notes?: string;
    kpis: ScenarioKpis;
    twin?: Twin;
    /** The garment this scenario was measured against. Required: there is
     *  no project-level default to fall back on — the caller knows which
     *  garment its KPIs describe, and guessing would mislabel the card. */
    garmentTemplateId: string;
    /** The operator count this scenario was measured with. Required, same
     *  reasoning. */
    operators: number;
  }) => Scenario;
  /** Remove a scenario by id. */
  deleteScenario: (id: string) => void;
  /** Rename a scenario in place. */
  renameScenario: (id: string, name: string) => void;

  // ── Factory CRUD ─────────────────────────────────────────────────────────
  /** Add a floor to the factory. Returns the created floor's id. */
  addFloor: (input: Omit<Floor, 'id'>) => string;
  /** Remove a floor + every line on it. */
  removeFloor: (id: string) => void;
  /** Rename a floor. */
  renameFloor: (id: string, name: string) => void;
  /** Add a new line to a floor. Returns the created line's id. */
  addLine: (input: Omit<Line, 'id' | 'lastKpis' | 'lastRunAt'>) => string;
  /** Remove a line. */
  removeLine: (id: string) => void;
  /** Update fields on a line (partial). */
  updateLine: (id: string, patch: Partial<Omit<Line, 'id' | 'floorId'>>) => void;
  /** Cache a fresh KPI snapshot on a line (called by Twin's Run-line). */
  setLineKpis: (id: string, kpis: ScenarioKpis) => void;

  // ── Station types (user-authored palette) ────────────────────────────────
  /** Append a new authored station type. */
  addStationType: (type: StationType) => void;
  /** Patch an existing type in place. Placed stations keep resolving through
   *  the same id, so an edit re-draws every station of that type — which
   *  means the id is fixed here even if the patch carries one. */
  updateStationType: (id: string, patch: Partial<StationType>) => void;
  /** Drop a type. Callers are expected to check for placed stations first —
   *  the store does not know about the twin. */
  removeStationType: (id: string) => void;

  // ── Garment / operation library ──────────────────────────────────────────
  /** Replace (or seed) an entire garment edit. Used when adding a brand-new
   *  garment from scratch and when the editor wants to commit a wholesale
   *  change. */
  setGarmentEdit: (id: string, garment: GarmentTemplate) => void;
  /** Patch top-level garment fields (name, description, totalSmv,
   *  hourlyTarget100). Auto-clones the built-in into
   *  `garmentEdits` if it isn't there yet. */
  patchGarment: (
    id: string,
    builtIn: GarmentTemplate | undefined,
    patch: Partial<Omit<GarmentTemplate, 'operations'>>,
  ) => void;
  /** Update one operation on a garment. */
  updateOperation: (
    garmentId: string,
    builtIn: GarmentTemplate | undefined,
    opId: string,
    patch: Partial<Operation>,
  ) => void;
  /** Append a new operation. */
  addOperation: (
    garmentId: string,
    builtIn: GarmentTemplate | undefined,
    op: Operation,
  ) => void;
  /** Remove an operation by id. */
  removeOperation: (
    garmentId: string,
    builtIn: GarmentTemplate | undefined,
    opId: string,
  ) => void;
  /** Shift an operation up (-1) or down (+1) in the bulletin. */
  moveOperation: (
    garmentId: string,
    builtIn: GarmentTemplate | undefined,
    opId: string,
    dir: -1 | 1,
  ) => void;
  /** Drop the override for a garment id; built-in default returns. */
  resetGarment: (id: string) => void;
  /** Hide a built-in garment from the picker and drop its edit. Custom
   *  garments should use `resetGarment` instead. */
  hideGarment: (id: string) => void;
  /** Unhide a previously hidden built-in. */
  unhideGarment: (id: string) => void;

  // ── Project actions ──────────────────────────────────────────────────────
  /** Wipe everything back to defaults. Caller should confirm first. */
  resetProject: () => void;
  /** Replace state from an imported snapshot. Validates schema version. */
  loadProject: (snapshot: unknown) => { ok: true } | { ok: false; reason: string };
  /** Serialise current state to a plain JSON-safe object for export. */
  exportProject: () => ProjectState;
}

function defaultMeta(): ProjectMeta {
  const now = new Date().toISOString();
  return {
    name: 'Test Factory',
    factory: 'Reference Unit-3',
    createdAt: now,
    modifiedAt: now,
  };
}

/**
 * Default factory: 3 floors (Sewing / Cutting / Finishing) with a sensible
 * spread of lines. Matches the layout the Factory Twin originally rendered
 * with mock data, but every value here flows into the real model.
 */
function defaultFactory(): FactoryStructure {
  return {
    floors: [
      { id: 'F1', name: 'Floor 1 · Sewing',    description: 'Knit garment sewing — 4 lines',  color: 'brand'  },
      { id: 'F2', name: 'Floor 2 · Cutting',   description: 'Spreading + cutting — 2 lines',  color: 'fabric' },
      { id: 'F3', name: 'Floor 3 · Finishing', description: 'Press + pack — 2 lines',         color: 'thread' },
    ],
    lines: [
      { id: 'L1', name: 'Line 1', floorId: 'F1', garmentTemplateId: 'tshirt' },
      { id: 'L2', name: 'Line 2', floorId: 'F1', garmentTemplateId: 'polo' },
      { id: 'L3', name: 'Line 3', floorId: 'F1', garmentTemplateId: 'shirt' },
      { id: 'L4', name: 'Line 4', floorId: 'F1', garmentTemplateId: 'sweatshirt' },
      { id: 'L5', name: 'Cut A',  floorId: 'F2', garmentTemplateId: 'tshirt' },
      { id: 'L6', name: 'Cut B',  floorId: 'F2', garmentTemplateId: 'shirt' },
      { id: 'L7', name: 'Finish A', floorId: 'F3', garmentTemplateId: 'tshirt' },
      { id: 'L8', name: 'Finish B', floorId: 'F3', garmentTemplateId: 'shirt' },
    ],
  };
}

/** Drop the v7 `skillMatrix` a saved scenario's config may still carry. */
function stripScenarioSkillMatrix(sc: Scenario): Scenario {
  const cfg = sc.config as Scenario['config'] & { skillMatrix?: unknown };
  if (!('skillMatrix' in cfg)) return sc;
  const { skillMatrix: _dropped, ...rest } = cfg;
  void _dropped;
  return { ...sc, config: rest };
}

/** Drop the v7 per-line `operators` headcount off the legacy factory seed. */
function stripLineHeadcount(factory: FactoryStructure): FactoryStructure {
  return {
    ...factory,
    lines: factory.lines.map((l) => {
      const { operators: _dropped, ...rest } = l as Line & { operators?: unknown };
      void _dropped;
      return rest;
    }),
  };
}

const defaults: Omit<
  ProjectState,
  | 'rename'
  | 'resetProject'
  | 'loadProject'
  | 'exportProject'
  | 'saveScenario'
  | 'deleteScenario'
  | 'renameScenario'
  | 'addFloor'
  | 'removeFloor'
  | 'renameFloor'
  | 'addLine'
  | 'removeLine'
  | 'updateLine'
  | 'setLineKpis'
  | 'addStationType'
  | 'updateStationType'
  | 'removeStationType'
  | 'setGarmentEdit'
  | 'patchGarment'
  | 'updateOperation'
  | 'addOperation'
  | 'removeOperation'
  | 'moveOperation'
  | 'resetGarment'
  | 'hideGarment'
  | 'unhideGarment'
  | 'setUnit'
  | 'setTime'
> = (() => {
  const meta = defaultMeta();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    meta,
    scenarios: [],
    factory: defaultFactory(),
    garmentEdits: {},
    stationTypes: [],
    hiddenGarmentIds: {},
    units: defaultUnits,
    time: defaultTimeSettings(meta.createdAt),
  };
})();

/** Re-derive totalSmv after operations change. */
function recomputeSmv(g: GarmentTemplate): GarmentTemplate {
  return { ...g, totalSmv: g.operations.reduce((s, o) => s + o.smv, 0) };
}

/** Clone the built-in into garmentEdits if no edit exists yet. */
function ensureEdit(
  edits: Record<string, GarmentTemplate>,
  id: string,
  builtIn: GarmentTemplate | undefined,
): { edits: Record<string, GarmentTemplate>; current: GarmentTemplate | undefined } {
  if (edits[id]) return { edits, current: edits[id] };
  if (!builtIn) return { edits, current: undefined };
  const clone = JSON.parse(JSON.stringify(builtIn)) as GarmentTemplate;
  return { edits: { ...edits, [id]: clone }, current: clone };
}

function touch<T extends ProjectState>(s: T): T {
  return { ...s, meta: { ...s.meta, modifiedAt: new Date().toISOString() } };
}

export const useProject = create<ProjectState>()(
  persist(
    (set, get) => ({
      ...defaults,

      rename: (name) =>
        set((s) => touch({ ...s, meta: { ...s.meta, name } })),


      setUnit: (key, value) =>
        set((s) => touch({ ...s, units: { ...s.units, [key]: value } })),

      setTime: (key, value) =>
        set((s) => touch({ ...s, time: { ...s.time, [key]: value } })),

      saveScenario: (input) => {
        const cur = get();
        const id = `scn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const { garmentTemplateId, operators } = input;
        const scenario: Scenario = {
          id,
          name: input.name || `Scenario ${cur.scenarios.length + 1}`,
          notes: input.notes,
          createdAt: new Date().toISOString(),
          config: {
            garmentTemplateId,
            operators,
            twin: input.twin ? (JSON.parse(JSON.stringify(input.twin)) as Twin) : undefined,
          },
          kpis: input.kpis,
        };
        set((s) => touch({ ...s, scenarios: [scenario, ...s.scenarios] }));
        return scenario;
      },

      deleteScenario: (id) =>
        set((s) => touch({ ...s, scenarios: s.scenarios.filter((x) => x.id !== id) })),

      renameScenario: (id, name) =>
        set((s) =>
          touch({
            ...s,
            scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, name } : x)),
          }),
        ),

      addFloor: (input) => {
        const id = `F${Date.now().toString(36)}`;
        set((s) =>
          touch({ ...s, factory: { ...s.factory, floors: [...s.factory.floors, { id, ...input }] } }),
        );
        return id;
      },

      removeFloor: (id) =>
        set((s) =>
          touch({
            ...s,
            factory: {
              floors: s.factory.floors.filter((f) => f.id !== id),
              lines: s.factory.lines.filter((l) => l.floorId !== id),
            },
          }),
        ),

      renameFloor: (id, name) =>
        set((s) =>
          touch({
            ...s,
            factory: {
              ...s.factory,
              floors: s.factory.floors.map((f) => (f.id === id ? { ...f, name } : f)),
            },
          }),
        ),

      addLine: (input) => {
        const id = `L${Date.now().toString(36)}`;
        set((s) =>
          touch({
            ...s,
            factory: { ...s.factory, lines: [...s.factory.lines, { id, ...input }] },
          }),
        );
        return id;
      },

      removeLine: (id) =>
        set((s) =>
          touch({
            ...s,
            factory: { ...s.factory, lines: s.factory.lines.filter((l) => l.id !== id) },
          }),
        ),

      updateLine: (id, patch) =>
        set((s) =>
          touch({
            ...s,
            factory: {
              ...s.factory,
              lines: s.factory.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
            },
          }),
        ),

      setLineKpis: (id, kpis) =>
        set((s) =>
          touch({
            ...s,
            factory: {
              ...s.factory,
              lines: s.factory.lines.map((l) =>
                l.id === id ? { ...l, lastKpis: kpis, lastRunAt: new Date().toISOString() } : l,
              ),
            },
          }),
        ),

      addStationType: (type) =>
        set((s) => touch({ ...s, stationTypes: [...s.stationTypes, normalizeStationType(type)] })),

      updateStationType: (id, patch) =>
        set((s) => ({
          ...touch(s),
          stationTypes: s.stationTypes.map((t) =>
            t.id === id ? normalizeStationType({ ...t, ...patch, id }) : t,
          ),
        })),

      removeStationType: (id) =>
        set((s) => touch({ ...s, stationTypes: s.stationTypes.filter((t) => t.id !== id) })),

      setGarmentEdit: (id, garment) =>
        set((s) => touch({ ...s, garmentEdits: { ...s.garmentEdits, [id]: recomputeSmv(garment) } })),

      patchGarment: (id, builtIn, patch) =>
        set((s) => {
          const { edits, current } = ensureEdit(s.garmentEdits, id, builtIn);
          if (!current) return s;
          return touch({
            ...s,
            garmentEdits: { ...edits, [id]: recomputeSmv({ ...current, ...patch }) },
          });
        }),

      updateOperation: (garmentId, builtIn, opId, patch) =>
        set((s) => {
          const { edits, current } = ensureEdit(s.garmentEdits, garmentId, builtIn);
          if (!current) return s;
          const next = recomputeSmv({
            ...current,
            operations: current.operations.map((o) => (o.id === opId ? { ...o, ...patch } : o)),
          });
          return touch({ ...s, garmentEdits: { ...edits, [garmentId]: next } });
        }),

      addOperation: (garmentId, builtIn, op) =>
        set((s) => {
          const { edits, current } = ensureEdit(s.garmentEdits, garmentId, builtIn);
          if (!current) return s;
          const next = recomputeSmv({
            ...current,
            operations: [...current.operations, op],
          });
          return touch({ ...s, garmentEdits: { ...edits, [garmentId]: next } });
        }),

      removeOperation: (garmentId, builtIn, opId) =>
        set((s) => {
          const { edits, current } = ensureEdit(s.garmentEdits, garmentId, builtIn);
          if (!current) return s;
          const next = recomputeSmv({
            ...current,
            operations: current.operations.filter((o) => o.id !== opId),
          });
          return touch({ ...s, garmentEdits: { ...edits, [garmentId]: next } });
        }),

      moveOperation: (garmentId, builtIn, opId, dir) =>
        set((s) => {
          const { edits, current } = ensureEdit(s.garmentEdits, garmentId, builtIn);
          if (!current) return s;
          const idx = current.operations.findIndex((o) => o.id === opId);
          if (idx < 0) return s;
          const j = idx + dir;
          if (j < 0 || j >= current.operations.length) return s;
          const ops = current.operations.slice();
          [ops[idx], ops[j]] = [ops[j], ops[idx]];
          const next = recomputeSmv({ ...current, operations: ops });
          return touch({ ...s, garmentEdits: { ...edits, [garmentId]: next } });
        }),

      resetGarment: (id) =>
        set((s) => {
          const next = { ...s.garmentEdits };
          delete next[id];
          return touch({ ...s, garmentEdits: next });
        }),

      hideGarment: (id) =>
        set((s) => {
          // Drop the override so a future restore returns the clean catalog
          // defaults rather than stale edits.
          const nextEdits = { ...s.garmentEdits };
          delete nextEdits[id];
          return touch({
            ...s,
            garmentEdits: nextEdits,
            hiddenGarmentIds: { ...s.hiddenGarmentIds, [id]: true },
          });
        }),

      unhideGarment: (id) =>
        set((s) => {
          if (!s.hiddenGarmentIds[id]) return s;
          const next = { ...s.hiddenGarmentIds };
          delete next[id];
          return touch({ ...s, hiddenGarmentIds: next });
        }),

      resetProject: () =>
        set(() => ({
          ...defaults,
          meta: defaultMeta(),
          rename: get().rename,
          setUnit: get().setUnit,
          setTime: get().setTime,
          saveScenario: get().saveScenario,
          deleteScenario: get().deleteScenario,
          renameScenario: get().renameScenario,
          addFloor: get().addFloor,
          removeFloor: get().removeFloor,
          renameFloor: get().renameFloor,
          addLine: get().addLine,
          removeLine: get().removeLine,
          updateLine: get().updateLine,
          setLineKpis: get().setLineKpis,
          setGarmentEdit: get().setGarmentEdit,
          patchGarment: get().patchGarment,
          updateOperation: get().updateOperation,
          addOperation: get().addOperation,
          removeOperation: get().removeOperation,
          moveOperation: get().moveOperation,
          resetGarment: get().resetGarment,
          hideGarment: get().hideGarment,
          unhideGarment: get().unhideGarment,
          resetProject: get().resetProject,
          loadProject: get().loadProject,
          exportProject: get().exportProject,
        })),

      loadProject: (snapshot) => {
        if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'Not an object' };
        const s = snapshot as Partial<ProjectState>;
        // Accept every version we've ever written. v1 imports get default
        // TimeSettings filled in; v1/v2 asset-library slices are simply not
        // read (the spread below names every field explicitly), so an older
        // file loads cleanly and is re-saved at the current version without
        // them. v1–v3 files carry no station types and load with none.
        const sv = s.schemaVersion as number | undefined;
        if (sv == null || sv < 1 || sv > PROJECT_SCHEMA_VERSION) {
          return {
            ok: false,
            reason: `Schema version mismatch: file is v${sv}, app supports v1–v${PROJECT_SCHEMA_VERSION}`,
          };
        }
        set((cur) => ({
          ...cur,
          schemaVersion: PROJECT_SCHEMA_VERSION,
          meta: { ...defaults.meta, ...s.meta, modifiedAt: new Date().toISOString() },
          // v7 and earlier carried a skill matrix, operator names and a
          // per-line headcount; none is read back. Not copying them is the
          // migration — the file loads, and the next save writes v8.
          scenarios: (s.scenarios ?? []).map(stripScenarioSkillMatrix),
          factory: stripLineHeadcount(s.factory ?? defaultFactory()),
          garmentEdits: s.garmentEdits ?? {},
          stationTypes: (s.stationTypes ?? []).map(normalizeStationType),
          hiddenGarmentIds: s.hiddenGarmentIds ?? {},
          units: { ...defaultUnits, ...s.units },
          // v1 files have no `time` field — fill from defaults anchored on
          // the project's creation date so calendar projections are sensible.
          time: timeSettingsFrom(s.meta?.createdAt ?? defaults.meta.createdAt, s.time),
        }));
        return { ok: true };
      },

      exportProject: () => {
        const s = get();
        return {
          schemaVersion: s.schemaVersion,
          meta: s.meta,
          scenarios: s.scenarios,
          factory: s.factory,
          garmentEdits: s.garmentEdits,
          stationTypes: s.stationTypes,
          hiddenGarmentIds: s.hiddenGarmentIds,
          units: s.units,
          time: s.time,
        } as ProjectState;
      },
    }),
    {
      name: 'stitchworks.project.v1',
      version: PROJECT_SCHEMA_VERSION,
      // Quota-aware storage — when the library + twin writes have eaten
      // the budget and project.scenarios can't fit, we want a loud
      // console.error instead of a silently dropped scenarios array.
      storage: createJSONStorage(() => indexedDbStorage()),
      // Persist data only — don't try to serialise functions.
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        meta: state.meta,
        scenarios: state.scenarios,
        factory: state.factory,
        garmentEdits: state.garmentEdits,
        stationTypes: state.stationTypes,
        hiddenGarmentIds: state.hiddenGarmentIds,
        units: state.units,
        time: state.time,
      }),
      migrate: (persisted, fromVersion) => {
        let p = (persisted as Partial<ProjectState>) ?? {};
        // v1 → v2: add the `time` slice with sensible defaults anchored on
        // the existing project's creation date.
        if (fromVersion < 2) {
          const createdAt = p.meta?.createdAt ?? new Date().toISOString();
          p = { ...p, time: defaultTimeSettings(createdAt) };
        }
        // v2 → v3: the sewing-lines pivot removed the asset library. Delete
        // its twelve slices outright rather than letting them ride along as
        // dead weight — `partialize` no longer writes them, but an existing
        // IndexedDB payload keeps whatever it last stored (including any
        // uploaded images, which were base64 data URLs and by far the
        // largest thing in the record).
        if (fromVersion < 3) {
          const dead = [
            'machineEdits', 'customMachines', 'hiddenMachines', 'machineImages',
            'workerEdits', 'customWorkers', 'hiddenWorkers', 'workerImages',
            'customProducts', 'productEdits', 'hiddenProducts', 'productImages',
          ] as const;
          const next = { ...p } as Record<string, unknown>;
          for (const k of dead) delete next[k];
          p = next as Partial<ProjectState>;
        }
        // v3 → v4: user-authored station types. Nothing to convert — the
        // slice simply did not exist, and `merge` backfills it.
        if (fromVersion < 4) {
          p = { ...p, stationTypes: p.stationTypes ?? [] };
        }
        // v4 → v5: the Orders wizard is gone. Drop the key outright — the
        // drafts reference a garment/system pairing nothing reads anymore,
        // and leaving them would keep a dead list growing in IndexedDB.
        if (fromVersion < 5) {
          const next = { ...p } as Record<string, unknown>;
          delete next.orders;
          p = next as Partial<ProjectState>;
        }
        // v5 → v6: production systems are out of scope. Drop the selected
        // system, and the per-line `productionSystem` string on the legacy
        // factory seed — both name a concept the app no longer has.
        if (fromVersion < 6) {
          const next = { ...p } as Record<string, unknown>;
          delete next.selectedProductionSystem;
          const factory = next.factory as { lines?: Array<Record<string, unknown>> } | undefined;
          if (factory?.lines) {
            next.factory = {
              ...factory,
              lines: factory.lines.map((l) => {
                const { productionSystem: _dropped, ...rest } = l;
                void _dropped;
                return rest;
              }),
            };
          }
          p = next as Partial<ProjectState>;
        }
        // v6 → v7: the per-garment Yamazumi override is gone. A line's balance
        // is its twin now — the stations placed on it, the operation each one
        // runs, and its parallel-channel count — and the twin is already
        // snapshotted into `scenario.config.twin`. The old map keyed a manual
        // assignment by GARMENT id, which could not name a line at all: two
        // lines running the same style shared one override, and a third
        // running a different style silently got none.
        if (fromVersion < 7) {
          const next = { ...p } as Record<string, unknown>;
          delete next.yamazumiOverrides;
          const scenarios = next.scenarios as Array<Record<string, unknown>> | undefined;
          if (scenarios) {
            next.scenarios = scenarios.map((sc) => {
              const cfg = sc.config as Record<string, unknown> | undefined;
              if (!cfg || !('yamazumiOverride' in cfg)) return sc;
              const { yamazumiOverride: _dropped, ...restCfg } = cfg;
              void _dropped;
              return { ...sc, config: restCfg };
            });
          }
          p = next as Partial<ProjectState>;
        }
        // v7 → v8: the skill matrix, operator-name overrides and the legacy
        // per-line headcount are gone. Efficiency lives on the twin's
        // stations and lines now, and the headcount is derived from the
        // stations on the floor, so each key is deleted rather than carried.
        if (fromVersion < 8) {
          const next = { ...p } as Record<string, unknown>;
          delete next.skillMatrix;
          delete next.operatorNames;
          const scenarios = next.scenarios as Scenario[] | undefined;
          if (scenarios) next.scenarios = scenarios.map(stripScenarioSkillMatrix);
          const factory = next.factory as FactoryStructure | undefined;
          if (factory) next.factory = stripLineHeadcount(factory);
          p = next as Partial<ProjectState>;
        }
        return { ...p, schemaVersion: PROJECT_SCHEMA_VERSION } as Partial<ProjectState>;
      },
      // Payloads written before a slice existed hydrate it as undefined, and
      // any consumer that iterates over it then crashes. Backfill the maps
      // and records that must never be undefined.
      merge: (persisted, current) => {
        const p = (persisted as Partial<ProjectState>) ?? {};
        return {
          ...current,
          ...p,
          units: { ...defaultUnits, ...(p.units ?? {}) },
          hiddenGarmentIds: p.hiddenGarmentIds ?? {},
          // Re-clamped on the way in: a payload hand-edited or written by an
          // older build can hold a footprint the canvas cannot draw.
          stationTypes: (p.stationTypes ?? []).map(normalizeStationType),
          time: timeSettingsFrom(p.meta?.createdAt ?? current.meta.createdAt, p.time),
        };
      },
    },
  ),
);

/**
 * Trigger a `.swproj` JSON download for the current project. Used by the
 * Settings page Export button.
 */
export function downloadProjectJson(state: ProjectState): void {
  const data = state.exportProject();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = `${(data.meta.name || 'stitchworks').replace(/[^a-z0-9-_]/gi, '-')}.swproj`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Turn the text of a chosen project file into JSON, naming the file in any
 * complaint. An empty file is called out on its own: it is what a Save that
 * opened the dialog and then failed to write leaves behind, and "unexpected
 * end of JSON input" does not tell the user that.
 */
export function parseProjectFileText(text: string, fileName: string): unknown {
  if (text.trim() === '') {
    throw new Error(`"${fileName}" is empty — nothing was ever written to it. Save the factory again, then open that file.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`"${fileName}" is not a .swproj file — its contents are not JSON.`);
  }
}

/**
 * Pop a file picker, parse the chosen `.swproj` (or `.json`), and feed it to
 * `loadProject`. Resolves to a result describing success or the failure
 * reason for the caller to show to the user. Rejects with an AbortError when
 * the dialog closes without a file, so callers can stay quiet on a cancel.
 */
export function pickProjectFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.swproj,.json,application/json';
    const cancelled = () => reject(new DOMException('No file chosen', 'AbortError'));
    input.oncancel = cancelled;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return cancelled();
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(parseProjectFileText(reader.result as string, file.name));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
