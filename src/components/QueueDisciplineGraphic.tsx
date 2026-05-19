/**
 * QueueDisciplineGraphic — small illustration of the queue discipline chosen
 * on a workstation (FCFS, SIRO, Priority). Sits under the Discipline picker
 * in QueueAnalysisPanel so the user can see, at a glance, which bundle the
 * operator picks next given the current setting.
 *
 *   FCFS     ●₁ ●₂ ●₃ ●₄  ──►  ■        (oldest bundle leaves first — FIFO cart)
 *   SIRO     ●  ●  ●  ●   ──►  ■        (operator dips into the cart at random)
 *   Priority ●  ●  ★  ●   ──►  ■        (rush bundle jumps the queue)
 *
 * The graphic is purely decorative — it reads the discipline prop and renders
 * a fixed mini-scene; it does not animate. Sized to feel like a caption
 * (≈48px tall) so it doesn't overpower the form controls above it.
 */

import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import type { QueueDiscipline } from '../simulation';

interface QueueDisciplineGraphicProps {
  discipline: QueueDiscipline;
}

const W = 320;
const H = 56;

// Bundle layout — 4 bundles waiting on the left, server on the right.
const BUNDLE_R = 7;
const BUNDLE_GAP = 22;
const BUNDLE_BASELINE = H / 2;
const BUNDLE_X0 = 16;
const SERVER_X = W - 44;
const SERVER_Y = BUNDLE_BASELINE - 12;
const SERVER_W = 26;
const SERVER_H = 24;
const ARROW_X1 = BUNDLE_X0 + 3 * BUNDLE_GAP + BUNDLE_R + 8;
const ARROW_X2 = SERVER_X - 4;

export function QueueDisciplineGraphic({ discipline }: QueueDisciplineGraphicProps) {
  const { pickedIdx, isPriority, caption } = sceneFor(discipline);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 8,
        padding: '8px 10px',
        border: `1px solid ${SW_COLORS.line}`,
        borderRadius: SW_RADIUS.sm,
        background: SW_COLORS.paperDeep,
      }}
      aria-label={`${discipline} discipline: ${caption}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
        {/* Cart rail (the line bundles sit on) */}
        <line
          x1={BUNDLE_X0 - 6}
          y1={BUNDLE_BASELINE + BUNDLE_R + 4}
          x2={BUNDLE_X0 + 3 * BUNDLE_GAP + BUNDLE_R + 6}
          y2={BUNDLE_BASELINE + BUNDLE_R + 4}
          stroke={SW_COLORS.line}
          strokeWidth={1}
        />

        {/* Four bundles in the cart */}
        {[0, 1, 2, 3].map((i) => {
          const cx = BUNDLE_X0 + i * BUNDLE_GAP;
          const cy = BUNDLE_BASELINE;
          const isPicked = i === pickedIdx;
          const rush = isPriority && i === pickedIdx;
          const fill = rush
            ? SW_COLORS.alarm
            : isPicked
            ? SW_COLORS.brand
            : SW_COLORS.muted;
          const opacity = isPicked ? 1 : 0.45;
          return (
            <g key={i} opacity={opacity}>
              <circle
                cx={cx}
                cy={cy}
                r={BUNDLE_R}
                fill={fill}
                stroke={SW_COLORS.paper}
                strokeWidth={1}
              />
              {rush && (
                <text
                  x={cx}
                  y={cy - BUNDLE_R - 4}
                  textAnchor="middle"
                  fontFamily={SW_FONTS.mono}
                  fontSize={9}
                  fontWeight={800}
                  fill={SW_COLORS.alarm}
                >
                  ★
                </text>
              )}
              <text
                x={cx}
                y={cy + 2}
                textAnchor="middle"
                fontFamily={SW_FONTS.mono}
                fontSize={7}
                fontWeight={700}
                fill={isPicked ? SW_COLORS.paper : SW_COLORS.faint}
              >
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Pick arrow — from picked bundle to the server. SIRO uses a curved
            path to suggest the random reach-in. */}
        {discipline === 'SIRO' ? (
          <path
            d={`M ${BUNDLE_X0 + pickedIdx * BUNDLE_GAP + BUNDLE_R + 2} ${BUNDLE_BASELINE - 4}
                C ${BUNDLE_X0 + pickedIdx * BUNDLE_GAP + 28} ${BUNDLE_BASELINE - 18},
                  ${ARROW_X2 - 28} ${BUNDLE_BASELINE - 18},
                  ${ARROW_X2} ${BUNDLE_BASELINE}`}
            stroke={SW_COLORS.brand}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            markerEnd="url(#sw-arrowhead)"
          />
        ) : (
          <path
            d={`M ${ARROW_X1} ${BUNDLE_BASELINE} L ${ARROW_X2} ${BUNDLE_BASELINE}`}
            stroke={isPriority ? SW_COLORS.alarm : SW_COLORS.brand}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            markerEnd={isPriority ? 'url(#sw-arrowhead-alarm)' : 'url(#sw-arrowhead)'}
          />
        )}

        {/* Arrow markers */}
        <defs>
          <marker
            id="sw-arrowhead"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 5 L 0 10 z" fill={SW_COLORS.brand} />
          </marker>
          <marker
            id="sw-arrowhead-alarm"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 5 L 0 10 z" fill={SW_COLORS.alarm} />
          </marker>
        </defs>

        {/* Server box */}
        <rect
          x={SERVER_X}
          y={SERVER_Y}
          width={SERVER_W}
          height={SERVER_H}
          rx={3}
          fill={SW_COLORS.brand}
          stroke={SW_COLORS.brand}
        />
        <text
          x={SERVER_X + SERVER_W / 2}
          y={SERVER_Y + SERVER_H / 2 + 4}
          textAnchor="middle"
          fontFamily={SW_FONTS.mono}
          fontSize={11}
          fontWeight={800}
          fill={SW_COLORS.paper}
        >
          ▰
        </text>
        <text
          x={SERVER_X + SERVER_W / 2}
          y={SERVER_Y + SERVER_H + 10}
          textAnchor="middle"
          fontFamily={SW_FONTS.mono}
          fontSize={8}
          fontWeight={700}
          fill={SW_COLORS.muted}
          letterSpacing="0.4px"
        >
          OPR
        </text>
      </svg>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          color: SW_COLORS.muted,
          letterSpacing: '0.3px',
          lineHeight: 1.4,
        }}
      >
        {caption}
      </div>
    </div>
  );
}

function sceneFor(discipline: QueueDiscipline): {
  pickedIdx: number;
  isPriority: boolean;
  caption: string;
} {
  switch (discipline) {
    case 'FCFS':
      return {
        pickedIdx: 0,
        isPriority: false,
        caption: 'FCFS — first bundle on the cart is sewn first (FIFO).',
      };
    case 'SIRO':
      return {
        pickedIdx: 2,
        isPriority: false,
        caption: 'SIRO — operator picks any bundle in the cart at random.',
      };
    case 'Priority':
      return {
        pickedIdx: 2,
        isPriority: true,
        caption: 'Priority — rush bundles jump the queue ahead of the rest.',
      };
    default:
      return {
        pickedIdx: 0,
        isPriority: false,
        caption: `${discipline} — operator picks the next bundle by rule.`,
      };
  }
}
