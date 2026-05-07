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
> = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  meta: defaultMeta(),
  selectedGarmentId: 'tshirt',
  defaultOperators: 25,
  operatorNames: {},
  yamazumiOverrides: {},
  skillMatrix: {},
  scenarios: [],
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
