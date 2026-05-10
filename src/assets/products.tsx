/**
 * Product sprites — what flows through the factory. Three families:
 *
 *   raw materials    — fabric roll, thread cone, trim/button card
 *   work-in-progress — cut-piece bundle, partial garment, hanger garment
 *   finished goods   — folded garment in poly bag, packed carton
 *
 * Plus one sprite per garment template (T-shirt, polo, formal shirt,
 * trouser, sweatshirt) so the order/factory views can show the actual
 * SKU silhouette instead of a generic icon.
 *
 * All sprites are drawn on a 100x100 viewBox. Garment colours come from a
 * small palette of common factory colourways and can be overridden via prop.
 */

import type { CSSProperties } from 'react';
import { SW_COLORS } from '../design/tokens';

export type ProductKind =
  // raw
  | 'fabric_roll'
  | 'thread_cone'
  | 'trim_card'
  | 'button_card'
  | 'zipper'
  // wip
  | 'bundle'
  | 'cut_piece'
  | 'wip_garment'
  | 'hanger'
  // finished garments (silhouettes)
  | 'tshirt'
  | 'polo'
  | 'shirt'
  | 'trouser'
  | 'sweatshirt'
  // packed
  | 'polybag'
  | 'carton';

interface ProductSpriteProps {
  kind: ProductKind;
  size?: number;
  /** Override the primary fabric colour. */
  color?: string;
  /** Bundle/carton count badge. */
  count?: number;
  cssStyle?: CSSProperties;
}

export function ProductSprite({
  kind,
  size = 64,
  color,
  count,
  cssStyle,
}: ProductSpriteProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: 'block', overflow: 'visible', ...cssStyle }}
      aria-label={kind.replace('_', ' ')}
    >
      <Body kind={kind} color={color} />
      {typeof count === 'number' && (
        <g>
          <circle cx={84} cy={18} r={12} fill={SW_COLORS.ink} />
          <text
            x={84}
            y={18}
            fontSize={10}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="central"
            fill={SW_COLORS.brand}
            fontFamily="ui-monospace, monospace"
          >
            ×{count}
          </text>
        </g>
      )}
    </svg>
  );
}

function Body({ kind, color }: { kind: ProductKind; color?: string }) {
  switch (kind) {
    case 'fabric_roll':
      return <FabricRoll color={color ?? SW_COLORS.fabric} />;
    case 'thread_cone':
      return <ThreadCone color={color ?? SW_COLORS.thread} />;
    case 'trim_card':
      return <TrimCard color={color ?? SW_COLORS.trim} />;
    case 'button_card':
      return <ButtonCard color={color ?? SW_COLORS.bobbin} />;
    case 'zipper':
      return <Zipper color={color ?? SW_COLORS.steel} />;
    case 'bundle':
      return <Bundle color={color ?? SW_COLORS.fabric} />;
    case 'cut_piece':
      return <CutPiece color={color ?? SW_COLORS.fabric} />;
    case 'wip_garment':
      return <WipGarment color={color ?? SW_COLORS.fabric} />;
    case 'hanger':
      return <HangerGarment color={color ?? SW_COLORS.brand} />;
    case 'tshirt':
      return <Tshirt color={color ?? SW_COLORS.brand} />;
    case 'polo':
      return <Polo color={color ?? SW_COLORS.bobbin} />;
    case 'shirt':
      return <FormalShirt color={color ?? SW_COLORS.paper} />;
    case 'trouser':
      return <Trouser color={color ?? SW_COLORS.steel} />;
    case 'sweatshirt':
      return <Sweatshirt color={color ?? SW_COLORS.trim} />;
    case 'polybag':
      return <Polybag color={color ?? SW_COLORS.brand} />;
    case 'carton':
      return <Carton />;
  }
}

// ── Raw ─────────────────────────────────────────────────────────────────
function FabricRoll({ color }: { color: string }) {
  return (
    <g>
      <rect x={10} y={30} width={80} height={40} rx={4} fill={color} stroke={SW_COLORS.ink} strokeWidth={1.5} />
      <ellipse cx={10} cy={50} rx={4} ry={20} fill={SW_COLORS.ink} opacity={0.85} />
      <ellipse cx={90} cy={50} rx={4} ry={20} fill={color} stroke={SW_COLORS.ink} strokeWidth={1.5} />
      {[40, 50, 60].map((y) => (
        <line key={y} x1={14} y1={y} x2={86} y2={y} stroke={SW_COLORS.paper} strokeWidth={0.6} opacity={0.5} />
      ))}
      <rect x={14} y={34} width={20} height={6} rx={1} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={0.5} />
    </g>
  );
}

