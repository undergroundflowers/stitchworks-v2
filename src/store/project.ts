/**
 * Project store — the single source of truth for everything the user
 * "owns" inside Stitchworks: factory metadata, the live-sim configuration,
 * the Yamazumi assignment overrides, and the skill matrix. Persisted to
 * localStorage automatically via zustand/middleware/persist.
 *
 * The shape is versioned (`schemaVersion`); future migrations bump the
 * version and add a `migrate` step in the persist config.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const PROJECT_SCHEMA_VERSION = 1 as const;

export interface ProjectMeta {
  name: string;
  factory: string;
  createdAt: string;
  modifiedAt: string;
}

/** Operator id → (operation id → efficiency 0..1). Sparse — missing entries
 *  fall back to the worker archetype's default efficiency. */
export type SkillMatrix = Record<string, Record<string, number>>;

export interface YamazumiAssignment {
  /** Operator display id, e.g. "OPR-01". */
  operatorId: string;
  /** Operation ids assigned to this operator, in execution order. */
  opIds: string[];
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
  operators: number;
  /** PBS / modular / UPS / etc. Drives operator distribution + WIP. */
  productionSystem: string;
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
    /** Sparse overrides at save time — recreate the run if needed. */
    skillMatrix: SkillMatrix;
    yamazumiOverride?: YamazumiAssignment[];
  };
  /** Results from the run that produced this snapshot. */
  kpis: ScenarioKpis;
}

export interface ProjectState {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  meta: ProjectMeta;

  /** Active garment template id used by LiveSim and Yamazumi by default. */
  selectedGarmentId: string;

  /** Default operator count for new sims and balancing views. */
  defaultOperators: number;

  /** Operator name overrides (id → name). */
  operatorNames: Record<string, string>;

  /** Per-garment-template, the user's manual Yamazumi assignment, if any.
   *  When absent, the Yamazumi falls back to the LPT auto-assignment. */
  yamazumiOverrides: Record<string, YamazumiAssignment[]>;

  skillMatrix: SkillMatrix;

  scenarios: Scenario[];

  /** Multi-line factory structure consumed by the Factory Twin. */
  factory: FactoryStructure;

  // ── Mutators ─────────────────────────────────────────────────────────────
  rename: (name: string) => void;
  setSelectedGarment: (id: string) => void;
  setDefaultOperators: (n: number) => void;
  setOperatorName: (id: string, name: string) => void;
  setYamazumiOverride: (garmentId: string, assignments: YamazumiAssignment[]) => void;
  clearYamazumiOverride: (garmentId: string) => void;
  setSkill: (operatorId: string, opId: string, efficiency: number) => void;
  resetSkillMatrix: () => void;

  /** Save a scenario from the current state + a freshly-captured KPI run. */
  saveScenario: (input: { name: string; notes?: string; kpis: ScenarioKpis }) => Scenario;
  /** Remove a scenario by id. */
  deleteScenario: (id: string) => void;
  /** Rename a scenario in place. */
  renameScenario: (id: string, name: string) => void;
  /**
   * Restore a scenario's config into the live project (garment, operators,
   * skill matrix, yamazumi override). The scenario itself is not deleted —
   * loading is non-destructive to the saved row.
   */
  loadScenario: (id: string) => void;

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
    name: 'Stitchworks Demo',
    factory: 'Brandix Unit-3',
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
      { id: 'L1', name: 'Line 1', floorId: 'F1', garmentTemplateId: 'tshirt',     operators: 25, productionSystem: 'PBS' },
      { id: 'L2', name: 'Line 2', floorId: 'F1', garmentTemplateId: 'polo',       operators: 28, productionSystem: 'PBS' },
      { id: 'L3', name: 'Line 3', floorId: 'F1', garmentTemplateId: 'shirt',      operators: 22, productionSystem: 'modular' },
      { id: 'L4', name: 'Line 4', floorId: 'F1', garmentTemplateId: 'sweatshirt', operators: 24, productionSystem: 'PBS' },
      { id: 'L5', name: 'Cut A',  floorId: 'F2', garmentTemplateId: 'tshirt',     operators: 6,  productionSystem: 'straight' },
      { id: 'L6', name: 'Cut B',  floorId: 'F2', garmentTemplateId: 'shirt',      operators: 8,  productionSystem: 'straight' },
      { id: 'L7', name: 'Finish A', floorId: 'F3', garmentTemplateId: 'tshirt',   operators: 10, productionSystem: 'straight' },
      { id: 'L8', name: 'Finish B', floorId: 'F3', garmentTemplateId: 'shirt',    operators: 8,  productionSystem: 'straight' },
    ],
  };
}

