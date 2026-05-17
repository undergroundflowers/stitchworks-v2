/**
 * Production-system topology diagrams. Each of the 9 production systems
 * (PBS, modular/TSS, UPS, make-through, straight, synchro, clump, bundle,
 * UHS) has a distinct floor layout — bundle size, line shape, conveyor
 * presence, supervisor cluster — that's hard to convey in prose alone.
 *
 * This component renders a compact inline SVG (≈280×120) that captures
 * the "shape" of each system: where operators stand, how pieces flow,
 * whether bundles or single pieces are in transit, conveyors / takt
 * overlays. Used on the Orders page hover-preview so the user can see
 * what each system would look like on the floor before committing.
 */

import { SW_COLORS, SW_FONTS } from '../design/tokens';
import type { ProductionSystem } from '../domain/routings';

interface Props {
  system: ProductionSystem;
  /** Height of the rendered SVG in CSS pixels. Width auto-scales. */
  height?: number;
}

const VB_W = 280;
const VB_H = 120;

/** Stylised operator glyph — small head + trapezoidal body. */
function Operator({
  x,
  y,
  scale = 1,
  fill = SW_COLORS.ink,
  badge,
}: {
  x: number;
  y: number;
  scale?: number;
  fill?: string;
  badge?: string;
}) {
  const r = 5 * scale;
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx={0} cy={-r * 1.6} r={r} fill={fill} />
      <path
        d={`M ${-r * 1.4} ${r * 1.6} L ${r * 1.4} ${r * 1.6} L ${r * 0.9} ${-r * 0.5} L ${-r * 0.9} ${-r * 0.5} Z`}
        fill={fill}
      />
      {badge && (
        <text
          x={r * 2}
          y={-r * 0.6}
          fontFamily={SW_FONTS.mono}
          fontSize={7 * scale}
          fontWeight={800}
          fill={SW_COLORS.brand}
        >
          {badge}
        </text>
      )}
    </g>
  );
}

/** Bundle of N pieces drawn as a tiny stack of slim rectangles. */
function Bundle({ x, y, n = 4 }: { x: number; y: number; n?: number }) {
  const w = 14;
  const h = 3;
  return (
    <g transform={`translate(${x},${y})`}>
      {Array.from({ length: n }).map((_, i) => (
        <rect
          key={i}
          x={-w / 2}
          y={-i * (h + 0.6)}
          width={w}
          height={h}
          rx={0.6}
          fill={SW_COLORS.brand}
          opacity={0.45 + (i / n) * 0.55}
        />
      ))}
    </g>
  );
}

/** Single piece in flight. */
function Piece({ x, y }: { x: number; y: number }) {
  return (
    <rect
      x={x - 3}
      y={y - 3}
      width={6}
      height={6}
      rx={1}
      fill={SW_COLORS.brand}
    />
  );
}

/** Right-facing flow arrow. */
function Arrow({ x1, x2, y, dashed = false }: { x1: number; x2: number; y: number; dashed?: boolean }) {
  return (
    <g>
      <line
        x1={x1}
        y1={y}
        x2={x2 - 4}
        y2={y}
        stroke={SW_COLORS.muted}
        strokeWidth={1}
        strokeDasharray={dashed ? '3 2' : undefined}
      />
      <path
        d={`M ${x2} ${y} L ${x2 - 5} ${y - 3} L ${x2 - 5} ${y + 3} Z`}
        fill={SW_COLORS.muted}
      />
    </g>
  );
}

export function ProductionSystemDiagram({ system, height = 120 }: Props) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={(VB_W * height) / VB_H}
      height={height}
      style={{ display: 'block', background: SW_COLORS.paperDeep, borderRadius: 6 }}
      role="img"
      aria-label={`Production system topology: ${system}`}
    >
      {renderTopology(system)}
    </svg>
  );
}

/** Per-system topology renderer. Each branch is self-contained so the
 *  diagrams can drift independently as we refine the visual language. */
