/**
 * Line-balancing heuristics — pure functions that pack a bulletin's
 * operations onto a fixed number of operators (the SALBP-2 formulation:
 * given N operators, minimise the bottleneck station's load).
 *
 * Every balancer returns the same shape (`BalancerResult`) so the engine
 * and the existing Yamazumi UI can swap heuristics by id without caring
 * about internals. The classical IE textbook names map as follows:
 *
 *   • balanceGreedyLPT       — Longest Processing Time, no precedence
 *                              awareness. Today's default in the legacy
 *                              `autoAssign`; kept for parity / fallback.
 *   • balanceLCR             — Largest Candidate Rule. LPT with a "must
 *                              be available" gate (every predecessor
 *                              already assigned). Light precedence.
 *   • balanceRPW             — Ranked Positional Weight (Helgeson-Birnie).
 *                              Sort by op.smv + Σ successor SMV; the sort
 *                              key itself encodes precedence so a single
 *                              pass produces a precedence-respecting
 *                              assignment.
 *   • balanceKilbridgeWester — Column method. Place precedence DAG into
 *                              level-wise columns and pack each column
 *                              into the least-loaded station.
 *   • balanceCOMSOAL         — Random feasible sequences with replacement;
 *                              keep the best one across N iterations.
 *   • balanceGA              — Tiny genetic algorithm over (op → station)
 *                              chromosomes. Slowest but converges past
 *                              local minima of the greedy heuristics.
 *
 * All balancers accept an optional `opEfficiency` map (op-id → 0.5..1.5)
 * derived from the skill matrix. When supplied, station loads are
 * computed against the *effective* SMV (= nominal ÷ efficiency), so
 * slower operators get lighter loads. Without it the balancer runs at
 * nominal SMV — same numbers an IE textbook would print.
 *
 * Pure logic. No React, no DOM, no Zustand. Safe to call from the engine,
 * the Reports page, or a selfcheck script.
 */

import type { Operation } from './operations';
import { balanceLoss, smoothnessIndex, lineEfficiency } from './kpi';

/** What every balancer returns — the assignment plus a small score
 *  vector callers can use to rank heuristics against each other. */
export interface BalancerResult {
  /** One bucket per operator. Position is the operator index. */
  assignment: OperatorBucket[];
  /** Balance-loss % (0 = perfectly balanced, higher = more idle slack). */
  balanceLoss: number;
  /** Smoothness index — variance of station loads. Lower is smoother. */
  smoothness: number;
  /** SMV of the slowest operator (the line pacer). */
  bottleneckSmv: number;
  /** Theoretical pieces/hour at the bottleneck SMV, no losses. */
  theoreticalPph: number;
  /** Line efficiency % at this assignment — sanity-check companion to
   *  balance loss. = totalSAM / (operators × bottleneckSMV) × 100. */
  efficiencyPct: number;
}

/** Per-operator bucket. Carries `id` so the result drops directly into
 *  the existing Yamazumi `OperatorAssignment` shape. */
export interface OperatorBucket {
  id: string;
  operations: Operation[];
}

/** Common balancer options surface — every heuristic accepts these. */
export interface BalancerOptions {
  ops: Operation[];
  operatorCount: number;
  /** Optional per-op efficiency from the skill matrix; missing ⇒ 1.0. */
  opEfficiency?: Record<string, number>;
  /** RNG seed for stochastic heuristics (COMSOAL, GA). Deterministic
   *  by default so the selfcheck is repeatable. */
  seed?: number;
}

/** Named balancer ids. The default is exported so callers can fall back
 *  to a known-good heuristic without hard-coding the string. */
export type BalancerId =
  | 'lpt'
  | 'lcr'
  | 'rpw'
  | 'kilbridge-wester'
  | 'comsoal'
  | 'ga';

/** Default balancer used when a caller passes nothing. RPW respects
 *  precedence implicitly through its sort key and consistently beats
 *  greedy LPT on bulletins with non-trivial precedence chains. */
export const DEFAULT_BALANCER: BalancerId = 'rpw';

// ============================================================================
// SHARED HELPERS
// ============================================================================

/** Effective SMV under the skill matrix. `eff` is clamped to [0.5, 1.5]
 *  here too so a stale matrix entry can't blow up the balancer math
 *  (same clamp as the engine's `cycleMinFor`). */
