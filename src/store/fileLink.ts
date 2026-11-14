/**
 * Which `.swproj` file on the user's disk each factory is linked to.
 *
 * Why this exists:
 *   The app always auto-saves to the browser's own database (IndexedDB), but
 *   that copy lives inside the browser profile — it is not a file the user can
 *   see, back up, email or keep in a project folder. Chromium browsers expose
 *   the File System Access API, which hands the page a `FileSystemFileHandle`
 *   the user picked in a native Save/Open dialog. Holding on to that handle is
 *   what lets Save behave like a desktop app: ask where once, then write back
 *   to the same file every time after.
 *
 * Shape:
 *   - The ACTIVE factory (the one in the project + twin stores) has at most
 *     one linked file. It is mirrored in this zustand store for the UI.
 *   - Factories parked in the library keep their link under their slot id, so
 *     switching factories carries the link with them (`parkActiveLink` /
 *     `restoreParkedLink`).
 *   - Handles are structured-cloneable but not JSON, so they live in their own
 *     IndexedDB database rather than going through zustand/persist.
 *
 * `dirty` means "changed since the last write to the linked file". The browser
 * copy is always current, so dirty never means "at risk" — only "the file on
 * disk is behind".
 *
 * Layering: imports the project + twin stores only (to watch for edits). The
 * file-writing orchestration lives in `swproj.ts`, which imports this module —
 * never the other way round.
 */

import { create } from 'zustand';
import { openDB, type IDBPDatabase } from 'idb';
import { useProject } from './project';
import { useTwin } from './twin';
import { bumpFactoryEpoch } from './factoryEpoch';

