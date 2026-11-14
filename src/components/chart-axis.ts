/**
 * Axis arithmetic shared by the time-series charts: where the ticks go and how
 * they are written. Kept out of the components so two charts on one page can
 * never disagree about what "2h" or a rounded step is.
 */

/** Time steps a clock actually divides on, in model minutes. */
const TIME_STEPS_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440];

/**
 * Time ticks on whole steps — 0h / 2h / 4h / 6h / 8h. Dividing the run into
 * four equal parts instead put the labels wherever the run happened to have
 * reached ("2.7h", "5.3h"), which is a reading nobody takes off an axis. The
 * ladder above is the one a shift is actually spoken in.
 */
export function timeTicks(
  tMin: number,
  tMax: number,
  target = 4,
): { ticks: number[]; stepMin: number } {
  if (!(tMax > tMin)) return { ticks: [tMin], stepMin: 1 };
  const want = (tMax - tMin) / target;
  const stepMin =
    TIME_STEPS_MIN.find((s) => s >= want) ?? TIME_STEPS_MIN[TIME_STEPS_MIN.length - 1];
  const ticks: number[] = [];
  for (let v = Math.ceil(tMin / stepMin) * stepMin; v <= tMax + 1e-6; v += stepMin) ticks.push(v);
  return { ticks: ticks.length ? ticks : [tMin, tMax], stepMin };
}

/** Axis tick label. Whole-hour steps print in hours so "0h" sits under "2h". */
export function fmtTick(t: number, stepMin: number): string {
  if (!Number.isFinite(t)) return '—';
  if (stepMin >= 60) {
    const h = t / 60;
    return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}h`;
  }
  return `${Math.round(t)}m`;
}

/** A model time in prose, to the tenth of an hour: `45m`, `2.5h`. */
export function fmtTime(simMinutes: number): string {
  if (!Number.isFinite(simMinutes)) return '—';
  if (simMinutes < 60) return `${simMinutes.toFixed(0)}m`;
  const h = simMinutes / 60;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}h`;
}

/** A model time to the minute, for a readout taken off one sample: `2h 15m`. */
export function fmtClock(simMinutes: number): string {
  if (!Number.isFinite(simMinutes)) return '—';
  const total = Math.round(simMinutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Step sizes an axis may count in, per decade. Finer than the usual 1-2-5
 *  because `alignedScale` fixes the NUMBER of steps, so the step is the only
 *  thing left to fit the data with — on 1-2-5 alone a series peaking at 0.42
 *  would get a 0–0.8 axis and use half the plot. */
const STEP_LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export interface AlignedScale {
  /** Top of the axis: `intervals × step`, and never below the data. */
  max: number;
  step: number;
  /** Decimals every tick needs so the column reads 0.00 / 0.25 / 0.50, not
   *  0 / 0.25 / 0.5. Precision belongs to the scale, not to each value. */
  decimals: number;
}

/**
 * A zero-based scale with exactly `intervals` equal, rounded steps.
 *
 * Fixing the count is what lets several y-axes share one set of gridlines:
 * with four steps on each, the line that marks 50% on one axis marks exactly
 * two steps on every other, so any gridline can be read off any axis. Axes
 * that pick their own tick counts leave each other's labels floating between
 * the lines.
 */
export function alignedScale(dataMax: number, intervals = 4): AlignedScale {
  if (!(dataMax > 0) || !Number.isFinite(dataMax)) return { max: 1, step: 0.25, decimals: 2 };
  const raw = dataMax / intervals;
  const mag = 10 ** Math.floor(Math.log10(raw));
  // The epsilon forgives float dust: 0.3 / 0.1 is 2.9999999999999996.
  const norm = STEP_LADDER.find((s) => s * mag >= raw * (1 - 1e-9)) ?? 10;
  const step = Number((norm * mag).toPrecision(12));
  return { max: Number((step * intervals).toPrecision(12)), step, decimals: decimalsOf(step) };
}

/** Fewest decimals (up to 4) that write `v` exactly. */
export function decimalsOf(v: number): number {
  for (let d = 0; d < 4; d++) {
    const scaled = v * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d;
  }
  return 4;
}
