/**
 * Apparel-IE KPI formulas. The names and definitions match the convention
 * used in industrial-engineering textbooks (Glock & Kunz, Roy Chowdhury,
 * etc.) so output matches what an apparel IE engineer expects to see.
 */

import type { Operation } from './operations';

/** Total SAM (sum of operation SMVs) for a bulletin. */
export function totalSam(ops: Operation[]): number {
  return ops.reduce((s, o) => s + o.smv, 0);
}

/**
 * Line efficiency % = (produced pieces × SAM) / (operators × work-minutes) × 100
 * The most-watched single number on an apparel shop floor.
 */
export function lineEfficiency(opts: {
  producedPieces: number;
  sam: number;
  operators: number;
  workMinutes: number;
}): number {
  const denom = opts.operators * opts.workMinutes;
  return denom > 0 ? ((opts.producedPieces * opts.sam) / denom) * 100 : 0;
}

/**
 * Balance loss % = (Σ(longestStation - station_i) / (operators × longestStation)) × 100
 * Captures how much idle time the line carries because of an unbalanced bulletin.
 * 0% = perfectly balanced, no slack. >25% is generally considered poor.
 */
export function balanceLoss(stationSmvs: number[]): number {
  if (stationSmvs.length === 0) return 0;
  const longest = Math.max(...stationSmvs);
  if (longest === 0) return 0;
  const idleSum = stationSmvs.reduce((s, v) => s + (longest - v), 0);
  return (idleSum / (stationSmvs.length * longest)) * 100;
}

/**
 * Line balance ratio (LBR) % = (sumOfStationSmvs / (longestStation × operators)) × 100
 * The complement of balance loss; sometimes reported instead.
 */
export function lineBalanceRatio(stationSmvs: number[]): number {
  if (stationSmvs.length === 0) return 0;
  const longest = Math.max(...stationSmvs);
  if (longest === 0) return 0;
  const sum = stationSmvs.reduce((s, v) => s + v, 0);
  return (sum / (stationSmvs.length * longest)) * 100;
}

/**
 * Takt time (min/piece) = available work-minutes ÷ daily demand
 * The pace at which the line must produce to hit demand.
 */
export function taktTime(opts: { workMinutesPerShift: number; demandPerShift: number }): number {
  return opts.demandPerShift > 0 ? opts.workMinutesPerShift / opts.demandPerShift : 0;
}

/**
 * 100% target / hour for an operator on one operation = 60 / SMV.
 * For the line, use the longest station SMV.
 */
export function hourlyTarget(smv: number, efficiencyPct = 100): number {
  return smv > 0 ? (60 / smv) * (efficiencyPct / 100) : 0;
}

/**
 * SAM consumed = produced × SAM. Total earned minutes by the line in a period.
 */
export function samConsumed(producedPieces: number, sam: number): number {
  return producedPieces * sam;
}

/**
 * Output per operator-hour — the cleanest cross-line productivity measure.
 */
export function outputPerOperatorHour(opts: {
  producedPieces: number;
  operators: number;
  hours: number;
}): number {
  const denom = opts.operators * opts.hours;
  return denom > 0 ? opts.producedPieces / denom : 0;
}

/**
 * Cost per piece given materials, direct labor, and overhead.
 */
export function costPerPiece(opts: {
  materialUsd: number;
  laborUsd: number;
  overheadUsd: number;
}): number {
  return opts.materialUsd + opts.laborUsd + opts.overheadUsd;
}

/**
 * Composite layout-comparison score, taken from the research-paper rubric:
 *   0.30 × normThroughput + 0.20 × (1 - normLeadTime) + 0.20 × (1 - normMHCost)
 *   + 0.15 × normUtilisation + 0.15 × (1 - normWIP)
 *
 * Inputs should already be normalised to 0..1 against the best scenario.
 */
export function compositeLayoutScore(opts: {
  normThroughput: number;
  normLeadTime: number;
  normMaterialHandlingCost: number;
  normUtilisation: number;
  normWip: number;
}): number {
  return (
    0.30 * opts.normThroughput +
    0.20 * (1 - opts.normLeadTime) +
    0.20 * (1 - opts.normMaterialHandlingCost) +
    0.15 * opts.normUtilisation +
    0.15 * (1 - opts.normWip)
  );
}

