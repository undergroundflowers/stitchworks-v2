/**
 * Workstation sprites — top-down SVG illustrations for every MachineCode in
 * the catalog. Each sprite is drawn on a 100x100 viewBox; multi-cell
 * footprints (CAD cutter, spreader, steam tunnel, embroidery) override to
 * 200x100 / 400x100 / 200x200 to keep proportions honest.
 *
 * The primary call site is the layout canvas — Builder palette tiles, Live
 * Floor stations, the assets gallery. Pure SVG, no images, so they re-colour
 * cleanly when the vibe changes.
 */

import type { CSSProperties } from 'react';
import { MACHINE_CATALOG, type MachineCode, type MachineSpec } from '../domain/machines';
import { SW_COLORS } from '../design/tokens';

interface WorkstationSpriteProps {
  code: MachineCode;
  size?: number;
  /** Show the table footprint behind the machine head (default true). */
  withTable?: boolean;
  /** Optional state tint — running stations glow brand, idle ones go grey. */
  state?: 'idle' | 'running' | 'broken';
  style?: CSSProperties;
}

/** Aspect ratio of the sprite's natural footprint, in cells. */
const FOOTPRINT_VIEWBOX: Partial<Record<MachineCode, [number, number]>> = {
  CAD: [400, 200],
  SPR: [400, 100],
  STEAM: [400, 200],
  EMB: [200, 200],
  FUSE: [200, 100],
};

const stateTint = (state: WorkstationSpriteProps['state']): string => {
  if (state === 'running') return SW_COLORS.ok;
  if (state === 'broken') return SW_COLORS.alarm;
  return SW_COLORS.muted;
};