function renderTopology(system: ProductionSystem) {
  switch (system) {
    case 'PBS': {
      // Progressive Bundle System — fixed line, batches between stations.
      const ops = [40, 90, 140, 190, 240];
      return (
        <g>
          {/* Conveyor / floor line */}
          <line x1={20} y1={70} x2={260} y2={70} stroke={SW_COLORS.line} strokeWidth={1} />
          {ops.map((x) => (
            <Operator key={x} x={x} y={55} />
          ))}
          {ops.slice(0, -1).map((x, i) => (
            <Bundle key={x} x={(x + ops[i + 1]) / 2} y={92} n={4} />
          ))}
          <Arrow x1={20} x2={260} y={108} />
          <text x={140} y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={2}>
            BUNDLES · 30 pcs · PROGRESSIVE
          </text>
        </g>
      );
    }

    case 'modular': {
      // Modular / TSS — small U-cell, single-piece flow, rotation.
      const cell = [
        { x: 70, y: 55 },
        { x: 105, y: 45 },
        { x: 140, y: 40 },
        { x: 175, y: 45 },
        { x: 210, y: 55 },
        { x: 195, y: 85 },
        { x: 110, y: 85 },
      ];
      return (
        <g>
          {/* U-shaped table outline */}
          <path
            d="M 60 60 Q 60 32 140 32 Q 220 32 220 60 L 220 92 L 60 92 Z"
            fill="none"
            stroke={SW_COLORS.line}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          {cell.map((p, i) => (
            <Operator key={i} x={p.x} y={p.y} scale={0.85} />
          ))}
          <Piece x={140} y={62} />
          {/* Rotation arrow */}
          <path
            d="M 140 105 m -28 0 a 28 12 0 1 0 56 0"
            fill="none"
            stroke={SW_COLORS.brand}
            strokeWidth={1.2}
          />
          <path d="M 168 105 L 162 102 L 162 108 Z" fill={SW_COLORS.brand} />
          <text x={140} y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={2}>
            5–8 OPERATORS · 1-PIECE FLOW · ROTATE
          </text>
        </g>
      );
    }

    case 'UPS': {
      // Unit Production System — overhead rail with hangers above, stations below.
      const stations = [50, 100, 150, 200, 250];
      return (
        <g>
          {/* Overhead rail */}
          <line x1={20} y1={38} x2={260} y2={38} stroke={SW_COLORS.ink} strokeWidth={2} />
          {stations.map((x, i) => (
            <g key={x}>
              {/* Hanger drop */}
              <line x1={x} y1={38} x2={x} y2={52} stroke={SW_COLORS.muted} strokeWidth={1} />
              {/* Hanger (garment T-shape) */}
              <path
                d={`M ${x - 5} 52 L ${x + 5} 52 L ${x + 8} 60 L ${x + 4} 60 L ${x + 4} 70 L ${x - 4} 70 L ${x - 4} 60 L ${x - 8} 60 Z`}
                fill={SW_COLORS.brand}
                opacity={i === 2 ? 1 : 0.5}
              />
              <Operator x={x} y={92} scale={0.85} />
            </g>
          ))}
          <Arrow x1={20} x2={260} y={108} />
          <text x={140} y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={2}>
            OVERHEAD CONVEYOR · ROUTED
          </text>
        </g>
      );
    }

    case 'make_through': {
      // Make-Through — one operator owns the whole garment.
      return (
        <g>
          <Operator x={100} y={70} scale={1.6} badge="1×" />
          {/* T-shirt outline */}
          <path
            d="M 160 50 L 175 50 L 185 60 L 178 68 L 178 105 L 220 105 L 220 68 L 213 60 L 224 50 L 240 50 L 248 60 L 240 75 L 232 70 L 232 110 L 168 110 L 168 70 L 160 75 L 152 60 Z"
            fill="none"
            stroke={SW_COLORS.brand}
            strokeWidth={1.5}
          />
          <text x={200} y={42} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={8} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={1.5}>
            FULL GARMENT
          </text>
          <text x={140} y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={2}>
            1 OPERATOR · ALL OPERATIONS
          </text>
        </g>
      );
    }

    case 'straight': {
      // Straight line — operators in a row, single pieces between them.
      const ops = [40, 90, 140, 190, 240];
      return (
        <g>
          <line x1={20} y1={70} x2={260} y2={70} stroke={SW_COLORS.line} strokeWidth={1} />
          {ops.map((x) => (
            <Operator key={x} x={x} y={55} />
          ))}
          {ops.slice(0, -1).map((x, i) => (
            <Piece key={x} x={(x + ops[i + 1]) / 2} y={92} />
          ))}
          <Arrow x1={20} x2={260} y={108} />
          <text x={140} y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={2}>
            STRAIGHT · 1-PIECE HAND-OFF
          </text>
        </g>
      );
    }

    case 'synchro': {
      // Synchronised — straight line + takt clock + pacing tick marks.
      const ops = [40, 90, 140, 190, 240];
      return (
        <g>
          {/* Takt clock */}
          <circle cx={140} cy={28} r={10} fill="none" stroke={SW_COLORS.brand} strokeWidth={1.2} />
          <line x1={140} y1={28} x2={140} y2={21} stroke={SW_COLORS.brand} strokeWidth={1.2} />
          <line x1={140} y1={28} x2={146} y2={28} stroke={SW_COLORS.brand} strokeWidth={1.2} />
          <text x={155} y={32} fontFamily={SW_FONTS.mono} fontSize={8} fontWeight={800} fill={SW_COLORS.brand}>
            TAKT
          </text>
          <line x1={20} y1={70} x2={260} y2={70} stroke={SW_COLORS.line} strokeWidth={1} />
          {ops.map((x) => (
            <Operator key={x} x={x} y={55} />
          ))}
          {/* Takt tick marks under each station */}
          {ops.map((x) => (
            <line key={x} x1={x} y1={92} x2={x} y2={100} stroke={SW_COLORS.brand} strokeWidth={1.5} />
          ))}
          <line x1={20} y1={100} x2={260} y2={100} stroke={SW_COLORS.brand} strokeWidth={0.5} strokeDasharray="2 3" />
          <Arrow x1={20} x2={260} y={110} />
        </g>
      );
    }

    case 'clump': {
      // Clump — senior operator + helpers cluster.
      return (
        <g>
          <Operator x={140} y={70} scale={1.4} fill={SW_COLORS.brand} badge="★" />
          {/* Helpers */}
          {[
            { x: 80, y: 50 },
            { x: 80, y: 92 },
            { x: 200, y: 50 },
            { x: 200, y: 92 },
          ].map((p, i) => (
            <g key={i}>
              <line
                x1={140}
                y1={70}
                x2={p.x}
                y2={p.y}
                stroke={SW_COLORS.line}
                strokeWidth={0.8}
                strokeDasharray="2 2"
              />
              <Operator x={p.x} y={p.y} scale={0.7} />
            </g>
          ))}
          <text x={140} y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={2}>
            SENIOR ★ + HELPERS
          </text>
        </g>
      );
    }

    case 'bundle': {
      // Generic bundle — uneven stations, shared bundles, some backflow.
      const ops = [
        { x: 50, y: 55 },
        { x: 100, y: 60 },
        { x: 150, y: 50 },
        { x: 200, y: 60 },
        { x: 245, y: 55 },
      ];
      return (
        <g>
          <line x1={20} y1={75} x2={260} y2={75} stroke={SW_COLORS.line} strokeWidth={1} />
          {ops.map((p, i) => (
            <Operator key={i} x={p.x} y={p.y} />
          ))}
          <Bundle x={75} y={92} n={3} />
          <Bundle x={125} y={95} n={5} />
          <Bundle x={175} y={92} n={2} />
          <Bundle x={222} y={95} n={4} />
          <Arrow x1={20} x2={260} y={112} />
          {/* Loop-back hint */}
          <path
            d="M 200 42 Q 175 25 150 42"
            fill="none"
            stroke={SW_COLORS.muted}
            strokeWidth={0.8}
            strokeDasharray="2 2"
          />
          <text x={140} y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={2}>
            UNEVEN BATCHES · SHARED OPERATIONS
          </text>
        </g>
      );
    }

    case 'unit_handle': {
      // Unit Handle — operators with their own large pile (piecework).
      const ops = [60, 120, 180, 240];
      return (
        <g>
          {ops.map((x) => (
            <g key={x}>
              <Operator x={x} y={55} />
              {/* Stack of pieces — taller than PBS bundles */}
              {Array.from({ length: 8 }).map((_, i) => (
                <rect
                  key={i}
                  x={x - 9}
                  y={92 - i * 3.4}
                  width={18}
                  height={3}
                  rx={0.6}
                  fill={SW_COLORS.brand}
                  opacity={0.3 + (i / 8) * 0.7}
                />
              ))}
            </g>
          ))}
          <text x={140} y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800} fill={SW_COLORS.muted} letterSpacing={2}>
            PIECEWORK · LARGE WIP PILES
          </text>
        </g>
      );
    }
  }
}