function ThreadCone({ color }: { color: string }) {
  return (
    <g>
      <ellipse cx={50} cy={84} rx={22} ry={5} fill={SW_COLORS.ink} opacity={0.15} />
      <path
        d={`M 32 80 L 68 80 L 60 22 L 40 22 Z`}
        fill={color}
        stroke={SW_COLORS.ink}
        strokeWidth={1.2}
      />
      {[30, 40, 50, 60, 70].map((y) => (
        <line
          key={y}
          x1={36 + (y - 22) * 0.07}
          y1={y}
          x2={64 - (y - 22) * 0.07}
          y2={y}
          stroke={SW_COLORS.paper}
          strokeWidth={0.5}
          opacity={0.5}
        />
      ))}
      <ellipse cx={50} cy={22} rx={10} ry={3} fill={SW_COLORS.steel} />
      <line x1={50} y1={22} x2={50} y2={10} stroke={color} strokeWidth={1} />
      <circle cx={50} cy={10} r={2} fill={color} />
    </g>
  );
}

function TrimCard({ color }: { color: string }) {
  return (
    <g>
      <rect x={20} y={20} width={60} height={60} rx={3} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={1.2} />
      <rect x={26} y={26} width={48} height={10} fill={color} />
      <text x={50} y={32.5} fontSize={6} fontWeight={700} textAnchor="middle" fill={SW_COLORS.paper} dominantBaseline="central">TRIM</text>
      {[44, 54, 64].map((y) => (
        <g key={y}>
          <circle cx={32} cy={y} r={2.5} fill={color} stroke={SW_COLORS.ink} strokeWidth={0.5} />
          <circle cx={50} cy={y} r={2.5} fill={color} stroke={SW_COLORS.ink} strokeWidth={0.5} />
          <circle cx={68} cy={y} r={2.5} fill={color} stroke={SW_COLORS.ink} strokeWidth={0.5} />
        </g>
      ))}
    </g>
  );
}

function ButtonCard({ color }: { color: string }) {
  return (
    <g>
      <rect x={18} y={20} width={64} height={60} rx={3} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={1.2} />
      {Array.from({ length: 4 }).map((_, r) =>
        Array.from({ length: 4 }).map((_, c) => (
          <g key={`${r}-${c}`}>
            <circle cx={28 + c * 14} cy={32 + r * 12} r={4} fill={color} stroke={SW_COLORS.ink} strokeWidth={0.6} />
            <circle cx={26.5 + c * 14} cy={30.5 + r * 12} r={0.5} fill={SW_COLORS.ink} />
            <circle cx={29.5 + c * 14} cy={30.5 + r * 12} r={0.5} fill={SW_COLORS.ink} />
            <circle cx={26.5 + c * 14} cy={33.5 + r * 12} r={0.5} fill={SW_COLORS.ink} />
            <circle cx={29.5 + c * 14} cy={33.5 + r * 12} r={0.5} fill={SW_COLORS.ink} />
          </g>
        )),
      )}
    </g>
  );
}

function Zipper({ color }: { color: string }) {
  return (
    <g>
      <rect x={42} y={14} width={16} height={72} rx={2} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={1} />
      {Array.from({ length: 14 }).map((_, i) => (
        <g key={i}>
          <rect x={42} y={16 + i * 5} width={7} height={3} fill={color} />
          <rect x={51} y={18.5 + i * 5} width={7} height={3} fill={color} />
        </g>
      ))}
      <path d="M 38 50 L 62 50 L 56 60 L 44 60 Z" fill={color} stroke={SW_COLORS.ink} strokeWidth={1} />
      <line x1={50} y1={60} x2={50} y2={68} stroke={SW_COLORS.ink} strokeWidth={2} />
      <circle cx={50} cy={70} r={3} fill={color} stroke={SW_COLORS.ink} strokeWidth={1} />
    </g>
  );
}