/**
 * Smoothness Index = √(Σ(CT − ti)²) / (CT × N)
 * Variance of station loads. Lower = smoother. Per Koc & Eryürük 2025 eq. 10.
 * RPW heuristic typically achieves SI in the 0.15–0.25 range on realistic
 * apparel bulletins.
 */
export function smoothnessIndex(stationSmvs: number[], cycleTime: number): number {
  const n = stationSmvs.length;
  if (n === 0 || cycleTime <= 0) return 0;
  const sumSq = stationSmvs.reduce((s, t) => s + (cycleTime - t) ** 2, 0);
  return Math.sqrt(sumSq) / (cycleTime * n);
}

/**
 * Pitch time (seconds per operator per piece) = SAM_garment × 60 / N_operators.
 * The pitch is the per-operator share of the total work content if perfectly
 * balanced. Per Line Balancing textbook p. 9.
 */
export function pitchTime(opts: { sam: number; operators: number }): number {
  return opts.operators > 0 ? (opts.sam * 60) / opts.operators : 0;
}

/**
 * Operator BSI / performance rating % = (production_time × 100) / actual_working_time
 * 100 BSI = on-standard. New operators commonly run 60–75 BSI; senior 100+.
 * Per Koc & Eryürük 2025 eq. 1.
 */
export function bsiPercent(opts: { producedPieces: number; sam: number; workMinutes: number }): number {
  const earned = opts.producedPieces * opts.sam;
  return opts.workMinutes > 0 ? (earned / opts.workMinutes) * 100 : 0;
}

/**
 * Labour requirement (planning) =
 *   (Total_SAM / 60) × demandPerHour × (100/attendance%) × (100/utilisation%) × (100/BSI%)
 *
 * The textbook formula for staffing to a hourly demand. Worked example from
 * Line Balancing p. 22: 480 pcs/hr × 8.41 SAM/60 × 100/90 × 100/80 × 100/95
 * gives the headcount the line should plan for.
 */
export function labourRequired(opts: {
  sam: number;
  demandPerHour: number;
  attendancePct: number;
  utilisationPct: number;
  bsiPct: number;
}): number {
  return (
    (opts.sam / 60) *
    opts.demandPerHour *
    (100 / opts.attendancePct) *
    (100 / opts.utilisationPct) *
    (100 / opts.bsiPct)
  );
}

/**
 * Floater pool size = total_operators × absentee% × (avg_BSI / floater_BSI)
 * Floaters are utility operators (~60 BSI across all ops) used to cover
 * absenteeism. Per Line Balancing textbook p. 24.
 *
 * Example: 25 operators, 8% absentee, avg BSI 90, floater BSI 60
 *  → 25 × 0.08 × (90/60) = 3 floaters needed.
 */
export function floatersRequired(opts: {
  totalOperators: number;
  absenteePct: number;
  avgBsi: number;
  floaterBsi?: number;
}): number {
  const floaterBsi = opts.floaterBsi ?? 60;
  if (floaterBsi <= 0) return 0;
  return opts.totalOperators * (opts.absenteePct / 100) * (opts.avgBsi / floaterBsi);
}

/**
 * First-pass yield = (produced - rejected) / produced.
 * What fraction of pieces went through inspection without needing rework.
 */
export function firstPassYield(opts: { produced: number; rejected: number }): number {
  return opts.produced > 0 ? (opts.produced - opts.rejected) / opts.produced : 1;
}

/**
 * Quality fraction from a good-vs-total split. Synonym of firstPassYield but
 * with the parameter shape the OEE pipeline uses (good, total) rather than
 * (produced, rejected). Returns 1 when total = 0 so OEE doesn't divide by 0
 * on idle shifts.
 */
export function qualityFromYield(opts: { goodPieces: number; totalPieces: number }): number {
  return opts.totalPieces > 0 ? opts.goodPieces / opts.totalPieces : 1;
}

/**
 * OEE = Availability × Performance × Quality.
 * Each input is a 0..1 fraction; the product is also 0..1. Multiply by 100
 * for the percentage figure the IE typically reports.
 */
export function oee(opts: { availability: number; performance: number; quality: number }): number {
  return opts.availability * opts.performance * opts.quality;
}

