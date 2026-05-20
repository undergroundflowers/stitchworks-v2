/**
 * Excel → GarmentTemplate importer. Reads operation-bulletin spreadsheets in
 * the format used by Modelama, Brandix, and most other ERP-exported
 * production sheets, and converts them into a Stitchworks `GarmentTemplate`
 * with proper `Operation[]` records.
 *
 * Shape we target (rows are 0-indexed):
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ <header / banner rows>                                              │
 *   │                                                                     │
 *   │ Style                  100225286 SHORTS WITH LINING                 │
 *   │ Customer               INC                                          │
 *   │ Description            SHORTS                                       │
 *   │ SMV                    28.781    Total Manpower      35.69          │
 *   │ Machine SMV            24.19                                        │
 *   │ Manual SMV             4.591                                        │
 *   │                                                                     │
 *   │ SeqNo │ OPNO │ Description │ SMV │ Status │ SubSection │ Work-Aid │ │
 *   │ Machine │ Target /Day @100 │ PCS/HR │ Man.Req │ Planned W/S │     │ │
 *   │ Remarks │ IsHelper                                                  │
 *   │                                                                     │
 *   │ <one row per operation, until first all-blank row>                  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * The parser is defensive — it tolerates extra blank rows, merged-cell
 * artifacts (an empty value in the immediate right cell falls through to
 * the next cell), and column-order shuffles (it locates each field by
 * matching the header label, not a fixed index).
 */

import * as XLSX from 'xlsx';
import type { GarmentTemplate, GarmentClass } from '../domain/garments';
import type { Operation, OperationCategory } from '../domain/operations';
import type { MachineCode } from '../domain/machines';
import type { SkillId } from '../domain/workers';

export interface ImportedGarment {
  garment: GarmentTemplate;
  /** Soft warnings the importer surfaced — e.g. an unrecognised machine
   *  code that defaulted to SNL, or a row dropped for missing SMV. */
  warnings: string[];
  /** What we observed in the metadata block above the operations table. */
  source: {
    fileName: string;
    sheetName: string;
    style?: string;
    customer?: string;
    description?: string;
    declaredSmv?: number;
    declaredMachineSmv?: number;
    declaredManualSmv?: number;
    declaredManpower?: number;
    declaredHourlyTarget?: number;
  };
}

/** Header-text → field-id map. Match is normalised (lowercased, spaces and
 *  punctuation removed) so "SeqNo", "Seq No", and "SEQ_NO" all hit the
 *  same key. */
const HEADER_ALIASES: Record<string, keyof OpRowSpec> = {
  seqno: 'seq',
  sequence: 'seq',
  sno: 'seq',
  sl: 'seq',
  slno: 'seq',
  opno: 'code',
  operationno: 'code',
  opcode: 'code',
  code: 'code',
  description: 'name',
  operationdescription: 'name',
  operation: 'name',
  smv: 'smv',
  sam: 'smv',
  smvmin: 'smv',
  status: 'status',
  subsection: 'section',
  section: 'section',
  workaid: 'workAid',
  machine: 'machine',
  machinetype: 'machine',
  worktype: 'machine',
  targetday100: 'target',
  targetday: 'target',
  target: 'target',
  pcshr: 'pcsPerHour',
  pcsperhour: 'pcsPerHour',
  output: 'pcsPerHour',
  manreq: 'manReq',
  manpower: 'manReq',
  plannedws: 'plannedWs',
  plannedworkstations: 'plannedWs',
  ws: 'plannedWs',
  remarks: 'remarks',
  notes: 'remarks',
  ishelper: 'isHelper',
  helper: 'isHelper',
};

interface OpRowSpec {
  seq?: number;
  code?: string;
  name?: string;
  smv?: number;
  status?: string;
  section?: string;
  workAid?: string;
  machine?: string;
  target?: number;
  pcsPerHour?: number;
  manReq?: number;
  plannedWs?: number;
  remarks?: string;
  isHelper?: boolean;
}

