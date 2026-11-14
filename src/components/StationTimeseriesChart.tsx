/**
 * StationTimeseriesChart — one station's queueing observables over model time
 * (ρ, L, Wq, Lq), all on a single plot. A solid line is what the engine
 * measured; the dashed horizontal line in the same colour is that quantity's
 * closed-form steady-state value from `queueing.ts::analyticalKpis()`. The
 * solid settling onto the dashed is the visual check that sim matches theory.
 *
 * ## Why more than one y-axis
 *
 * The four quantities are in three units: ρ is a share of the shift, L and Lq
 * are bundle counts, Wq is minutes. Drawing them against one scale would be a
 * lie about at least two of them, so each UNIT gets its own axis — the first
 * on the left, the others in gutters on the right — titled with the symbols
 * it measures, in their line colours. L and Lq share the bundles axis, which
 * keeps the one comparison that is physically meaningful (waiting ≤ at
 * station) true on the page.
 *
 * Every axis is cut into the same four rounded steps (`alignedScale`), so one
 * set of gridlines serves all of them: any gridline can be read off any axis.
 *
 * ## Drawn in pixel space
 *
 * This used to be a stretched `1000 × 200` viewBox: no tick could be labelled
 * (text would have come out condensed) and nothing could be measured off it.
 * It is drawn from a measured width now — the same approach as WipSparkline —
 * so text is text, circles are round, and the pointer gets a crosshair that
 * snaps to a real sample and reads every plotted value at that instant.
 *
 * ## Two bases
 *
 * Every quantity can be drawn on either of two bases (`basis`):
 *  - `average` — the running mean from the start of the run up to each point.
 *    This is the estimator queueing theory talks about, so it is the one that
 *    settles onto the dashed target; it is also, by construction, nearly deaf
 *    to anything that happens late in a shift.
 *  - `step` — the mean over each sampling step on its own. This is what the
 *    station was doing during those few minutes, drawn as a staircase because
 *    a step's mean holds for the whole step, not just its last instant.
 *
 * `StationMetricLegend` is the page-level key: when many stations are stacked
 * the legend is said once, and doubles as the switch for which lines to draw.
 */

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { alpha } from '../design/color-utils';
import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';
import type { StationHistoryPoint, StationView } from '../simulation';
import type { QuantityId } from '../simulation/notation';
import { alignedScale, fmtClock, fmtTick, timeTicks, type AlignedScale } from './chart-axis';
import { Sym } from './Sym';

export type StationMetric = 'rho' | 'L' | 'Wq' | 'Lq';

/** The unit a metric is measured in — one y-axis each. */
export type StationScaleId = 'ratio' | 'bundles' | 'minutes';

/** What each plotted point averages over — see "Two bases" above. */
export type StationSeriesBasis = 'average' | 'step';

interface MetricSpec {
  /** The running-average reading, and its per-step counterpart. */
  field: 'utilization' | 'inSystem' | 'meanWqMin' | 'queueLen';
  stepField: 'utilizationStep' | 'inSystemStep' | 'meanWqMinStep' | 'queueLenStep';
  caption: string;
  /** The textbook quantity this line plots. Drives the symbol beside the
   *  caption; see the note in `simulation/notation.ts` on why it is data. */
  quantity: QuantityId;
  tooltip: string;
  /** A token KEY, not a value: `applyVibe` mutates `SW_COLORS` in place, so
   *  the colour has to be looked up at render time. */
  colorKey: 'brand' | 'bobbin' | 'thread' | 'warn';
  scale: StationScaleId;
  /** Formatter for a single reading — the legend, target and hover values. */
  fmt: (v: number) => string;
}

/** Drawing and legend order. */
export const STATION_METRICS: StationMetric[] = ['rho', 'L', 'Wq', 'Lq'];

