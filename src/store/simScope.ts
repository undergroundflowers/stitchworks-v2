/**
 * Shared simulation scope + run parameters.
 *
 * Every surface that runs the engine — the Sim screen, the queueing tables,
 * the reports — has to agree on WHAT is being simulated and WITH WHAT
 * parameters, or they each derive a slightly different spec, mint a different
 * session key, and thrash one another's playback on every route change.
 *
 * Deliberately small and persisted: this is user intent ("I'm looking at Line
 * 2, over one shift, seed 42"), not derived state.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { indexedDbStorage } from './storage/indexedDbStorage';

/** What the engine is pointed at. The floor is free space, so the only
 *  meaningful groupings are the whole factory or one sewing line. */
export type SimScope =
  | { kind: 'factory' }
  | { kind: 'line'; id: string };

export interface SimScopeState {
  scope: SimScope;
  /** Run length in sim MINUTES. */
  durationMin: number;
  /** RNG seed. Same seed ⇒ same run. */
  seed: number;
  /**
   * Transient discarded from steady-state observables, in sim minutes. 0 —
   * the default — discards nothing: every average covers the whole run,
   * start-up included.
   *
   * The live surfaces truncate by DIFFERENCING two samples rather than asking
   * the engine to zero its accumulators, because a chart needs the start-up
   * ramp to stay visible even while the KPI tiles quote post-warm-up numbers.
   */
  warmupMin: number;
  /**
   * End the run when this many pieces are finished, rather than at the end of
   * the shift. 0 — the default — runs the whole shift.
   *
   * A shift-length run answers "how much does this line make in a day". This
   * answers the other planning question, "how long does this order take", and
   * the shift length then acts only as a ceiling.
   */
  stopAtPieces: number;

  setScope: (s: SimScope) => void;
  setDuration: (m: number) => void;
  setSeed: (n: number) => void;
  setWarmup: (m: number) => void;
  setStopAtPieces: (n: number) => void;
}

export const DEFAULT_SIM_DURATION_MIN = 480;
export const DEFAULT_SIM_SEED = 42;
/**
 * No warm-up: averages are over the shift as it was run, empty start and all.
 *
 * This was 60 until 2026-11-11. The first hour was being dropped from every
 * average without anything on screen saying so, and the user's decision was
 * that a shift's figures should be the whole shift's. The cost is known and
 * accepted: against the steady-state targets, an average that includes the
 * start-up reads a little low, most of all at heavily loaded stations and at
 * stations far down the line that wait for their first bundle.
 */
export const DEFAULT_SIM_WARMUP_MIN = 0;

/** Bump with a `migrate` step whenever the persisted shape or a default that
 *  old saves should not keep changes. */
const SIM_SCOPE_SCHEMA_VERSION = 1;

export const useSimScope = create<SimScopeState>()(
  persist(
    (set) => ({
      scope: { kind: 'factory' },
      durationMin: DEFAULT_SIM_DURATION_MIN,
      seed: DEFAULT_SIM_SEED,
      warmupMin: DEFAULT_SIM_WARMUP_MIN,
      stopAtPieces: 0,

      setScope: (scope) => set({ scope }),
      setDuration: (durationMin) =>
        set({ durationMin: Math.max(1, Math.round(durationMin)) }),
      setSeed: (seed) => set({ seed: Math.round(seed) }),
      setStopAtPieces: (n) => set({ stopAtPieces: Math.max(0, Math.round(n)) }),
      // Warm-up can never swallow the whole run, or every observable would be
      // measured over a zero-length window.
      setWarmup: (warmupMin) =>
        set((s) => ({
          warmupMin: Math.max(0, Math.min(Math.round(warmupMin), s.durationMin - 1)),
        })),
    }),
    {
      name: 'stitchworks.simscope.v1',
      storage: createJSONStorage(() => indexedDbStorage()),
      version: SIM_SCOPE_SCHEMA_VERSION,
      /**
       * A `migrate` has to exist: on a version mismatch without one, zustand
       * treats the save as unmigratable and discards it, scope and all.
       *
       * v0 → v1: the saved warm-up is reset to the new default. No screen has
       * ever let it be edited, so a saved 60 is the old default written back
       * out, never a choice — keeping it would leave every existing install
       * silently dropping the first hour.
       */
      migrate: (persisted, fromVersion) => {
        const state = persisted as SimScopeState;
        return fromVersion < 1 ? { ...state, warmupMin: DEFAULT_SIM_WARMUP_MIN } : state;
      },
    },
  ),
);

/** Stable string form of a scope — used inside the session key. */
export function scopeToKey(scope: SimScope): string {
  return scope.kind === 'factory' ? 'factory' : `${scope.kind}:${scope.id}`;
}

/**
 * The scope as it applies to the factory that is open now.
 *
 * The scope is saved once for the whole app, not per factory, so it can name a
 * line that no longer exists: one picked in a different factory, a scenario
 * that was switched away from, or a line that was deleted. Read as-is, that
 * scope matches nothing and every analysis page shows an empty state with no
 * way out. A line that isn't among `lines` therefore means the whole factory.
 */
export function resolveSimScope(scope: SimScope, lines: readonly { id: string }[]): SimScope {
  if (scope.kind === 'line' && !lines.some((l) => l.id === scope.id)) return { kind: 'factory' };
  return scope;
}