// ── Machine vernacular → MachineCode ──────────────────────────────────────
// Order matters: longest/most specific patterns first so "SNLS UBT" doesn't
// match the bare "SN" rule. Each pattern is tested against the cell text
// after lowercasing and collapsing whitespace/punct.
const MACHINE_PATTERNS: { pattern: RegExp; code: MachineCode }[] = [
  // Overlock variants — pick thread count when present
  { pattern: /\b5\s*(?:th|thread|t)?\s*o\s*\/?\s*l/i, code: '5OL' },
  { pattern: /\b4\s*(?:th|thread|t)?\s*o\s*\/?\s*l/i, code: '4OL' },
  { pattern: /\b3\s*(?:th|thread|t)?\s*o\s*\/?\s*l/i, code: '4OL' }, // closest match
  { pattern: /\bover[\s-]*lock|o\/l/i, code: '4OL' },
  // Cover / flatlock / feed of arm
  { pattern: /\b(coverstitch|cover\s*stitch|flat\s*lock|flatlock|fl)\b/i, code: 'FL' },
  { pattern: /\b(feed\s*of\s*arm|foa|fb)\b/i, code: 'FB' },
  { pattern: /\bkansai|ks\b/i, code: 'KS' },
  // Speciality
  { pattern: /\bbutton\s*hole|\bbh\b/i, code: 'BH' },
  { pattern: /\bbutton\s*(sew|stitch|stch|attach)|\bbs\b/i, code: 'BS' },
  { pattern: /\bbar\s*tack|\bbt\b/i, code: 'BT' },
  { pattern: /\b(embroid|emb)\b/i, code: 'EMB' },
  { pattern: /\bcad\b/i, code: 'CAD' },
  { pattern: /\b(cutter|cut\b|straight\s*knife|band\s*knife)/i, code: 'CUT' },
  { pattern: /\bspread/i, code: 'SPR' },
  { pattern: /\bfusing|fuse\b/i, code: 'FUSE' },
  { pattern: /\b(steam\s*tunnel|steam)\b/i, code: 'STEAM' },
  { pattern: /\b(press|iron)\b/i, code: 'PRESS' },
  { pattern: /\b(inspect|qc|aql)/i, code: 'INSP' },
  // Sewing — must come after specific sewing machines like BH/BS/BT/FL
  { pattern: /\bdnl(s|m)?\b|\bdn\b|\bdouble\s*needle/i, code: 'DNL' },
  // SN family: SNL, SNLS, SNEC (electronic), SNEM (electronic motor),
  // SNK / SNCS variants — all collapse to plain SNL for our catalog.
  { pattern: /\bsn(l|e|k|c)\w*\b|\bsn\b|\bsingle\s*needle|\block\s*stitch/i, code: 'SNL' },
  // Fallback manual
  { pattern: /\b(manual|hand|helper|mnl)\b/i, code: 'MNL' },
];

const MACHINE_CATEGORY_TO_OP_CATEGORY: Record<MachineCode, OperationCategory> = {
  SNL: 'sewing', DNL: 'sewing', '4OL': 'sewing', '5OL': 'sewing',
  FL: 'sewing', FB: 'sewing', KS: 'sewing',
  BH: 'sewing', BS: 'sewing', BT: 'sewing',
  EMB: 'embroidery',
  CUT: 'cutting', CAD: 'cutting',
  SPR: 'spreading',
  FUSE: 'fusing',
  PRESS: 'pressing', STEAM: 'pressing',
  INSP: 'inspection',
  MNL: 'manual',
};

const MACHINE_TO_SKILL: Record<MachineCode, SkillId> = {
  SNL: 'stitching', DNL: 'stitching',
  '4OL': 'overlock', '5OL': 'overlock',
  FL: 'flatlock', FB: 'feed_of_arm', KS: 'kansai',
  BH: 'buttonhole', BS: 'button_sew', BT: 'bartack',
  EMB: 'embroidery',
  CUT: 'cutting_manual', CAD: 'cutting_cad',
  SPR: 'spreading',
  FUSE: 'fusing',
  PRESS: 'pressing', STEAM: 'pressing',
  INSP: 'inspection',
  MNL: 'bundling',
};