export function WorkstationSprite({
  code,
  size = 64,
  withTable = true,
  state,
  style,
}: WorkstationSpriteProps) {
  const spec = MACHINE_CATALOG[code];
  const [vw, vh] = FOOTPRINT_VIEWBOX[code] ?? [100, 100];
  const ratio = vw / vh;
  const w = size * ratio;
  const h = size;

  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      width={w}
      height={h}
      style={{ display: 'block', overflow: 'visible', ...style }}
      aria-label={spec.label}
    >
      {withTable && <StationTable spec={spec} vw={vw} vh={vh} />}
      <StationHead code={code} vw={vw} vh={vh} />
      {state && (
        <circle
          cx={vw - 10}
          cy={10}
          r={5}
          fill={stateTint(state)}
          stroke={SW_COLORS.ink}
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

// ── Table base ───────────────────────────────────────────────────────────
function StationTable({ spec, vw, vh }: { spec: MachineSpec; vw: number; vh: number }) {
  const pad = 6;
  return (
    <>
      {/* Drop shadow */}
      <rect
        x={pad + 2}
        y={pad + 3}
        width={vw - pad * 2}
        height={vh - pad * 2}
        rx={6}
        fill={SW_COLORS.ink}
        opacity={0.08}
      />
      {/* Table top */}
      <rect
        x={pad}
        y={pad}
        width={vw - pad * 2}
        height={vh - pad * 2}
        rx={6}
        fill={SW_COLORS.paper}
        stroke={SW_COLORS.ink}
        strokeWidth={1.5}
      />
      {/* Category strip — left edge */}
      <rect x={pad} y={pad} width={6} height={vh - pad * 2} rx={3} fill={spec.color} />
    </>
  );
}

// ── Station heads ────────────────────────────────────────────────────────
function StationHead({ code, vw, vh }: { code: MachineCode; vw: number; vh: number }) {
  const cx = vw / 2;
  const cy = vh / 2;
  switch (code) {
    case 'SNL':
      return <SewingMachineHead cx={cx} cy={cy} accent={SW_COLORS.brand} needles={1} />;
    case 'DNL':
      return <SewingMachineHead cx={cx} cy={cy} accent={SW_COLORS.brand} needles={2} />;
    case '4OL':
      return <SewingMachineHead cx={cx} cy={cy} accent={SW_COLORS.bobbin} needles={4} arm="curved" />;
    case '5OL':
      return <SewingMachineHead cx={cx} cy={cy} accent={SW_COLORS.bobbin} needles={5} arm="curved" />;
    case 'FL':
      return <SewingMachineHead cx={cx} cy={cy} accent={SW_COLORS.bobbin} needles={3} arm="flat" />;
    case 'FB':
      return <SewingMachineHead cx={cx} cy={cy} accent={SW_COLORS.bobbin} needles={1} arm="cylinder" />;
    case 'KS':
      return <SewingMachineHead cx={cx} cy={cy} accent={SW_COLORS.trim} needles={6} />;
    case 'BH':
      return <ButtonholeHead cx={cx} cy={cy} />;
    case 'BS':
      return <ButtonSewHead cx={cx} cy={cy} />;
    case 'BT':
      return <BartackHead cx={cx} cy={cy} />;
    case 'EMB':
      return <EmbroideryHead vw={vw} vh={vh} />;
    case 'CUT':
      return <StraightKnifeHead cx={cx} cy={cy} />;
    case 'CAD':
      return <CadCutterHead vw={vw} vh={vh} />;
    case 'SPR':
      return <SpreaderHead vw={vw} vh={vh} />;
    case 'FUSE':
      return <FusingPressHead vw={vw} vh={vh} />;
    case 'PRESS':
      return <IronHead cx={cx} cy={cy} />;
    case 'STEAM':
      return <SteamTunnelHead vw={vw} vh={vh} />;
    case 'INSP':
      return <InspectionHead cx={cx} cy={cy} />;
    case 'MNL':
      return <ManualHead cx={cx} cy={cy} />;
  }
}

// ── Generic sewing machine — used for SNL/DNL/OL/FL/FB/KS variants ──────
function SewingMachineHead({
  cx,
  cy,
  accent,
  needles,
  arm = 'standard',
}: {
  cx: number;
  cy: number;
  accent: string;
  needles: number;
  arm?: 'standard' | 'curved' | 'flat' | 'cylinder';
}) {
  // Body + arm in profile (top-down view). The arm extends right from a
  // motor block on the left, with needles dropping down from the head.
  return (
    <g>
      {/* Motor block (rear) */}
      <rect x={cx - 26} y={cy - 18} width={18} height={36} rx={3} fill={SW_COLORS.steel} />
      <rect x={cx - 24} y={cy - 14} width={4} height={4} fill={accent} />
      <rect x={cx - 24} y={cy - 6} width={4} height={4} fill={accent} opacity={0.7} />

      {/* Arm */}
      {arm === 'cylinder' ? (
        <>
          <ellipse cx={cx + 8} cy={cy} rx={20} ry={6} fill={SW_COLORS.steel} />
          <circle cx={cx + 24} cy={cy} r={5} fill={accent} />
        </>
      ) : arm === 'curved' ? (
        <>
          <path
            d={`M ${cx - 8} ${cy - 8} Q ${cx + 12} ${cy - 14} ${cx + 22} ${cy} Q ${cx + 12} ${cy + 14} ${cx - 8} ${cy + 8} Z`}
            fill={SW_COLORS.steel}
          />
        </>
      ) : (
        <rect
          x={cx - 8}
          y={cy - 7}
          width={32}
          height={14}
          rx={3}
          fill={SW_COLORS.steel}
        />
      )}

      {/* Head + needle plate */}
      <rect x={cx + 14} y={cy - 9} width={10} height={18} rx={2} fill={accent} />
      {arm !== 'cylinder' &&
        Array.from({ length: needles }).map((_, i) => {
          const offset = (i - (needles - 1) / 2) * 2.2;
          return (
            <line
              key={i}
              x1={cx + 19 + offset}
              y1={cy + 9}
              x2={cx + 19 + offset}
              y2={cy + 13}
              stroke={SW_COLORS.ink}
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          );
        })}

      {/* Thread spool on top */}
      <circle cx={cx - 17} cy={cy - 22} r={4} fill={SW_COLORS.thread} stroke={SW_COLORS.ink} strokeWidth={0.8} />
      <line x1={cx - 17} y1={cy - 22} x2={cx + 14} y2={cy - 7} stroke={SW_COLORS.thread} strokeWidth={0.6} opacity={0.7} />

      {/* Hand wheel */}
      <circle cx={cx - 8} cy={cy + 16} r={5} fill={SW_COLORS.steelLite} stroke={SW_COLORS.ink} strokeWidth={0.6} />
      <circle cx={cx - 8} cy={cy + 16} r={1.5} fill={accent} />
    </g>
  );
}

function ButtonholeHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <rect x={cx - 22} y={cy - 14} width={44} height={28} rx={4} fill={SW_COLORS.steel} />
      <rect x={cx - 14} y={cy - 2} width={28} height={5} rx={2.5} fill={SW_COLORS.paper} />
      <rect x={cx - 12} y={cy - 1} width={24} height={3} rx={1.5} fill={SW_COLORS.ink} />
      <circle cx={cx + 17} cy={cy - 9} r={2.5} fill={SW_COLORS.trim} />
      <line x1={cx} y1={cy - 14} x2={cx} y2={cy - 18} stroke={SW_COLORS.thread} strokeWidth={1.2} />
      <circle cx={cx} cy={cy - 20} r={3} fill={SW_COLORS.thread} stroke={SW_COLORS.ink} strokeWidth={0.6} />
    </g>
  );
}

function ButtonSewHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <rect x={cx - 20} y={cy - 14} width={40} height={28} rx={4} fill={SW_COLORS.steel} />
      <circle cx={cx} cy={cy} r={6} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={1} />
      <circle cx={cx - 2} cy={cy - 2} r={0.8} fill={SW_COLORS.ink} />
      <circle cx={cx + 2} cy={cy - 2} r={0.8} fill={SW_COLORS.ink} />
      <circle cx={cx - 2} cy={cy + 2} r={0.8} fill={SW_COLORS.ink} />
      <circle cx={cx + 2} cy={cy + 2} r={0.8} fill={SW_COLORS.ink} />
      <rect x={cx + 12} y={cy - 8} width={6} height={4} fill={SW_COLORS.trim} />
    </g>
  );
}

function BartackHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <rect x={cx - 22} y={cy - 12} width={44} height={24} rx={4} fill={SW_COLORS.steel} />
      <g stroke={SW_COLORS.trim} strokeWidth={2} strokeLinecap="round">
        <line x1={cx - 5} y1={cy - 4} x2={cx + 5} y2={cy + 4} />
        <line x1={cx + 5} y1={cy - 4} x2={cx - 5} y2={cy + 4} />
      </g>
      <rect x={cx - 18} y={cy - 8} width={4} height={3} fill={SW_COLORS.brand} />
      <rect x={cx - 18} y={cy + 5} width={4} height={3} fill={SW_COLORS.bobbin} />
    </g>
  );
}

function EmbroideryHead({ vw, vh }: { vw: number; vh: number }) {
  // Multi-head — 4 hoops in a row
  const cx = vw / 2;
  const cy = vh / 2;
  return (
    <g>
      <rect x={cx - 70} y={cy - 30} width={140} height={60} rx={5} fill={SW_COLORS.steel} />
      <rect x={cx - 64} y={cy - 24} width={128} height={20} rx={3} fill={SW_COLORS.steelLite} />
      {[-48, -16, 16, 48].map((dx, i) => (
        <g key={i}>
          <circle cx={cx + dx} cy={cy + 6} r={11} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={1} />
          <circle cx={cx + dx} cy={cy + 6} r={7} fill="none" stroke={SW_COLORS.trim} strokeWidth={1.5} />
          <circle cx={cx + dx} cy={cy - 14} r={3} fill={SW_COLORS.thread} stroke={SW_COLORS.ink} strokeWidth={0.6} />
        </g>
      ))}
    </g>
  );
}

function StraightKnifeHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <rect x={cx - 26} y={cy - 4} width={52} height={8} rx={1} fill={SW_COLORS.steel} />
      <rect x={cx - 6} y={cy - 24} width={12} height={28} rx={2} fill={SW_COLORS.steelLite} />
      <rect x={cx - 1.5} y={cy - 12} width={3} height={24} fill={SW_COLORS.press} />
      <line x1={cx} y1={cy + 12} x2={cx} y2={cy + 22} stroke={SW_COLORS.ink} strokeWidth={1.2} />
      <circle cx={cx - 2} cy={cy - 22} r={3} fill={SW_COLORS.brand} />
    </g>
  );
}

