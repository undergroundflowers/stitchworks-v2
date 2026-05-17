/**
 * Per-tab UI preferences for the top nav: hidden + locked. Persisted to
 * localStorage so a user's customisation survives reloads and project
 * switches. Keyed by `RouteDef.id`.
 *
 *  - hidden:  the tab is removed from the bar's main row. It still shows
 *             under the "more" (⋯) overflow menu so the user can bring it
 *             back. The route remains reachable via direct URL.
 *  - locked:  the tab still renders, but click-navigation is blocked and the
 *             button shows a not-allowed cursor. Direct URL still works —
 *             this is a UI affordance, not access control.
 */

import { useCallback, useEffect, useState } from 'react';

export interface TabPref {
  hidden: boolean;
  locked: boolean;
}

export type TabPrefs = Record<string, TabPref>;

const KEY = 'stitchworks.tabPrefs.v1';
/** Fires when any tab in this tab/window updates prefs so other consumers
 *  (e.g. another TopBar instance) re-read from storage in lock-step. */
const EVT = 'stitchworks:tabPrefs';

function read(): TabPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as TabPrefs) : {};
  } catch {
    return {};
  }
}

function write(next: TabPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / disabled — silently ignore */
  }
}

function computeNext(cur: TabPrefs, id: string, patch: Partial<TabPref>): TabPrefs {
  const existing = cur[id] ?? { hidden: false, locked: false };
  const merged: TabPref = { ...existing, ...patch };
  if (merged.hidden || merged.locked) return { ...cur, [id]: merged };
  // Both false → drop the entry so the stored shape stays tidy.
  const { [id]: _drop, ...rest } = cur;
  void _drop;
  return rest;
}

export function useTabPrefs() {
  const [prefs, setPrefs] = useState<TabPrefs>(() => read());

  useEffect(() => {
    const onLocal = () => setPrefs(read());
    // `storage` only fires across tabs; our custom event covers same-tab.
    window.addEventListener('storage', onLocal);
    window.addEventListener(EVT, onLocal);
    return () => {
      window.removeEventListener('storage', onLocal);
      window.removeEventListener(EVT, onLocal);
    };
  }, []);

  // Single source of truth for mutation: read fresh from storage, compute the
  // new state, persist, then mirror into React state. Avoids the strict-mode
  // double-invocation trap that nesting setState updaters would create.
  const apply = useCallback((id: string, toggle: 'hidden' | 'locked') => {
    const cur = read();
    const existing = cur[id] ?? { hidden: false, locked: false };
    const next = computeNext(cur, id, { [toggle]: !existing[toggle] });
    write(next);
    setPrefs(next);
    window.dispatchEvent(new Event(EVT));
  }, []);

  const toggleHidden = useCallback((id: string) => apply(id, 'hidden'), [apply]);
  const toggleLocked = useCallback((id: string) => apply(id, 'locked'), [apply]);

  const get = useCallback(
    (id: string): TabPref => prefs[id] ?? { hidden: false, locked: false },
    [prefs],
  );

  return { prefs, get, toggleHidden, toggleLocked };
}
