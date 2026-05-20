/**
 * Balance advisor — pure logic that turns the live Yamazumi state into a
 * prioritised list of "what to fix" suggestions for the Reports balance tab.
 *
 * Inputs come from the same numbers the metrics tier already computes (LBR,
 * LBE, optimum manning, balance loss, smoothness), plus the per-station
 * breakdown so we can name the offending op when suggesting a split.
 *
 * Rules order matters: the highest-severity item should appear first so a
 * scan-reader sees the action they must take, not just background advice.
 * Each suggestion carries:
 *   • severity — drives the colour and ordering.
 *   • title    — one short line the user can read at a glance.
 *   • detail   — the diagnostic numbers behind the title.
 *   • action   — a concrete next step (verb-led).
 *
 * Pure logic. Safe to call from React render, the engine, or a selfcheck.
 */

import type { Operation } from './operations';

/** A station with both its load and the operations stacked on it.
 *  The advisor needs the op breakdown so it can name the heaviest op when
 *  suggesting a split, not just point at "station 3". */
export interface StationBreakdown {
  /** Operator id or station label, used in the suggestion copy. */
  id: string;
  /** Operations on this station — ordered by SMV desc is convenient for
   *  the heaviest-op suggestion but not required. */
  operations: Operation[];
  /** Effective SMV sum after skill / share-fraction adjustments. The
   *  advisor uses this rather than recomputing from operations[] so the
   *  caller stays the source of truth for what "loaded" means. */
  effectiveLoadMin: number;
}

export interface BalanceAdvisorInput {
  /** Per-station breakdown with op stacks. Sorted in operator order. */
  stations: StationBreakdown[];
  /** Total bulletin SAM (sum of operation SMVs) in minutes. */
  totalSam: number;
  /** Operators currently on the line. Same as stations.length when one
   *  operator per station; kept separate so a future shared-station case
   *  reads naturally. */
  operators: number;
  /** Takt the line must hit, in minutes / piece. */
  taktMin: number;
  /** Did the takt come from a committed order or from the bottleneck
   *  fallback? Drives the "commit an order" info item. */
  taktSource: 'order' | 'bottleneck';
  /** Current bottleneck SMV (slowest station, post-balance). */
  bottleneckSmv: number;
  /** LBR % — the fairness metric. */
  lbr: number;
  /** LBE % — capacity-vs-takt metric. */
  lbe: number;
  /** Optimum manning — the theoretical headcount at takt. */
  optimumManning: number;
  /** Balance loss % — complement of LBR, more intuitive to call out
   *  directly in copy ("38 % of paid minutes are idle"). */
  balanceLoss: number;
  /** Smoothness index — variance of station loads, 0 = flat, ~0.25
   *  = visibly uneven on a real bulletin. */
  smoothness: number;
  /** Did the user override the auto-assignment? If true we suggest
   *  reverting to RPW for a fresh take instead of touting balancers. */
  hasManualOverride: boolean;
  /** Bulletin name, for friendly copy ("the T-shirt bulletin"). */
  bulletinName?: string;
}

export type SuggestionSeverity = 'critical' | 'warn' | 'opportunity' | 'info';

export interface BalanceSuggestion {
  /** Stable id so React keys are predictable and rules can be referenced
   *  in tests / docs without depending on the user-visible title string. */
  id: string;
  severity: SuggestionSeverity;
  title: string;
  detail: string;
  /** Verb-led next step, kept under ~140 chars so the row stays compact. */
  action: string;
}

/** Severity rank for sorting — critical first, info last. */
const SEVERITY_RANK: Record<SuggestionSeverity, number> = {
  critical: 0,
  warn: 1,
  opportunity: 2,
  info: 3,
};

/**
 * Run every rule against the input and return the resulting suggestions
 * sorted by severity (critical → info). Rules that do not fire return
 * nothing; the rule order below is only the *evaluation* order, the
 * final sort makes the output deterministic regardless.
 *
 * The advisor is intentionally non-prescriptive about which action the
 * user should take when multiple are available — it surfaces every
 * mismatch it can see and lets the IE choose.
 */