const METRICS: Record<StationMetric, MetricSpec> = {
  rho: {
    field: 'utilization',
    stepField: 'utilizationStep',
    caption: 'Operator saturation',
    quantity: 'rho',
    tooltip: 'Share of the shift this operator spends sewing. 85%+ sustained marks the slowest station.',
    colorKey: 'brand',
    scale: 'ratio',
    fmt: (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—'),
  },
  L: {
    field: 'inSystem',
    stepField: 'inSystemStep',
    caption: 'Bundles at station',
    quantity: 'L',
    tooltip: 'Every bundle here: being sewn plus waiting.',
    colorKey: 'bobbin',
    scale: 'bundles',
    fmt: (v) => reading(v),
  },
  Wq: {
    field: 'meanWqMin',
    stepField: 'meanWqMinStep',
    caption: 'Bundle wait time',
    quantity: 'Wq',
    tooltip: 'Average minutes a bundle sits on the cart before it is picked up.',
    colorKey: 'thread',
    scale: 'minutes',
    fmt: (v) => `${reading(v)} min`,
  },
  Lq: {
    field: 'queueLen',
    stepField: 'queueLenStep',
    caption: 'Bundles waiting',
    quantity: 'Lq',
    tooltip: 'The pile not yet started: the WIP seen on a floor walk.',
    colorKey: 'warn',
    scale: 'bundles',
    fmt: (v) => reading(v),
  },
};

/**
 * A single reading to about three significant figures. A fixed two decimals
 * printed a 0.6-second wait as `0.01 min` beside a target of `0.01 min` — two
 * values that differ by half again, shown as equal.
 */
function reading(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '—';
  const a = Math.abs(v);
  return v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : a >= 0.1 || a === 0 ? 2 : 3);
}

interface ScaleSpec {
  /** Unit word for the axis title. */
  unit: string;
  /** Axis tick label, at the precision the axis's step needs. */
  tick: (v: number, decimals: number) => string;
  /** How many decimals a tick needs, given the step in data units. */
  tickDecimals: (s: AlignedScale) => number;
}

const SCALE_ORDER: StationScaleId[] = ['ratio', 'bundles', 'minutes'];

const SCALES: Record<StationScaleId, ScaleSpec> = {
  ratio: {
    unit: '% busy',
    tick: (v, d) => `${(v * 100).toFixed(d)}%`,
    // The step is a fraction; the label is a percentage, two decimals coarser.
    tickDecimals: (s) => Math.max(0, s.decimals - 2),
  },
  bundles: {
    unit: 'bundles',
    tick: (v, d) => v.toFixed(d),
    tickDecimals: (s) => s.decimals,
  },
  minutes: {
    unit: 'min',
    tick: (v, d) => v.toFixed(d),
    tickDecimals: (s) => s.decimals,
  },
};

/** One reading off a history point, on the chosen basis. May be `NaN`: a
 *  step in which no bundle started service has no wait to report. */
function valueOf(h: StationHistoryPoint, spec: MetricSpec, basis: StationSeriesBasis): number {
  return h[basis === 'step' ? spec.stepField : spec.field];
}

/** Closed-form targets in the units the history is recorded in.
 *  `queueing.ts` returns Wq in HOURS; the engine records `meanWqMin`. */
function analyticalRefs(station: StationView): Record<StationMetric, number> {
  return {
    rho: station.analytical.rho,
    L: station.analytical.L,
    Wq: station.analytical.Wq * 60,
    Lq: station.analytical.Lq,
  };
}

/**
 * The largest value each unit has to show, across any number of stations:
 * every plotted sample and every finite target. Pass the result as `domain`
 * to put a whole column of charts on the same scales, so heights compare
 * from one station to the next.
 *
 * The ratio axis never drops below 100% — "fully saturated" is the natural
 * ceiling and a ρ of 30% should look like 30% of something.
 */
export function stationScaleDomain(
  stations: StationView[],
  histories: StationHistoryPoint[][],
  metrics: StationMetric[] = STATION_METRICS,
  basis: StationSeriesBasis = 'average',
): Record<StationScaleId, number> {
  const top: Record<StationScaleId, number> = { ratio: 1, bundles: 0, minutes: 0 };
  stations.forEach((station, i) => {
    const refs = analyticalRefs(station);
    for (const m of metrics) {
      const spec = METRICS[m];
      if (Number.isFinite(refs[m])) top[spec.scale] = Math.max(top[spec.scale], refs[m]);
      for (const h of histories[i] ?? []) {
        const v = valueOf(h, spec, basis);
        if (Number.isFinite(v)) top[spec.scale] = Math.max(top[spec.scale], v);
      }
    }
  });
  return top;
}