// ── Public API ────────────────────────────────────────────────────────────
/**
 * Parse an .xlsx / .xls file (or its ArrayBuffer) and produce a draft
 * `GarmentTemplate`. The caller decides whether to persist it.
 */
export function parseGarmentXlsx(input: ArrayBuffer | Uint8Array, fileName = 'imported.xlsx'): ImportedGarment {
  const wb = XLSX.read(input, { type: 'array', cellDates: false });
  // Score every sheet: name-prefer OB-style tabs (a workbook can pack a
  // Layout + an OB on the same file — we need to land on the OB one), then
  // verify the chosen sheet actually has an operations table by probing its
  // header rows. Fall back to "sheet with the most rows" if no preferred
  // tab carries OB data.
  type Candidate = { name: string; rows: unknown[][]; nameScore: number; hasHeader: boolean };
  const candidates: Candidate[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });
    candidates.push({
      name,
      rows,
      nameScore: scoreSheetName(name),
      hasHeader: findOperationsHeaderRow(rows) >= 0,
    });
  }
  if (candidates.length === 0) {
    throw new Error('Workbook has no readable sheets.');
  }
  // Sort: a real OB header trumps a high name score; ties broken by row
  // count so longer tables win over short scrap sheets.
  candidates.sort((a, b) => {
    if (a.hasHeader !== b.hasHeader) return a.hasHeader ? -1 : 1;
    if (a.nameScore !== b.nameScore) return b.nameScore - a.nameScore;
    return b.rows.length - a.rows.length;
  });
  const best = candidates[0];
  if (!best.hasHeader) {
    throw new Error(
      `No operations table found in this workbook. ` +
      `Looked at sheets: ${candidates.map((c) => c.name).join(', ')}.`,
    );
  }
  return parseRows(best.rows, fileName, best.name);
}

/** Sheet-name preference. Higher = more likely to be an OB. */
function scoreSheetName(name: string): number {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (/^ob$/.test(n)) return 100;
  if (/operationbreakdown|opbreakdown|productionob/.test(n)) return 90;
  if (/^operations?$|^opsheet$/.test(n)) return 80;
  if (/balancing|smv|sam/.test(n)) return 70;
  if (/production/.test(n)) return 60;
  if (/^sheet\d+$/.test(n)) return 10;
  if (/layout|critical|nsr|cover|summary|index/.test(n)) return -10;
  return 0;
}

/** Internal — split out so unit tests can hand it a synthetic 2D array. */
export function parseRows(rows: unknown[][], fileName: string, sheetName: string): ImportedGarment {
  const warnings: string[] = [];

  const headerRow = findOperationsHeaderRow(rows);
  if (headerRow < 0) {
    throw new Error('Could not find the operations table header row (needs columns like SeqNo, Description, SMV, Machine).');
  }
  const columnMap = mapColumns(rows[headerRow]);

  const source = readMetadata(rows.slice(0, headerRow));
  source.fileName = fileName;
  source.sheetName = sheetName;

  const ops: Operation[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const parsed = readOpRow(row, columnMap);
    if (!parsed.name || !Number.isFinite(parsed.smv) || (parsed.smv ?? 0) <= 0) {
      // Treat as separator / blank row; if we see 3 in a row, stop.
      if (isBlankRow(row)) {
        // count back through to detect a contiguous blank run; cheaper to
        // just break on the first total-blank row past the table.
        break;
      }
      continue;
    }
    // Skip summary / total rows that some ERP exports leave inline:
    // "Total SMV :", "Sub Total", "Grand Total" — these have a number in
    // the SMV column but aren't real operations.
    if (/^\s*(grand\s*total|sub\s*total|section\s*total|total\s*smv|total\s*sam|total\b\s*:?\s*$)/i.test(parsed.name)) {
      continue;
    }
    const machineCode = resolveMachineCode(parsed.machine ?? '', warnings, parsed.name ?? `op ${ops.length + 1}`);
    const category = MACHINE_CATEGORY_TO_OP_CATEGORY[machineCode];
    const skill = MACHINE_TO_SKILL[machineCode];
    const op: Operation = {
      id: `imp-${slug(parsed.code ?? `${ops.length + 1}`)}-${ops.length + 1}`,
      code: parsed.code,
      name: parsed.name,
      smv: round(parsed.smv ?? 0, 4),
      machineCode,
      skill,
      category,
      notes: composeNotes(parsed),
    };
    ops.push(op);
  }

  if (ops.length === 0) {
    throw new Error('No operations found below the header row.');
  }

  const totalSmv = round(ops.reduce((s, o) => s + o.smv, 0), 3);
  const bottleneck = ops.reduce((m, o) => Math.max(m, o.smv), 0);
  const hourly100 = bottleneck > 0 ? Math.round(60 / bottleneck) : 0;

  const name = source.style?.trim() || source.description?.trim() || stripExt(fileName);

  const garment: GarmentTemplate = {
    id: `imp-${slug(name)}-${Date.now().toString(36)}`,
    name,
    class: guessGarmentClass(source.style, source.description),
    description: composeGarmentDescription(source),
    operations: ops,
    defaultBundleSize: 20,
    totalSmv,
    hourlyTarget100: source.declaredHourlyTarget ?? hourly100,
    bestFor: source.customer ? `Imported from ${source.customer} spec sheet` : `Imported garment`,
  };

  // If the declared SMV is meaningfully different from the sum, warn the
  // user — useful for catching when a row got dropped.
  if (source.declaredSmv && Math.abs(source.declaredSmv - totalSmv) > Math.max(0.5, source.declaredSmv * 0.05)) {
    warnings.push(
      `Declared total SMV (${source.declaredSmv}) differs from sum of operation SMVs (${totalSmv.toFixed(3)}). ` +
      `Check the sheet for skipped rows.`,
    );
  }

  return { garment, warnings, source };
}