// ---------------------------------------------------------------------------
// File System Access API — not in TypeScript's DOM lib yet.
// ---------------------------------------------------------------------------

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface PermissionCapableHandle extends FileSystemFileHandle {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

type FsWindow = Window & {
  showSaveFilePicker?: (o: { suggestedName?: string; types?: PickerType[] }) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (o: { types?: PickerType[]; multiple?: boolean }) => Promise<FileSystemFileHandle[]>;
};

export const SWPROJ_PICKER_TYPES: PickerType[] = [
  { description: 'Stitchworks project', accept: { 'application/json': ['.swproj'] } },
];

/** True in Chrome / Edge / Brave / Arc; false in Safari and Firefox. */
export function canWriteFiles(): boolean {
  return typeof window !== 'undefined' && typeof (window as FsWindow).showSaveFilePicker === 'function';
}

export function fsWindow(): FsWindow {
  return window as FsWindow;
}

/**
 * Some embedded browsers show the native Open dialog, hand back a handle, and
 * then refuse to read it. Nothing reveals that before a file is picked, so the
 * first refusal is remembered here and every later Open goes straight to the
 * classic file input, which those browsers do allow.
 */
const HANDLE_READS_REFUSED_KEY = 'sw.fileHandleReadsRefused';

export function handleReadsRefused(): boolean {
  try {
    return localStorage.getItem(HANDLE_READS_REFUSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberHandleReadsRefused(): void {
  try {
    localStorage.setItem(HANDLE_READS_REFUSED_KEY, '1');
  } catch {
    // Storage unavailable: the next Open simply finds out again.
  }
}

/**
 * Make sure the page may write to `handle`. Chromium forgets the grant when
 * the tab closes, so the first Save after a reload asks again — that prompt
 * must come from a click, which Save always is.
 */
export async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as PermissionCapableHandle;
  if (!h.queryPermission || !h.requestPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface LinkRecord {
  handle: FileSystemFileHandle;
  dirty: boolean;
  savedAt: string | null;
}

const DB_NAME = 'stitchworks-files';
const STORE = 'links';
const ACTIVE_KEY = 'active';

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

async function readRecord(key: string): Promise<LinkRecord | undefined> {
  const p = db();
  if (!p) return undefined;
  try {
    return (await (await p).get(STORE, key)) as LinkRecord | undefined;
  } catch {
    return undefined;
  }
}

async function writeRecord(key: string, rec: LinkRecord | null): Promise<void> {
  const p = db();
  if (!p) return;
  try {
    const d = await p;
    if (rec) await d.put(STORE, rec, key);
    else await d.delete(STORE, key);
  } catch {
    // A lost link only means the next Save asks where again — never data loss.
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface FileLinkState {
  /** The active factory's linked file, or null when it has never been saved to one. */
  handle: FileSystemFileHandle | null;
  /** The linked file's name, e.g. "Modelama.swproj". */
  fileName: string | null;
  /** Changed since the last write to the linked file. */
  dirty: boolean;
  /** ISO time of the last successful write. */
  savedAt: string | null;
}

export const useFileLink = create<FileLinkState>()(() => ({
  handle: null,
  fileName: null,
  dirty: false,
  savedAt: null,
}));

function activeRecord(): LinkRecord | null {
  const s = useFileLink.getState();
  return s.handle ? { handle: s.handle, dirty: s.dirty, savedAt: s.savedAt } : null;
}

function setActive(rec: LinkRecord | null): void {
  useFileLink.setState({
    handle: rec?.handle ?? null,
    fileName: rec?.handle.name ?? null,
    dirty: rec?.dirty ?? false,
    savedAt: rec?.savedAt ?? null,
  });
  void writeRecord(ACTIVE_KEY, rec);
}

/** Link the active factory to `handle`, which now matches what is on screen. */
export function linkActiveFile(handle: FileSystemFileHandle): void {
  setActive({ handle, dirty: false, savedAt: new Date().toISOString() });
  recordRecentFile(handle);
}

/** The active factory was just written to its linked file. */
export function markSaved(): void {
  const s = useFileLink.getState();
  if (!s.handle) return;
  setActive({ handle: s.handle, dirty: false, savedAt: new Date().toISOString() });
  recordRecentFile(s.handle);
}

/** Forget the active factory's file (e.g. it was moved or deleted on disk). */
export function unlinkActiveFile(): void {
  setActive(null);
}

/** The active factory is going into the library as `slotId`; its link goes with it. */
export function parkActiveLink(slotId: string): void {
  const rec = activeRecord();
  if (rec) void writeRecord(slotId, rec);
  setActive(null);
}

/** Library slot `slotId` just became the active factory; bring its link back. */
export function restoreParkedLink(slotId: string): void {
  void readRecord(slotId).then((rec) => {
    void writeRecord(slotId, null);
    if (rec) setActive(rec);
  });
}

/** Library slot `slotId` was deleted. */
export function dropParkedLink(slotId: string): void {
  void writeRecord(slotId, null);
}

// ---------------------------------------------------------------------------
// Recent files
// ---------------------------------------------------------------------------

/**
 * The `.swproj` files you have opened or saved, newest first — the menu's
 * RECENT FACTORIES list, the way a desktop app remembers recent documents.
 *
 * Each entry keeps the file's handle, so clicking it reopens the file from
 * disk rather than from a browser copy. The factory name and station count
 * are cached from the moment it was last opened or saved, so the list can
 * render without reading every file. Only Chromium browsers hand out handles;
 * elsewhere this list simply stays empty.
 */
export interface RecentFile {
  id: string;
  handle: FileSystemFileHandle;
  fileName: string;
  factoryName: string;
  stationCount: number;
  /** ISO time it was last opened or saved. */
  openedAt: string;
}

export const RECENT_FILES_MAX = 12;
const RECENTS_KEY = 'recents';

export const useRecentFiles = create<{ files: RecentFile[] }>()(() => ({ files: [] }));

async function writeRecents(files: RecentFile[]): Promise<void> {
  const p = db();
  if (!p) return;
  try {
    await (await p).put(STORE, files, RECENTS_KEY);
  } catch {
    // Losing the recents list costs a trip through IMPORT, never data.
  }
}

async function readRecents(): Promise<RecentFile[]> {
  const p = db();
  if (!p) return [];
  try {
    const v = (await (await p).get(STORE, RECENTS_KEY)) as RecentFile[] | undefined;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** True when two handles point at the same file on disk. */
export async function sameFile(a: FileSystemFileHandle, b: FileSystemFileHandle): Promise<boolean> {
  if (a === b) return true;
  try {
    return typeof a.isSameEntry === 'function' ? await a.isSameEntry(b) : a.name === b.name;
  } catch {
    return false;
  }
}

// Recents updates are async (isSameEntry) — chain them so two quick calls
// can't interleave and drop each other's write.
let recentsQueue: Promise<void> = Promise.resolve();

/** The active factory was just opened from or saved to `handle`. */
export function recordRecentFile(handle: FileSystemFileHandle): void {
  const factoryName = useProject.getState().meta.name || 'Untitled Factory';
  const stationCount = useTwin.getState().canonical.workstations.length;
  recentsQueue = recentsQueue.then(async () => {
    const kept: RecentFile[] = [];
    for (const f of useRecentFiles.getState().files) {
      if (!(await sameFile(f.handle, handle))) kept.push(f);
    }
    const entry: RecentFile = {
      id: `rf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      handle,
      fileName: handle.name,
      factoryName,
      stationCount,
      openedAt: new Date().toISOString(),
    };
    const files = [entry, ...kept].slice(0, RECENT_FILES_MAX);
    useRecentFiles.setState({ files });
    await writeRecents(files);
  });
}

/** Drop one entry from the recents list. The file on disk is untouched. */
export function forgetRecentFile(id: string): void {
  recentsQueue = recentsQueue.then(async () => {
    const files = useRecentFiles.getState().files.filter((f) => f.id !== id);
    useRecentFiles.setState({ files });
    await writeRecents(files);
  });
}

/**
 * Work out how the recents list overlaps the factories already on screen.
 * A recent file that is the active factory's file, or the file of a factory
 * parked in the library, is already represented by that row — so it is
 * hidden rather than listed twice. Also returns each library slot's linked
 * file name so the slot row can show where it lives.
 */
export async function resolveRecentOverlap(
  slotIds: string[],
  activeHandle: FileSystemFileHandle | null,
  files: RecentFile[],
): Promise<{ hiddenIds: Set<string>; slotFileNames: Record<string, string> }> {
  const slotFileNames: Record<string, string> = {};
  const handles: FileSystemFileHandle[] = activeHandle ? [activeHandle] : [];
  for (const id of slotIds) {
    const rec = await readRecord(id);
    if (rec) {
      slotFileNames[id] = rec.handle.name;
      handles.push(rec.handle);
    }
  }
  const hiddenIds = new Set<string>();
  for (const f of files) {
    for (const h of handles) {
      if (await sameFile(h, f.handle)) { hiddenIds.add(f.id); break; }
    }
  }
  return { hiddenIds, slotFileNames };
}

/** Make sure the page may read `handle` — after a reload Chromium asks again. */
export async function ensureReadable(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as PermissionCapableHandle;
  if (!h.queryPermission || !h.requestPermission) return true;
  if ((await h.queryPermission({ mode: 'read' })) === 'granted') return true;
  return (await h.requestPermission({ mode: 'read' })) === 'granted';
}

// ---------------------------------------------------------------------------
// Dirty tracking
// ---------------------------------------------------------------------------

/**
 * Programmatic loads (opening a file, switching factories) replace the whole
 * store contents. Those are not edits, so they must not mark the file dirty.
 */
let suppress = 0;
export function withoutDirtyTracking<T>(fn: () => T): T {
  suppress += 1;
  try {
    return fn();
  } finally {
    suppress -= 1;
    // Every caller of this is a whole-factory replacement, which is exactly
    // the moment the kept-alive surfaces have to let go of their view state.
    if (suppress === 0) bumpFactoryEpoch();
  }
}

function markDirty(): void {
  if (suppress > 0) return;
  // Before both stores have hydrated, "changes" are just the saved state
  // loading in.
  if (!useProject.persist.hasHydrated() || !useTwin.persist.hasHydrated()) return;
  const s = useFileLink.getState();
  if (!s.handle || s.dirty) return;
  setActive({ handle: s.handle, dirty: true, savedAt: s.savedAt });
}

let started = false;
/** Restore the active link from the last session and start watching for edits. */
export function startFileLinkTracking(): void {
  if (started) return;
  started = true;
  recentsQueue = recentsQueue.then(async () => {
    const files = await readRecents();
    // A file recorded during startup (before this read landed) stays on top.
    const live = useRecentFiles.getState().files;
    useRecentFiles.setState({ files: live.length ? [...live, ...files].slice(0, RECENT_FILES_MAX) : files });
  });
  void readRecord(ACTIVE_KEY).then((rec) => {
    if (rec && !useFileLink.getState().handle) {
      useFileLink.setState({
        handle: rec.handle,
        fileName: rec.handle.name,
        dirty: rec.dirty,
        savedAt: rec.savedAt,
      });
    }
  });
  useTwin.subscribe((s, prev) => {
    if (
      s.canonical !== prev.canonical
      || s.scenarios !== prev.scenarios
      || s.activeScenarioId !== prev.activeScenarioId
    ) {
      markDirty();
    }
  });
  useProject.subscribe((s, prev) => {
    for (const key of Object.keys(s) as (keyof typeof s)[]) {
      if (typeof s[key] !== 'function' && s[key] !== prev[key]) {
        markDirty();
        return;
      }
    }
  });
}
