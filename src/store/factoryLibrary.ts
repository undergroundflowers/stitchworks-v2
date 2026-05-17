/**
 * Factory library — a registry of archived factories. Each entry is a frozen
 * snapshot of the project store + twin store at the moment it was saved.
 *
 * Why a separate store?
 *   The project + twin stores already own "the active factory". The library
 *   lives alongside them as an outer layer. Archiving and loading happen by
 *   exporting from / replaying into the two existing stores, so neither has
 *   to learn about multi-project concerns.
 *
 * Persistence:
 *   localStorage key `stitchworks.library.v1`. Independent of the two inner
 *   stores so the active factory can be wiped without losing archived ones.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import {
  useProject,
  PROJECT_SCHEMA_VERSION,
  type ProjectState,
} from './project';
import { useTwin, TWIN_STORE_SCHEMA_VERSION } from './twin';
import type { Twin, Scenario as TwinScenario } from '../domain/twin';

export const LIBRARY_SCHEMA_VERSION = 1 as const;

/** Slot cap surfaced in the menu UI ("SAVED FACTORIES · n / MAX"). */
export const FACTORY_LIBRARY_MAX = 5;

interface TwinSnapshot {
  schemaVersion: typeof TWIN_STORE_SCHEMA_VERSION;
  canonical: Twin;
  scenarios: TwinScenario[];
  activeScenarioId: string | null;
}

export interface SavedFactory {
  id: string;
  name: string;
  /** ISO timestamp captured at archive time. */
  savedAt: string;
  /** Cached for the slot tile so we don't have to deep-walk on render. */
  stationCount: number;
  project: ProjectState;
  twin: TwinSnapshot;
}

export interface FactoryLibraryState {
  schemaVersion: typeof LIBRARY_SCHEMA_VERSION;
  savedFactories: SavedFactory[];

  /** Snapshot the active project + twin into a new library entry. */
  archiveCurrent: (overrideName?: string) => SavedFactory;
  /** Replace active state with the given saved factory. If `archiveFirst`
   *  is true (default), the current active factory is snapshotted before
   *  the swap so the user never silently loses work. */
  loadFactory: (id: string, opts?: { archiveFirst?: boolean }) => boolean;
  /** Drop a saved factory by id. */
  deleteFactory: (id: string) => void;
  /** Rename a saved factory in place. */
  renameFactory: (id: string, name: string) => void;
}

function newId(): string {
  return `fac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function captureProject(): ProjectState {
  // exportProject already returns a serialisable data-only shape.
  // Deep-clone via JSON so subsequent edits to the live store can't
  // mutate the archived snapshot through shared refs.
  const data = useProject.getState().exportProject();
  return JSON.parse(JSON.stringify(data)) as ProjectState;
}

function captureTwin(): TwinSnapshot {
  const data = useTwin.getState().exportTwin();
  return JSON.parse(JSON.stringify(data)) as TwinSnapshot;
}

function applyProject(snap: ProjectState): void {
  const result = useProject.getState().loadProject(snap);
  if (!result.ok) {
    console.warn('[factoryLibrary] project load failed:', result.reason);
  }
}

function applyTwin(snap: TwinSnapshot): void {
  // Twin store has no full-snapshot import. Splice the data fields directly
  // — zustand setState shallow-merges, so the action references are kept.
  useTwin.setState({
    schemaVersion: TWIN_STORE_SCHEMA_VERSION,
    canonical: snap.canonical,
    scenarios: snap.scenarios,
    activeScenarioId: snap.activeScenarioId,
  });
}

export const useFactoryLibrary = create<FactoryLibraryState>()(
  persist(
    (set, get) => ({
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      savedFactories: [],

      archiveCurrent: (overrideName) => {
        const project = captureProject();
        const twin = captureTwin();
        const name = (overrideName ?? project.meta.name ?? 'Untitled Factory').trim() || 'Untitled Factory';
        const entry: SavedFactory = {
          id: newId(),
          name,
          savedAt: new Date().toISOString(),
          stationCount: twin.canonical.workstations.length,
          project,
          twin,
        };
        set((s) => ({ savedFactories: [entry, ...s.savedFactories] }));
        return entry;
      },

      loadFactory: (id, opts) => {
        const archiveFirst = opts?.archiveFirst ?? true;
        const target = get().savedFactories.find((f) => f.id === id);
        if (!target) return false;
        if (archiveFirst) get().archiveCurrent();
        applyProject(target.project);
        applyTwin(target.twin);
        // The just-loaded factory is now live; drop the slot to avoid
        // a duplicate (active + archived copy with the same content).
        set((s) => ({ savedFactories: s.savedFactories.filter((f) => f.id !== id) }));
        return true;
      },

      deleteFactory: (id) =>
        set((s) => ({ savedFactories: s.savedFactories.filter((f) => f.id !== id) })),

      renameFactory: (id, name) =>
        set((s) => ({
          savedFactories: s.savedFactories.map((f) => (f.id === id ? { ...f, name } : f)),
        })),
    }),
    {
      name: 'stitchworks.library.v1',
      version: LIBRARY_SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        savedFactories: state.savedFactories,
      }),
    },
  ),
);

/**
 * Convenience: archive the active factory and then reset both stores to a
 * blank starter. Used by the Menu's "Create New Factory" flow. The new
 * name is applied after reset so the fresh factory shows up under the
 * label the user typed.
 */
export function archiveAndStartFresh(newName: string): void {
  const lib = useFactoryLibrary.getState();
  lib.archiveCurrent();
  useProject.getState().resetProject();
  useTwin.getState().resetTwin();
  const trimmed = newName.trim();
  if (trimmed) {
    // Keep the project meta and twin canonical names in sync so every
    // surface that reads either (TopBar reads project.meta.name; Builder
    // picker reads twin.canonical.name) shows the same label.
    useProject.getState().rename(trimmed);
    useTwin.getState().renameActive(trimmed);
  }
}

void PROJECT_SCHEMA_VERSION; // re-export only for type narrowing if needed
