/**
 * Quota-aware localStorage wrapper for zustand/persist.
 *
 * Why this exists:
 *   Browsers throw QuotaExceededError when a single localStorage.setItem
 *   blows past the ~5 MB cap. zustand/persist catches that and logs to
 *   console — but during a multi-store save sequence (project → twin →
 *   library) the user sees no error, the second write silently disappears,
 *   and the UI looks half-loaded. Concretely: a Load-Bundle click that
 *   stacks library copies until project + twin no longer fit, and the
 *   twin store (the biggest) is the one that gets dropped.
 *
 * What this does:
 *   • Wraps `localStorage` with the StateStorage shape `createJSONStorage`
 *     accepts, so each store can opt in by replacing the default storage.
 *   • Detects QuotaExceededError across browser dialects (DOMException name,
 *     legacy code 22, Firefox's NS_ERROR_DOM_QUOTA_REACHED) and re-throws a
 *     normalised `QuotaPersistError` after surfacing a console.error AND a
 *     window.dispatchEvent so the UI can show a banner.
 *   • Calls a per-store `onQuotaError(key, bytesAttempted)` callback when
 *     provided so stores can attempt their own remediation (e.g. drop the
 *     oldest scenario, then retry).
 *
 * What this deliberately doesn't do:
 *   • Compress payloads (we'd rather fix the root cause — unbounded
 *     library growth — than mask a 2x size headroom that runs out again).
 *   • Spill to IndexedDB. That's a bigger lift; if quota is a recurring
 *     problem after the cap fixes, that's the right next step.
 */

import type { StateStorage } from 'zustand/middleware';

/** True for any browser's flavour of QuotaExceededError. */
export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name ?? '';
  const message = (err as { message?: string }).message ?? '';
  const code = (err as { code?: number }).code;
  return (
    name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || code === 22
    || /quota/i.test(message)
  );
}

/** Custom error so callers can switch on it without sniffing strings. */
export class QuotaPersistError extends Error {
  readonly storageKey: string;
  readonly bytesAttempted: number;
  constructor(storageKey: string, bytesAttempted: number, cause?: unknown) {
    super(
      `localStorage quota exceeded while writing "${storageKey}" `
        + `(${(bytesAttempted / 1024).toFixed(1)} KB). The persist write was dropped — `
        + `subsequent reads will return the previous on-disk snapshot.`,
    );
    this.name = 'QuotaPersistError';
    this.storageKey = storageKey;
    this.bytesAttempted = bytesAttempted;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Browser-window event fired when a persist write hits quota. The UI's
 * top-bar / toast layer can listen for this and warn the user. Event
 * detail carries the storage key and attempted size so the message can be
 * specific. We dispatch on `window` (rather than a private bus) so any
 * surface in the app — including dev consoles — can subscribe with a
 * one-liner addEventListener.
 */
export const QUOTA_EVENT = 'sw_persist_quota';
export interface QuotaEventDetail {
  storageKey: string;
  bytesAttempted: number;
}

export interface QuotaAwareStorageOptions {
  /** Optional per-store hook fired before the QuotaPersistError throws.
   *  Return `true` to indicate the store has trimmed its payload and the
   *  caller should silently retry the write once; otherwise the throw
   *  propagates and zustand/persist logs it. */
  onQuotaError?: (storageKey: string, bytesAttempted: number) => boolean | void;
}

/**
 * Build a StateStorage shim that wraps `localStorage` (the default for
 * createJSONStorage(() => localStorage)) and adds quota detection on
 * write. Reads + removes pass through unchanged.
 *
 * Usage in a zustand persist config:
 *
 *     storage: createJSONStorage(() => quotaAwareLocalStorage()),
 */
export function quotaAwareLocalStorage(opts: QuotaAwareStorageOptions = {}): StateStorage {
  return {
    getItem: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        // SecurityError (private mode in Safari historically) — treat as
        // missing rather than crashing the store rehydrate.
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch (err) {
        if (!isQuotaError(err)) throw err;
        const bytes = value.length;
        // Give the store a chance to shed payload and retry once. This
        // keeps the recovery logic next to the store that owns the data
        // (e.g. factoryLibrary could drop its oldest entry).
        let retried = false;
        if (opts.onQuotaError) {
          const handled = opts.onQuotaError(key, bytes);
          if (handled === true) {
            try {
              localStorage.setItem(key, value);
              retried = true;
            } catch (err2) {
              if (!isQuotaError(err2)) throw err2;
              // Fall through to the loud failure path.
            }
          }
        }
        if (!retried) {
          // Surface the failure so the user sees something. Console.error
          // shows up in DevTools; the custom event lets the UI react.
          // eslint-disable-next-line no-console
          console.error(
            `[stitchworks] localStorage quota exceeded while writing "${key}" `
              + `(${(bytes / 1024).toFixed(1)} KB). Older state on disk is preserved; `
              + `recent edits to this store will NOT survive a refresh until space is freed.`,
            err,
          );
          try {
            window.dispatchEvent(
              new CustomEvent<QuotaEventDetail>(QUOTA_EVENT, {
                detail: { storageKey: key, bytesAttempted: bytes },
              }),
            );
          } catch {
            /* SSR / no window — swallow */
          }
          throw new QuotaPersistError(key, bytes, err);
        }
      }
    },
    removeItem: (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore — removal of a missing key shouldn't crash */
      }
    },
  };
}