// ── Work in progress ────────────────────────────────────────────────────
function Bundle({ color }: { color: string }) {
  return (
    <g>
      <ellipse cx={50} cy={86} rx={32} ry={4} fill={SW_COLORS.ink} opacity={0.18} />
      {/* Stack */}
      {[60, 50, 40].map((y, i) => (
        <rect
          key={y}
          x={20 + i * 1}
          y={y}
          width={60 - i * 2}
          height={14}
          rx={2}
          fill={color}
          stroke={SW_COLORS.ink}
          strokeWidth={1}
          opacity={0.85 + i * 0.05}
        />
      ))}
      {/* String tying the bundle */}
      <line x1={35} y1={36} x2={35} y2={78} stroke={SW_COLORS.ink} strokeWidth={1.2} />
      <line x1={65} y1={36} x2={65} y2={78} stroke={SW_COLORS.ink} strokeWidth={1.2} />
      {/* Ticket */}
      <rect x={36} y={28} width={28} height={12} rx={1.5} fill={SW_COLORS.thread} stroke={SW_COLORS.ink} strokeWidth={0.8} />
      <line x1={40} y1={32} x2={60} y2={32} stroke={SW_COLORS.ink} strokeWidth={0.5} />
      <line x1={40} y1={36} x2={56} y2={36} stroke={SW_COLORS.ink} strokeWidth={0.5} />
    </g>
  );
}

function CutPiece({ color }: { color: string }) {
  return (
    <g>
      {/* A back panel of a t-shirt, pre-sewn */}
      <path
        d={`M 20 28 L 30 22 L 40 26 L 60 26 L 70 22 L 80 28 L 76 38 L 68 36 L 68 80 L 32 80 L 32 36 L 24 38 Z`}
        fill={color}
        stroke={SW_COLORS.ink}
        strokeWidth={1.2}
      />
      {/* Cut markers */}
      <path
        d="M 20 28 L 30 22 L 40 26 L 60 26 L 70 22 L 80 28 L 76 38 L 68 36 L 68 80 L 32 80 L 32 36 L 24 38 Z"
        fill="none"
        stroke={SW_COLORS.alarm}
        strokeWidth={0.6}
        strokeDasharray="3 2"
        opacity={0.7}
      />
    </g>
  );
}

function WipGarment({ color }: { color: string }) {
  return (
    <g>
      {/* T-shirt-ish body, half stitched */}
      <Tshirt color={color} />
      {/* Seam lines */}
      <line x1={32} y1={40} x2={32} y2={80} stroke={SW_COLORS.alarm} strokeWidth={0.8} strokeDasharray="2 2" />
      <line x1={68} y1={40} x2={68} y2={80} stroke={SW_COLORS.alarm} strokeWidth={0.8} strokeDasharray="2 2" />
      {/* In-progress badge */}
      <circle cx={20} cy={20} r={8} fill={SW_COLORS.warn} stroke={SW_COLORS.ink} strokeWidth={1} />
      <text x={20} y={20} fontSize={8} fontWeight={800} textAnchor="middle" dominantBaseline="central" fill={SW_COLORS.ink}>WIP</text>
    </g>
  );
}

function HangerGarment({ color }: { color: string }) {
  return (
    <g>
      {/* Hanger */}
      <path
        d={`M 50 14 q -4 -4 -8 0 q 0 4 4 6 L 50 22`}
        stroke={SW_COLORS.ink}
        strokeWidth={1.4}
        fill="none"
      />
      <path d={`M 18 32 L 50 22 L 82 32 Z`} fill="none" stroke={SW_COLORS.ink} strokeWidth={1.4} strokeLinejoin="round" />
      {/* Garment */}
      <path
        d={`M 22 32 L 30 28 L 40 34 L 60 34 L 70 28 L 78 32 L 74 44 L 66 42 L 66 88 L 34 88 L 34 42 L 26 44 Z`}
        fill={color}
        stroke={SW_COLORS.ink}
        strokeWidth={1.2}
      />
    </g>
  );
}

// ── Garment templates ───────────────────────────────────────────────────
function Tshirt({ color }: { color: string }) {
  return (
    <g>
      <path
        d={`M 18 32 L 30 22 L 40 28 Q 50 32 60 28 L 70 22 L 82 32 L 76 44 L 68 42 L 68 86 L 32 86 L 32 42 L 24 44 Z`}
        fill={color}
        stroke={SW_COLORS.ink}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* Neck rib */}
      <path d={`M 40 28 Q 50 33 60 28`} fill="none" stroke={SW_COLORS.ink} strokeWidth={1} />
      {/* Body hem */}
      <line x1={32} y1={82} x2={68} y2={82} stroke={SW_COLORS.ink} strokeWidth={0.6} opacity={0.5} />
    </g>
  );
}

