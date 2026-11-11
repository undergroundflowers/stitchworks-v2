/**
 * Excel → Builder-line importer. Reads "Machine Layout" sheets exported
 * by Modelama (and similar Asian-factory line-plan templates) and
 * produces a flat list of stations ready to materialize as a SewingLine
 * + Workstations on the canonical Twin.
 *
 * Source shape (what the parser expects to find on the chosen sheet):
 *
 *   Row 0       MACHINE LAYOUT
 *   Rows 1-4    metadata block:
 *                 DESCRIPTION | DRESS | LINE NO. | 6   | MACHINE     | 45
 *                 Style No.   | 100…  |          |     | MACHINE SMV | 26.45
 *                 Buyer       | INC   |          |     | No of Work  | 62
 *                 Quantity    | 6250  | FINAL INSPECTION TABLE | … | Target 8 Hrs | 61.24
 *   Row 6       header:
 *                 OPERATION | CODE NO. | TYPE OF M/C |   | TYPE OF M/C | CODE NO. | OPERATION
 *   Rows 7..n   alternating data + visually-blank spacer rows. Each data
 *               row may carry a station on the LEFT half (cols 0..2), the
 *               RIGHT half (cols 4..6), both, or neither.
 *
 * The two halves represent physically facing rows on a Progressive-
 * Bundle (PBS) sewing line — operators sit on either side of an aisle.
 * Importantly, codeNo runs *continuously across both halves* (e.g.
 * left=63, right=62, left=64, right=60…), not within one column.
 * We treat codeNo as "position along the line" and use it for X
 * placement; `side` decides which row (Y).
 */

import * as XLSX from 'xlsx';
import { useTwin, selectActiveTwin } from '../store/twin';
import type { EntityColorKey, Workstation } from '../domain/twin';
import { getBlockKind, getBlockParams, pmlFixtureId } from '../domain/pml';
import { BOTTLENECK_TARGET_RHO } from '../domain/reference-twin';
import { defaultDist } from '../simulation/distributions';
import type { ObBinding } from './bind-ob-to-layout';

export interface ImportedStation {
  /** "Code No." from the sheet — Modelama's station-position number. */
  codeNo?: number;
  /** Operation label (e.g. "BOTTOM HEM SHELL"). */
  name: string;
  /** Raw machine string from the sheet (e.g. "SN", "OL-5", "TABLE"). */
  rawMachine: string;
  /** Mapped ISO_FIXTURE_CATALOG id (e.g. `a_snls`, `a_bartack`). */
  catalogId: string;
  /** Aisle side. 'L' = top facing row, 'R' = bottom facing row. */
  side: 'L' | 'R';
  /**
   * 0-based index of the data row this station came from on the sheet.
   * Both an L and an R station drawn from the same sheet row share the
   * same `rowIndex` — that's how we know they physically face each other
   * across the aisle, regardless of how their `codeNo` values compare.
   * (On Modelama PBS sheets the codeNo snakes between sides, so two
   * facing stations almost always have different codeNos.)
   */
  rowIndex: number;
}

export interface ImportedFloor {
  stations: ImportedStation[];
  source: {
    fileName: string;
    sheetName: string;
    style?: string;
    description?: string;
    buyer?: string;
    lineNo?: number;
    machineCount?: number;
    workstationCount?: number;
    machineSmv?: number;
    quantity?: number;
    target?: number;
  };
  warnings: string[];
}

