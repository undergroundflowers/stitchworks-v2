/**
 * Apparel-IE KPI formulas. The names and definitions match the convention
 * used in industrial-engineering textbooks (Glock & Kunz, Roy Chowdhury,
 * etc.) so output matches what an apparel IE engineer expects to see.
 */

import type { Operation } from './operations';
import type { ProductionSystem } from './routings';

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

/** A station row may either be a bare SMV (current callers) or a tuple
 *  carrying an explicit `shareFrac` so the balance math can inflate the
 *  effective load when one operator covers N stations. Same rule the PML
 *  engine uses: effective SMV = nominal / shareFrac. */
export type StationLoad = number | { smv: number; shareFrac?: number };

function effectiveSmvForBalance(s: StationLoad): number {
  if (typeof s === 'number') return s;
  const sf = s.shareFrac ?? 1;
  return sf > 0 && sf < 1 ? s.smv / sf : s.smv;
}

/**
 * Balance loss % = (Σ(longestStation - station_i) / (operators × longestStation)) × 100
 * Captures how much idle time the line carries because of an unbalanced bulletin.
 * 0% = perfectly balanced, no slack. >25% is generally considered poor.
 *
 * When a station row carries `shareFrac < 1`, its SMV is inflated by
 * 1/shareFrac before the max is taken — matches engine cycle inflation so
 * the balance KPI doesn't claim "well-balanced" while one operator covers
 * two stations at half-time each.
 */
export function balanceLoss(stationSmvs: StationLoad[]): number {
  if (stationSmvs.length === 0) return 0;
  const effs = stationSmvs.map(effectiveSmvForBalance);
  const longest = Math.max(...effs);
  if (longest === 0) return 0;
  const idleSum = effs.reduce((s, v) => s + (longest - v), 0);
  return (idleSum / (effs.length * longest)) * 100;
}

/**
 * Line balance ratio (LBR) % = (sumOfStationSmvs / (longestStation × operators)) × 100
 * The complement of balance loss; sometimes reported instead. Same shareFrac
 * inflation rule as `balanceLoss`.
 */