function Polo({ color }: { color: string }) {
  return (
    <g>
      <Tshirt color={color} />
      {/* Collar */}
      <path
        d={`M 40 28 L 44 26 L 50 32 L 56 26 L 60 28 L 56 36 L 50 38 L 44 36 Z`}
        fill={SW_COLORS.paper}
        stroke={SW_COLORS.ink}
        strokeWidth={1}
      />
      {/* Placket */}
      <line x1={50} y1={32} x2={50} y2={48} stroke={SW_COLORS.ink} strokeWidth={1} />
      <circle cx={50} cy={38} r={1} fill={SW_COLORS.ink} />
      <circle cx={50} cy={44} r={1} fill={SW_COLORS.ink} />
    </g>
  );
}

function FormalShirt({ color }: { color: string }) {
  return (
    <g>
      {/* Body — long sleeves */}
      <path
        d={`M 14 36 L 26 22 L 36 28 Q 50 32 64 28 L 74 22 L 86 36 L 80 78 L 70 76 L 70 88 L 30 88 L 30 76 L 20 78 Z`}
        fill={color}
        stroke={SW_COLORS.ink}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* Collar */}
      <path
        d={`M 36 28 L 42 24 L 50 34 L 58 24 L 64 28 L 58 38 L 50 40 L 42 38 Z`}
        fill={SW_COLORS.paper}
        stroke={SW_COLORS.ink}
        strokeWidth={1}
      />
      <line x1={50} y1={34} x2={50} y2={84} stroke={SW_COLORS.ink} strokeWidth={1} />
      {/* Buttons */}
      {[42, 50, 58, 66, 74].map((y) => (
        <circle key={y} cx={50} cy={y} r={1.2} fill={SW_COLORS.ink} />
      ))}
      {/* Pocket */}
      <rect x={34} y={48} width={12} height={14} fill="none" stroke={SW_COLORS.ink} strokeWidth={0.8} />
    </g>
  );
}

function Trouser({ color }: { color: string }) {
  return (
    <g>
      {/* Waistband */}
      <rect x={22} y={14} width={56} height={8} fill={SW_COLORS.steelLite} stroke={SW_COLORS.ink} strokeWidth={1} />
      {/* Body */}
      <path
        d={`M 22 22 L 78 22 L 74 88 L 56 88 L 50 36 L 44 88 L 26 88 Z`}
        fill={color}
        stroke={SW_COLORS.ink}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* Fly */}
      <line x1={50} y1={22} x2={50} y2={36} stroke={SW_COLORS.ink} strokeWidth={1} strokeDasharray="2 2" />
      {/* Pockets */}
      <path d={`M 28 22 q 4 8 12 8`} fill="none" stroke={SW_COLORS.ink} strokeWidth={0.8} />
      <path d={`M 72 22 q -4 8 -12 8`} fill="none" stroke={SW_COLORS.ink} strokeWidth={0.8} />
      {/* Belt loops */}
      {[30, 42, 58, 70].map((x) => (
        <rect key={x} x={x - 1.5} y={12} width={3} height={4} fill={color} stroke={SW_COLORS.ink} strokeWidth={0.6} />
      ))}
    </g>
  );
}

function Sweatshirt({ color }: { color: string }) {
  return (
    <g>
      {/* Hood */}
      <path
        d={`M 38 26 Q 50 12 62 26 L 62 32 L 38 32 Z`}
        fill={color}
        stroke={SW_COLORS.ink}
        strokeWidth={1.3}
      />
      <path d={`M 42 24 Q 50 18 58 24`} fill="none" stroke={SW_COLORS.ink} strokeWidth={0.8} opacity={0.5} />
      {/* Body */}
      <path
        d={`M 18 36 L 30 26 L 40 30 L 60 30 L 70 26 L 82 36 L 78 50 L 70 48 L 70 86 L 30 86 L 30 48 L 22 50 Z`}
        fill={color}
        stroke={SW_COLORS.ink}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* Kangaroo pocket */}
      <path
        d={`M 32 60 L 68 60 L 64 76 L 36 76 Z`}
        fill="none"
        stroke={SW_COLORS.ink}
        strokeWidth={0.8}
      />
      {/* Drawstrings */}
      <line x1={46} y1={28} x2={46} y2={40} stroke={SW_COLORS.paper} strokeWidth={1} />
      <line x1={54} y1={28} x2={54} y2={40} stroke={SW_COLORS.paper} strokeWidth={1} />
      {/* Cuffs */}
      <rect x={18} y={42} width={6} height={6} fill={SW_COLORS.steelLite} opacity={0.5} />
      <rect x={76} y={42} width={6} height={6} fill={SW_COLORS.steelLite} opacity={0.5} />
      <rect x={30} y={82} width={40} height={4} fill={SW_COLORS.steelLite} opacity={0.5} />
    </g>
  );
}

