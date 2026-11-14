/**
 * Replication fixture — the T-shirt line of
 *
 *   Rahman, S M A., Rahman, M F., Kamal, T., Tseng, T-L. (2023). "A
 *   Simulation-Based Approach for Line Balancing Under Demand Uncertainty in
 *   Production Environment". Proc. Winter Simulation Conference, 2020–2030.
 *
 * built as a Stitchworks twin, so the engine can be run against a published
 * AnyLogic model and against an independent reference of the same assumptions
 * (`scripts/replication/rahman2023_reference.py`).
 *
 * NOT product code. Nothing under `src/` outside this folder imports it: the
 * app ships general capabilities, and this is one data set that exercises
 * them. It lives beside the engine only so the replication test and the
 * factory-file exporter can share one definition.
 *
 * ── What the paper leaves open, and what is assumed here ───────────────────
 *  • ORDER. Figure 1, Table 1 and Figure 2 each list the thirteen operations
 *    in a different order. Figure 2 is the model that was actually run, so its
 *    order is used.
 *  • TIMES. Table 1's Min / Max / Mode are output RATES in pieces per minute
 *    (Mode × 60 equals the Capacity column for every row). A piece takes
 *    1 / X minutes with X ~ Triangular(min, mode, max).
 *  • THE SECOND JOIN. Figure 2 has no "Sleeve joint" block; an Assembler
 *    called CareLJ sits in that slot and takes the care-label stream. It is
 *    given Table 1's Sleeve joint timing.
 *  • ONE BAD ROW. Sleeve soap tack is printed min 2, max 3, mode 5. See
 *    `SOAP_TACK`.
 *  • WHO COVERS WHAT. "Eleven operators at thirteen workstations" is never
 *    broken down. Two readings are built — see `RahmanReading`.
 */

import type { GarmentTemplate } from '../../domain/garments';
import type { MachineCode } from '../../domain/machines';
import type { Operation } from '../../domain/operations';
import { pmlFixtureId } from '../../domain/pml';
import { catalogForMachine } from '../../domain/reference-twin';
import {
  DEFAULT_LINE_POLICY,
  TWIN_SCHEMA_VERSION,
  makeWorkstation,
  newAssignmentId,
  newConnectorId,
  newLineId,
  newOperatorId,
  newTwinId,
  type Assignment,
  type Connector,
  type EntityColorKey,
  type Operator,
  type SewingLine,
  type Twin,
  type Workstation,
} from '../../domain/twin';
import { meanOf, type ServiceDist } from '../distributions';

// ============================================================================
// THE PAPER'S NUMBERS
// ============================================================================

/** Standard minute value the paper states for the garment (its Table 2). */
export const RAHMAN_SMV = 5.39;
/** Pieces a day the paper's production manager has to make. */
export const RAHMAN_TARGET = 1600;
/** Pieces each of the three sources releases — the "2,000" on Figure 2. */
export const RAHMAN_LOT = 2000;
/** Release rate. Far above anything the line can take, so it never starves. */
export const RAHMAN_FEED_PER_HR = 6000;

/** Table 2, as printed. `output` at a fixed run length, or 1600 at a measured one. */
export const RAHMAN_TABLE_2 = {
  S1: { operators: 11, operatingMinutes: 5280, output: 919, efficiencyPct: 93.81 },
  S2: { operators: 11, operatingMinutes: 9126, output: 1600, efficiencyPct: 94.5 },
  S3: { operators: 10, operatingMinutes: 9100, output: 1031, efficiencyPct: 61.07 },
  S4: { operators: 10, operatingMinutes: 13100, output: 1600, efficiencyPct: 65.83 },
  S5: { operators: 10, operatingMinutes: 9146, output: 1600, efficiencyPct: 94.29 },
} as const;

export type RahmanStationKey =
  | 'shoulder'
  | 'neckJoint'
  | 'ribTack'
  | 'neckTape'
  | 'mainLabel'
  | 'neckTopSeam'
  | 'sleeveHem'
  | 'sleeveJoint'
  | 'careLabel'
  | 'sideSeam'
  | 'sleeveTack'
  | 'soapTack'
  | 'bodyHem';

interface StationRow {
  key: RahmanStationKey;
  name: string;
  /** Table 1, "Capacity Pcs/Hr". */
  capacityPerHr: number;
  /** Table 1 Min / Mode / Max, read as pieces per minute. */
  rate: readonly [min: number, mode: number, max: number];
  /** The paper names no machines. These are the usual ones for the operation,
   *  and only decide which glyph the floor draws. */
  machineCode: MachineCode;
  /** This operation joins a side stream to the garment before it is sewn. */
  joins?: 'label' | 'careLabel';
}

