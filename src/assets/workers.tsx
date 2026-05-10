/**
 * Worker sprites — front-facing chibi-ish silhouettes for every WorkerRole
 * in the archetypes catalog. Three styles map to the `avatars` tweak:
 *
 *   'dots'        — a coloured circle plus a role glyph (used for tiny tiles)
 *   'silhouette'  — a head + torso outline tinted by role
 *   'chibi'       — a head + body + role-specific tool / apron
 *
 * Each sprite is drawn on a 60x80 viewBox; the chibi variant fills it, the
 * silhouette variant uses a flatter shape, and the dot variant centers a
 * disc at (30, 40).
 */

import type { CSSProperties } from 'react';
import { WORKER_ARCHETYPES, type WorkerRole, type WorkerArchetype } from '../domain/workers';
import { SW_COLORS } from '../design/tokens';

export type WorkerSpriteStyle = 'dots' | 'silhouette' | 'chibi';

interface WorkerSpriteProps {
  role: WorkerRole;
  size?: number;
  style?: WorkerSpriteStyle;
  /** Optional state — busy adds a faint pulse ring, idle stays neutral. */
  state?: 'idle' | 'busy' | 'walking' | 'absent';
  className?: string;
  cssStyle?: CSSProperties;
}

export function WorkerSprite({
  role,
  size = 56,
  style = 'chibi',
  state = 'idle',
  cssStyle,
}: WorkerSpriteProps) {
  const arch = WORKER_ARCHETYPES[role];
  const w = size * 0.75;
  const h = size;
  return (
    <svg
      viewBox="0 0 60 80"
      width={w}
      height={h}
      style={{ display: 'block', overflow: 'visible', ...cssStyle }}
      aria-label={arch.label}
    >
      {state === 'busy' && (
        <circle cx={30} cy={70} r={14} fill={SW_COLORS.ok} opacity={0.18} />
      )}
      {state === 'walking' && (
        <ellipse cx={30} cy={75} rx={14} ry={3} fill={SW_COLORS.bobbin} opacity={0.3} />
      )}
      {state === 'absent' && (
        <rect x={4} y={4} width={52} height={72} fill={SW_COLORS.muted} opacity={0.1} />
      )}
      {style === 'dots' && <DotAvatar arch={arch} />}
      {style === 'silhouette' && <SilhouetteAvatar arch={arch} />}
      {style === 'chibi' && <ChibiAvatar arch={arch} role={role} />}
    </svg>
  );
}

// ── Dot avatar ───────────────────────────────────────────────────────────
function DotAvatar({ arch }: { arch: WorkerArchetype }) {
  return (
    <g>
      <circle cx={30} cy={40} r={26} fill={arch.color} />
      <circle cx={30} cy={40} r={26} fill="none" stroke={SW_COLORS.ink} strokeWidth={2} />
      <text
        x={30}
        y={40}
        fontSize={22}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        fill={SW_COLORS.paper}
      >
        {arch.icon}
      </text>
    </g>
  );
}

// ── Silhouette avatar ────────────────────────────────────────────────────
function SilhouetteAvatar({ arch }: { arch: WorkerArchetype }) {
  return (
    <g>
      {/* Head */}
      <circle cx={30} cy={20} r={10} fill={arch.color} />
      {/* Shoulders + torso */}
      <path
        d="M 8 78 Q 8 44 30 36 Q 52 44 52 78 Z"
        fill={arch.color}
      />
      {/* Highlight stripe */}
      <rect x={28} y={36} width={4} height={42} fill={SW_COLORS.paper} opacity={0.18} />
    </g>
  );
}