// ── Packed ──────────────────────────────────────────────────────────────
function Polybag({ color }: { color: string }) {
  return (
    <g>
      {/* Bag outline */}
      <path
        d={`M 20 24 L 80 24 L 80 86 L 20 86 Z`}
        fill={SW_COLORS.paper}
        opacity={0.85}
        stroke={SW_COLORS.ink}
        strokeWidth={1.2}
      />
      {/* Hang hole */}
      <ellipse cx={50} cy={20} rx={6} ry={2} fill="none" stroke={SW_COLORS.ink} strokeWidth={1} />
      {/* Folded garment inside */}
      <rect x={28} y={36} width={44} height={12} rx={1} fill={color} />
      <rect x={28} y={50} width={44} height={12} rx={1} fill={color} opacity={0.85} />
      <rect x={28} y={64} width={44} height={12} rx={1} fill={color} opacity={0.7} />
      {/* Sticker */}
      <rect x={56} y={68} width={18} height={12} rx={1.5} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={0.6} />
      <line x1={58} y1={72} x2={72} y2={72} stroke={SW_COLORS.ink} strokeWidth={0.5} />
      <line x1={58} y1={76} x2={68} y2={76} stroke={SW_COLORS.ink} strokeWidth={0.5} />
      {/* Plastic shine */}
      <line x1={26} y1={28} x2={32} y2={84} stroke={SW_COLORS.paper} strokeWidth={1.5} opacity={0.8} />
    </g>
  );
}

function Carton() {
  const cardboard = '#C49A6C';
  const cardShade = '#A37D52';
  return (
    <g>
      {/* Top face */}
      <path
        d={`M 14 30 L 50 16 L 86 30 L 50 44 Z`}
        fill={cardboard}
        stroke={SW_COLORS.ink}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Right face */}
      <path
        d={`M 86 30 L 86 76 L 50 90 L 50 44 Z`}
        fill={cardShade}
        stroke={SW_COLORS.ink}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Left face */}
      <path
        d={`M 14 30 L 14 76 L 50 90 L 50 44 Z`}
        fill={cardboard}
        stroke={SW_COLORS.ink}
        strokeWidth={1.2}
        strokeLinejoin="round"
        opacity={0.92}
      />
      {/* Tape on top */}
      <path d={`M 50 16 L 50 44`} stroke={SW_COLORS.thread} strokeWidth={3} opacity={0.8} />
      {/* Label */}
      <rect x={56} y={56} width={22} height={14} fill={SW_COLORS.paper} stroke={SW_COLORS.ink} strokeWidth={0.8} />
      <line x1={59} y1={60} x2={75} y2={60} stroke={SW_COLORS.ink} strokeWidth={0.5} />
      <line x1={59} y1={64} x2={73} y2={64} stroke={SW_COLORS.ink} strokeWidth={0.5} />
      <line x1={59} y1={68} x2={70} y2={68} stroke={SW_COLORS.ink} strokeWidth={0.5} />
    </g>
  );
}

export const PRODUCT_KINDS: ProductKind[] = [
  'fabric_roll',
  'thread_cone',
  'trim_card',
  'button_card',
  'zipper',
  'bundle',
  'cut_piece',
  'wip_garment',
  'hanger',
  'tshirt',
  'polo',
  'shirt',
  'trouser',
  'sweatshirt',
  'polybag',
  'carton',
];

export const PRODUCT_LABELS: Record<ProductKind, string> = {
  fabric_roll: 'Fabric roll',
  thread_cone: 'Thread cone',
  trim_card: 'Trim card',
  button_card: 'Button card',
  zipper: 'Zipper',
  bundle: 'Cut-piece bundle',
  cut_piece: 'Cut panel',
  wip_garment: 'WIP garment',
  hanger: 'Hanger garment',
  tshirt: 'T-shirt',
  polo: 'Polo',
  shirt: 'Formal shirt',
  trouser: 'Trouser',
  sweatshirt: 'Sweatshirt',
  polybag: 'Polybag',
  carton: 'Export carton',
};

export const PRODUCT_GROUPS: { label: string; kinds: ProductKind[] }[] = [
  { label: 'Raw materials', kinds: ['fabric_roll', 'thread_cone', 'trim_card', 'button_card', 'zipper'] },
  { label: 'Work in progress', kinds: ['bundle', 'cut_piece', 'wip_garment', 'hanger'] },
  { label: 'Garments', kinds: ['tshirt', 'polo', 'shirt', 'trouser', 'sweatshirt'] },
  { label: 'Packed', kinds: ['polybag', 'carton'] },
];