/**
 * Availability fraction for OEE = runtime / planned production time, where
 * planned time = runtime + downtime + changeover. Changeover is split out
 * from generic downtime so the IE can attribute lost minutes to setup vs
 * mechanical failure separately.
 */
export function availabilityFromState(opts: {
  runtimeMin: number;
  downtimeMin: number;
  changeoverMin: number;
}): number {
  const planned = opts.runtimeMin + opts.downtimeMin + opts.changeoverMin;
  return planned > 0 ? opts.runtimeMin / planned : 0;
}

/**
 * Performance fraction for OEE = actual / theoretical throughput. The
 * theoretical throughput is the ideal pace at the bottleneck SMV with no
 * losses — same number `hourlyTarget(bottleneckSmv)` returns.
 */
export function performanceFromThroughput(opts: {
  actualPph: number;
  theoreticalPph: number;
}): number {
  return opts.theoreticalPph > 0 ? opts.actualPph / opts.theoreticalPph : 0;
}

/**
 * On-standard performance % — the apparel-lean synonym for BSI. Earned
 * minutes (produced × SAM) divided by clocked minutes. 100 = on standard.
 * Identical formula to `bsiPercent`; named for engineers who reach for the
 * lean-manufacturing term instead of the IE-textbook one.
 */
export function onStandardPerformance(opts: {
  producedPieces: number;
  sam: number;
  clockedMinutes: number;
}): number {
  return bsiPercent({
    producedPieces: opts.producedPieces,
    sam: opts.sam,
    workMinutes: opts.clockedMinutes,
  });
}

/**
 * Off-standard loss % — minutes burned without earning SAM, expressed as a
 * fraction of total clocked minutes. = (clocked - earned) / clocked × 100.
 * Complements on-standard performance: if BSI = 80, off-standard loss = 20.
 */
export function offStandardLossPct(opts: {
  clockedMinutes: number;
  earnedMinutes: number;
}): number {
  return opts.clockedMinutes > 0
    ? ((opts.clockedMinutes - opts.earnedMinutes) / opts.clockedMinutes) * 100
    : 0;
}

/**
 * Labour productivity = pieces / operator-hour. Identical to
 * `outputPerOperatorHour`; kept under the lean-textbook name so the KPI
 * record reads naturally.
 */
export function labourProductivity(opts: {
  producedPieces: number;
  operators: number;
  hours: number;
}): number {
  return outputPerOperatorHour(opts);
}

/**
 * Demand-takt gap (pieces/hour, signed). Positive = ahead of demand,
 * negative = behind. Lets the IE see at a glance whether the simulated
 * line can meet the order book.
 */
export function demandTaktGap(opts: { actualPph: number; demandPph: number }): number {
  return opts.actualPph - opts.demandPph;
}

/**
 * Intrinsic vs dynamic balance ratio — measures how much of the achieved
 * line-balance ratio comes from the bulletin's natural workload distribution
 * (intrinsic) versus operator skill flex (dynamic).
 *
 * intrinsic = balance assuming every operator runs at nominal speed.
 * dynamic   = balance after applying the skill matrix.
 *
 * A ratio close to 1 means the bulletin itself is well-shaped — most of the
 * balance is intrinsic. A ratio significantly < 1 means the line depends on
 * skill flex to stay balanced (fragile if a strong operator is absent).
 */
export function intrinsicVsDynamicRatio(opts: {
  nominalStationSmvs: number[];
  skillAdjustedStationSmvs: number[];
}): number {
  const intrinsic = lineBalanceRatio(opts.nominalStationSmvs);
  const dynamic = lineBalanceRatio(opts.skillAdjustedStationSmvs);
  return dynamic > 0 ? intrinsic / dynamic : 0;
}

/**
 * Cost per piece from cumulative totals (USD spent ÷ pieces produced).
 * Sibling of `costPerPiece` which sums per-piece inputs already.
 */
export function costPerPieceFromTotals(opts: {
  totalLabourUsd: number;
  totalMaterialUsd: number;
  totalOverheadUsd: number;
  pieces: number;
}): number {
  if (opts.pieces <= 0) return 0;
  return (opts.totalLabourUsd + opts.totalMaterialUsd + opts.totalOverheadUsd) / opts.pieces;
}