/** Figure 2 order, Table 1 timing. */
export const RAHMAN_STATIONS: readonly StationRow[] = [
  { key: 'shoulder',    name: 'Shoulder joint',   capacityPerHr: 300, rate: [3, 5, 6], machineCode: '4OL' },
  { key: 'neckJoint',   name: 'Neck joint',       capacityPerHr: 120, rate: [2, 2, 3], machineCode: '4OL' },
  { key: 'ribTack',     name: 'Rib tack',         capacityPerHr: 180, rate: [2, 3, 5], machineCode: 'SNL' },
  { key: 'neckTape',    name: 'Neck tape joint',  capacityPerHr: 120, rate: [1, 2, 3], machineCode: 'SNL' },
  { key: 'mainLabel',   name: 'Main label joint', capacityPerHr: 250, rate: [2, 4, 5], machineCode: 'SNL', joins: 'label' },
  // "NecktapeSim" on Figure 2 — the block the paper's text calls "Neck tape
  // seam" and brackets with time-measure blocks.
  { key: 'neckTopSeam', name: 'Neck top seam',    capacityPerHr: 130, rate: [2, 2, 4], machineCode: 'FL' },
  { key: 'sleeveHem',   name: 'Sleeve hem',       capacityPerHr: 90,  rate: [1, 2, 4], machineCode: 'FL' },
  // "CareLJ" on Figure 2.
  { key: 'sleeveJoint', name: 'Sleeve joint',     capacityPerHr: 120, rate: [2, 2, 3], machineCode: '4OL', joins: 'careLabel' },
  { key: 'careLabel',   name: 'Care label joint', capacityPerHr: 300, rate: [3, 5, 6], machineCode: 'SNL' },
  { key: 'sideSeam',    name: 'Side seam',        capacityPerHr: 130, rate: [1, 2, 4], machineCode: '4OL' },
  { key: 'sleeveTack',  name: 'Sleeve tack',      capacityPerHr: 350, rate: [4, 6, 7], machineCode: 'SNL' },
  { key: 'soapTack',    name: 'Sleeve soap tack', capacityPerHr: 300, rate: [2, 3, 3], machineCode: 'SNL' },
  { key: 'bodyHem',     name: 'Body hem',         capacityPerHr: 110, rate: [2, 2, 3], machineCode: 'FL' },
];

/**
 * Sleeve soap tack is printed with its mode (5) outside its range (2–3), so
 * the row cannot be run as printed. Three repairs, none of them the paper's:
 *
 *   asPrinted  — keep the printed range and pull the mode into it. The default:
 *                it changes the least, and it is the one that lands on the
 *                paper's Scenario 5.
 *   symmetric  — keep the printed range and ignore the mode.
 *   byCapacity — use (3, 5, 6), the triangle the other two 300 pcs/hr rows
 *                carry, on the theory that the range is the misprint.
 */
export type RahmanSoapTack = 'asPrinted' | 'symmetric' | 'byCapacity';
const SOAP_TACK: Record<RahmanSoapTack, readonly [number, number, number]> = {
  asPrinted: [2, 3, 3],
  symmetric: [2, 2.5, 3],
  byCapacity: [3, 5, 6],
};

/**
 * Two ways to seat eleven operators at thirteen workstations.
 *
 *   A — the two stations that sew a label in are timed but unmanned; the other
 *       eleven have one operator each.
 *   B — every station is manned and two operators double up: one on Shoulder
 *       joint + Neck joint (the pair Figure 2 draws with explicit Seize and
 *       Release), one on the last two stations.
 */
export type RahmanReading = 'A' | 'B';

/**
 * Which of the paper's three line set-ups.
 *
 *   base     — Scenarios 1 and 2.
 *   shared34 — Scenarios 3 and 4: Sleeve tack's operator is taken off the
 *              line and the operator of the paired station covers both.
 *   shared5  — Scenario 5: Sleeve tack and Sleeve soap tack under one operator.
 */
export type RahmanConfig = 'base' | 'shared34' | 'shared5';