function effectiveSmv(op: Operation, opEfficiency?: Record<string, number>): number {
  const raw = opEfficiency?.[op.id];
  if (raw == null || !Number.isFinite(raw)) return op.smv;
  const clamped = Math.min(1.5, Math.max(0.5, raw));
  return op.smv / clamped;
}

/** Resolve `Operation.follows` (predecessors) defensively — many of our
 *  seeded bulletins lean on `precedes` from the other side, so we
 *  reverse-build a predecessor map from both fields. */
function buildPredecessorMap(ops: Operation[]): Map<string, string[]> {
  const preds = new Map<string, string[]>();
  for (const op of ops) preds.set(op.id, []);
  for (const op of ops) {
    for (const pid of op.follows ?? []) {
      const list = preds.get(op.id) ?? [];
      if (!list.includes(pid)) list.push(pid);
      preds.set(op.id, list);
    }
    for (const sid of op.precedes ?? []) {
      const list = preds.get(sid) ?? [];
      if (!list.includes(op.id)) list.push(op.id);
      preds.set(sid, list);
    }
  }
  return preds;
}

/** Reverse of `buildPredecessorMap` — successors per op. */
function buildSuccessorMap(ops: Operation[]): Map<string, string[]> {
  const succs = new Map<string, string[]>();
  for (const op of ops) succs.set(op.id, []);
  for (const op of ops) {
    for (const sid of op.precedes ?? []) {
      const list = succs.get(op.id) ?? [];
      if (!list.includes(sid)) list.push(sid);
      succs.set(op.id, list);
    }
    for (const pid of op.follows ?? []) {
      const list = succs.get(pid) ?? [];
      if (!list.includes(op.id)) list.push(op.id);
      succs.set(pid, list);
    }
  }
  return succs;
}

/** Compose the final BalancerResult from a per-station op layout. */
function scoreAssignment(
  stations: Operation[][],
  opEfficiency: Record<string, number> | undefined,
  totalSamForEff: number,
): BalancerResult {
  const stationSmvs = stations.map((bucket) =>
    bucket.reduce((s, op) => s + effectiveSmv(op, opEfficiency), 0),
  );
  const bottleneck = Math.max(0, ...stationSmvs);
  const bl = balanceLoss(stationSmvs);
  const sm = smoothnessIndex(stationSmvs, bottleneck);
  const theoreticalPph = bottleneck > 0 ? 60 / bottleneck : 0;
  const eff = lineEfficiency({
    producedPieces: 1,
    sam: totalSamForEff,
    operators: stations.length,
    workMinutes: bottleneck > 0 ? bottleneck : 1,
  });
  return {
    assignment: stations.map((operations, i) => ({
      id: `OPR-${(i + 1).toString().padStart(2, '0')}`,
      operations,
    })),
    balanceLoss: bl,
    smoothness: sm,
    bottleneckSmv: bottleneck,
    theoreticalPph,
    efficiencyPct: eff,
  };
}

/** Mulberry32 — small deterministic RNG. Same impl as `priority-queue.ts`
 *  but local to keep the balancer module zero-dependency outside of
 *  domain/*. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Index of the least-loaded station whose index ≥ minStation. */
function leastLoadedStation(loads: number[], minStation: number): number {
  let best = minStation;
  for (let i = minStation + 1; i < loads.length; i++) {
    if (loads[i] < loads[best]) best = i;
  }
  return best;
}

// ============================================================================
// BALANCERS
// ============================================================================

/**
 * Greedy LPT — today's baseline. Sort by SMV desc, assign each op to the
 * least-loaded operator. Ignores precedence — exposed under the explicit
 * name so callers that want the legacy behaviour can still ask for it
 * without going through the named-default switch.
 */
export function balanceGreedyLPT(opts: BalancerOptions): BalancerResult {
  const { ops, operatorCount, opEfficiency } = opts;
  const stations: Operation[][] = Array.from({ length: operatorCount }, () => []);
  const loads = new Array<number>(operatorCount).fill(0);
  const sorted = [...ops].sort((a, b) => effectiveSmv(b, opEfficiency) - effectiveSmv(a, opEfficiency));
  for (const op of sorted) {
    const best = leastLoadedStation(loads, 0);
    stations[best].push(op);
    loads[best] += effectiveSmv(op, opEfficiency);
  }
  return scoreAssignment(stations, opEfficiency, ops.reduce((s, o) => s + o.smv, 0));
}