export function lineBalanceRatio(stationSmvs: StationLoad[]): number {
  if (stationSmvs.length === 0) return 0;
  const effs = stationSmvs.map(effectiveSmvForBalance);
  const longest = Math.max(...effs);
  if (longest === 0) return 0;
  const sum = effs.reduce((s, v) => s + v, 0);
  return (sum / (effs.length * longest)) * 100;
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
export function smoothnessIndex(stationSmvs: StationLoad[], cycleTime: number): number {
  const n = stationSmvs.length;
  if (n === 0 || cycleTime <= 0) return 0;
  const effs = stationSmvs.map(effectiveSmvForBalance);
  const sumSq = effs.reduce((s, t) => s + (cycleTime - t) ** 2, 0);
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
 * Crew size required to staff a line under a specific production system.
 * The `labourRequired` formula above is system-agnostic — it answers "how
 * much labour is required to hit this demand" but doesn't reflect that
 * different systems STAFF that labour differently:
 *
 *   • PBS / bundle / straight / synchro / UPS / unit_handle — fixed-station
 *     systems, so the crew must cover every operation even when one
 *     operator could in theory handle two short ops. Floor at opCount.
 *   • modular / clump — multi-skilled rotation cells run lean: a 25-op
 *     T-shirt cell typically runs with 5–8 operators, not 25. We size the
 *     cell at ~40 % of opCount, clamped to a realistic 3–8 operator range.
 *   • make_through — one operator owns the whole garment, so crew is
 *     purely throughput-bound (pcs/hr × SAM/60).
 *
 * Returns a positive integer. Callers should pass realistic attendance /
 * utilisation / BSI margins when computing `demandPerHour` upstream.
 */
export function crewSizeFor(opts: {
  productionSystem: ProductionSystem;
  sam: number;
  opCount: number;
  demandPerHour: number;
  attendancePct?: number;
  utilisationPct?: number;
  bsiPct?: number;
}): number {
  const attendancePct = opts.attendancePct ?? 90;
  const utilisationPct = opts.utilisationPct ?? 80;
  const bsiPct = opts.bsiPct ?? 95;
  const basicLabour = labourRequired({
    sam: opts.sam,
    demandPerHour: opts.demandPerHour,
    attendancePct,
    utilisationPct,
    bsiPct,
  });
  switch (opts.productionSystem) {
    case 'make_through':
      // One operator builds the whole garment; total crew = throughput ÷
      // per-operator output rate. With 8 h shifts this collapses to the
      // basic labour estimate without the per-station floor.
      return Math.max(1, Math.ceil(basicLabour));
    case 'modular':
    case 'clump': {
      // Cell-based: 5–8 multi-skilled operators is the literature norm.
      // 40 % of opCount lands a 25-op bulletin at 10 operators; we clamp
      // to the realistic 3–8 range so the recommendation is honest about
      // the cell size constraint.
      const sized = Math.ceil(opts.opCount * 0.4);
      return Math.max(3, Math.min(8, sized));
    }
    case 'PBS':
    case 'bundle':
    case 'straight':
    case 'synchro':
    case 'UPS':
    case 'unit_handle':
    default:
      // Fixed-station: must cover every operation. If demand exceeds the
      // 1:1 ceiling, basic labour wins — that's the multi-shift / parallel
      // station case.
      return Math.max(opts.opCount, Math.ceil(basicLabour));
  }
}

/**
 * Quick gut-check that the chosen production system fits the order's
 * size and complexity. Returns a short, user-facing warning string when
 * the pairing is off, or `null` when the choice is reasonable.
 *
 * Used by the Orders wizard's recommendation card so the user gets a
 * concrete reason to reconsider before they ship. Not exhaustive — covers
 * the common mismatches (too small for PBS, too complex for modular,
 * too high-volume for make-through).
 */
export function systemFeasibilityHint(opts: {
  productionSystem: ProductionSystem;
  qty: number;
  days: number;
  opCount: number;
}): { severity: 'warn' | 'error'; message: string } | null {
  const dailyDemand = opts.qty / Math.max(1, opts.days);
  switch (opts.productionSystem) {
    case 'make_through':
      // One operator per garment caps at roughly 60 pcs/day for a typical
      // 8 min SMV top. Larger orders need a multi-station line.
      if (dailyDemand > 100) {
        return {
          severity: 'warn',
          message:
            'Make-Through scales linearly with operators — large orders saturate the labour pool. Consider Modular or PBS for > 100 pcs/day.',
        };
      }
      return null;
    case 'modular':
    case 'clump':
      // Cells max out around 8 ops; 25-op garments either need a giant
      // (un-rotatable) cell or two cells running in parallel.
      if (opts.opCount > 12) {
        return {
          severity: 'warn',
          message: `${opts.opCount} ops is large for a rotation cell — operators may not stay cross-trained on every station. Consider splitting into two cells or moving to PBS.`,
        };
      }
      return null;
    case 'PBS':
    case 'bundle':
      // PBS pays a setup cost in bundle ticketing + balancing. For short
      // runs that overhead never amortises.
      if (opts.qty < 100) {
        return {
          severity: 'warn',
          message:
            'PBS has a long setup tail (balancing, bundle tickets, line bring-up). Short runs typically suit Make-Through or Modular better.',
        };
      }
      return null;
    case 'synchro':
      if (dailyDemand < 200) {
        return {
          severity: 'warn',
          message:
            'Synchro / takt lines need stable, high demand to keep the belt loaded. Consider Modular for variable mid-volume runs.',
        };
      }
      return null;
    case 'UPS':
    case 'unit_handle':
      if (opts.qty < 500) {
        return {
          severity: 'warn',
          message:
            'UPS / overhead-rail capex is hard to justify on small runs. Consider PBS or Modular.',
        };
      }
      return null;
    default:
      return null;
  }
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