export interface RahmanOptions {
  reading: RahmanReading;
  config: RahmanConfig;
  soapTack?: RahmanSoapTack;
  /**
   * Which station's operator picks up Sleeve tack in Scenarios 3–4.
   * `seam` (default) is Neck top seam — Figure 2's "NecktapeSim", the block
   * the time-measure pair brackets. `joint` is Neck tape joint, the other
   * candidate for the text's "Neck tape seam".
   */
  pairing?: 'seam' | 'joint';
  /**
   * How that operator divides their time in Scenarios 3–4. `primaryFirst`
   * (default) is the paper's wording: finish the work at your own station,
   * then help. `equal` serves whichever piece has waited longest.
   */
  priority?: 'primaryFirst' | 'equal';
}

// ============================================================================
// BULLETIN
// ============================================================================

export const RAHMAN_GARMENT_ID = 'rahman2023-tshirt';

function rateDist(row: StationRow, soap: RahmanSoapTack): ServiceDist {
  const [min, mode, max] = row.key === 'soapTack' ? SOAP_TACK[soap] : row.rate;
  return { kind: 'triangularRate', min, mode, max };
}

/**
 * The line as an operation bulletin.
 *
 * Table 1 gives a capacity per operation but no SMV, and the paper states one
 * SMV for the whole garment: 5.39 min. Each operation's SMV here is its basic
 * time, 60 / capacity, scaled by the single factor (≈ 1.082) that makes the
 * thirteen add up to 5.39 — so the bulletin's total is the number the paper's
 * efficiency formula uses. The SMV does not drive the run: every station's
 * time is drawn from its rate triangle.
 */
export function rahmanGarment(soap: RahmanSoapTack = 'asPrinted'): GarmentTemplate {
  const basicTotal = RAHMAN_STATIONS.reduce((s, r) => s + 60 / r.capacityPerHr, 0);
  const allowance = RAHMAN_SMV / basicTotal;
  const operations: Operation[] = RAHMAN_STATIONS.map((row, i) => ({
    id: `rh-${row.key}`,
    code: `OP-${String(i + 1).padStart(2, '0')}`,
    name: row.name,
    smv: (60 / row.capacityPerHr) * allowance,
    machineCode: row.machineCode,
    serviceDistribution: rateDist(row, soap),
    servers: 1,
  }));
  return {
    id: RAHMAN_GARMENT_ID,
    name: 'Basic T-shirt (Rahman et al. 2023)',
    description:
      'Thirteen-operation T-shirt line from a Winter Simulation Conference 2023 case study. '
      + 'Times are drawn as the reciprocal of a triangular output rate.',
    operations,
    totalSmv: operations.reduce((s, o) => s + o.smv, 0),
    hourlyTarget100: Math.round((60 / RAHMAN_SMV) * 11),
  };
}

// ============================================================================
// CREW
// ============================================================================

interface CrewMember {
  name: string;
  /** Stations covered. `priority` 1 is served first. */
  stations: { key: RahmanStationKey; priority: number }[];
}

/**
 * Who covers what. A station that appears under no operator is unmanned: it
 * still takes its time, one piece at a time, but nobody is billed for it.
 */
export function rahmanCrew(opts: RahmanOptions): CrewMember[] {
  const { reading, config, pairing = 'seam', priority = 'primaryFirst' } = opts;
  const owned = new Map<RahmanStationKey, { key: RahmanStationKey; priority: number }[]>();
  for (const row of RAHMAN_STATIONS) {
    if (reading === 'A' && row.joins) continue;
    owned.set(row.key, [{ key: row.key, priority: 1 }]);
  }
  const merge = (keep: RahmanStationKey, absorb: RahmanStationKey, absorbPriority = 1) => {
    owned.get(keep)!.push({ key: absorb, priority: absorbPriority });
    owned.delete(absorb);
  };
  const ownerOf = (key: RahmanStationKey): RahmanStationKey => {
    for (const [owner, rows] of owned) if (rows.some((r) => r.key === key)) return owner;
    throw new Error(`rahmanCrew: no operator covers ${key}`);
  };
  /** Take `key` away from whoever has it, dropping an operator left with nothing. */
  const release = (key: RahmanStationKey) => {
    const owner = ownerOf(key);
    const rest = owned.get(owner)!.filter((r) => r.key !== key);
    if (rest.length === 0) owned.delete(owner);
    else owned.set(owner, rest);
  };

  if (reading === 'B') {
    merge('shoulder', 'neckJoint');
    merge('soapTack', 'bodyHem');
  }
  if (config === 'shared34') {
    const primary: RahmanStationKey = pairing === 'seam' ? 'neckTopSeam' : 'neckTape';
    release('sleeveTack');
    owned.get(ownerOf(primary))!.push({
      key: 'sleeveTack',
      priority: priority === 'primaryFirst' ? 2 : 1,
    });
  } else if (config === 'shared5') {
    release('sleeveTack');
    owned.get(ownerOf('soapTack'))!.push({ key: 'sleeveTack', priority: 1 });
  }

  return [...owned.values()].map((stations, i) => ({
    name: `OPR-${String(i + 1).padStart(2, '0')}`,
    stations,
  }));
}