// ── Modelama machine vernacular → ISO_FIXTURE_CATALOG id ─────────────────
// Long/specific patterns first; falls through to fx_table if nothing
// matches so unrecognised cells still place a station (and we surface a
// warning). Each entry covers the abbreviations Modelama actually uses on
// these layout sheets — see the four xlsx samples in MODELAMA DATA/.
const FIXTURE_PATTERNS: { pattern: RegExp; catalogId: string; label: string }[] = [
  // Overlocks first — they're the most ambiguous if we let SN match early
  { pattern: /\bo\s*\/?\s*l\s*5\b|\bol[-\s]?5\b|\b5\s*o\s*\/?\s*l/i, catalogId: 'a_5ol', label: '5-thread overlock' },
  { pattern: /\bo\s*\/?\s*l\s*4\b|\bol[-\s]?4\b|\b4\s*o\s*\/?\s*l/i, catalogId: 'a_4ol', label: '4-thread overlock' },
  { pattern: /\bo\s*\/?\s*l\s*3\b|\bol[-\s]?3\b|\b3\s*o\s*\/?\s*l/i, catalogId: 'a_4ol', label: '3-thread overlock → 4-thread' },
  { pattern: /\bover[\s-]*lock|\bo\/l\b|\bol\b/i, catalogId: 'a_4ol', label: 'overlock (unspecified)' },
  // Speciality sewing
  { pattern: /\bbartack|\bbt\b/i, catalogId: 'a_bartack', label: 'bartack' },
  { pattern: /\bbutton\s*hole|\bbh\b/i, catalogId: 'a_buttonhole', label: 'buttonhole' },
  { pattern: /\bbutton\s*(sew|stitch|stch|attach)|\bbs\b/i, catalogId: 'a_buttonsew', label: 'button sew' },
  { pattern: /\bembroid|\bemb\b/i, catalogId: 'a_embroidery', label: 'embroidery' },
  // Flatlock / cover / feed-of-arm / kansai
  { pattern: /\b(coverstitch|cover\s*stitch|flat\s*lock|flatlock|\bfl\b)/i, catalogId: 'a_flatlock', label: 'flatlock' },
  { pattern: /\b(feed\s*of\s*arm|foa|\bfb\b)/i, catalogId: 'a_foa', label: 'feed-of-arm' },
  { pattern: /\bkansai|\bks\b/i, catalogId: 'a_kansai', label: 'kansai' },
  // Edge cutter — a single-needle lockstitch with a trimming knife. Written
  // "E/C" on some sheets and "SNEC" on others; both are the same machine, so
  // both land on the single-needle fixture. Has to sit ahead of the cutting
  // patterns, or "edge cutter" reads as a cutting-room knife.
  { pattern: /\be\s*\/\s*c\b|\bedge[\s-]*cut/i, catalogId: 'a_snls', label: 'edge cutter (single needle)' },
  // Cutting / spreading
  { pattern: /\bcad\b/i, catalogId: 'a_cnc_cutter', label: 'CAD cutter' },
  { pattern: /\b(cutter|cut\b|straight\s*knife|band\s*knife)/i, catalogId: 'a_knife_straight', label: 'cutter' },
  { pattern: /\bspread/i, catalogId: 'a_spread_auto', label: 'spreader' },
  // Pressing / fusing / steam
  { pattern: /\bfusing\b|\bfuse\b/i, catalogId: 'fx_press', label: 'fusing' },
  { pattern: /\bsteam\s*tunnel\b|\bsteam\b/i, catalogId: 'fx_press', label: 'steam' },
  { pattern: /\biron\b|\bpress\b/i, catalogId: 'fx_press', label: 'iron / press' },
  // Inspection
  { pattern: /\btable\b/i, catalogId: 'a_inspect_table', label: 'inspection table' },
  { pattern: /\binspect|\bqc\b|\baql\b/i, catalogId: 'a_inspect_table', label: 'inspection' },
  // Sewing — double then single, both AFTER speciality so BH/BS/BT take precedence
  { pattern: /\bdnl(s|m|c|ec)?\b|\bdn\b|\bdouble\s*needle/i, catalogId: 'a_dnls', label: 'double needle' },
  { pattern: /\bsn(l|e|k|c|ec)?\w*\b|\bsn\b|\bsingle\s*needle|\block\s*stitch/i, catalogId: 'a_snls', label: 'single needle' },
  // Manual helper / hand
  { pattern: /\bhd\b|\bhelper\b|\bhand\b|\bmnl\b|\bmanual\b/i, catalogId: 'fx_table', label: 'manual / helper' },
];

// ── Public API ────────────────────────────────────────────────────────────
/**
 * Parse an .xlsx and return EVERY Machine Layout sheet inside it.
 * Modelama workbooks sometimes carry stale template layouts alongside the
 * file's real layout (e.g. `100225286 LINE-6.xlsx` has both a `7800`
 * carry-over and the actual `1893` sheet for style 100225286) — surfacing
 * every layout lets the user pick which ones to keep on import.
 */