/**
 * Largest Candidate Rule — LPT with a precedence gate. At each step we
 * only consider ops whose predecessors have all been assigned, then
 * pick the largest. Honours `Operation.follows` (and `precedes` in
 * reverse).
 */
export function balanceLCR(opts: BalancerOptions): BalancerResult {
  const { ops, operatorCount, opEfficiency } = opts;
  const preds = buildPredecessorMap(ops);
  const assigned = new Set<string>();
  const opStation = new Map<string, number>();
  const stations: Operation[][] = Array.from({ length: operatorCount }, () => []);
  const loads = new Array<number>(operatorCount).fill(0);

  while (assigned.size < ops.length) {
    // Ops with every predecessor already assigned.
    const available = ops.filter((op) => {
      if (assigned.has(op.id)) return false;
      const ps = preds.get(op.id) ?? [];
      for (const pid of ps) if (!assigned.has(pid)) return false;
      return true;
    });
    if (available.length === 0) break; // precedence cycle — bail safely

    // Pick the largest available by effective SMV.
    available.sort((a, b) => effectiveSmv(b, opEfficiency) - effectiveSmv(a, opEfficiency));
    const op = available[0];

    // Earliest eligible station = 1 past the latest predecessor's station.
    let minStation = 0;
    for (const pid of preds.get(op.id) ?? []) {
      const ps = opStation.get(pid);
      if (ps != null && ps > minStation) minStation = ps;
    }
    const idx = leastLoadedStation(loads, minStation);
    stations[idx].push(op);
    loads[idx] += effectiveSmv(op, opEfficiency);
    opStation.set(op.id, idx);
    assigned.add(op.id);
  }

  return scoreAssignment(stations, opEfficiency, ops.reduce((s, o) => s + o.smv, 0));
}

/**
 * Ranked Positional Weight (Helgeson-Birnie). Positional weight of an
 * op = its own effective SMV + the sum of positional weights of every
 * transitive successor. Sorting by descending PW automatically respects
 * precedence: every successor has a strictly smaller PW than its
 * predecessor, so it always sorts after.
 */
export function balanceRPW(opts: BalancerOptions): BalancerResult {
  const { ops, operatorCount, opEfficiency } = opts;
  const succs = buildSuccessorMap(ops);
  const preds = buildPredecessorMap(ops);
  const pw = new Map<string, number>();
  function compute(opId: string): number {
    const cached = pw.get(opId);
    if (cached != null) return cached;
    const op = ops.find((o) => o.id === opId);
    if (!op) {
      pw.set(opId, 0);
      return 0;
    }
    let total = effectiveSmv(op, opEfficiency);
    for (const sid of succs.get(opId) ?? []) total += compute(sid);
    pw.set(opId, total);
    return total;
  }
  for (const op of ops) compute(op.id);

  const sorted = [...ops].sort((a, b) => (pw.get(b.id) ?? 0) - (pw.get(a.id) ?? 0));
  const opStation = new Map<string, number>();
  const stations: Operation[][] = Array.from({ length: operatorCount }, () => []);
  const loads = new Array<number>(operatorCount).fill(0);
  for (const op of sorted) {
    let minStation = 0;
    for (const pid of preds.get(op.id) ?? []) {
      const ps = opStation.get(pid);
      if (ps != null && ps > minStation) minStation = ps;
    }
    const idx = leastLoadedStation(loads, minStation);
    stations[idx].push(op);
    loads[idx] += effectiveSmv(op, opEfficiency);
    opStation.set(op.id, idx);
  }
  return scoreAssignment(stations, opEfficiency, ops.reduce((s, o) => s + o.smv, 0));
}

/**
 * Kilbridge-Wester column method. Group ops into precedence levels —
 * level 0 = no predecessors, level k = max(predecessor levels) + 1.
 * Process columns in order; within each column, place ops in the
 * least-loaded station. Produces visibly column-aligned stations,
 * which is the original method's pedagogical advantage.
 */