// ============================================================================
// LINE
// ============================================================================

/** Floor rows one line occupies, so several can sit one above another. */
const BAND_ROWS = 14;
const STATIONS_PER_ROW = 7;
const STATION_DX = 3;

interface LineParts {
  line: SewingLine;
  workstations: Workstation[];
  connectors: Connector[];
  operators: Operator[];
  assignments: Assignment[];
  /** Station key → workstation id, for tests that read results per station. */
  wsIdByKey: Record<RahmanStationKey, string>;
  sinkId: string;
}

export function buildRahmanLine(
  opts: RahmanOptions & { name: string; band?: number; color?: EntityColorKey },
): LineParts {
  const soap = opts.soapTack ?? 'asPrinted';
  const band = opts.band ?? 0;
  const y0 = 3 + band * BAND_ROWS;
  const line: SewingLine = {
    id: newLineId(),
    name: opts.name,
    color: opts.color ?? 'blue',
    garmentId: RAHMAN_GARMENT_ID,
    // The paper moves single garments, not bundles.
    policy: { ...DEFAULT_LINE_POLICY, bundleSize: 1, pieceFlow: true },
  };

  const workstations: Workstation[] = [];
  const connectors: Connector[] = [];
  const wire = (fromWsId: string, toWsId: string, toPort?: string) => {
    connectors.push({
      id: newConnectorId(),
      kind: 'flow',
      fromWsId,
      toWsId,
      ...(toPort ? { toPort } : {}),
    });
  };
  const place = (ws: Workstation): Workstation => {
    workstations.push(ws);
    return ws;
  };

  const source = (name: string, x: number, y: number): Workstation => {
    const ws = makeWorkstation({
      lineId: line.id,
      catalogId: pmlFixtureId('Source'),
      position: { x, y },
      name,
    });
    ws.block = {
      kind: 'Source',
      params: {
        sourceRatePerHr: RAHMAN_FEED_PER_HR,
        piecesPerAgent: 1,
        maxArrivals: RAHMAN_LOT,
      },
    };
    ws.resources = { ...ws.resources, workersRequired: 0 };
    return place(ws);
  };

  const crew = rahmanCrew(opts);
  const manned = new Set<RahmanStationKey>(crew.flatMap((m) => m.stations.map((s) => s.key)));

  const wsIdByKey = {} as Record<RahmanStationKey, string>;
  let upstream = source('Input · bodies', 2, y0 + 4).id;

  RAHMAN_STATIONS.forEach((row, i) => {
    // Serpentine: seven stations left to right, the rest back right to left.
    const onFirstRow = i < STATIONS_PER_ROW;
    const col = onFirstRow ? i : STATIONS_PER_ROW - 1 - (i - STATIONS_PER_ROW);
    const x = 5 + col * STATION_DX;
    const y = y0 + (onFirstRow ? 4 : 9);
    const dist = rateDist(row, soap);

    if (row.joins) {
      // A join is two blocks: an Assembler that waits for one garment and one
      // label, then the station that sews the label in. The Assembler sits
      // just before its station; the label source sits off the line beside it.
      const join = makeWorkstation({
        lineId: line.id,
        catalogId: pmlFixtureId('Assembler'),
        position: { x: x - 1.4, y: y + (onFirstRow ? -1.6 : 1.6) },
        name: row.joins === 'label' ? 'Join · main label' : 'Join · care label',
      });
      join.block = { kind: 'Assembler' };
      join.resources = { ...join.resources, workersRequired: 0 };
      place(join);
      const parts = source(
        row.joins === 'label' ? 'Label' : 'CareLabel',
        x - 1.4,
        y + (onFirstRow ? -3.6 : 3.6),
      );
      wire(upstream, join.id, 'parts1');
      wire(parts.id, join.id, 'parts2');
      upstream = join.id;
    }

    const ws = makeWorkstation({
      lineId: line.id,
      catalogId: catalogForMachine(row.machineCode),
      position: { x, y },
      name: `${i + 1}. ${row.name}`,
    });
    ws.block = {
      kind: 'Service',
      params: {
        cycleS: Math.round(meanOf(dist) * 60 * 100) / 100,
        servers: 1,
        cycleDist: dist,
      },
    };
    ws.operation = {
      ...ws.operation,
      opId: `rh-${row.key}`,
      garmentId: RAHMAN_GARMENT_ID,
      bundleSize: 1,
    };
    ws.resources = { ...ws.resources, workersRequired: manned.has(row.key) ? 1 : 0 };
    place(ws);
    wsIdByKey[row.key] = ws.id;
    wire(upstream, ws.id);
    upstream = ws.id;
  });

  const sink = makeWorkstation({
    lineId: line.id,
    catalogId: pmlFixtureId('Sink'),
    position: { x: 5, y: y0 + 9 },
    name: 'Output',
  });
  sink.block = { kind: 'Sink' };
  sink.resources = { ...sink.resources, workersRequired: 0 };
  place(sink);
  wire(upstream, sink.id);

  const operators: Operator[] = [];
  const assignments: Assignment[] = [];
  for (const member of crew) {
    const shared = member.stations.length > 1;
    const opr: Operator = {
      id: newOperatorId(),
      lineId: line.id,
      name: member.name,
      skills: [],
      ...(shared ? { shareMode: 'onDemand' as const } : {}),
    };
    operators.push(opr);
    for (const st of member.stations) {
      assignments.push({
        id: newAssignmentId(),
        operatorId: opr.id,
        wsId: wsIdByKey[st.key],
        role: 'primary',
        // Nominal split, for the surfaces that draw a shared operator. The
        // run ignores it for an on-demand operator.
        shareFrac: 1 / member.stations.length,
        ...(shared ? { priority: st.priority } : {}),
      });
    }
  }

  return { line, workstations, connectors, operators, assignments, wsIdByKey, sinkId: sink.id };
}