function CadCutterHead({ vw, vh }: { vw: number; vh: number }) {
  const cx = vw / 2;
  const cy = vh / 2;
  return (
    <g>
      {/* Bed */}
      <rect x={cx - 170} y={cy - 70} width={340} height={140} rx={3} fill={SW_COLORS.steelLite} />
      {/* Vacuum perforation pattern */}
      {Array.from({ length: 7 }).map((_, ry) =>
        Array.from({ length: 17 }).map((_, rx2) => (
          <circle
            key={`${ry}-${rx2}`}
            cx={cx - 160 + rx2 * 20}
            cy={cy - 60 + ry * 20}
            r={1.2}
            fill={SW_COLORS.ink}
            opacity={0.3}
          />
        )),
      )}
      {/* Gantry rail */}
      <rect x={cx - 170} y={cy - 6} width={340} height={12} fill={SW_COLORS.steel} />
      {/* Cutting head */}
      <rect x={cx + 40} y={cy - 18} width={36} height={24} rx={2} fill={SW_COLORS.brand} />
      <rect x={cx + 50} y={cy + 4} width={16} height={10} fill={SW_COLORS.press} />
      {/* Pattern outline being cut */}
      <path
        d={`M ${cx - 110} ${cy + 30} Q ${cx - 100} ${cy + 50} ${cx - 80} ${cy + 50} L ${cx - 40} ${cy + 50} Q ${cx - 20} ${cy + 30} ${cx - 30} ${cy + 20} L ${cx - 70} ${cy + 20} Q ${cx - 90} ${cy + 20} ${cx - 110} ${cy + 30} Z`}
        fill="none"
        stroke={SW_COLORS.fabric}
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
    </g>
  );
}

function SpreaderHead({ vw, vh }: { vw: number; vh: number }) {
  const cx = vw / 2;
  const cy = vh / 2;
  return (
    <g>
      {/* Spreading table */}
      <rect x={cx - 170} y={cy - 32} width={340} height={64} rx={3} fill={SW_COLORS.fabric} opacity={0.4} />
      {/* Fabric layers */}
      {[-20, -12, -4].map((dy, i) => (
        <rect key={i} x={cx - 160} y={cy + dy} width={320} height={3} fill={SW_COLORS.fabric} opacity={0.6 + i * 0.1} />
      ))}
      {/* Carriage */}
      <rect x={cx + 110} y={cy - 28} width={50} height={56} rx={3} fill={SW_COLORS.steel} />
      <circle cx={cx + 120} cy={cy + 22} r={5} fill={SW_COLORS.ink} />
      <circle cx={cx + 150} cy={cy + 22} r={5} fill={SW_COLORS.ink} />
      <rect x={cx + 116} y={cy - 22} width={28} height={10} fill={SW_COLORS.brand} />
      {/* Fabric roll */}
      <circle cx={cx + 135} cy={cy} r={12} fill={SW_COLORS.bobbin} />
      <circle cx={cx + 135} cy={cy} r={4} fill={SW_COLORS.steelLite} />
    </g>
  );
}