// ── Chibi avatar — body + role-specific accessories ──────────────────────
function ChibiAvatar({ arch, role }: { arch: WorkerArchetype; role: WorkerRole }) {
  const skin = '#E8C39A';
  const hair = SW_COLORS.ink;
  const apron = arch.color;
  return (
    <g>
      {/* Head */}
      <circle cx={30} cy={18} r={11} fill={skin} stroke={SW_COLORS.ink} strokeWidth={1} />
      {/* Hair / cap */}
      <Hair role={role} hair={hair} />
      {/* Eyes */}
      <circle cx={26} cy={18} r={1.2} fill={SW_COLORS.ink} />
      <circle cx={34} cy={18} r={1.2} fill={SW_COLORS.ink} />
      {/* Body / torso */}
      <path
        d={`M 14 78 L 14 40 Q 14 30 30 30 Q 46 30 46 40 L 46 78 Z`}
        fill={apron}
        stroke={SW_COLORS.ink}
        strokeWidth={1}
      />
      {/* Apron pocket */}
      <rect x={22} y={50} width={16} height={10} rx={1.5} fill={SW_COLORS.paper} opacity={0.85} stroke={SW_COLORS.ink} strokeWidth={0.6} />
      {/* Arms */}
      <rect x={6} y={42} width={10} height={26} rx={4} fill={apron} stroke={SW_COLORS.ink} strokeWidth={1} />
      <rect x={44} y={42} width={10} height={26} rx={4} fill={apron} stroke={SW_COLORS.ink} strokeWidth={1} />
      {/* Hands */}
      <circle cx={11} cy={70} r={3.5} fill={skin} stroke={SW_COLORS.ink} strokeWidth={0.8} />
      <circle cx={49} cy={70} r={3.5} fill={skin} stroke={SW_COLORS.ink} strokeWidth={0.8} />
      {/* Role tool */}
      <RoleTool role={role} />
      {/* Role tag */}
      <RoleBadge role={role} arch={arch} />
    </g>
  );
}

function Hair({ role, hair }: { role: WorkerRole; hair: string }) {
  if (role === 'qc_inline' || role === 'qc_final') {
    // QC cap
    return (
      <g>
        <ellipse cx={30} cy={10} rx={12} ry={5} fill={SW_COLORS.alarm} />
        <rect x={24} y={8} width={12} height={3} fill={SW_COLORS.paper} />
      </g>
    );
  }
  if (role === 'mechanic') {
    // mechanic cap
    return (
      <g>
        <path d={`M 18 12 Q 30 4 42 12 L 42 14 L 18 14 Z`} fill={SW_COLORS.steel} />
        <rect x={18} y={14} width={24} height={2} fill={SW_COLORS.steelLite} />
      </g>
    );
  }
  if (role === 'supervisor') {
    return (
      <g>
        <path d={`M 19 13 Q 30 4 41 13 L 41 16 L 19 16 Z`} fill={hair} />
        <rect x={18} y={16} width={24} height={2} fill={SW_COLORS.brand} />
      </g>
    );
  }
  // Generic hair
  return <path d={`M 19 13 Q 30 5 41 13 L 41 17 L 19 17 Z`} fill={hair} />;
}

