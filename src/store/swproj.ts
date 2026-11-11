/**
 * `.swproj` project file format — the "proper formats" seam.
 *
 * Why a versioned envelope:
 *   The old export wrote the project store ONLY (downloadProjectJson →
 *   exportProject). The twin — every department, workstation, connector,
 *   operator and scenario fork, i.e. the actual factory layout — was NOT in
 *   the file, so an exported `.swproj` could not rebuild the factory. This
 *   envelope bundles BOTH stores and stamps the schema versions so a future
 *   build can migrate an old file instead of rejecting it.
 *
 * Backward compatibility:
 *   parseSwproj() also accepts a legacy bare-ProjectState file (the old
 *   format had no `format` field) so existing `.swproj` files still import —
 *   they just restore the project half, leaving the current twin in place.
 *
 * Layering: this module orchestrates the two stores (it imports useProject /
 * useTwin), so the stores must NOT import it back — keep the dependency
 * one-way to avoid an import cycle.
 */

import { z } from 'zod';
import {
  useProject,
  pickProjectFile,
  parseProjectFileText,
  PROJECT_SCHEMA_VERSION,
  type ProjectState,
} from './project';
import { useTwin, TWIN_STORE_SCHEMA_VERSION } from './twin';
import { useFactoryLibrary, uniquifyFactoryName } from './factoryLibrary';
import { normalizeTwin, validateTwin, type Twin, type Scenario } from '../domain/twin';
import {
  SWPROJ_PICKER_TYPES,
  canWriteFiles,
  ensureReadable,
  ensureWritable,
  forgetRecentFile,
  fsWindow,
  handleReadsRefused,
  rememberHandleReadsRefused,
  useRecentFiles,
  linkActiveFile,
  markSaved,
  useFileLink,
  withoutDirtyTracking,
} from './fileLink';

export const SWPROJ_FORMAT = 'stitchworks-project';
export const SWPROJ_FORMAT_VERSION = 1;
/** App build stamped into exports for provenance (informational only). */
const APP_VERSION = '0.2.0';

/** The twin half of a `.swproj` — exactly what useTwin.exportTwin() returns. */
export interface TwinExport {
  schemaVersion: number;
  canonical: Twin;
  scenarios: Scenario[];
  activeScenarioId: string | null;
}

export interface SwprojEnvelope {
  format: typeof SWPROJ_FORMAT;
  formatVersion: number;
  app: { name: string; version: string };
  /** Schema versions of the embedded payloads, so importers can migrate. */
  schemas: { project: number; twin: number };
  exportedAt: string;
  data: {
    project: ProjectState;
    twin: TwinExport;
  };
}

// ---------------------------------------------------------------------------
// Validation + format migration
// ---------------------------------------------------------------------------

// Structural schemas — validate the shape that matters for a SAFE import (the
// format discriminator, version, and that the embedded project + twin look
// right). Deeper integrity is handled downstream by loadProject +
// validateTwin/normalizeTwin. NB: these are used for validation ONLY via
// safeParse; the original (unstripped) data is what actually gets imported,
// so zod's key-stripping never drops real ProjectState/Twin fields.
const projectShape = z.object({
  schemaVersion: z.number(),
  meta: z.object({ name: z.string() }),
});
const envelopeSchema = z.object({
  format: z.literal(SWPROJ_FORMAT),
  formatVersion: z.number(),
  data: z.object({
    project: projectShape,
    twin: z.object({ canonical: z.object({}) }).optional(),
  }),
});

function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

/**
 * Ordered envelope-version upgraders — the explicit migration registry for the
 * file format. formatVersion 1 is current so there are none yet; when the
 * envelope shape changes, a `1: (env) => ({...})` step lands here so old files
 * keep importing instead of being rejected.
 */
const ENVELOPE_MIGRATIONS: Record<number, (env: Record<string, unknown>) => Record<string, unknown>> = {
  // 1: (env) => ({ ...env, formatVersion: 2, /* shape change */ }),
};

function migrateEnvelope(env: Record<string, unknown>): Record<string, unknown> {
  let v = typeof env.formatVersion === 'number' ? env.formatVersion : 1;
  if (v > SWPROJ_FORMAT_VERSION) {
    throw new Error(
      `This .swproj was saved by a newer Stitchworks (format v${v}); this build supports up to v${SWPROJ_FORMAT_VERSION}. Update the app to open it.`,
    );
  }
  let out = env;
  while (v < SWPROJ_FORMAT_VERSION) {
    const step = ENVELOPE_MIGRATIONS[v];
    if (!step) break;
    out = step(out);
    v += 1;
  }
  return out;
}

