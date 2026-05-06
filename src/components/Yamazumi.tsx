import { SW_COLORS, SW_FONTS } from '../design/tokens';
import type { Operation } from '../domain';

export interface OperatorAssignment {
  /** Display id, e.g. "OPR-01". */
  id: string;
  /** Operations this operator runs, in order. */
  operations: Operation[];
}

interface YamazumiProps {
  /** One bar per operator. */
  assignments: OperatorAssignment[];
  /**
   * Takt time in minutes per piece. Drawn as a horizontal reference line —
   * if any operator's bar exceeds takt, that operator is the bottleneck.
   */
  taktMin: number;
  /** Optional fixed height; defaults to 280. */
  height?: number;
  /** Optional width; defaults to 100% of container via SVG viewBox. */
  width?: number;
}

/**
 * Yamazumi chart — operator-by-operator stacked SMV bars with a takt-time
 * line drawn across. The single most-asked-for IE balancing tool: at a
 * glance you can see whose bar exceeds takt (= bottleneck) and where there's
 * idle slack (= bar is shorter than takt).
 *
 * Each segment in a bar is one operation; the segment colour is the
 * operation's category (sewing / manual / pressing / inspection / etc.) so
 * machine-mix per operator is also visible.
 */
export function Yamazumi({ assignments, taktMin, height = 280, width = 720 }: YamazumiProps) {
  const padL = 56, padR = 24, padT = 24, padB = 56;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const totals = assignments.map((a) => a.operations.reduce((s, o) => s + o.smv, 0));
  const yMax = Math.max(taktMin * 1.25, ...totals, 0.1);
  const barW = innerW / assignments.length;
  const barInnerW = Math.min(38, barW * 0.7);

  const yScale = (v: number) => padT + innerH - (v / yMax) * innerH;

  // Y-axis ticks every 0.2 min (12 sec). Adjust if scale is large.
  const tickStep = yMax > 4 ? 1 : yMax > 2 ? 0.5 : 0.2;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += tickStep) ticks.push(v);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height, display: 'block' }}>
      {/* y-axis grid + labels */}
      {ticks.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            y1={yScale(v)}
            x2={width - padR}
            y2={yScale(v)}
            stroke={SW_COLORS.line}
            strokeWidth={i === 0 ? 1.5 : 0.5}
          />
          <text
            x={padL - 8}
            y={yScale(v) + 3}
            textAnchor="end"
            fontFamily={SW_FONTS.mono}
            fontSize={9}
            fontWeight={700}
            fill={SW_COLORS.muted}
          >
            {v.toFixed(2)}
          </text>
        </g>
      ))}

      {/* y-axis title */}
      <text
        x={12}
        y={padT + innerH / 2}
        textAnchor="middle"
        transform={`rotate(-90, 12, ${padT + innerH / 2})`}
        fontFamily={SW_FONTS.mono}
        fontSize={10}
        fontWeight={700}
        fill={SW_COLORS.muted}
      >
        SMV (min)
      </text>

      {/* Stacked bars — one per operator */}
      {assignments.map((a, i) => {
        const x = padL + barW * i + (barW - barInnerW) / 2;
        let yCursor = padT + innerH;
        return (
          <g key={a.id}>
            {a.operations.map((op, j) => {
              const segH = (op.smv / yMax) * innerH;
              yCursor -= segH;
              const fill = colorForCategory(op.category);
              return (
                <g key={op.id}>
                  <rect
                    x={x}
                    y={yCursor}
                    width={barInnerW}
                    height={segH}
                    fill={fill}
                    stroke="#fff"
                    strokeWidth={0.6}
                  >
                    <title>{`${op.code ? `${op.code} ` : ''}${op.name} · ${op.smv.toFixed(2)} min · ${op.machineCode}`}</title>
                  </rect>
                  {/* Operation label inside segment if it fits */}
                  {segH > 14 && j < a.operations.length && (
                    <text
                      x={x + barInnerW / 2}
                      y={yCursor + segH / 2 + 3}
                      textAnchor="middle"
                      fontFamily={SW_FONTS.mono}
                      fontSize={8}
                      fontWeight={700}
                      fill="#fff"
                      style={{ pointerEvents: 'none' }}
                    >
                      {op.code ?? op.name.slice(0, 3)}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Operator id below bar */}
            <text
              x={x + barInnerW / 2}
              y={padT + innerH + 14}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={700}
              fill={SW_COLORS.muted}
            >
              {a.id}
            </text>
            {/* Total at the top of the bar */}
            <text
              x={x + barInnerW / 2}
              y={yScale(totals[i]) - 4}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={700}
              fill={totals[i] > taktMin ? SW_COLORS.alarm : SW_COLORS.ink}
            >
              {totals[i].toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* Takt-time reference line */}
      <line
        x1={padL}
        y1={yScale(taktMin)}
        x2={width - padR}
        y2={yScale(taktMin)}
        stroke={SW_COLORS.brand}
        strokeWidth={1.5}
        strokeDasharray="6 4"
      />
      <text
        x={width - padR - 4}
        y={yScale(taktMin) - 6}
        textAnchor="end"
        fontFamily={SW_FONTS.mono}
        fontSize={10}
        fontWeight={800}
        fill={SW_COLORS.brand}
      >
        TAKT {taktMin.toFixed(2)} min
      </text>

      {/* Category legend */}
      <g transform={`translate(${padL}, ${height - 24})`}>
        {LEGEND.map((l, i) => (
          <g key={l.cat} transform={`translate(${i * 90}, 0)`}>
            <rect width={10} height={10} fill={colorForCategory(l.cat)} rx={2} />
            <text
              x={14}
              y={9}
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={700}
              fill={SW_COLORS.muted}
            >
              {l.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

const LEGEND: { cat: Operation['category']; label: string }[] = [
  { cat: 'sewing',     label: 'SEW' },
  { cat: 'manual',     label: 'MNL' },
  { cat: 'pressing',   label: 'PRESS' },
  { cat: 'inspection', label: 'INSP' },
  { cat: 'fusing',     label: 'FUSE' },
];

function colorForCategory(cat: Operation['category']): string {
  switch (cat) {
    case 'sewing':     return SW_COLORS.brand;
    case 'manual':     return SW_COLORS.muted;
    case 'pressing':   return SW_COLORS.thread;
    case 'inspection': return SW_COLORS.alarm;
    case 'fusing':     return SW_COLORS.press;
    case 'cutting':    return SW_COLORS.bobbin;
    case 'spreading':  return SW_COLORS.fabric;
    case 'embroidery': return SW_COLORS.trim;
    case 'finishing':  return SW_COLORS.ship;
    default:           return SW_COLORS.steel;
  }
}

/**
 * Round-robin operation assignment to N operators, optionally biased to keep
 * each operator on a single machine type. This is a stand-in for a real
 * line-balancing heuristic (RPW etc.) — good enough for visual validation.
 */
export function autoAssign(
  ops: Operation[],
  operatorCount: number,
): OperatorAssignment[] {
  const buckets: Operation[][] = Array.from({ length: operatorCount }, () => []);
  // Sort operations by SMV descending, then place each onto the operator
  // with the lowest current load. Longest-Processing-Time (LPT) heuristic.
  const sorted = [...ops].sort((a, b) => b.smv - a.smv);
  const loads = new Array(operatorCount).fill(0);
  for (const op of sorted) {
    let target = 0;
    for (let i = 1; i < operatorCount; i++) {
      if (loads[i] < loads[target]) target = i;
    }
    buckets[target].push(op);
    loads[target] += op.smv;
  }
  return buckets.map((operations, i) => ({
    id: `OPR-${(i + 1).toString().padStart(2, '0')}`,
    operations,
  }));
}