export function suggestBalanceActions(input: BalanceAdvisorInput): BalanceSuggestion[] {
  const out: BalanceSuggestion[] = [];

  // ── Heaviest op + bottleneck station identification ─────────────────────
  // Used by several rules below. Done once up front so each rule can lean
  // on the same data without re-scanning the station array.
  const sortedByLoad = [...input.stations].sort(
    (a, b) => b.effectiveLoadMin - a.effectiveLoadMin,
  );
  const bottleneckStation = sortedByLoad[0];
  const heaviestOpOnBottleneck = bottleneckStation?.operations.reduce<Operation | null>(
    (best, op) => (best == null || op.smv > best.smv ? op : best),
    null,
  );
  const avgLoad =
    input.stations.length > 0
      ? input.stations.reduce((s, st) => s + st.effectiveLoadMin, 0) / input.stations.length
      : 0;

  // ── 1. CRITICAL — Infeasible at takt (LBE > 100) ───────────────────────
  // The slowest station can't keep up with takt no matter how cleanly we
  // re-pack the others. This is the failure case the user must resolve
  // before any other suggestion matters.
  if (input.lbe > 100 + 0.01) {
    const exceedMin = Math.max(0, input.bottleneckSmv - input.taktMin);
    out.push({
      id: 'lbe-infeasible',
      severity: 'critical',
      title: 'Line is infeasible at takt',
      detail:
        `Bottleneck ${input.bottleneckSmv.toFixed(3)} min/pc exceeds takt ` +
        `${input.taktMin.toFixed(3)} min/pc by ${exceedMin.toFixed(3)} min. ` +
        `LBE reads ${input.lbe.toFixed(1)} %; the line will fall behind demand every cycle.`,
      action:
        heaviestOpOnBottleneck
          ? `Split "${heaviestOpOnBottleneck.name}" (${heaviestOpOnBottleneck.smv.toFixed(3)} min) across two stations, OR add operators until manning ≥ ${input.optimumManning}, OR negotiate a longer deadline.`
          : `Add operators until manning ≥ ${input.optimumManning}, OR sub-divide the slowest station's heaviest op, OR negotiate a longer deadline.`,
    });
  }

  // ── 2. CRITICAL — Understaffed for takt ────────────────────────────────
  // Optimum manning is the floor a perfectly-balanced line would land at.
  // If we don't even meet that, no amount of rebalancing can save us.
  // Skip when the LBE-infeasible rule already fired (same root cause,
  // duplicate copy adds noise).
  if (input.optimumManning > input.operators && input.lbe <= 100) {
    const gap = input.optimumManning - input.operators;
    out.push({
      id: 'manning-understaffed',
      severity: 'critical',
      title: `Need ${gap} more operator${gap === 1 ? '' : 's'} to meet takt`,
      detail:
        `Optimum manning is ${input.optimumManning} (= ⌈ΣSAM ${input.totalSam.toFixed(2)} min ÷ takt ${input.taktMin.toFixed(3)} min⌉) ` +
        `but the line is staffed for ${input.operators}. Even a perfect rebalance leaves the bottleneck above takt.`,
      action: `Add ${gap} operator${gap === 1 ? '' : 's'}, OR run a second shift, OR reduce demand until takt ≥ ΣSAM/${input.operators} = ${(input.totalSam / Math.max(1, input.operators)).toFixed(3)} min.`,
    });
  }

  // ── 3. WARN — Poor balance (BL > 25 %) ─────────────────────────────────
  // Classic textbook threshold. 25 % balance loss means a quarter of every
  // operator-paid minute is idle slack.
  if (input.balanceLoss > 25) {
    out.push({
      id: 'balance-loss-high',
      severity: 'warn',
      title: `${input.balanceLoss.toFixed(1)} % of paid operator-minutes are idle`,
      detail:
        `LBR is ${input.lbr.toFixed(1)} %; on a ${input.operators}-operator line that's ` +
        `≈ ${((input.balanceLoss / 100) * input.operators * input.bottleneckSmv).toFixed(2)} idle minutes per piece across the crew. ` +
        `Smoothness index ${input.smoothness.toFixed(3)} (lower is flatter).`,
      action: input.hasManualOverride
        ? 'Click "Reset to auto" to re-run RPW from scratch — your manual override may be carrying historic slack.'
        : 'Try a different balancer (COMSOAL or GA) from the balancer picker, OR drag the heaviest segment off the bottleneck operator manually.',
    });
  }

  // ── 4. WARN — Single station dominates ─────────────────────────────────
  // When the bottleneck is more than ~30 % above the average, one station
  // is doing the lion's share and the rest of the line carries the idle.
  // Suggest splitting the heaviest op on it.
  if (
    bottleneckStation &&
    avgLoad > 0 &&
    bottleneckStation.effectiveLoadMin > avgLoad * 1.3 &&
    heaviestOpOnBottleneck
  ) {
    const overshoot =
      ((bottleneckStation.effectiveLoadMin - avgLoad) / avgLoad) * 100;
    out.push({
      id: 'bottleneck-domination',
      severity: 'warn',
      title: `Station ${bottleneckStation.id} carries ${overshoot.toFixed(0)} % more than average`,
      detail:
        `Load ${bottleneckStation.effectiveLoadMin.toFixed(3)} min vs line average ${avgLoad.toFixed(3)} min. ` +
        `Heaviest op there: "${heaviestOpOnBottleneck.name}" at ${heaviestOpOnBottleneck.smv.toFixed(3)} min.`,
      action: `Either split "${heaviestOpOnBottleneck.name}" into two sub-ops, OR move a lighter op off ${bottleneckStation.id} onto a faster station.`,
    });
  }

  // ── 5. WARN — High smoothness index ────────────────────────────────────
  // SI > 0.20 is empirically the "visibly bumpy Yamazumi" threshold. We
  // skip this rule when balance loss has already fired (same diagnosis
  // from a different angle — don't say it twice).
  if (input.smoothness > 0.2 && input.balanceLoss <= 25) {
    out.push({
      id: 'smoothness-high',
      severity: 'warn',
      title: `Station loads are uneven (SI ${input.smoothness.toFixed(3)})`,
      detail:
        `LBR ${input.lbr.toFixed(1)} % looks acceptable, but the variance behind it is high — some operators are well-loaded and others aren't. ` +
        `Smoothness improves when adjacent stations are within ~10 % of each other.`,
      action: 'Re-run balancer with COMSOAL (stochastic, 200 iterations) or GA for a smoother pack.',
    });
  }

  // ── 6. OPPORTUNITY — Significantly over-staffed vs theoretical floor ──
  // Three operators or more above optimum manning is when it stops being
  // "carry a buffer" and starts being a redeployable headcount surplus.
  if (input.operators - input.optimumManning >= 3 && input.optimumManning > 0) {
    const surplus = input.operators - input.optimumManning;
    out.push({
      id: 'manning-overstaffed',
      severity: 'opportunity',
      title: `${surplus} operators above theoretical floor`,
      detail:
        `Optimum manning is ${input.optimumManning} but the line runs ${input.operators}. ` +
        `Either the bulletin is loose vs takt (extra capacity available) or the balance is dropping pieces an extra operator could absorb.`,
      action: `Either redeploy ${surplus} operators to another line, OR take on a second style on this line, OR tighten takt to absorb the surplus.`,
    });
  }

  // ── 7. INFO — No committed order, takt is bottleneck-paced ─────────────
  // LBE collapses to LBR in this case — worth telling the user once.
  if (input.taktSource === 'bottleneck') {
    out.push({
      id: 'takt-no-order',
      severity: 'info',
      title: 'No committed order — takt is bottleneck-paced',
      detail:
        `Without a demand signal, takt falls back to the bottleneck SMV (${input.bottleneckSmv.toFixed(3)} min). ` +
        'LBE will read the same as LBR until a demand-driven takt arrives.',
      action: 'Commit an order in the Orders wizard — qty / deadlineDays drives takt = SHIFT_MIN / demand.',
    });
  }

  // ── 8. INFO — Manual override in use ───────────────────────────────────
  if (input.hasManualOverride && input.balanceLoss <= 25) {
    out.push({
      id: 'manual-override',
      severity: 'info',
      title: 'Manual Yamazumi override in use',
      detail:
        'You\'ve hand-tuned the assignment; the auto-balancer (RPW) is not running on every change. ' +
        'That\'s fine when you\'re finalising a known-good plan.',
      action: 'Click "Reset to auto" if you want to compare against a fresh RPW pack.',
    });
  }

  // ── 9. INFO — Healthy line (only when nothing else fires) ──────────────
  // Suppresses the "all clear" line when any actionable rule already
  // surfaced. We want a positive signal *only* when the page is genuinely
  // free of issues.
  if (out.length === 0) {
    out.push({
      id: 'healthy',
      severity: 'info',
      title: 'Balance is healthy',
      detail:
        `LBR ${input.lbr.toFixed(1)} %, LBE ${input.lbe.toFixed(1)} %, manning at ${input.optimumManning}/${input.operators}. ` +
        'No structural rebalancing required.',
      action: 'Keep this layout. Consider committing it as a saved scenario for downstream comparison.',
    });
  }

  // Final sort — severity rank then evaluation order (stable).
  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
