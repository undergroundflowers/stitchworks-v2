/**
 * WipSparkline — minimal SVG line chart for line-level WIP (or throughput)
 * over time. Reads `state.history` from the sim engine; each sample is one
 * `HistoryPoint` taken every 5 sim minutes.
 *
 * No axes, no grid — just an area + line + caption. Empty when the engine
 * hasn't run long enough to produce two samples.
 */

import { SW_COLORS, SW_FONTS } from '../design/tokens';
import type { HistoryPoint } from '../simulation';

export interface WipSparklineProps {
  history: HistoryPoint[];
  height?: number;
  yField?: 'wip' | 'throughputPerHr';
}

const W = 1000;          // viewBox width (logical units)
const PAD_X = 6;
const PAD_Y = 8;

export function WipSparkline({ history, height = 80, yField = 'wip' }: WipSparklineProps) {
  if (history.length < 2) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: SW_FONTS.mono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.6px',
          color: SW_COLORS.faint,
          border: `1px dashed ${SW_COLORS.line}`,
          borderRadius: 6,
        }}
      >
        WARMING UP — RUN THE SIM TO SEE WIP HISTORY
      </div>
    );
  }

  const values = history.map((h) => h[yField]);
  const tMin = history[0].time;
  const tMax = history[history.length - 1].time;
  const yMaxRaw = Math.max(...values);
  const yMax = yMaxRaw > 0 ? yMaxRaw * 1.1 : 1;
  const span = Math.max(1, tMax - tMin);

  const H = 200; // viewBox height (logical units; CSS sets actual height)

  const points = history.map((h) => {
    const x = PAD_X + ((h.time - tMin) / span) * (W - PAD_X * 2);
    const y = PAD_Y + (1 - h[yField] / yMax) * (H - PAD_Y * 2);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    `M${points[0][0].toFixed(1)} ${(H - PAD_Y).toFixed(1)} ` +
    points.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') +
    ` L${points[points.length - 1][0].toFixed(1)} ${(H - PAD_Y).toFixed(1)} Z`;

  const yLabel = yField === 'wip' ? 'WIP' : 'OUT/hr';

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
        role="img"
        aria-label={`${yLabel} over time`}
      >
        {/* baseline */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={H - PAD_Y}
          y2={H - PAD_Y}
          stroke={SW_COLORS.line}
          strokeWidth={1}
        />
        {/* area */}
        <path d={areaPath} fill={`${SW_COLORS.brand}1F`} />
        {/* line */}
        <path
          d={linePath}
          fill="none"
          stroke={SW_COLORS.brand}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* last-point dot */}
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r={6}
          fill={SW_COLORS.brand}
          stroke={SW_COLORS.paper}
          strokeWidth={2}
        />
      </svg>

      {/* Captions overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '4px 8px',
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.5px',
          color: SW_COLORS.muted,
        }}
      >
        <span>
          {yLabel} · max <span style={{ color: SW_COLORS.ink }}>{yMaxRaw.toFixed(1)}</span>
        </span>
        <span>
          now <span style={{ color: SW_COLORS.ink }}>{values[values.length - 1].toFixed(1)}</span>
        </span>
      </div>

      {/* X-axis label row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: SW_FONTS.mono,
          fontSize: 9,
          color: SW_COLORS.faint,
          marginTop: 2,
        }}
      >
        <span>t = {fmtTime(tMin)}</span>
        <span>t = {fmtTime(tMax)}</span>
      </div>
    </div>
  );
}

function fmtTime(simMinutes: number): string {
  if (!Number.isFinite(simMinutes)) return '—';
  if (simMinutes < 60) return `${simMinutes.toFixed(0)} min`;
  const h = simMinutes / 60;
  return `${h.toFixed(1)} h`;
}