export interface StationTimeseriesChartProps {
  station: StationView;
  history: StationHistoryPoint[];
  /** Which lines to draw. Defaults to all four. */
  metrics?: StationMetric[];
  /** Running average (default) or the mean of each step on its own. */
  basis?: StationSeriesBasis;
  /** Height of the plot including its axes, excluding the legend. */
  height?: number;
  /** Name each line above the plot, with its current and target value. Turn
   *  it off when a page-level `StationMetricLegend` already says it. */
  legend?: boolean;
  /** Data maxima to scale to, from `stationScaleDomain`. Omit and the chart
   *  fits its own station. */
  domain?: Partial<Record<StationScaleId, number>>;
  /** The colour behind the chart — the ring around each dot is drawn in it. */
  surface?: string;
}

/** Gutter for the left y-axis, and for each y-axis on the right. */
const AXIS_LEFT_W = 46;
const AXIS_RIGHT_W = 48;
/** Top band: holds the axis titles. Bottom band: the time ticks. */
const PAD_TOP = 24;
const PAD_BOTTOM = 22;
const INTERVALS = 4;
/** Width assumed for the first paint, before the observer reports the real one. */
const FALLBACK_W = 640;

export function StationTimeseriesChart({
  station,
  history,
  metrics = STATION_METRICS,
  basis = 'average',
  height = 200,
  legend = true,
  domain,
  surface = SW_COLORS.paper,
}: StationTimeseriesChartProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Namespaces this chart's SVG paint servers: ids are document-wide, and a
  // page stacks dozens of these charts.
  const paintId = useId();
  const [width, setWidth] = useState(FALLBACK_W);
  // Index of the sample under the pointer / keyboard cursor; null when idle.
  const [cursor, setCursor] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const sync = () => setWidth(Math.max(240, el.clientWidth));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const refs = analyticalRefs(station);
  // Canonical order whatever order the caller listed them in, so a line keeps
  // its place in the legend and the draw stack as others are toggled.
  const shown = STATION_METRICS.filter((m) => metrics.includes(m));
  const enough = history.length >= 2;

  const head = legend ? (
    <ChartLegend
      metrics={shown}
      refs={refs}
      basis={basis}
      latest={enough ? history[history.length - 1] : null}
    />
  ) : null;

  if (!enough || shown.length === 0) {
    return (
      <div>
        {head}
        <div
          ref={hostRef}
          style={{
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: SW_FONTS.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.5px',
            color: SW_COLORS.faint,
            border: `1px dashed ${SW_COLORS.line}`,
            borderRadius: SW_RADIUS.sm,
          }}
        >
          {shown.length === 0 ? 'NO LINES SELECTED' : 'WARMING UP — RUN THE SIM TO SEE HISTORY'}
        </div>
      </div>
    );
  }

  // ── Axes: one per unit in play, each on the same number of rounded steps.
  const own = stationScaleDomain([station], [history], shown, basis);
  const read = (h: StationHistoryPoint, m: StationMetric) => valueOf(h, METRICS[m], basis);
  const axes = SCALE_ORDER.filter((id) => shown.some((m) => METRICS[m].scale === id)).map(
    (id, slot) => {
      const scale = alignedScale(Math.max(own[id], domain?.[id] ?? 0), INTERVALS);
      const members = shown.filter((m) => METRICS[m].scale === id);
      return { id, slot, scale, members, decimals: SCALES[id].tickDecimals(scale) };
    },
  );
  const axisOf = (m: StationMetric) => axes.find((a) => a.id === METRICS[m].scale)!;

  const padLeft = AXIS_LEFT_W;
  const padRight = axes.length > 1 ? (axes.length - 1) * AXIS_RIGHT_W : 14;
  const plotW = Math.max(1, width - padLeft - padRight);
  const plotH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);
  const plotRight = padLeft + plotW;
  const plotBottom = PAD_TOP + plotH;

  const tMin = history[0].time;
  const tMax = history[history.length - 1].time;
  const span = Math.max(1e-6, tMax - tMin);
  const xAt = (t: number) => padLeft + ((t - tMin) / span) * plotW;
  const yAt = (m: StationMetric, v: number) => {
    const max = axisOf(m).scale.max;
    // A non-finite sample pins to the axis it ran off rather than poisoning
    // the path with NaN, which would blank the whole line.
    const frac = Number.isFinite(v) ? Math.min(1, Math.max(0, v / max)) : v > 0 ? 1 : 0;
    return PAD_TOP + (1 - frac) * plotH;
  };
  const gridY = (k: number) => PAD_TOP + (1 - k / INTERVALS) * plotH;
  /** Where a right-hand axis stands: slot 1 on the plot edge, slot 2 one gutter out. */
  const axisX = (slot: number) => (slot === 0 ? padLeft : plotRight + (slot - 1) * AXIS_RIGHT_W);

  const { ticks: xTicks, stepMin } = timeTicks(tMin, tMax, plotW > 520 ? 8 : 4);

  // Clamped on read rather than reset by an effect: the series grows every
  // few sim-minutes, and a cursor held past a shrink is a render-time detail.
  const at = cursor == null ? null : Math.min(cursor, history.length - 1);
  const active = at == null ? null : history[at];
  const last = history[history.length - 1];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - box.left - padLeft) / plotW;
    const t = tMin + Math.min(1, Math.max(0, frac)) * span;
    // Snap to the nearest sample: the reader aims at a moment in the run, and
    // every value in the readout is then one the engine actually recorded.
    let best = 0;
    for (let i = 1; i < history.length; i++) {
      if (Math.abs(history[i].time - t) < Math.abs(history[best].time - t)) best = i;
    }
    setCursor(best);
  };

  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setCursor((c) => {
      const from = c ?? history.length - 1;
      return Math.min(history.length - 1, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1)));
    });
  };

  /**
   * One line's path.
   *
   * A running average is a value AT a time, so its points are joined. A step
   * mean is a value OVER a stretch, so it is drawn flat across that stretch
   * and steps to the next — joining step means with sloped segments would
   * claim the station drifted smoothly between two numbers it never passed
   * through. A step with no reading lifts the pen instead of drawing a zero.
   */
  const linePath = (m: StationMetric): string => {
    let d = '';
    let penDown = false;
    for (const h of history) {
      const v = read(h, m);
      if (!Number.isFinite(v)) {
        penDown = false;
        continue;
      }
      const x = xAt(h.time).toFixed(1);
      const y = yAt(m, v).toFixed(1);
      if (basis === 'step') {
        const x0 = xAt(Math.max(tMin, h.stepFrom)).toFixed(1);
        d += penDown ? `V${y}H${x}` : `M${x0} ${y}H${x}`;
      } else {
        d += `${penDown ? 'L' : 'M'}${x} ${y}`;
      }
      penDown = true;
    }
    return d;
  };

  const tickStyle: CSSProperties = {
    fontFamily: SW_FONTS.mono,
    fontSize: 10,
    fontVariantNumeric: 'tabular-nums',
  };
  /**
   * An axis's numbers are written in the colour of the line they measure, so
   * the eye goes from line to scale without the legend. An axis two lines
   * share (L and Lq, both in bundles) is written in BOTH colours — each number
   * split down the middle — because grey said "belongs to nothing" exactly
   * where the answer was "belongs to these two".
   */
  const axisPaintId = (id: StationScaleId) => `${paintId}-${id}`;
  const axisInk = (id: StationScaleId, members: StationMetric[]) =>
    members.length === 1
      ? SW_COLORS[METRICS[members[0]].colorKey]
      : `url(#${CSS.escape(axisPaintId(id))})`;

  const cursorX = at == null ? 0 : xAt(history[at].time);
  const readoutOnLeft = cursorX > padLeft + plotW / 2;

  return (
    <div>
      {head}
      <div ref={hostRef} style={{ position: 'relative', width: '100%' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block', touchAction: 'none', outline: 'none' }}
          role="img"
          tabIndex={0}
          aria-label={
            `${station.opName} over model time. ` +
            shown
              .map(
                (m) =>
                  `${METRICS[m].caption} ${basis === 'step' ? 'in the latest step' : 'averaged so far'} ${METRICS[m].fmt(read(last, m))}`,
              )
              .join(', ')
          }
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
        >
          {/* Shared grid: one line per step, serving every axis at once. */}
          {Array.from({ length: INTERVALS + 1 }, (_, k) => (
            <line
              key={k}
              x1={padLeft}
              x2={plotRight}
              y1={gridY(k)}
              y2={gridY(k)}
              stroke={k === 0 ? SW_COLORS.line : SW_COLORS.gridLine}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          ))}

          {/* Paint for shared axes: equal hard-edged bands, one per line, laid
              across each number's own box. */}
          <defs>
            {axes
              .filter((a) => a.members.length > 1)
              .map((a) => (
                <linearGradient key={a.id} id={axisPaintId(a.id)} x1="0" x2="1" y1="0" y2="0">
                  {a.members.flatMap((m, i) => {
                    const color = SW_COLORS[METRICS[m].colorKey];
                    return [
                      <stop key={`${m}-a`} offset={i / a.members.length} stopColor={color} />,
                      <stop key={`${m}-b`} offset={(i + 1) / a.members.length} stopColor={color} />,
                    ];
                  })}
                </linearGradient>
              ))}
          </defs>

          {/* Y axes: a rule and five tick labels each. */}
          {axes.map((a) => {
            const x = axisX(a.slot);
            const ink = axisInk(a.id, a.members);
            return (
              <g key={a.id}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD_TOP}
                  y2={plotBottom}
                  stroke={SW_COLORS.lineSoft}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                {Array.from({ length: INTERVALS + 1 }, (_, k) => (
                  <text
                    key={k}
                    x={a.slot === 0 ? x - 7 : x + 7}
                    y={gridY(k)}
                    textAnchor={a.slot === 0 ? 'end' : 'start'}
                    dominantBaseline="middle"
                    style={{ ...tickStyle, fill: ink }}
                  >
                    {SCALES[a.id].tick(a.scale.step * k, a.decimals)}
                  </text>
                ))}
              </g>
            );
          })}

          {/* X axis: a tick mark and a label on whole time steps. */}
          {xTicks.map((t) => {
            const x = xAt(t);
            return (
              <g key={t}>
                <line
                  x1={x}
                  x2={x}
                  y1={plotBottom}
                  y2={plotBottom + 4}
                  stroke={SW_COLORS.line}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={x}
                  y={height - 5}
                  // A middle-anchored label at the right end would hang off
                  // the plot into the next axis; it anchors inward instead.
                  textAnchor={x > plotRight - 10 ? 'end' : 'middle'}
                  style={{ ...tickStyle, fill: SW_COLORS.muted }}
                >
                  {fmtTick(t, stepMin)}
                </text>
              </g>
            );
          })}
          <text
            // Hard left of the gutter, clear of the first tick's label.
            x={2}
            y={height - 5}
            textAnchor="start"
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              fill: SW_COLORS.muted,
            }}
          >
            TIME
          </text>

          {/* Targets go underneath, so a converged solid line sits on top of
              its own dashes rather than being cut by another series'. */}
          {shown.map((m) => {
            if (!Number.isFinite(refs[m])) return null;
            const y = yAt(m, refs[m]);
            return (
              <line
                key={m}
                x1={padLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke={alpha(SW_COLORS[METRICS[m].colorKey], 0.75)}
                strokeWidth={1}
                strokeDasharray="5 4"
              />
            );
          })}

          {shown.map((m) => (
            <path
              key={m}
              d={linePath(m)}
              fill="none"
              stroke={SW_COLORS[METRICS[m].colorKey]}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* End dots, ringed in the surface so they clear the lines. */}
          {shown.filter((m) => Number.isFinite(read(last, m))).map((m) => (
            <circle
              key={m}
              cx={xAt(last.time)}
              cy={yAt(m, read(last, m))}
              r={3.25}
              fill={SW_COLORS[METRICS[m].colorKey]}
              stroke={surface}
              strokeWidth={1.5}
            />
          ))}

          {/* Crosshair. Snaps to the nearest sample — see `onMove`. */}
          {active && (
            <g pointerEvents="none">
              <line
                x1={cursorX}
                x2={cursorX}
                y1={PAD_TOP}
                y2={plotBottom}
                stroke={SW_COLORS.muted}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              {shown.filter((m) => Number.isFinite(read(active, m))).map((m) => (
                <circle
                  key={m}
                  cx={cursorX}
                  cy={yAt(m, read(active, m))}
                  r={4}
                  fill={SW_COLORS[METRICS[m].colorKey]}
                  stroke={surface}
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>

        {/* Axis titles: the symbols an axis measures, in their line colours,
            then the unit. HTML rather than SVG text so `<Sym>` can set the
            subscripts. A right-hand title is right-aligned to its own gutter
            and may run left over the empty band above the plot. */}
        {axes.map((a) => (
          <div
            key={a.id}
            style={{
              position: 'absolute',
              top: 2,
              ...(a.slot === 0
                ? { left: 2 }
                : { right: (axes.length - 1 - a.slot) * AXIS_RIGHT_W + 2 }),
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'baseline',
              gap: 5,
              fontFamily: SW_FONTS.mono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: SW_COLORS.muted,
              whiteSpace: 'nowrap',
            }}
          >
            {a.members.map((m) => (
              <Sym
                key={m}
                quantity={METRICS[m].quantity}
                size={11}
                color={SW_COLORS[METRICS[m].colorKey]}
              />
            ))}
            <span>{SCALES[a.id].unit}</span>
          </div>
        ))}

        {/* Readout: every plotted value at the sample under the cursor, with
            its target. It travels with the crosshair — pinned to the far side
            of the plot, the eye had to leave the point to read its value. */}
        {active && (
          <div
            style={{
              position: 'absolute',
              top: PAD_TOP + 4,
              // Beside the crosshair: just right of it, flipping to just left
              // once the cursor is past the middle so it never runs off the
              // plot or covers the points it reads.
              left: readoutOnLeft ? undefined : cursorX + 12,
              right: readoutOnLeft ? width - cursorX + 12 : undefined,
              pointerEvents: 'none',
              padding: '6px 8px',
              borderRadius: SW_RADIUS.sm,
              background: SW_COLORS.paperDeep,
              border: `1px solid ${SW_COLORS.lineSoft}`,
              boxShadow: SW_SHADOWS.float,
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontSize: 10, color: SW_COLORS.muted, marginBottom: 3 }}>
              {basis === 'step'
                ? `${fmtClock(active.stepFrom)} – ${fmtClock(active.time)}`
                : `average up to ${fmtClock(active.time)}`}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto auto auto',
                columnGap: 10,
                rowGap: 1,
                alignItems: 'baseline',
              }}
            >
              {shown.map((m) => {
                const spec = METRICS[m];
                return (
                  <ReadoutRow
                    key={m}
                    spec={spec}
                    value={spec.fmt(read(active, m))}
                    target={refs[m]}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadoutRow({ spec, value, target }: { spec: MetricSpec; value: string; target: number }) {
  return (
    <>
      <Sym quantity={spec.quantity} color={SW_COLORS[spec.colorKey]} />
      <span style={{ fontWeight: 700, color: SW_COLORS.ink, textAlign: 'right' }}>{value}</span>
      <TargetText spec={spec} target={target} />
    </>
  );
}

/** `target 0.42`, or the unstable flag when theory has no steady state. */
function TargetText({ spec, target }: { spec: MetricSpec; target: number }) {
  if (target === Infinity) return <span style={{ color: SW_COLORS.alarm }}>target ∞ (unstable)</span>;
  if (!Number.isFinite(target)) return <span />;
  return <span style={{ color: SW_COLORS.muted }}>target {spec.fmt(target)}</span>;
}

/** Per-chart legend: each line's name, colour, latest value and target. For
 *  a chart standing alone; a stack of charts uses `StationMetricLegend`. */
function ChartLegend({
  metrics,
  refs,
  basis,
  latest,
}: {
  metrics: StationMetric[];
  refs: Record<StationMetric, number>;
  basis: StationSeriesBasis;
  latest: StationHistoryPoint | null;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '6px 14px',
        marginBottom: 8,
      }}
    >
      {metrics.map((m) => {
        const spec = METRICS[m];
        const color = SW_COLORS[spec.colorKey];
        return (
          <div key={m} title={spec.tooltip} style={{ display: 'flex', gap: 8, minWidth: 0 }}>
            <Swatch color={color} style={{ marginTop: 5 }} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: SW_FONTS.mono,
                  fontSize: 10,
                  color: SW_COLORS.muted,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                {spec.caption} <Sym quantity={spec.quantity} bracketed color={color} />
              </div>
              <div
                style={{
                  fontFamily: SW_FONTS.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.4px',
                  color: SW_COLORS.muted,
                  marginTop: 2,
                }}
              >
                {basis === 'step' ? 'latest step' : 'average'}{' '}
                <span style={{ color: SW_COLORS.ink }}>
                  {latest ? spec.fmt(valueOf(latest, spec, basis)) : '—'}
                </span>
                {(Number.isFinite(refs[m]) || refs[m] === Infinity) && ' · '}
                <TargetText spec={spec} target={refs[m]} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Swatch({ color, dashed, style }: { color: string; dashed?: boolean; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        flex: 'none',
        width: 16,
        height: 0,
        borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        ...style,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Page-level pieces — for a column of station charts that share one legend.
// ─────────────────────────────────────────────────────────────────────────

export interface StationMetricLegendProps {
  /** The lines currently drawn. */
  active: StationMetric[];
  /** Called with the next selection. The last line cannot be switched off —
   *  an empty chart answers nothing. */
  onChange: (next: StationMetric[]) => void;
}

/**
 * The key for a stack of station charts, said once — and the switch for which
 * lines they draw. Each chip is a line's colour, name, symbol and unit; click
 * it to take that line off every chart, in any combination.
 */
export function StationMetricLegend({ active, onChange }: StationMetricLegendProps) {
  const toggle = (m: StationMetric) => {
    const next = active.includes(m) ? active.filter((x) => x !== m) : [...active, m];
    if (next.length > 0) onChange(STATION_METRICS.filter((x) => next.includes(x)));
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
      <div
        role="group"
        aria-label="Lines to plot"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          padding: 3,
          background: SW_COLORS.paperDeep,
          border: `1px solid ${SW_COLORS.line}`,
          borderRadius: SW_RADIUS.sm,
        }}
      >
        {STATION_METRICS.map((m) => {
          const spec = METRICS[m];
          const on = active.includes(m);
          const color = SW_COLORS[spec.colorKey];
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(m)}
              title={`${spec.tooltip}\n${on ? 'Click to hide this line.' : 'Click to show this line.'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                border: 'none',
                borderRadius: SW_RADIUS.sm - 2,
                background: on ? SW_COLORS.paper : 'transparent',
                color: on ? SW_COLORS.ink : SW_COLORS.muted,
                fontFamily: SW_FONTS.body,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                opacity: on ? 1 : 0.7,
              }}
            >
              <Swatch color={on ? color : SW_COLORS.faint} />
              <span>
                {spec.caption} <Sym quantity={spec.quantity} bracketed color={on ? color : undefined} />
              </span>
            </button>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          color: SW_COLORS.muted,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Swatch color={SW_COLORS.ink} /> Simulated
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Swatch color={SW_COLORS.ink} dashed /> Theory target
        </span>
      </div>
    </div>
  );
}

export interface StationMetricReadoutProps {
  station: StationView;
  history: StationHistoryPoint[];
  metrics?: StationMetric[];
  basis?: StationSeriesBasis;
}

/**
 * One station's numbers in a line: for each plotted quantity its symbol, the
 * latest value on the chosen basis, and the theory target after the slash. The compact partner to
 * `StationMetricLegend`, which carries the names.
 */
export function StationMetricReadout({
  station,
  history,
  metrics = STATION_METRICS,
  basis = 'average',
}: StationMetricReadoutProps) {
  const refs = analyticalRefs(station);
  const latest = history.length > 0 ? history[history.length - 1] : null;
  return (
    <div
      title={`${basis === 'step' ? 'Mean over the latest step' : 'Average so far'} / steady-state target from queueing theory`}
      style={{
        // One line, always: the station's name and details give way and
        // wrap beneath themselves before a figure drops to a second row.
        display: 'flex',
        flex: 'none',
        justifyContent: 'flex-end',
        gap: 16,
        fontFamily: SW_FONTS.mono,
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {STATION_METRICS.filter((m) => metrics.includes(m)).map((m) => {
        const spec = METRICS[m];
        const ref = refs[m];
        return (
          <span key={m} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
            <Sym quantity={spec.quantity} color={SW_COLORS[spec.colorKey]} />
            <span style={{ fontWeight: 700, color: SW_COLORS.ink }}>
              {latest ? spec.fmt(valueOf(latest, spec, basis)) : '—'}
            </span>
            {ref === Infinity ? (
              <span style={{ color: SW_COLORS.alarm }}>/ ∞</span>
            ) : Number.isFinite(ref) ? (
              <span style={{ color: SW_COLORS.muted }}>/ {spec.fmt(ref)}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