// ── Header / column detection ─────────────────────────────────────────────
function findOperationsHeaderRow(rows: unknown[][]): number {
  const want = ['description', 'smv', 'machine'];
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const norm = (rows[r] ?? []).map((c) => normaliseHeaderText(c));
    let hits = 0;
    for (const w of want) if (norm.some((c) => c === w || (c && c.startsWith(w)))) hits++;
    // Need at least description + smv + one of (machine, opno, seqno) on
    // the same row to call it the operations header.
    if (hits >= 3) return r;
    // A weaker fallback — description + smv + an "op no" or "seqno" cell.
    if (hits >= 2 && norm.some((c) => c === 'opno' || c === 'seqno' || c === 'opcode')) return r;
  }
  return -1;
}

function mapColumns(headerRow: unknown[]): Partial<Record<keyof OpRowSpec, number>> {
  const map: Partial<Record<keyof OpRowSpec, number>> = {};
  for (let c = 0; c < headerRow.length; c++) {
    const key = normaliseHeaderText(headerRow[c]);
    if (!key) continue;
    const field = HEADER_ALIASES[key];
    if (field && map[field] === undefined) map[field] = c;
  }
  return map;
}

function readOpRow(row: unknown[], cols: Partial<Record<keyof OpRowSpec, number>>): OpRowSpec {
  const out: OpRowSpec = {};
  if (cols.seq !== undefined) out.seq = toNumber(row[cols.seq]) ?? undefined;
  if (cols.code !== undefined) out.code = toString(row[cols.code]);
  if (cols.name !== undefined) out.name = toString(row[cols.name]);
  if (cols.smv !== undefined) out.smv = toNumber(row[cols.smv]) ?? undefined;
  if (cols.status !== undefined) out.status = toString(row[cols.status]);
  if (cols.section !== undefined) out.section = toString(row[cols.section]);
  if (cols.workAid !== undefined) out.workAid = toString(row[cols.workAid]);
  if (cols.machine !== undefined) out.machine = toString(row[cols.machine]);
  if (cols.target !== undefined) out.target = toNumber(row[cols.target]) ?? undefined;
  if (cols.pcsPerHour !== undefined) out.pcsPerHour = toNumber(row[cols.pcsPerHour]) ?? undefined;
  if (cols.manReq !== undefined) out.manReq = toNumber(row[cols.manReq]) ?? undefined;
  if (cols.plannedWs !== undefined) out.plannedWs = toNumber(row[cols.plannedWs]) ?? undefined;
  if (cols.remarks !== undefined) out.remarks = toString(row[cols.remarks]);
  if (cols.isHelper !== undefined) {
    const v = toString(row[cols.isHelper]);
    if (v) out.isHelper = /^y(es)?|true|1$/i.test(v);
  }
  return out;
}