function RoleTool({ role }: { role: WorkerRole }) {
  switch (role) {
    case 'sew_op':
      // tiny needle in hand
      return (
        <g>
          <line x1={49} y1={70} x2={56} y2={62} stroke={SW_COLORS.steel} strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={56} cy={62} r={1} fill={SW_COLORS.thread} />
        </g>
      );
    case 'cutter':
      // scissors
      return (
        <g>
          <circle cx={9} cy={70} r={2} fill="none" stroke={SW_COLORS.steel} strokeWidth={1.2} />
          <circle cx={13} cy={70} r={2} fill="none" stroke={SW_COLORS.steel} strokeWidth={1.2} />
          <line x1={10} y1={70} x2={4} y2={64} stroke={SW_COLORS.steel} strokeWidth={1.2} />
          <line x1={12} y1={70} x2={18} y2={64} stroke={SW_COLORS.steel} strokeWidth={1.2} />
        </g>
      );
    case 'spreader':
      // ruler bar
      return (
        <rect x={2} y={68} width={16} height={3} fill={SW_COLORS.fabric} stroke={SW_COLORS.ink} strokeWidth={0.6} />
      );
    case 'bundler':
      // ticket
      return (
        <g>
          <rect x={4} y={66} width={10} height={8} fill={SW_COLORS.thread} stroke={SW_COLORS.ink} strokeWidth={0.6} />
          <line x1={6} y1={68} x2={12} y2={68} stroke={SW_COLORS.ink} strokeWidth={0.5} />
          <line x1={6} y1={70} x2={12} y2={70} stroke={SW_COLORS.ink} strokeWidth={0.5} />
        </g>
      );
    case 'fuser':
      // small heat icon
      return (
        <path
          d="M 49 66 q -2 -3 0 -6 q 2 -3 0 -6"
          stroke={SW_COLORS.alarm}
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
        />
      );
    case 'embroidery_op':
      return <circle cx={49} cy={68} r={3} fill="none" stroke={SW_COLORS.trim} strokeWidth={1.2} />;
    case 'qc_inline':
    case 'qc_final':
      // magnifier
      return (
        <g>
          <circle cx={49} cy={68} r={3.5} fill="none" stroke={SW_COLORS.steel} strokeWidth={1.2} />
          <line x1={51.5} y1={70.5} x2={55} y2={74} stroke={SW_COLORS.steel} strokeWidth={1.2} />
        </g>
      );
    case 'presser':
      // mini iron
      return (
        <path
          d={`M 4 70 L 14 68 L 16 73 L 4 73 Z`}
          fill={SW_COLORS.thread}
          stroke={SW_COLORS.ink}
          strokeWidth={0.6}
        />
      );
    case 'packer':
      // box
      return (
        <g>
          <rect x={45} y={66} width={10} height={8} fill={SW_COLORS.ship} stroke={SW_COLORS.ink} strokeWidth={0.6} />
          <line x1={50} y1={66} x2={50} y2={74} stroke={SW_COLORS.ink} strokeWidth={0.5} />
        </g>
      );
    case 'material_handler':
      // trolley wheels
      return (
        <g>
          <rect x={4} y={69} width={14} height={2} fill={SW_COLORS.steel} />
          <circle cx={6} cy={73} r={2} fill={SW_COLORS.ink} />
          <circle cx={16} cy={73} r={2} fill={SW_COLORS.ink} />
        </g>
      );
    case 'mechanic':
      // wrench
      return (
        <g>
          <line x1={48} y1={70} x2={56} y2={62} stroke={SW_COLORS.steel} strokeWidth={2} strokeLinecap="round" />
          <circle cx={57} cy={61} r={2} fill={SW_COLORS.steel} />
        </g>
      );
    case 'supervisor':
      // clipboard
      return (
        <g>
          <rect x={45} y={64} width={9} height={11} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={0.6} />
          <rect x={47} y={63} width={5} height={2} fill={SW_COLORS.steel} />
          <line x1={47} y1={67} x2={52} y2={67} stroke={SW_COLORS.ink} strokeWidth={0.4} />
          <line x1={47} y1={69} x2={52} y2={69} stroke={SW_COLORS.ink} strokeWidth={0.4} />
          <line x1={47} y1={71} x2={52} y2={71} stroke={SW_COLORS.ink} strokeWidth={0.4} />
        </g>
      );
    case 'merchandiser':
      // pencil
      return (
        <g>
          <line x1={48} y1={70} x2={56} y2={62} stroke={SW_COLORS.bobbin} strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={56} cy={62} r={1.2} fill={SW_COLORS.ink} />
        </g>
      );
    case 'helper':
    default:
      return null;
  }
}

function RoleBadge({ role, arch }: { role: WorkerRole; arch: WorkerArchetype }) {
  // Small role-code chip on the chest
  const code = ROLE_CODE[role] ?? '••';
  return (
    <g>
      <rect x={20} y={36} width={20} height={9} rx={2} fill={SW_COLORS.ink} />
      <text
        x={30}
        y={42.5}
        fontSize={6}
        fontWeight={800}
        textAnchor="middle"
        fill={arch.color}
        fontFamily="ui-monospace, monospace"
      >
        {code}
      </text>
    </g>
  );
}

const ROLE_CODE: Record<WorkerRole, string> = {
  sew_op: 'SEW',
  helper: 'HLP',
  cutter: 'CUT',
  spreader: 'SPR',
  bundler: 'BND',
  fuser: 'FUS',
  embroidery_op: 'EMB',
  qc_inline: 'QC1',
  qc_final: 'QC2',
  presser: 'PRS',
  packer: 'PCK',
  material_handler: 'MAT',
  mechanic: 'MEC',
  supervisor: 'SUP',
  merchandiser: 'MER',
};
