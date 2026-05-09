/**
 * Twin store — owns the canonical Twin and its scenario forks.
 *
 * This store is intentionally PARALLEL to the legacy `project` store while
 * the rest of the app is wired over to the twin model. Keeping it isolated
 * means existing pages (FactoryTwin, IsoBuilder, LiveSim, …) keep working
 * against the old `factory: { floors, lines }` shape until each one is
 * migrated.
 *
 * Persistence:
 *   localStorage key `stitchworks.twin.v1` — separate from the project
 *   store so a stale legacy snapshot can't poison the new model.
 *
 * Mental model:
 *   • There is exactly one canonical Twin per project. It's what the user
 *     authors in Factory Builder.
 *   • A Scenario is a fork of the canonical twin: a deep clone with its
 *     own ids and its own run history. Scenarios diverge freely; the
 *     canonical twin does NOT propagate edits into existing forks.
 *   • The "active" twin (canonical or scenario) is what the Builder + the
 *     Simulation tab read from. Switching scenarios is the editing-context
 *     switch — no page-level state needed.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import {
  TWIN_SCHEMA_VERSION,
  type Twin,
  type Scenario,
  type SimRun,
  type Department,
  type Workstation,
  type DepartmentColorKey,
  type Vec2,
  type Rect,
  type Rotation,
  type KpiObservedAttrs,
  type Connector,
  type ConnectorKind,
  type CadUnderlay,
  type CadUnderlayTransform,
  emptyTwin,
  forkTwin,
  newDeptId,
  newWorkstationId,
  newScenarioId,
  newRunId,
  newConnectorId,
  makeWorkstation,
  normalizeTwin,
  validateTwin,
} from '../domain/twin';

export const TWIN_STORE_SCHEMA_VERSION = 4 as const;

// ============================================================================
// STATE SHAPE
// ============================================================================

export interface TwinState {
  schemaVersion: typeof TWIN_STORE_SCHEMA_VERSION;
  /** The master twin authored in Factory Builder. */
  canonical: Twin;
  /** Scenario forks of the canonical twin. */
  scenarios: Scenario[];
  /** Which twin is currently being viewed/edited.
   *  null = canonical; otherwise a scenario id. */
  activeScenarioId: string | null;

  // ── Twin-level mutators (operate on the *active* twin) ────────────────────
  renameActive: (name: string) => void;
  setActiveNotes: (notes: string) => void;

  // ── Department CRUD ──────────────────────────────────────────────────────
  addDepartment: (input: Omit<Department, 'id'>) => string;
  updateDepartment: (id: string, patch: Partial<Omit<Department, 'id'>>) => void;
  removeDepartment: (id: string) => void;
  moveDepartment: (id: string, bounds: Rect) => void;

  // ── Workstation CRUD ─────────────────────────────────────────────────────
  addWorkstation: (input: {
    deptId: string;
    catalogId: string;
    position: Vec2;
    rotation?: Rotation;
    name?: string;
  }) => string;
  updateWorkstation: (id: string, patch: Partial<Omit<Workstation, 'id'>>) => void;
  removeWorkstation: (id: string) => void;
  /** Move a workstation to a new world position. */
  moveWorkstation: (id: string, position: Vec2) => void;
  /** Rotate a workstation in 90° steps. dir = +1 turns CW, -1 turns CCW. */
  rotateWorkstation: (id: string, dir: 1 | -1) => void;
  /** Clone a workstation, offsetting the copy slightly. Returns the new id
   *  (or null if the source id doesn't resolve in the active twin). */
  duplicateWorkstation: (id: string) => string | null;

  // ── Connector CRUD ───────────────────────────────────────────────────────
  /** Create a directed connector between two workstations. Returns the
   *  created id, or null if the source/target ids don't resolve in the
   *  active twin or if from === to. */
  addConnector: (input: {
    kind: ConnectorKind;
    fromWsId: string;
    toWsId: string;
    label?: string;
  }) => string | null;
  /** Patch fields on a connector. */
  updateConnector: (id: string, patch: Partial<Omit<Connector, 'id'>>) => void;
  /** Remove a connector by id. */
  removeConnector: (id: string) => void;

  // ── CAD underlay (imported floor-plan, used as a tracing reference) ──────
  /** Replace the active twin's CAD underlay with a freshly imported one,
   *  or clear it (pass null). The transform should already be sized so the
   *  drawing roughly fits the grid; the user nudges from the canvas
   *  controls. */
  setCadUnderlay: (underlay: CadUnderlay | null) => void;
  /** Patch the placement of the CAD underlay on the active twin (no-op if
   *  there is no underlay). */
  updateCadTransform: (patch: Partial<CadUnderlayTransform>) => void;

  // ── Lens-attribute writes (sugar over updateWorkstation) ─────────────────
  setOperation: (wsId: string, patch: Partial<Workstation['operation']>) => void;
  setResources: (wsId: string, patch: Partial<Workstation['resources']>) => void;
  setKpiTargets: (wsId: string, patch: Partial<Workstation['kpiTargets']>) => void;
  /** Called by the simulation engine after a run; mirrors per-station
   *  observed values onto the twin for fast lens rendering. */
  setKpiObserved: (wsId: string, observed: KpiObservedAttrs | undefined) => void;

  // ── Scenario forking ─────────────────────────────────────────────────────
  /** Fork the canonical twin into a new scenario, optionally switching to
   *  it. Returns the created scenario id. */
  createScenarioFromCanonical: (input: {
    name: string;
    notes?: string;
    activate?: boolean;
  }) => string;
  /** Fork an *existing* scenario (canonical → scenarioA → scenarioA') —
   *  useful for "what if I tweak this scenario further" branches. */
  forkScenario: (
    fromScenarioId: string,
    input: { name: string; notes?: string; activate?: boolean },
  ) => string | null;
  renameScenario: (id: string, name: string) => void;
  deleteScenario: (id: string) => void;
  setActiveScenario: (id: string | null) => void;
  /** Promote a scenario into the canonical twin (replaces canonical with a
   *  copy of the scenario's twin, kept as canonical=true). The previous
   *  canonical is discarded — caller should confirm first. */
  promoteScenarioToCanonical: (id: string) => void;

  // ── Run history ──────────────────────────────────────────────────────────
  recordRun: (
    scenarioId: string | null,
    run: Omit<SimRun, 'id' | 'scenarioId'>,
  ) => SimRun;
  clearRunsFor: (scenarioId: string) => void;

  // ── Project-level actions ────────────────────────────────────────────────
  /** Replace canonical with a fresh empty twin and drop all scenarios.
   *  Caller should confirm. */
  resetTwin: () => void;
  /** Replace canonical with a known good twin (used by importers + the
   *  legacy migration). Drops scenarios. Validates the input first. */
  loadCanonical: (twin: Twin) => { ok: true } | { ok: false; reason: string };
  /** Snapshot the whole twin store for export to `.swproj`. */
  exportTwin: () => {
    schemaVersion: typeof TWIN_STORE_SCHEMA_VERSION;
    canonical: Twin;
    scenarios: Scenario[];
    activeScenarioId: string | null;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/** Update the currently-active twin (canonical or scenario fork) via a
 *  pure mapper. Bumps `modifiedAt` automatically. */
function updateActive<S extends TwinState>(s: S, fn: (twin: Twin) => Twin): S {
  const now = new Date().toISOString();
  if (s.activeScenarioId === null) {
    const next = fn(s.canonical);
    return { ...s, canonical: { ...next, modifiedAt: now } };
  }
  const scenarios = s.scenarios.map((scn) =>
    scn.id === s.activeScenarioId
      ? { ...scn, twin: { ...fn(scn.twin), modifiedAt: now }, modifiedAt: now }
      : scn,
  );
  return { ...s, scenarios };
}

/** Mutate one workstation in the active twin, identified by id. No-op if
 *  the id doesn't resolve. */
function patchWorkstation<S extends TwinState>(
  s: S,
  wsId: string,
  fn: (w: Workstation) => Workstation,
): S {
  return updateActive(s, (twin) => ({
    ...twin,
    workstations: twin.workstations.map((w) => (w.id === wsId ? fn(w) : w)),
  }));
}

// ============================================================================
// STORE
// ============================================================================

export const useTwin = create<TwinState>()(
  persist(
    (set, get) => ({
      schemaVersion: TWIN_STORE_SCHEMA_VERSION,
      canonical: emptyTwin('My factory'),
      scenarios: [],
      activeScenarioId: null,

      renameActive: (name) =>
        set((s) => updateActive(s, (twin) => ({ ...twin, name }))),

      setActiveNotes: (notes) =>
        set((s) => updateActive(s, (twin) => ({ ...twin, notes }))),

      // ── Departments ────────────────────────────────────────────────────────
      addDepartment: (input) => {
        const id = newDeptId();
        const dept: Department = { id, ...input };
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            departments: [...twin.departments, dept],
          })),
        );
        return id;
      },

      updateDepartment: (id, patch) =>
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            departments: twin.departments.map((d) =>
              d.id === id ? { ...d, ...patch } : d,
            ),
          })),
        ),

      removeDepartment: (id) =>
        set((s) =>
          updateActive(s, (twin) => {
            // Cascade: workstations whose dept disappeared also disappear,
            // and any connector touching one of those workstations follows.
            const orphanedWsIds = new Set(
              twin.workstations.filter((w) => w.deptId === id).map((w) => w.id),
            );
            return {
              ...twin,
              departments: twin.departments.filter((d) => d.id !== id),
              workstations: twin.workstations.filter((w) => w.deptId !== id),
              connectors: (twin.connectors ?? []).filter(
                (c) => !orphanedWsIds.has(c.fromWsId) && !orphanedWsIds.has(c.toWsId),
              ),
            };
          }),
        ),

      moveDepartment: (id, bounds) =>
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            departments: twin.departments.map((d) =>
              d.id === id ? { ...d, bounds: { ...bounds } } : d,
            ),
          })),
        ),

      // ── Workstations ───────────────────────────────────────────────────────
      addWorkstation: (input) => {
        const ws = makeWorkstation(input);
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            workstations: [...twin.workstations, ws],
          })),
        );
        return ws.id;
      },

      updateWorkstation: (id, patch) =>
        set((s) => patchWorkstation(s, id, (w) => ({ ...w, ...patch }))),

      removeWorkstation: (id) =>
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            workstations: twin.workstations.filter((w) => w.id !== id),
            // Cascade: drop connectors that touch the removed workstation.
            connectors: (twin.connectors ?? []).filter(
              (c) => c.fromWsId !== id && c.toWsId !== id,
            ),
          })),
        ),

      moveWorkstation: (id, position) =>
        set((s) =>
          patchWorkstation(s, id, (w) => ({ ...w, position: { ...position } })),
        ),

      rotateWorkstation: (id, dir) =>
        set((s) =>
          patchWorkstation(s, id, (w) => {
            const next = ((w.rotation + dir * 90 + 360) % 360) as 0 | 90 | 180 | 270;
            return { ...w, rotation: next };
          }),
        ),

      duplicateWorkstation: (id) => {
        const active = selectActiveTwin(get());
        const src = active.workstations.find((w) => w.id === id);
        if (!src) return null;
        const newId = newWorkstationId();
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            workstations: [
              ...twin.workstations,
              {
                ...src,
                id: newId,
                position: { x: src.position.x + 1, y: src.position.y + 1 },
                props: { ...src.props },
                operation: { ...src.operation },
                resources: {
                  ...src.resources,
                  materialsPerCycle: { ...src.resources.materialsPerCycle },
                },
                kpiTargets: { ...src.kpiTargets },
                kpiObserved: undefined,
              },
            ],
          })),
        );
        return newId;
      },

      // ── Connector CRUD ─────────────────────────────────────────────────────
      addConnector: (input) => {
        if (input.fromWsId === input.toWsId) return null;
        const active = selectActiveTwin(get());
        const wsIds = new Set(active.workstations.map((w) => w.id));
        if (!wsIds.has(input.fromWsId) || !wsIds.has(input.toWsId)) return null;
        const id = newConnectorId();
        const conn: Connector = {
          id,
          kind: input.kind,
          fromWsId: input.fromWsId,
          toWsId: input.toWsId,
          label: input.label,
        };
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            connectors: [...(twin.connectors ?? []), conn],
          })),
        );
        return id;
      },

      updateConnector: (id, patch) =>
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            connectors: (twin.connectors ?? []).map((c) =>
              c.id === id ? { ...c, ...patch } : c,
            ),
          })),
        ),

      removeConnector: (id) =>
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            connectors: (twin.connectors ?? []).filter((c) => c.id !== id),
          })),
        ),

      // ── CAD underlay ───────────────────────────────────────────────────────
      setCadUnderlay: (underlay) =>
        set((s) =>
          updateActive(s, (twin) => ({
            ...twin,
            cadUnderlay: underlay
              ? {
                  ...underlay,
                  transform: { ...underlay.transform },
                  viewBox: [...underlay.viewBox] as [number, number, number, number],
                  regions: underlay.regions.map((r) => ({
                    ...r,
                    bbox: [...r.bbox] as [number, number, number, number],
                  })),
                }
              : null,
          })),
        ),

      updateCadTransform: (patch) =>
        set((s) =>
          updateActive(s, (twin) => {
            if (!twin.cadUnderlay) return twin;
            return {
              ...twin,
              cadUnderlay: {
                ...twin.cadUnderlay,
                transform: { ...twin.cadUnderlay.transform, ...patch },
              },
            };
          }),
        ),

      // ── Lens-attribute sugar ───────────────────────────────────────────────
      setOperation: (wsId, patch) =>
        set((s) =>
          patchWorkstation(s, wsId, (w) => ({
            ...w,
            operation: { ...w.operation, ...patch },
          })),
        ),

      setResources: (wsId, patch) =>
        set((s) =>
          patchWorkstation(s, wsId, (w) => ({
            ...w,
            resources: {
              ...w.resources,
              ...patch,
              materialsPerCycle:
                patch.materialsPerCycle !== undefined
                  ? { ...patch.materialsPerCycle }
                  : w.resources.materialsPerCycle,
            },
          })),
        ),

      setKpiTargets: (wsId, patch) =>
        set((s) =>
          patchWorkstation(s, wsId, (w) => ({
            ...w,
            kpiTargets: { ...w.kpiTargets, ...patch },
          })),
        ),

      setKpiObserved: (wsId, observed) =>
        set((s) =>
          patchWorkstation(s, wsId, (w) => ({ ...w, kpiObserved: observed })),
        ),

      // ── Scenarios ──────────────────────────────────────────────────────────
      createScenarioFromCanonical: ({ name, notes, activate }) => {
        const id = newScenarioId();
        const now = new Date().toISOString();
        set((s) => {
          const twin = forkTwin(s.canonical, { name, notes });
          const scenario: Scenario = {
            id,
            name,
            notes,
            createdAt: now,
            modifiedAt: now,
            twin,
            runs: [],
          };
          return {
            ...s,
            scenarios: [scenario, ...s.scenarios],
            activeScenarioId: activate ? id : s.activeScenarioId,
          };
        });
        return id;
      },

      forkScenario: (fromScenarioId, { name, notes, activate }) => {
        const source = get().scenarios.find((x) => x.id === fromScenarioId);
        if (!source) return null;
        const id = newScenarioId();
        const now = new Date().toISOString();
        set((s) => {
          const twin = forkTwin(source.twin, { name, notes });
          const scenario: Scenario = {
            id,
            name,
            notes,
            createdAt: now,
            modifiedAt: now,
            twin,
            runs: [],
          };
          return {
            ...s,
            scenarios: [scenario, ...s.scenarios],
            activeScenarioId: activate ? id : s.activeScenarioId,
          };
        });
        return id;
      },

      renameScenario: (id, name) =>
        set((s) => ({
          ...s,
          scenarios: s.scenarios.map((scn) =>
            scn.id === id
              ? {
                  ...scn,
                  name,
                  twin: { ...scn.twin, name },
                  modifiedAt: new Date().toISOString(),
                }
              : scn,
          ),
        })),

      deleteScenario: (id) =>
        set((s) => ({
          ...s,
          scenarios: s.scenarios.filter((scn) => scn.id !== id),
          activeScenarioId: s.activeScenarioId === id ? null : s.activeScenarioId,
        })),

      setActiveScenario: (id) =>
        set((s) => {
          if (id === null) return { ...s, activeScenarioId: null };
          if (!s.scenarios.some((scn) => scn.id === id)) return s;
          return { ...s, activeScenarioId: id };
        }),

      promoteScenarioToCanonical: (id) =>
        set((s) => {
          const scn = s.scenarios.find((x) => x.id === id);
          if (!scn) return s;
          const now = new Date().toISOString();
          const promoted: Twin = {
            ...scn.twin,
            isCanonical: true,
            parentTwinId: null,
            modifiedAt: now,
          };
          return {
            ...s,
            canonical: promoted,
            // Preserve other scenarios but drop the one we promoted.
            scenarios: s.scenarios.filter((x) => x.id !== id),
            activeScenarioId: null,
          };
        }),

      // ── Run history ────────────────────────────────────────────────────────
      recordRun: (scenarioId, runInput) => {
        const id = newRunId();
        const run: SimRun = { ...runInput, id, scenarioId: scenarioId ?? '' };
        set((s) => {
          if (scenarioId === null) {
            // Runs against the canonical twin are not persisted on a Scenario;
            // they ride along on the canonical twin's stations via
            // setKpiObserved. Aggregate run history for canonical lives in
            // the simulation layer for now.
            return s;
          }
          return {
            ...s,
            scenarios: s.scenarios.map((scn) =>
              scn.id === scenarioId ? { ...scn, runs: [run, ...scn.runs] } : scn,
            ),
          };
        });
        return run;
      },

      clearRunsFor: (scenarioId) =>
        set((s) => ({
          ...s,
          scenarios: s.scenarios.map((scn) =>
            scn.id === scenarioId ? { ...scn, runs: [] } : scn,
          ),
        })),

      // ── Project-level ──────────────────────────────────────────────────────
      resetTwin: () =>
        set(() => ({
          schemaVersion: TWIN_STORE_SCHEMA_VERSION,
          canonical: emptyTwin('My factory'),
          scenarios: [],
          activeScenarioId: null,
          // Preserve action references so the store's identity holds.
          renameActive: get().renameActive,
          setActiveNotes: get().setActiveNotes,
          addDepartment: get().addDepartment,
          updateDepartment: get().updateDepartment,
          removeDepartment: get().removeDepartment,
          moveDepartment: get().moveDepartment,
          addWorkstation: get().addWorkstation,
          updateWorkstation: get().updateWorkstation,
          removeWorkstation: get().removeWorkstation,
          moveWorkstation: get().moveWorkstation,
          rotateWorkstation: get().rotateWorkstation,
          duplicateWorkstation: get().duplicateWorkstation,
          addConnector: get().addConnector,
          updateConnector: get().updateConnector,
          removeConnector: get().removeConnector,
          setCadUnderlay: get().setCadUnderlay,
          updateCadTransform: get().updateCadTransform,
          setOperation: get().setOperation,
          setResources: get().setResources,
          setKpiTargets: get().setKpiTargets,
          setKpiObserved: get().setKpiObserved,
          createScenarioFromCanonical: get().createScenarioFromCanonical,
          forkScenario: get().forkScenario,
          renameScenario: get().renameScenario,
          deleteScenario: get().deleteScenario,
          setActiveScenario: get().setActiveScenario,
          promoteScenarioToCanonical: get().promoteScenarioToCanonical,
          recordRun: get().recordRun,
          clearRunsFor: get().clearRunsFor,
          resetTwin: get().resetTwin,
          loadCanonical: get().loadCanonical,
          exportTwin: get().exportTwin,
        })),

      loadCanonical: (twin) => {
        const errs = validateTwin(twin);
        if (errs.length > 0) {
          return { ok: false, reason: errs.join('; ') };
        }
        set((s) => ({
          ...s,
          canonical: { ...twin, isCanonical: true, parentTwinId: null },
          scenarios: [],
          activeScenarioId: null,
        }));
        return { ok: true };
      },

      exportTwin: () => {
        const s = get();
        return {
          schemaVersion: TWIN_STORE_SCHEMA_VERSION,
          canonical: s.canonical,
          scenarios: s.scenarios,
          activeScenarioId: s.activeScenarioId,
        };
      },
    }),
    {
      name: 'stitchworks.twin.v1',
      version: TWIN_STORE_SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        canonical: state.canonical,
        scenarios: state.scenarios,
        activeScenarioId: state.activeScenarioId,
      }),
      // v1 → v2: add `connectors: []` to canonical and every scenario's twin.
      // v2 → v3: add `cadUnderlay: null` (handled by normalizeTwin).
      // v3 → v4: add `regions: []` to existing CAD underlays (also handled
      // by normalizeTwin). Auto-Extract is unavailable on pre-v4 underlays
      // until the user re-imports.
      // All upgrades are pure additions; existing factory data is unchanged.
      migrate: (persisted, fromVersion) => {
        const s = (persisted ?? {}) as {
          canonical?: unknown;
          scenarios?: Array<{ twin?: unknown; runs?: unknown[] } & Record<string, unknown>>;
          activeScenarioId?: string | null;
        };
        if (fromVersion < TWIN_STORE_SCHEMA_VERSION) {
          return {
            schemaVersion: TWIN_STORE_SCHEMA_VERSION,
            canonical: normalizeTwin(s.canonical),
            scenarios: (s.scenarios ?? []).map((scn) => ({
              ...scn,
              twin: normalizeTwin(scn.twin),
              runs: scn.runs ?? [],
            })),
            activeScenarioId: s.activeScenarioId ?? null,
          };
        }
        return persisted;
      },
    },
  ),
);

// ============================================================================
// SELECTORS — small, composable readers for components
// ============================================================================

/** The twin currently being authored / simulated. */
export function selectActiveTwin(s: TwinState): Twin {
  if (s.activeScenarioId === null) return s.canonical;
  return s.scenarios.find((scn) => scn.id === s.activeScenarioId)?.twin ?? s.canonical;
}

/** All workstations inside one department in the active twin. */
export function selectWorkstationsInDept(
  s: TwinState,
  deptId: string,
): Workstation[] {
  return selectActiveTwin(s).workstations.filter((w) => w.deptId === deptId);
}

/** Resolve a department id in the active twin. */
export function selectDepartment(
  s: TwinState,
  deptId: string,
): Department | undefined {
  return selectActiveTwin(s).departments.find((d) => d.id === deptId);
}

/** Resolve a workstation id in the active twin. */
export function selectWorkstation(
  s: TwinState,
  wsId: string,
): Workstation | undefined {
  return selectActiveTwin(s).workstations.find((w) => w.id === wsId);
}

// Re-export the colour-key type so callers don't have to dig into domain/twin.
export type { DepartmentColorKey };