export function parseFloorXlsx(input: ArrayBuffer | Uint8Array, fileName = 'imported.xlsx'): ImportedFloor[] {
  const wb = XLSX.read(input, { type: 'array', cellDates: false });
  const layouts: ImportedFloor[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });
    if (findLayoutHeaderRow(rows) < 0) continue;
    try {
      const parsed = parseLayoutRows(rows, fileName, name);
      // Filter out sheets that match the header structure but have zero
      // stations under it (defensive — parseLayoutRows already throws on 0).
      if (parsed.stations.length > 0) layouts.push(parsed);
    } catch {
      // Skip — empty-table sheets shouldn't poison the batch.
    }
  }
  if (layouts.length === 0) {
    throw new Error('No Machine Layout sheets found in this workbook.');
  }
  return layouts;
}

/** Pick a single best layout from a workbook — used when the caller only
 *  wants one result. Prefers the sheet whose internal Style No. matches
 *  the leading numeric token in the filename; falls back to row count. */
export function parseBestFloorXlsx(input: ArrayBuffer | Uint8Array, fileName = 'imported.xlsx'): ImportedFloor {
  const all = parseFloorXlsx(input, fileName);
  const fileStyle = (fileName.match(/^\s*(\d{4,})/) || [])[1];
  if (fileStyle) {
    const exact = all.find((f) => normaliseStyle(f.source.style) === normaliseStyle(fileStyle));
    if (exact) return exact;
  }
  // Score-based fallback: prefer sheet with the most stations.
  return all.slice().sort((a, b) => b.stations.length - a.stations.length)[0];
}

function normaliseStyle(s: string | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function parseLayoutRows(rows: unknown[][], fileName: string, sheetName: string): ImportedFloor {
  const warnings: string[] = [];
  const headerRow = findLayoutHeaderRow(rows);
  if (headerRow < 0) {
    throw new Error('Could not find the layout header row (needs "TYPE OF M/C" + "OPERATION" / "CODE NO.").');
  }
  // Column layout per Modelama spec — header is *symmetric* around column 3
  // (an empty gutter). We hardcode the offsets because the sheets we've
  // seen all match this exact 7-col grid; if a future sheet deviates we can
  // map columns by header text.
  const COL_L_NAME = 0;
  const COL_L_CODE = 1;
  const COL_L_M = 2;
  const COL_R_M = 4;
  const COL_R_CODE = 5;
  const COL_R_NAME = 6;

  const source = readLayoutMetadata(rows.slice(0, headerRow));
  source.fileName = fileName;
  source.sheetName = sheetName;

  const stations: ImportedStation[] = [];
  // `rowIndex` is a compressed counter — only sheet rows that actually
  // contributed at least one station bump it, so visually-blank spacer
  // rows in the workbook don't create empty columns on the canvas.
  let rowIndex = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    let pushedFromThisRow = false;
    // LEFT side
    const lName = toString(row[COL_L_NAME]);
    const lMach = toString(row[COL_L_M]);
    const lCode = toNumber(row[COL_L_CODE]);
    if (lName && lMach) {
      const { catalogId, matched } = resolveCatalogId(lMach);
      if (!matched) warnings.push(`Left col row ${r + 1}: machine "${lMach}" unmapped — fell back to ${catalogId}.`);
      stations.push({
        codeNo: lCode ?? undefined,
        name: lName,
        rawMachine: lMach,
        catalogId,
        side: 'L',
        rowIndex,
      });
      pushedFromThisRow = true;
    }
    // RIGHT side
    const rName = toString(row[COL_R_NAME]);
    const rMach = toString(row[COL_R_M]);
    const rCode = toNumber(row[COL_R_CODE]);
    if (rName && rMach) {
      const { catalogId, matched } = resolveCatalogId(rMach);
      if (!matched) warnings.push(`Right col row ${r + 1}: machine "${rMach}" unmapped — fell back to ${catalogId}.`);
      stations.push({
        codeNo: rCode ?? undefined,
        name: rName,
        rawMachine: rMach,
        catalogId,
        side: 'R',
        rowIndex,
      });
      pushedFromThisRow = true;
    }
    if (pushedFromThisRow) rowIndex++;
  }

  if (stations.length === 0) {
    throw new Error('Found a Machine Layout header but no stations under it.');
  }

  return { stations, source, warnings };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function findLayoutHeaderRow(rows: unknown[][]): number {
  // Look in the first ~40 rows for one that has "TYPE OF M/C" along with
  // "OPERATION" or "CODE NO." — these three header labels uniquely identify
  // Modelama's Machine Layout header row.
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const norm = (rows[r] ?? []).map((c) => normaliseHeaderText(c));
    const hasTypeMc = norm.some((c) => c === 'typeofmc' || c === 'typemc');
    const hasOperation = norm.some((c) => c === 'operation' || c === 'operationname');
    const hasCode = norm.some((c) => c === 'codeno' || c === 'code');
    if (hasTypeMc && (hasOperation || hasCode)) return r;
  }
  return -1;
}