// ============================================================================
// TWINS
// ============================================================================

function twinOf(name: string, parts: LineParts[], notes: string): Twin {
  const now = new Date().toISOString();
  return {
    schemaVersion: TWIN_SCHEMA_VERSION,
    id: newTwinId(),
    name,
    parentTwinId: null,
    isCanonical: true,
    createdAt: now,
    modifiedAt: now,
    gridW: 30,
    gridH: 4 + parts.length * BAND_ROWS,
    lines: parts.map((p) => p.line),
    workstations: parts.flatMap((p) => p.workstations),
    connectors: parts.flatMap((p) => p.connectors),
    operators: parts.flatMap((p) => p.operators),
    assignments: parts.flatMap((p) => p.assignments),
    notes,
  };
}

/** One line, one set-up — what the replication test runs. */
export function buildRahmanScenario(opts: RahmanOptions): {
  twin: Twin;
  parts: LineParts;
  garmentsById: Record<string, GarmentTemplate>;
} {
  const parts = buildRahmanLine({ ...opts, name: `Rahman ${opts.reading} · ${opts.config}` });
  const garment = rahmanGarment(opts.soapTack ?? 'asPrinted');
  return {
    twin: twinOf(parts.line.name, [parts], ''),
    parts,
    garmentsById: { [garment.id]: garment },
  };
}

/**
 * The whole study as one factory: the three set-ups as three lines, one above
 * another, so each can be picked as the run's scope. Scenario pairs that share
 * a set-up (1 & 2, 3 & 4) differ only in how the run is stopped.
 */
export function buildRahmanFactory(reading: RahmanReading, soapTack: RahmanSoapTack = 'asPrinted'): {
  twin: Twin;
  garment: GarmentTemplate;
} {
  const lines = [
    buildRahmanLine({
      reading, soapTack, config: 'base', band: 0, color: 'blue',
      name: 'S1 · S2 — 11 operators',
    }),
    buildRahmanLine({
      reading, soapTack, config: 'shared34', band: 1, color: 'red',
      name: 'S3 · S4 — seam + sleeve tack',
    }),
    buildRahmanLine({
      reading, soapTack, config: 'shared5', band: 2, color: 'green',
      name: 'S5 — sleeve tack + soap tack',
    }),
  ];
  const seating =
    reading === 'A'
      ? 'Reading A: the two label-join stations are unmanned; eleven operators, one station each.'
      : 'Reading B: every station manned; two operators double up (Shoulder + Neck joint, Soap tack + Body hem).';
  return {
    twin: twinOf(
      `Rahman 2023 — reading ${reading}`,
      lines,
      `Replication of Rahman, Rahman, Kamal & Tseng (WSC 2023). ${seating} `
        + 'Run S1 and S3 for 480 min; run S2, S4 and S5 with "stop at output" set to 1600.',
    ),
    garment: rahmanGarment(soapTack),
  };
}