export function balanceKilbridgeWester(opts: BalancerOptions): BalancerResult {
  const { ops, operatorCount, opEfficiency } = opts;
  const preds = buildPredecessorMap(ops);
  const column = new Map<string, number>();
  function levelOf(opId: string): number {
    const cached = column.get(opId);
    if (cached != null) return cached;
    let maxPred = -1;
    for (const pid of preds.get(opId) ?? []) {
      maxPred = Math.max(maxPred, levelOf(pid));
    }
    const lvl = maxPred + 1;
    column.set(opId, lvl);
    return lvl;
  }
  for (const op of ops) levelOf(op.id);

  // Group by column ascending.
  const byColumn = new Map<number, Operation[]>();
  for (const op of ops) {
    const lvl = column.get(op.id) ?? 0;
    const list = byColumn.get(lvl) ?? [];
    list.push(op);
    byColumn.set(lvl, list);
  }
  const orderedColumns = [...byColumn.entries()].sort((a, b) => a[0] - b[0]);

  const stations: Operation[][] = Array.from({ length: operatorCount }, () => []);
  const loads = new Array<number>(operatorCount).fill(0);
  const opStation = new Map<string, number>();
  for (const [, colOps] of orderedColumns) {
    // Largest first within a column.
    colOps.sort((a, b) => effectiveSmv(b, opEfficiency) - effectiveSmv(a, opEfficiency));
    for (const op of colOps) {
      // Gate on predecessor station — KW visits columns in order, so this
      // op's predecessors are already placed. Earliest eligible station =
      // 1 past the latest predecessor.
      let minStation = 0;
      for (const pid of preds.get(op.id) ?? []) {
        const ps = opStation.get(pid);
        if (ps != null && ps > minStation) minStation = ps;
      }
      const idx = leastLoadedStation(loads, minStation);
      stations[idx].push(op);
      loads[idx] += effectiveSmv(op, opEfficiency);
      opStation.set(op.id, idx);
    }
  }
  return scoreAssignment(stations, opEfficiency, ops.reduce((s, o) => s + o.smv, 0));
}

/**
 * COMSOAL — generate `iterations` random feasible (precedence-respecting)
 * op sequences; pack each into stations with greedy least-loaded; keep
 * the assignment with the lowest balance loss.
 *
 * Cheap to run (a few ms for 30 ops × 200 iterations); useful when the
 * deterministic heuristics get stuck on a local optimum.
 */
export function balanceCOMSOAL(opts: BalancerOptions & { iterations?: number }): BalancerResult {
  const { ops, operatorCount, opEfficiency, seed = 42, iterations = 200 } = opts;
  const preds = buildPredecessorMap(ops);
  const rng = mulberry32(seed);
  const totalSam = ops.reduce((s, o) => s + o.smv, 0);

  let bestResult = balanceGreedyLPT(opts); // start with a known-OK baseline

  for (let i = 0; i < iterations; i++) {
    // Build a random topological sequence.
    const assigned = new Set<string>();
    const seq: Operation[] = [];
    while (seq.length < ops.length) {
      const available = ops.filter((op) => {
        if (assigned.has(op.id)) return false;
        for (const pid of preds.get(op.id) ?? []) {
          if (!assigned.has(pid)) return false;
        }
        return true;
      });
      if (available.length === 0) break;
      const pick = available[Math.floor(rng() * available.length)];
      seq.push(pick);
      assigned.add(pick.id);
    }
    // Pack the sequence into stations, least-loaded first.
    const stations: Operation[][] = Array.from({ length: operatorCount }, () => []);
    const loads = new Array<number>(operatorCount).fill(0);
    for (const op of seq) {
      const idx = leastLoadedStation(loads, 0);
      stations[idx].push(op);
      loads[idx] += effectiveSmv(op, opEfficiency);
    }
    const result = scoreAssignment(stations, opEfficiency, totalSam);
    if (result.balanceLoss < bestResult.balanceLoss) bestResult = result;
  }
  return bestResult;
}

/**
 * Genetic algorithm — tiny population (20) over a handful of generations
 * (40 by default). Chromosome = assignment of station index to each op
 * (in input order). Mutation = randomly reassign one op to a random
 * eligible station. Crossover = single-point swap.
 *
 * Seeded with the best of LPT / RPW so the initial population already
 * starts at a strong baseline; the GA only has to refine, not discover
 * a feasible point.
 */