/** Build an envelope from the two store exports. Pure. */
export function buildSwproj(
  project: ProjectState,
  twin: TwinExport,
  exportedAt: string,
): SwprojEnvelope {
  return {
    format: SWPROJ_FORMAT,
    formatVersion: SWPROJ_FORMAT_VERSION,
    app: { name: 'Stitchworks', version: APP_VERSION },
    schemas: { project: PROJECT_SCHEMA_VERSION, twin: TWIN_STORE_SCHEMA_VERSION },
    exportedAt,
    data: { project, twin },
  };
}

export interface ParsedSwproj {
  project: ProjectState;
  /** Null when the source was a legacy project-only file. */
  twin: TwinExport | null;
  legacy: boolean;
}

/**
 * Interpret raw parsed JSON as a `.swproj`. Accepts the versioned envelope
 * AND the legacy bare-ProjectState format. Throws with a human-readable
 * reason on shapes it can't interpret (the caller surfaces it as a toast).
 */
export function parseSwproj(raw: unknown): ParsedSwproj {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Not a valid .swproj file (expected a JSON object).');
  }
  const obj = raw as Record<string, unknown>;

  // Versioned envelope — discriminated by the `format` field.
  if (obj.format === SWPROJ_FORMAT) {
    const migrated = migrateEnvelope(obj);
    const check = envelopeSchema.safeParse(migrated);
    if (!check.success) {
      throw new Error(`Corrupt .swproj envelope — ${formatZodError(check.error)}.`);
    }
    const data = migrated.data as { project: ProjectState; twin?: TwinExport };
    return { project: data.project, twin: data.twin ?? null, legacy: false };
  }

  // Legacy: the file IS a bare ProjectState (has schemaVersion + meta).
  if ('schemaVersion' in obj && 'meta' in obj) {
    const check = projectShape.safeParse(obj);
    if (!check.success) {
      throw new Error(`Corrupt legacy project file — ${formatZodError(check.error)}.`);
    }
    return { project: obj as unknown as ProjectState, twin: null, legacy: true };
  }

  throw new Error('Unrecognised .swproj file — no `format` field and not a legacy project file.');
}

/** The active factory as `.swproj` JSON text. */
function currentSwprojJson(): string {
  const project = useProject.getState().exportProject();
  const twin = useTwin.getState().exportTwin();
  return JSON.stringify(buildSwproj(project, twin, new Date().toISOString()), null, 2);
}

function suggestedFileName(): string {
  const name = useProject.getState().meta?.name || 'stitchworks';
  return `${name.replace(/[^a-z0-9-_ ()]/gi, '-').trim() || 'stitchworks'}.swproj`;
}