// ── Metadata block above the operations table ────────────────────────────
function readMetadata(headerRows: unknown[][]): ImportedGarment['source'] {
  const src: ImportedGarment['source'] = { fileName: '', sheetName: '' };
  for (let r = 0; r < headerRows.length; r++) {
    const row = headerRows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const label = normaliseHeaderText(row[c]);
      if (!label) continue;
      const valStr = pickNextValue(row, c);
      const valNum = toNumber(valStr);
      if (label === 'style' && valStr) src.style ??= valStr;
      else if (label === 'customer' && valStr) src.customer ??= valStr;
      else if (label === 'description' && valStr) src.description ??= valStr;
      else if (label === 'smv' && valNum) src.declaredSmv ??= valNum;
      else if (label === 'machinesmv' && valNum) src.declaredMachineSmv ??= valNum;
      else if (label === 'manualsmv' && valNum) src.declaredManualSmv ??= valNum;
      else if (label === 'totalmanpower' && valNum) src.declaredManpower ??= valNum;
      else if (label === 'outputhour100' && valNum) src.declaredHourlyTarget ??= valNum;
      else if (label === 'oph' && valNum) src.declaredHourlyTarget ??= valNum;
    }
  }
  return src;
}

function pickNextValue(row: unknown[], from: number): string | undefined {
  // Walk forward up to 5 cells looking for a non-empty value (merged cells
  // come through as nulls between label and value).
  for (let c = from + 1; c < Math.min(row.length, from + 6); c++) {
    const v = toString(row[c]);
    if (v) return v;
  }
  return undefined;
}

// ── Machine resolution ────────────────────────────────────────────────────
function resolveMachineCode(raw: string, warnings: string[], opLabel: string): MachineCode {
  const cleaned = (raw ?? '').toString().trim();
  if (!cleaned) {
    warnings.push(`Op "${opLabel}" has no machine column — defaulted to MNL.`);
    return 'MNL';
  }
  for (const { pattern, code } of MACHINE_PATTERNS) {
    if (pattern.test(cleaned)) return code;
  }
  warnings.push(`Op "${opLabel}" has unrecognised machine "${cleaned}" — defaulted to SNL.`);
  return 'SNL';
}

// ── Generic helpers ───────────────────────────────────────────────────────
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

function isBlankRow(row: unknown[]): boolean {
  return !row.some((c) => toString(c));
}

function round(n: number, digits: number): number {
  const k = Math.pow(10, digits);
  return Math.round(n * k) / k;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'op';
}

function stripExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function composeNotes(p: OpRowSpec): string | undefined {
  const bits: string[] = [];
  if (p.section) bits.push(`Section: ${p.section}`);
  if (p.workAid) bits.push(`Work-aid: ${p.workAid}`);
  if (p.remarks) bits.push(p.remarks);
  return bits.length ? bits.join(' · ') : undefined;
}

function composeGarmentDescription(s: ImportedGarment['source']): string {
  const bits: string[] = [];
  if (s.description) bits.push(s.description);
  if (s.customer) bits.push(`Customer: ${s.customer}`);
  if (s.style) bits.push(`Style: ${s.style}`);
  bits.push(`Imported from ${s.fileName}`);
  return bits.join(' · ');
}

function guessGarmentClass(style?: string, description?: string): GarmentClass {
  const t = `${style ?? ''} ${description ?? ''}`.toLowerCase();
  if (/short|trouser|pant|jean|legging|skirt|bottom/.test(t)) return 'bottom';
  if (/jacket|coat|outer|hood|sweat/.test(t)) return 'outerwear';
  if (/dress|gown|frock/.test(t)) return 'dress';
  if (/bag|cap|hat|scarf|belt|accessor/.test(t)) return 'accessory';
  return 'top';
}