const defaults: Omit<
  ProjectState,
  | 'rename'
  | 'setSelectedGarment'
  | 'setDefaultOperators'
  | 'setOperatorName'
  | 'setYamazumiOverride'
  | 'clearYamazumiOverride'
  | 'setSkill'
  | 'resetSkillMatrix'
  | 'resetProject'
  | 'loadProject'
  | 'exportProject'
  | 'saveScenario'
  | 'deleteScenario'
  | 'renameScenario'
  | 'loadScenario'
  | 'addFloor'
  | 'removeFloor'
  | 'renameFloor'
  | 'addLine'
  | 'removeLine'
  | 'updateLine'
  | 'setLineKpis'
> = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  meta: defaultMeta(),
  selectedGarmentId: 'tshirt',
  defaultOperators: 25,
  operatorNames: {},
  yamazumiOverrides: {},
  skillMatrix: {},
  scenarios: [],
  factory: defaultFactory(),
};

function touch<T extends ProjectState>(s: T): T {
  return { ...s, meta: { ...s.meta, modifiedAt: new Date().toISOString() } };
}

export const useProject = create<ProjectState>()(
  persist(
    (set, get) => ({
      ...defaults,

      rename: (name) =>
        set((s) => touch({ ...s, meta: { ...s.meta, name } })),

      setSelectedGarment: (id) =>
        set((s) => touch({ ...s, selectedGarmentId: id })),

      setDefaultOperators: (n) =>
        set((s) => touch({ ...s, defaultOperators: Math.max(1, Math.min(120, Math.round(n))) })),

      setOperatorName: (id, name) =>
        set((s) => touch({ ...s, operatorNames: { ...s.operatorNames, [id]: name } })),

      setYamazumiOverride: (garmentId, assignments) =>
        set((s) =>
          touch({
            ...s,
            yamazumiOverrides: { ...s.yamazumiOverrides, [garmentId]: assignments },
          }),
        ),

      clearYamazumiOverride: (garmentId) =>
        set((s) => {
          const next = { ...s.yamazumiOverrides };
          delete next[garmentId];
          return touch({ ...s, yamazumiOverrides: next });
        }),

      setSkill: (operatorId, opId, efficiency) =>
        set((s) => {
          const opRow = { ...(s.skillMatrix[operatorId] ?? {}) };
          if (efficiency <= 0) delete opRow[opId];
          else opRow[opId] = Math.max(0, Math.min(1.5, efficiency));
          return touch({
            ...s,
            skillMatrix: { ...s.skillMatrix, [operatorId]: opRow },
          });
        }),

      resetSkillMatrix: () => set((s) => touch({ ...s, skillMatrix: {} })),

      saveScenario: (input) => {
        const cur = get();
        const id = `scn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const scenario: Scenario = {
          id,
          name: input.name || `Scenario ${cur.scenarios.length + 1}`,
          notes: input.notes,
          createdAt: new Date().toISOString(),
          config: {
            garmentTemplateId: cur.selectedGarmentId,
            operators: cur.defaultOperators,
            skillMatrix: JSON.parse(JSON.stringify(cur.skillMatrix)) as SkillMatrix,
            yamazumiOverride: cur.yamazumiOverrides[cur.selectedGarmentId]
              ? JSON.parse(JSON.stringify(cur.yamazumiOverrides[cur.selectedGarmentId])) as YamazumiAssignment[]
              : undefined,
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

      loadScenario: (id) =>
        set((s) => {
          const scenario = s.scenarios.find((x) => x.id === id);
          if (!scenario) return s;
          const yamOverrides = { ...s.yamazumiOverrides };
          if (scenario.config.yamazumiOverride) {
            yamOverrides[scenario.config.garmentTemplateId] = scenario.config.yamazumiOverride;
          } else {
            delete yamOverrides[scenario.config.garmentTemplateId];
          }
          return touch({
            ...s,
            selectedGarmentId: scenario.config.garmentTemplateId,
            defaultOperators: scenario.config.operators,
            skillMatrix: JSON.parse(JSON.stringify(scenario.config.skillMatrix)) as SkillMatrix,
            yamazumiOverrides: yamOverrides,
          });
        }),

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

      resetProject: () =>
        set(() => ({
          ...defaults,
          meta: defaultMeta(),
          rename: get().rename,
          setSelectedGarment: get().setSelectedGarment,
          setDefaultOperators: get().setDefaultOperators,
          setOperatorName: get().setOperatorName,
          setYamazumiOverride: get().setYamazumiOverride,
          clearYamazumiOverride: get().clearYamazumiOverride,
          setSkill: get().setSkill,
          resetSkillMatrix: get().resetSkillMatrix,
          saveScenario: get().saveScenario,
          deleteScenario: get().deleteScenario,
          renameScenario: get().renameScenario,
          loadScenario: get().loadScenario,
          addFloor: get().addFloor,
          removeFloor: get().removeFloor,
          renameFloor: get().renameFloor,
          addLine: get().addLine,
          removeLine: get().removeLine,
          updateLine: get().updateLine,
          setLineKpis: get().setLineKpis,
          resetProject: get().resetProject,
          loadProject: get().loadProject,
          exportProject: get().exportProject,
        })),

      loadProject: (snapshot) => {
        if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'Not an object' };
        const s = snapshot as Partial<ProjectState>;
        if (s.schemaVersion !== PROJECT_SCHEMA_VERSION) {
          return {
            ok: false,
            reason: `Schema version mismatch: file is v${s.schemaVersion}, app expects v${PROJECT_SCHEMA_VERSION}`,
          };
        }
        set((cur) => ({
          ...cur,
          schemaVersion: PROJECT_SCHEMA_VERSION,
          meta: { ...defaults.meta, ...s.meta, modifiedAt: new Date().toISOString() },
          selectedGarmentId: s.selectedGarmentId ?? defaults.selectedGarmentId,
          defaultOperators: s.defaultOperators ?? defaults.defaultOperators,
          operatorNames: s.operatorNames ?? {},
          yamazumiOverrides: s.yamazumiOverrides ?? {},
          skillMatrix: s.skillMatrix ?? {},
          scenarios: s.scenarios ?? [],
          factory: s.factory ?? defaultFactory(),
        }));
        return { ok: true };
      },

      exportProject: () => {
        const s = get();
        return {
          schemaVersion: s.schemaVersion,
          meta: s.meta,
          selectedGarmentId: s.selectedGarmentId,
          defaultOperators: s.defaultOperators,
          operatorNames: s.operatorNames,
          yamazumiOverrides: s.yamazumiOverrides,
          skillMatrix: s.skillMatrix,
          scenarios: s.scenarios,
          factory: s.factory,
        } as ProjectState;
      },
    }),
    {
      name: 'stitchworks.project.v1',
      version: PROJECT_SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Persist data only — don't try to serialise functions.
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        meta: state.meta,
        selectedGarmentId: state.selectedGarmentId,
        defaultOperators: state.defaultOperators,
        operatorNames: state.operatorNames,
        yamazumiOverrides: state.yamazumiOverrides,
        skillMatrix: state.skillMatrix,
        scenarios: state.scenarios,
        factory: state.factory,
      }),
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
 * Pop a file picker, parse the chosen `.swproj` (or `.json`), and feed it to
 * `loadProject`. Resolves to a result describing success or the failure
 * reason for the caller to show to the user.
 */
export function pickProjectFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.swproj,.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file chosen'));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          resolve(JSON.parse(text));
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