function readLayoutMetadata(headerRows: unknown[][]): ImportedFloor['source'] {
  const src: ImportedFloor['source'] = { fileName: '', sheetName: '' };
  for (const row of headerRows) {
    for (let c = 0; c < row.length; c++) {
      const label = normaliseHeaderText(row[c]);
      if (!label) continue;
      const v = pickNextValue(row, c);
      const num = toNumber(v);
      if (label === 'description' && v) src.description ??= v;
      else if (label === 'styleno' && v) src.style ??= v;
      else if (label === 'buyer' && v) src.buyer ??= v;
      else if (label === 'quantity' && num != null) src.quantity ??= num;
      else if ((label === 'lineno' || label === 'line') && num != null) src.lineNo ??= num;
      else if (label === 'machine' && num != null) src.machineCount ??= num;
      else if (label === 'machinesmv' && num != null) src.machineSmv ??= num;
      else if (label === 'noofworkstations' && num != null) src.workstationCount ??= num;
      else if (label.startsWith('target') && num != null) src.target ??= num;
    }
  }
  return src;
}

function pickNextValue(row: unknown[], from: number): string | undefined {
  for (let c = from + 1; c < Math.min(row.length, from + 6); c++) {
    const v = toString(row[c]);
    if (v) return v;
  }
  return undefined;
}

function resolveCatalogId(raw: string): { catalogId: string; matched: boolean } {
  const cleaned = (raw ?? '').toString().trim();
  if (!cleaned) return { catalogId: 'fx_table', matched: false };
  for (const { pattern, catalogId } of FIXTURE_PATTERNS) {
    if (pattern.test(cleaned)) return { catalogId, matched: true };
  }
  return { catalogId: 'fx_table', matched: false };
}