/** Trigger a download of the current project + twin as a versioned `.swproj`. */
export function downloadSwproj(): void {
  const json = currentSwprojJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = suggestedFileName();
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ApplySwprojResult {
  ok: boolean;
  reason?: string;
  legacy: boolean;
}

/**
 * Apply a parsed `.swproj` to the live stores. Validates before writing so a
 * malformed file can't corrupt state — on any failure nothing is applied past
 * the project load and a reason is returned. The twin is normalised (missing
 * fields filled) then referential-integrity checked via validateTwin.
 */
export function applySwproj(parsed: ParsedSwproj): ApplySwprojResult {
  const pr = useProject.getState().loadProject(parsed.project);
  if (!pr.ok) return { ok: false, reason: pr.reason, legacy: parsed.legacy };

  if (parsed.twin) {
    const canonical = normalizeTwin(parsed.twin.canonical);
    const errs = validateTwin(canonical);
    if (errs.length > 0) {
      return { ok: false, reason: `Factory layout invalid: ${errs.join('; ')}`, legacy: parsed.legacy };
    }
    const scenarios = (parsed.twin.scenarios ?? []).map((sc) => ({
      ...sc,
      twin: normalizeTwin(sc.twin),
    }));
    useTwin.setState({
      schemaVersion: TWIN_STORE_SCHEMA_VERSION,
      canonical,
      scenarios,
      activeScenarioId: parsed.twin.activeScenarioId ?? null,
      past: [],
      future: [],
    });
  }

  return { ok: true, legacy: parsed.legacy };
}

/** Outcome of the Menu's "import factory" flow. */
export interface ImportFactoryResult {
  ok: boolean;
  /** Name the imported factory ended up under (suffixed on collision). */
  name?: string;
  /** Name the previously-open factory was archived as. */
  archivedAs?: string;
  reason?: string;
  legacy: boolean;
}

/**
 * Import a `.swproj` as a NEW factory rather than over the open one.
 *
 * Settings' import is an in-place restore: it overwrites the active project +
 * twin, which is the right thing when you are recovering a backup of the
 * factory you already have open. The Menu is a library — opening a file there
 * should behave like `archiveAndStartFresh`, i.e. the factory you were on goes
 * to the FACTORY LIBRARY and the file becomes the active factory. Same
 * guarantee the create-new flow gives: nothing you had open is lost.
 *
 * Throws (via `parseSwproj`) on a file that isn't a project at all; returns
 * `ok: false` with a reason when the file parses but its payload won't load.
 * In that second case the snapshot taken up front is rolled straight back, so
 * a bad file leaves the app exactly where it was.
 */
export function archiveAndImportSwproj(raw: unknown): ImportFactoryResult {
  const parsed = parseSwproj(raw);
  const archived = useFactoryLibrary.getState().archiveCurrent();
  const result = applySwproj(parsed);
  if (!result.ok) {
    // `loadFactory` drops the slot it restores from, so the rollback leaves
    // the library at the size it started at.
    useFactoryLibrary.getState().loadFactory(archived.id, { archiveFirst: false });
    return { ok: false, reason: result.reason, legacy: parsed.legacy };
  }
  // The file carries its own name, and the commonest import is re-opening a
  // factory you also have archived — so suffix rather than reject. The active
  // factory IS the import at this point, which is why it is excluded from the
  // collision check.
  const incoming = useProject.getState().meta.name?.trim();
  const name = uniquifyFactoryName(incoming || 'Imported Factory', { includeActive: false });
  useProject.getState().rename(name);
  useTwin.getState().renameActive(name);
  return { ok: true, name, archivedAs: archived.name, legacy: parsed.legacy };
}

// ---------------------------------------------------------------------------
// Save to / open from a file on disk
// ---------------------------------------------------------------------------

export type SaveToFileResult =
  /** Written to the linked file. */
  | { kind: 'saved'; fileName: string }
  /** The browser cannot write files (Safari, Firefox), or offered the Save
   *  dialog and then refused the write; a copy was downloaded instead. */
  | { kind: 'downloaded'; fileName: string }
  /** The user closed the Save dialog or refused permission. Nothing changed. */
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * The platform itself turned the write down. Embedded browsers and locked-down
 * profiles expose `showSaveFilePicker`, hand back a handle, and then throw
 * NotAllowedError from `createWritable` — so feature-detecting the picker is
 * not enough to know a save will land. This is not the user saying no (that
 * path returns false from `ensureWritable`), so the right answer is the same
 * one a browser without the API gets: a downloaded copy, not a dead end.
 */
function isWriteRefused(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
}

function downloadInstead(): SaveToFileResult {
  downloadSwproj();
  return { kind: 'downloaded', fileName: suggestedFileName() };
}

async function writeTo(handle: FileSystemFileHandle, json: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(json);
  await writable.close();
}

/**
 * Save the active factory to its `.swproj` file on disk.
 *
 * The first save (or any save with `saveAs`) opens the native Save dialog and
 * links the factory to the chosen file; after that, Save writes straight back
 * to it. If the linked file has been moved or deleted, the dialog opens again
 * rather than failing. Must be called from a click or key press — the browser
 * only shows dialogs and permission prompts in response to one.
 */
export async function saveSwprojToFile(opts: { saveAs?: boolean } = {}): Promise<SaveToFileResult> {
  if (!canWriteFiles()) return downloadInstead();
  const json = currentSwprojJson();
  const linked = opts.saveAs ? null : useFileLink.getState().handle;

  if (linked) {
    try {
      if (!(await ensureWritable(linked))) return { kind: 'cancelled' };
      await writeTo(linked, json);
      markSaved();
      return { kind: 'saved', fileName: linked.name };
    } catch (e) {
      if (isAbort(e)) return { kind: 'cancelled' };
      if (isWriteRefused(e)) return downloadInstead();
      // NotFoundError / NotReadableError: the file was moved, renamed or
      // deleted outside the app. Fall through and ask where to save instead.
      if (!(e instanceof DOMException) || (e.name !== 'NotFoundError' && e.name !== 'NotReadableError')) {
        return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  try {
    const picker = fsWindow().showSaveFilePicker!;
    const handle = await picker({ suggestedName: suggestedFileName(), types: SWPROJ_PICKER_TYPES });
    await writeTo(handle, json);
    linkActiveFile(handle);
    return { kind: 'saved', fileName: handle.name };
  } catch (e) {
    if (isAbort(e)) return { kind: 'cancelled' };
    if (isWriteRefused(e)) return downloadInstead();
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Pick a `.swproj` from disk and return its parsed JSON plus, where the
 * browser supports it, a handle so Save can write back to the same file.
 *
 * Rejects with an AbortError when the user closes the dialog, and with a
 * plain Error naming the file when it cannot be read as a project — callers
 * must tell those two apart, or a bad file looks like a cancelled click.
 * Some embedded browsers expose `showOpenFilePicker` and then refuse to show
 * it, or show it and refuse to read the file it returns (NotAllowedError /
 * SecurityError). Both fall back to the classic file input every browser
 * has, at the cost of the write-back link.
 */
export async function pickSwprojFile(): Promise<{ raw: unknown; handle: FileSystemFileHandle | null }> {
  const open = fsWindow().showOpenFilePicker;
  if (typeof open !== 'function' || handleReadsRefused()) {
    return { raw: await pickProjectFile(), handle: null };
  }
  let handle: FileSystemFileHandle;
  try {
    [handle] = await open({ types: SWPROJ_PICKER_TYPES, multiple: false });
  } catch (e) {
    if (isAbort(e)) throw e;
    if (isWriteRefused(e) || e instanceof TypeError) {
      return { raw: await pickProjectFile(), handle: null };
    }
    throw e;
  }
  let text: string;
  let fileName: string;
  try {
    const file = await handle.getFile();
    fileName = file.name;
    text = await file.text();
  } catch (e) {
    if (!isWriteRefused(e)) throw e;
    rememberHandleReadsRefused();
    // A file input only opens during a click, and the dialog that just closed
    // has usually outlived this one. When it has, say so: the next click skips
    // the refused dialog entirely.
    if (typeof navigator !== 'undefined' && navigator.userActivation?.isActive) {
      return { raw: await pickProjectFile(), handle: null };
    }
    throw new Error(
      'This browser blocked reading that file directly. Click IMPORT FACTORY again to pick it with the standard file dialog.',
      { cause: e },
    );
  }
  return { raw: parseProjectFileText(text, fileName), handle };
}

/**
 * Open a `.swproj` as the active factory (see `archiveAndImportSwproj`) and,
 * when a handle is given, link it so Save writes back to that file.
 */
export function openSwprojAsFactory(
  raw: unknown,
  handle: FileSystemFileHandle | null,
): ImportFactoryResult {
  const result = withoutDirtyTracking(() => archiveAndImportSwproj(raw));
  if (result.ok && handle) linkActiveFile(handle);
  return result;
}

/**
 * Reopen a factory from the RECENT FACTORIES list — read straight from its
 * file on disk, so it reflects the file as it is now. A file that has been
 * moved or deleted since is dropped from the list rather than left as a
 * dead row. Must be called from a click: after a reload the browser asks
 * for read permission again.
 */
export async function openRecentFile(id: string): Promise<ImportFactoryResult> {
  const entry = useRecentFiles.getState().files.find((f) => f.id === id);
  if (!entry) return { ok: false, reason: 'That file is no longer in the recent list.', legacy: false };
  try {
    if (!(await ensureReadable(entry.handle))) {
      return { ok: false, reason: `Permission to read "${entry.fileName}" was not granted.`, legacy: false };
    }
    const file = await entry.handle.getFile();
    const raw = parseProjectFileText(await file.text(), file.name);
    return openSwprojAsFactory(raw, entry.handle);
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'NotReadableError')) {
      forgetRecentFile(id);
      return {
        ok: false,
        reason: `"${entry.fileName}" was moved or deleted — removed it from recent factories.`,
        legacy: false,
      };
    }
    if (isWriteRefused(e)) {
      rememberHandleReadsRefused();
      return {
        ok: false,
        reason: `This browser blocked reading "${entry.fileName}" directly. Use IMPORT FACTORY to open it instead.`,
        legacy: false,
      };
    }
    return { ok: false, reason: e instanceof Error ? e.message : String(e), legacy: false };
  }
}
