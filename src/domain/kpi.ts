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
 * Cost per piece given materials, direct labor, overhead and defect cost.
 */
export function costPerPiece(opts: {
  materialUsd: number;
  laborUsd: number;
  overheadUsd: number;
  defectUsd: number;
}): number {
  return opts.materialUsd + opts.laborUsd + opts.overheadUsd + opts.defectUsd;
}

/**
 * Defect rate % = defects / produced × 100. Watch this beside output —
 * factories chasing throughput often see defect rate creep.
 */
export function defectRate(opts: { defects: number; produced: number }): number {
  return opts.produced > 0 ? (opts.defects / opts.produced) * 100 : 0;
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