function FusingPressHead({ vw, vh }: { vw: number; vh: number }) {
  const cx = vw / 2;
  const cy = vh / 2;
  return (
    <g>
      {/* Conveyor */}
      <rect x={cx - 80} y={cy - 14} width={160} height={28} rx={3} fill={SW_COLORS.steelLite} />
      {/* Heated drum */}
      <rect x={cx - 24} y={cy - 28} width={48} height={56} rx={6} fill={SW_COLORS.press} />
      {/* Heat lines */}
      {[-3, 0, 3].map((dx, i) => (
        <path
          key={i}
          d={`M ${cx + dx} ${cy - 36} q -3 -4 0 -8 q 3 -4 0 -8`}
          stroke={SW_COLORS.alarm}
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {/* Belt rollers */}
      <circle cx={cx - 76} cy={cy} r={6} fill={SW_COLORS.steel} />
      <circle cx={cx + 76} cy={cy} r={6} fill={SW_COLORS.steel} />
    </g>
  );
}

function IronHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {/* Pressing table */}
      <ellipse cx={cx} cy={cy + 4} rx={36} ry={18} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={1} />
      {/* Iron */}
      <path
        d={`M ${cx - 14} ${cy - 4} L ${cx + 14} ${cy - 6} L ${cx + 18} ${cy + 2} L ${cx - 14} ${cy + 4} Z`}
        fill={SW_COLORS.thread}
        stroke={SW_COLORS.ink}
        strokeWidth={1}
      />
      <rect x={cx - 12} y={cy - 12} width={20} height={6} rx={2} fill={SW_COLORS.steel} />
      {/* Steam */}
      {[-10, -4, 2].map((dx, i) => (
        <path
          key={i}
          d={`M ${cx + dx} ${cy - 16} q -2 -3 0 -6 q 2 -3 0 -6`}
          stroke={SW_COLORS.bobbin}
          strokeWidth={1.4}
          fill="none"
          opacity={0.7}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function SteamTunnelHead({ vw, vh }: { vw: number; vh: number }) {
  const cx = vw / 2;
  const cy = vh / 2;
  return (
    <g>
      {/* Tunnel body */}
      <rect x={cx - 170} y={cy - 60} width={340} height={120} rx={20} fill={SW_COLORS.steel} />
      <rect x={cx - 160} y={cy - 50} width={320} height={100} rx={14} fill={SW_COLORS.steelLite} />
      {/* Garments on hangers passing through */}
      {[-100, -30, 40, 110].map((dx, i) => (
        <g key={i}>
          <line x1={cx + dx} y1={cy - 40} x2={cx + dx} y2={cy - 12} stroke={SW_COLORS.ink} strokeWidth={1} />
          <path
            d={`M ${cx + dx - 14} ${cy + 30} L ${cx + dx + 14} ${cy + 30} L ${cx + dx + 10} ${cy - 12} L ${cx + dx - 10} ${cy - 12} Z`}
            fill={SW_COLORS.fabric}
            opacity={0.7}
          />
        </g>
      ))}
      {/* Steam */}
      {[-60, 0, 60].map((dx, i) => (
        <path
          key={i}
          d={`M ${cx + dx} ${cy - 70} q -3 -4 0 -8 q 3 -4 0 -8`}
          stroke={SW_COLORS.bobbin}
          strokeWidth={1.6}
          fill="none"
          opacity={0.7}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function InspectionHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {/* Light table */}
      <rect x={cx - 28} y={cy - 18} width={56} height={36} rx={3} fill={SW_COLORS.thread} opacity={0.4} stroke={SW_COLORS.ink} strokeWidth={1} />
      {/* Garment outline */}
      <path
        d={`M ${cx - 14} ${cy + 12} L ${cx - 14} ${cy - 4} L ${cx - 18} ${cy - 8} L ${cx - 10} ${cy - 14} L ${cx + 10} ${cy - 14} L ${cx + 18} ${cy - 8} L ${cx + 14} ${cy - 4} L ${cx + 14} ${cy + 12} Z`}
        fill="none"
        stroke={SW_COLORS.ink}
        strokeWidth={1}
        opacity={0.6}
      />
      {/* Magnifier */}
      <circle cx={cx + 16} cy={cy - 16} r={7} fill="none" stroke={SW_COLORS.steel} strokeWidth={2} />
      <line x1={cx + 21} y1={cy - 11} x2={cx + 28} y2={cy - 4} stroke={SW_COLORS.steel} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

function ManualHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {/* Bare table */}
      <rect x={cx - 26} y={cy - 16} width={52} height={32} rx={2} fill={SW_COLORS.paperEdge} stroke={SW_COLORS.ink} strokeWidth={0.8} />
      {/* Scissors */}
      <circle cx={cx - 8} cy={cy + 6} r={3.5} fill="none" stroke={SW_COLORS.steel} strokeWidth={1.5} />
      <circle cx={cx + 8} cy={cy + 6} r={3.5} fill="none" stroke={SW_COLORS.steel} strokeWidth={1.5} />
      <line x1={cx - 6} y1={cy + 4} x2={cx + 12} y2={cy - 10} stroke={SW_COLORS.steel} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={cx + 6} y1={cy + 4} x2={cx - 12} y2={cy - 10} stroke={SW_COLORS.steel} strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
}
