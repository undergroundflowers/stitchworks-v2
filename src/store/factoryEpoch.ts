import { useSyncExternalStore } from 'react';

/**
 * A counter that ticks every time the open factory is replaced wholesale —
 * loading a saved factory, opening a `.swproj`, starting a new one.
 *
 * The app shell keeps every surface mounted across tab switches so each one
 * resumes where it was left. That is only right while the factory underneath
 * is the same one: a selection, a camera or an open drawer carried over into a
 * different factory points at things that no longer exist. Surfaces read this
 * to know when what they were holding stopped being about the open factory.
 *
 * Deliberately not persisted and not part of any store's data — it describes
 * this session, not the factory.
 */
let epoch = 0;
const listeners = new Set<() => void>();

export function bumpFactoryEpoch(): void {
  epoch += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFactoryEpoch(): number {
  return useSyncExternalStore(subscribe, () => epoch);
}