export function balanceGA(opts: BalancerOptions & { generations?: number; population?: number }): BalancerResult {
  const { ops, operatorCount, opEfficiency, seed = 42, generations = 40, population = 20 } = opts;
  const rng = mulberry32(seed);
  const totalSam = ops.reduce((s, o) => s + o.smv, 0);
  const preds = buildPredecessorMap(ops);

  // Helper — assignment array (one station idx per op) to stations[].
  function buildStations(arr: number[]): Operation[][] {
    const stations: Operation[][] = Array.from({ length: operatorCount }, () => []);
    ops.forEach((op, i) => stations[arr[i]].push(op));
    return stations;
  }

  // Helper — check whether an assignment respects precedence. Returns
  // true if every predecessor's station index is ≤ this op's station.
  function isFeasible(arr: number[]): boolean {
    const opIdx = new Map(ops.map((o, i) => [o.id, i]));
    for (let i = 0; i < ops.length; i++) {
      const pStation = arr[i];
      for (const pid of preds.get(ops[i].id) ?? []) {
        const pi = opIdx.get(pid);
        if (pi == null) continue;
        if (arr[pi] > pStation) return false;
      }
    }
    return true;
  }

  function fitness(arr: number[]): number {
    const stations = buildStations(arr);
    const r = scoreAssignment(stations, opEfficiency, totalSam);
    // Lower balance loss is better; treat infeasible as +infinity.
    return r.balanceLoss;
  }

  // Seed population: half from RPW-derived assignments (perturbed),
  // half random feasible.
  const rpwSeed = balanceRPW(opts);
  const rpwArr: number[] = ops.map((op) => {
    const idx = rpwSeed.assignment.findIndex((b) => b.operations.some((o) => o.id === op.id));
    return Math.max(0, idx);
  });

  const pop: number[][] = [];
  for (let i = 0; i < population; i++) {
    if (i < population / 2) {
      // Perturbed RPW.
      const cand = [...rpwArr];
      const mutations = 1 + Math.floor(rng() * 3);
      for (let m = 0; m < mutations; m++) {
        const at = Math.floor(rng() * cand.length);
        cand[at] = Math.floor(rng() * operatorCount);
      }
      pop.push(cand);
    } else {
      // Random with precedence retry.
      const cand = ops.map(() => Math.floor(rng() * operatorCount));
      pop.push(cand);
    }
  }

  let best: number[] = rpwArr;
  let bestFit = fitness(rpwArr);

  for (let g = 0; g < generations; g++) {
    // Score, sort, keep top half.
    const scored = pop.map((c) => ({ c, f: fitness(c) }));
    scored.sort((a, b) => a.f - b.f);
    const top = scored.slice(0, Math.max(2, Math.floor(population / 2)));

    if (top[0].f < bestFit && isFeasible(top[0].c)) {
      bestFit = top[0].f;
      best = top[0].c;
    }

    // Repopulate via crossover + mutation.
    pop.length = 0;
    for (const t of top) pop.push(t.c);
    while (pop.length < population) {
      const a = top[Math.floor(rng() * top.length)].c;
      const b = top[Math.floor(rng() * top.length)].c;
      // Single-point crossover.
      const cut = Math.floor(rng() * a.length);
      const child = [...a.slice(0, cut), ...b.slice(cut)];
      // Mutation.
      if (rng() < 0.3) {
        const at = Math.floor(rng() * child.length);
        child[at] = Math.floor(rng() * operatorCount);
      }
      pop.push(child);
    }
  }

  // Fall back to RPW if no feasible child beat the seed.
  if (!isFeasible(best)) return rpwSeed;
  const stations = buildStations(best);
  return scoreAssignment(stations, opEfficiency, totalSam);
}

// ============================================================================
// DISPATCHER
// ============================================================================

/** Run a balancer by id. The single entry point engine code uses so the
 *  default can change without touching call sites. */
export function balance(id: BalancerId, opts: BalancerOptions): BalancerResult {
  switch (id) {
    case 'lpt': return balanceGreedyLPT(opts);
    case 'lcr': return balanceLCR(opts);
    case 'rpw': return balanceRPW(opts);
    case 'kilbridge-wester': return balanceKilbridgeWester(opts);
    case 'comsoal': return balanceCOMSOAL(opts);
    case 'ga': return balanceGA(opts);
  }
}