function normaliseHeaderText(v: unknown): string {
  if (v == null) return '';
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function toString(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[, ]+/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Twin materialiser ────────────────────────────────────────────────────
/**
 * Lay the parsed stations out as a two-row facing line in Twin grid space.
 * Returns the relative placement positions; the caller adds an origin
 * offset so multiple imports don't stack on top of each other.
 *
 * Geometry rules (this is the part that has to match the source sheet):
 *
 *   • **Sheet row ⇒ X column.** Both the L and the R cell on the same
 *     sheet row are *physically facing each other across the aisle* in the
 *     factory — they belong at the same X on the canvas, just on opposite
 *     sides of the aisle. We bucket stations by `rowIndex` and give every
 *     bucket one X column.
 *
 *   • **Representative codeNo orders the columns.** Modelama PBS sheets
 *     are usually laid out tail-at-top / head-at-bottom (FINAL TABLE up
 *     top, codeNo 1 down low). We sort the row buckets by their smallest
 *     codeNo so the canvas reads line-head → tail left-to-right, which is
 *     the convention everywhere else in the app.
 *
 *   • **Side ⇒ Y row.** `L` sits on the top facing row, `R` on the bottom
 *     facing row, separated by the aisle.
 *
 *   • **codeNo ⇒ seq.** The flow connectors that wire workstations
 *     together still follow codeNo ascending — the snake path the sheet
 *     encodes — independent of X placement.
 *
 * Earlier this used codeNo for X directly, which broke visual fidelity:
 * a sheet row showing L=58 / R=57 (two operators across the aisle from
 * each other) ended up at X=58 and X=57 — two completely different
 * columns. The canvas no longer matched what the user saw in Excel.
 */
export interface PlacedStation extends ImportedStation {
  /** Cell offset within the new line's bounding rect. */
  x: number;
  y: number;
  /** Order along the line, ascending (0 = head, N-1 = tail). */
  seq: number;
}

export interface LayoutPlacement {
  /** Stations with x/y resolved, sorted in flow order (head→tail). */
  stations: PlacedStation[];
  /** Bounding rect width / depth in cells. */
  widthCells: number;
  depthCells: number;
  /** Suggested name for the new SewingLine. */
  lineName: string;
  /** Suggested grouping name carried over from the sheet. */
  deptName: string;
}

const STATION_STRIDE = 3;      // Cells between adjacent stations along X
const AISLE_WIDTH = 4;          // Cells separating the two facing rows

export function placeLayoutStations(parsed: ImportedFloor): LayoutPlacement {
  // 1) Bucket stations by their sheet `rowIndex` so the L and R cells on
  //    the same data row always land at the same X column.
  const byRow = new Map<number, ImportedStation[]>();
  for (const s of parsed.stations) {
    const arr = byRow.get(s.rowIndex);
    if (arr) arr.push(s);
    else byRow.set(s.rowIndex, [s]);
  }

  // 2) Compute one representative codeNo per row (the smaller of the two
  //    sides — that's the one closer to the line head on a snake path).
  //    Rows with no codeNo at all sort to the right edge in original sheet
  //    order — they're things like blank trailers or "FINAL TABLE" stubs
  //    with the codeNo column missing, which conventionally sit at the
  //    tail anyway.
  type RowMeta = { rowIndex: number; rep: number; stations: ImportedStation[] };
  const rowMetas: RowMeta[] = [];
  for (const [rowIndex, stations] of byRow.entries()) {
    const codes = stations
      .map((s) => s.codeNo)
      .filter((c): c is number => c != null);
    const rep = codes.length ? Math.min(...codes) : Number.POSITIVE_INFINITY;
    rowMetas.push({ rowIndex, rep, stations });
  }
  rowMetas.sort((a, b) => {
    if (a.rep === b.rep) return a.rowIndex - b.rowIndex;
    return a.rep - b.rep;
  });

  // 3) Assign every row a column index, then materialise stations at
  //    (col × stride, side-based Y). L on top row, R across the aisle.
  const placed: PlacedStation[] = [];
  rowMetas.forEach((rm, col) => {
    for (const s of rm.stations) {
      placed.push({
        ...s,
        x: col * STATION_STRIDE,
        y: s.side === 'L' ? 0 : AISLE_WIDTH,
        seq: 0, // filled in step 4
      });
    }
  });

  // 4) Flow sequence (`seq`) is driven by codeNo independent of X — that
  //    keeps the connector graph snaking the way the sheet's codeNos
  //    intend. Within a tied codeNo, L precedes R as a deterministic
  //    tiebreaker. Stations missing codeNo go to the end in placement
  //    order.
  const seqOrder = [...placed].sort((a, b) => {
    const ac = a.codeNo ?? Number.POSITIVE_INFINITY;
    const bc = b.codeNo ?? Number.POSITIVE_INFINITY;
    if (ac !== bc) return ac - bc;
    if (a.side !== b.side) return a.side === 'L' ? -1 : 1;
    return 0;
  });
  seqOrder.forEach((s, i) => {
    s.seq = i;
  });

  // 5) Sort the returned list by seq so `commitFloorImport`'s neighbour
  //    wiring (wsIds[i] → wsIds[i+1]) follows the bundle path.
  placed.sort((a, b) => a.seq - b.seq);

  const colCount = Math.max(1, rowMetas.length);
  const widthCells = (colCount - 1) * STATION_STRIDE + 3;
  const depthCells = AISLE_WIDTH + 3;
  const styleLabel = parsed.source.style ?? parsed.source.sheetName ?? 'Imported';
  const lineLabel = parsed.source.lineNo != null ? `Line ${parsed.source.lineNo}` : 'Imported line';

  return {
    stations: placed,
    widthCells,
    depthCells,
    lineName: `${lineLabel} · ${styleLabel}`,
    deptName: `Imported · ${styleLabel}`,
  };
}

// ── Commit ───────────────────────────────────────────────────────────────
/**
 * Materialise a parsed layout into the active Twin as a line that can be
 * RUN, not just looked at.
 *
 * A layout sheet only lists the operator positions. Committing just those
 * left a line the simulator could do nothing with: no Source to feed it, no
 * Sink to count what it made, and every station on the catalogue's generic
 * cycle because nothing tied a station to a bulletin time. It ran a full
 * shift and reported zero pieces. So this writes the whole graph, the same
 * one `buildGarmentTwin` emits for a line built from a bulletin:
 *
 *   Source → station → station → … → Sink, plus the line's operator pool.
 *
 * Every layout position becomes a one-operator Service. That matters for
 * helper tables and check points, whose catalogue defaults (Delay,
 * SelectOutput) would otherwise let work through with no capacity limit or
 * route failures down a branch the import never wires.
 *
 * With a `binding` (see `bind-ob-to-layout`), each matched station also gets
 * its bulletin time baked in. Stations the bulletin does not cover stay on the
 * floor where the sheet drew them but are left OUT of the flow: there is no
 * time for them, and inventing one would move the bottleneck. Without a
 * binding every station stays in the flow at its catalogue cycle — runnable,
 * but generic until operations are assigned.
 *
 * Returns a summary so the caller can surface counts in a toast.
 */
export interface CommittedFloor {
  lineId: string;
  /** Stations read off the sheet (excludes the Source, Sink and pool). */
  workstationCount: number;
  connectorCount: number;
  /** Stations wired into the flow. Equals `workstationCount` unless a
   *  bulletin was bound and some stations had no operation in it. */
  inFlowCount: number;
  /** Feed given to the line's Source, pieces per hour. */
  sourceRatePerHr: number;
}

type TwinStore = ReturnType<typeof useTwin.getState>;

export function commitFloorImport(
  store: TwinStore,
  _parsed: ImportedFloor,
  placement: LayoutPlacement,
  options?: { color?: EntityColorKey; binding?: ObBinding },
): CommittedFloor {
  const color: EntityColorKey = options?.color ?? 'blue';
  // A binding that matched nothing carries no information; importing with it
  // would leave every station out of the flow. Fall back to layout-only.
  const binding = options?.binding && options.binding.matched > 0 ? options.binding : undefined;
  if (binding && binding.opIdByStation.length !== placement.stations.length) {
    throw new Error('The operation binding does not line up with this layout\'s stations.');
  }
  const opById = new Map((binding?.garment.operations ?? []).map((o) => [o.id, o]));
  const boundOp = (i: number) => (binding ? opById.get(binding.opIdByStation[i] ?? '') : undefined);
  const inFlow = (i: number) => !binding || boundOp(i) != null;
  const inFlowCount = placement.stations.filter((_, i) => inFlow(i)).length;

  // Find an empty patch of the grid for the new line — sit it to the right of
  // everything that already exists, with a 4-cell gutter.
  const active = selectActiveTwin(store);
  if (!active) throw new Error('No active twin to import into.');
  // Park the import clear of whatever is already on the floor. With zones
  // gone there is no dept rect to measure, so the right edge of the existing
  // stations is the reference.
  const gutter = 4;
  let originX = 0;
  const originY = 0;
  for (const w of active.workstations) {
    const right = w.position.x + (w.size?.w ?? 1);
    if (right > originX) originX = right;
  }
  if (active.workstations.length > 0) originX += gutter;

  const lineId = store.addLine({
    name: placement.lineName,
    color,
    operatorTarget: inFlowCount,
    garmentId: binding?.garment.id,
  });

  // Inset by 1 cell so the imported block sits clear of whatever it was parked
  // beside, then one more stride so the Source has a column of its own at the
  // head of the line.
  const stationX0 = originX + 1 + STATION_STRIDE;
  const stationY0 = originY + 1;

  // The actions on `store` are stable, but its state is the snapshot taken
  // when the caller read it — re-read to see what the adds just wrote.
  const current = (id: string): Workstation => {
    const ws = selectActiveTwin(useTwin.getState()).workstations.find((w) => w.id === id);
    if (!ws) throw new Error(`Imported workstation ${id} went missing.`);
    return ws;
  };

  // Drop each workstation, remembering the new id so we can wire flow
  // connectors between them afterwards.
  const wsIds: string[] = [];
  placement.stations.forEach((s, i) => {
    const id = store.addWorkstation({
      lineId,
      catalogId: s.catalogId,
      position: { x: stationX0 + s.x, y: stationY0 + s.y },
      name: s.name,
    });
    const ws = current(id);
    const op = boundOp(i);
    const patch: Partial<Omit<Workstation, 'id'>> = { lineId };
    if (op) {
      // Bake the bulletin time into the block, exactly as `buildGarmentTwin`
      // does, so the run and the analytical model read the same cycle and the
      // same service distribution.
      patch.block = {
        ...(ws.block ?? {}),
        kind: 'Service',
        params: {
          ...(ws.block?.params ?? {}),
          cycleS: op.smv * 60,
          servers: 1,
          queueCapacity: op.queueCapacity ?? 0,
          cycleDist: op.serviceDistribution ?? defaultDist(op.smv),
        },
      };
      patch.operation = { ...ws.operation, opId: op.id, garmentId: binding!.garment.id };
      patch.props = { ...ws.props, cycle_s: op.smv * 60, servers: 1 };
      patch.kpiTargets = { ...ws.kpiTargets, capacityPerHr: Math.round(60 / op.smv) };
    } else {
      if (getBlockKind(ws) !== 'Service') patch.block = { ...(ws.block ?? {}), kind: 'Service' };
      if (binding) {
        patch.operation = {
          ...ws.operation,
          freeText: 'No bulletin operation matched this station — left out of the flow',
        };
      }
    }
    store.updateWorkstation(id, patch);
    wsIds.push(id);
  });

  const flowIds = wsIds.filter((_, i) => inFlow(i));

  // Feed the line at a rate its slowest station can hold. Bound stations have
  // their cycle baked above; unbound ones resolve to the catalogue default.
  const slowestMin = flowIds.reduce((m, id) => Math.max(m, getBlockParams(current(id)).cycleS / 60), 0);
  const sourceRatePerHr = slowestMin > 0
    ? Math.max(1, Math.round((60 / slowestMin) * BOTTLENECK_TARGET_RHO))
    : 60;

  const sourceId = store.addWorkstation({
    lineId,
    catalogId: 'buf_in',
    position: { x: originX + 1, y: stationY0 + AISLE_WIDTH / 2 },
    name: 'Source — cut work in',
  });
  store.updateWorkstation(sourceId, {
    lineId,
    block: {
      kind: 'Source',
      params: {
        sourceRatePerHr,
        piecesPerAgent: 1,
        // Poisson arrivals, as on a bulletin-built line: a fixed lattice
        // under-reports queueing against the models the app compares to.
        arrivalDist: { kind: 'exp', mean: 60 / sourceRatePerHr },
      },
    },
    operation: {
      ...current(sourceId).operation,
      freeText: `${sourceRatePerHr} pcs/hr · ${Math.round(BOTTLENECK_TARGET_RHO * 100)}% of bottleneck capacity`,
    },
  });

  const sinkId = store.addWorkstation({
    lineId,
    catalogId: 'buf_out',
    position: { x: stationX0 + placement.widthCells, y: stationY0 + AISLE_WIDTH / 2 },
    name: 'Sink — finished pcs',
  });
  store.updateWorkstation(sinkId, { lineId, block: { kind: 'Sink' } });

  // One operator per station in the flow. Tagged with the same line as the
  // Services it serves — the engine keys pools by line, so a pool on another
  // line would impose no constraint at all.
  const poolId = store.addWorkstation({
    lineId,
    catalogId: pmlFixtureId('ResourcePool'),
    position: { x: originX + 1, y: stationY0 + placement.depthCells + 2 },
    name: `Operators · ${inFlowCount} units`,
  });
  store.updateWorkstation(poolId, {
    lineId,
    block: { kind: 'ResourcePool', params: { capacity: inFlowCount } },
  });

  // Flow connectors Source → head … tail → Sink, skipping stations that are
  // out of the flow so the chain never breaks around them.
  let connectorCount = 0;
  const chain = flowIds.length > 0 ? [sourceId, ...flowIds, sinkId] : [];
  for (let i = 0; i < chain.length - 1; i++) {
    const cid = store.addConnector({
      kind: 'flow',
      fromWsId: chain[i],
      toWsId: chain[i + 1],
    });
    if (cid) connectorCount++;
  }

  return {
    lineId,
    workstationCount: wsIds.length,
    connectorCount,
    inFlowCount: flowIds.length,
    sourceRatePerHr,
  };
}
