import {
  useState,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// STITCHWORKS — LIVE SIM (rebuilt v2)
// Iso / Top / Heatmap views, animated workers + bundles, click-to-inspect.
// Ported wholesale from .design-import/live-sim*.jsx (and the inlined HTML
// reference). Every visual element — sprite SVG paths, animation, palette,
// font, layout constant — is preserved verbatim from the prototype. The
// internal animation (`t` counter + bundle/operator arrays) is decoupled
// from the discrete-event engine in src/simulation; this is a pure visual
// sim for now.
// ============================================================================

// ----------------------------------------------------------------------------
// Iso math + grid constants
// ----------------------------------------------------------------------------
const LS_TILE_W = 26; // half-width of a diamond
const LS_TILE_H = 13; // half-height
const LS_GRID_W = 64;
const LS_GRID_H = 36;

interface IsoPoint {
  x: number;
  y: number;
}

function lsIso(x: number, y: number, z: number = 0): IsoPoint {
  return {
    x: (x - y) * LS_TILE_W,
    y: (x + y) * LS_TILE_H - z,
  };
}

// Color palette (mirrors SW_COLORS — keep local copy so the iso sprites can
// be re-themed independently of the global tokens if needed).
const LSS_COL = {
  ink: '#0F1419',
  paper: '#FBFAF6',
  paperDeep: '#F2EEE3',
  steel: '#2A3340',
  steelLite: '#3D4856',
  brand: '#FF5B26',
  brandDeep: '#D43E0F',
  thread: '#FFB800',
  fabric: '#2BA88B',
  bobbin: '#4F7CFF',
  press: '#C73E5F',
  trim: '#8B5CF6',
  ship: '#0EA5A4',
  ok: '#1FB36B',
  warn: '#F5A623',
  alarm: '#E74C3C',
  line: '#0F141930',
  muted: '#0F141999',
};

const LSV_FONTS = {
  display: '"Archivo Black", system-ui, sans-serif',
  mono: '"JetBrains Mono", monospace',
  body: '"Inter", system-ui, sans-serif',
};

// shade(hex, amt) — scale rgb channels by (1+amt). Negative = darker.
function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const a = (v: number) => Math.max(0, Math.min(255, Math.round(v + v * amt)));
  return (
    '#' +
    [a(r), a(g), a(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

// ----------------------------------------------------------------------------
// Layout types + zone defs
// ----------------------------------------------------------------------------
interface Zone {
  id: string;
  label: string;
  x0: number;
  y0: number;
  w: number;
  h: number;
  color: string;
}

interface Station {
  id: string;
  x: number;
  y: number;
  kind: string;
  op?: string;
  zone?: string;
  row?: number;
  col?: number;
  cell?: number;
  cluster?: number;
  sync?: boolean;
}

interface Conveyor {
  x0: number;
  x1: number;
  y: number;
  dir: number;
}

interface HangerRailDef {
  x0: number;
  x1: number;
  y: number;
}

interface Layout {
  stations: Station[];
  conveyors: Conveyor[];
  hangers: HangerRailDef[];
}

interface Operator {
  id: string;
  stationId: string;
  hx: number;
  hy: number;
  x: number;
  y: number;
  target: { x: number; y: number } | null;
  state: 'work' | 'walk' | 'idle';
  skin: string;
  role: string;
  productivity: number;
  pieces: number;
}

interface Bundle {
  id: string;
  x: number;
  y: number;
  target: { x: number; y: number } | null;
  stage: 'cut' | 'sew' | 'qc';
  color: string;
  pieces: number;
}

interface SimEvent {
  id: number;
  kind: 'breakdown' | 'defect' | 'good';
  label: string;
  station: string;
  stationId: string;
  active: boolean;
  born: number;
}

interface Selected {
  kind: 'station' | 'worker';
  id: string;
}

const LS_ZONE_DEFS: Zone[] = [
  { id: 'dock_in',    label: 'DOCK · IN',    x0: 1,  y0: 4,  w: 6,  h: 12, color: '#3D4856' },
  { id: 'fabric',     label: 'FABRIC RACK',  x0: 8,  y0: 4,  w: 4,  h: 12, color: '#2BA88B' },
  { id: 'spreading',  label: 'SPREADING',    x0: 13, y0: 4,  w: 6,  h: 12, color: '#FFB800' },
  { id: 'cutting',    label: 'CUTTING',      x0: 20, y0: 4,  w: 5,  h: 12, color: '#FF5B26' },
  { id: 'bundling',   label: 'BUNDLING',     x0: 26, y0: 4,  w: 3,  h: 12, color: '#8B5CF6' },
  { id: 'sewing',     label: 'SEWING',       x0: 30, y0: 3,  w: 18, h: 18, color: '#4F7CFF' },
  { id: 'qc',         label: 'QC',           x0: 49, y0: 4,  w: 4,  h: 8,  color: '#1FB36B' },
  { id: 'finishing',  label: 'FINISHING',    x0: 49, y0: 13, w: 4,  h: 8,  color: '#C73E5F' },
  { id: 'pack',       label: 'PACK',         x0: 54, y0: 4,  w: 4,  h: 12, color: '#0EA5A4' },
  { id: 'dock_out',   label: 'DOCK · OUT',   x0: 59, y0: 4,  w: 4,  h: 12, color: '#3D4856' },
];

// Sewing system station layouts — each returns {stations, conveyors, hangers}
function lsBuildSewLayout(system: string): Layout {
  const z = LS_ZONE_DEFS.find((zz) => zz.id === 'sewing')!;
  const stations: Station[] = [];
  const conveyors: Conveyor[] = [];
  const hangers: HangerRailDef[] = [];

  if (system === 'PBS') {
    const ops = ['Shoulder', 'Sleeve', 'Side seam', 'Collar', 'Placket', 'Cuff', 'Hem', 'Buttonhole', 'Button', 'Label', 'Inspect', 'Bundle'];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 6; c++) {
        stations.push({
          id: `sew-${r}-${c}`,
          x: z.x0 + 1 + c * 3,
          y: z.y0 + 2 + r * 8,
          op: ops[r * 6 + c],
          kind: 'sew_pbs',
          row: r,
          col: c,
        });
      }
      conveyors.push({ y: z.y0 + 4 + r * 8, x0: z.x0 + 1, x1: z.x0 + 17, dir: r === 0 ? 1 : -1 });
    }
  } else if (system === 'UPS') {
    const ops = ['Front join', 'Back join', 'Shoulder', 'Sleeve attach', 'Side', 'Collar', 'Cuff', 'Hem', 'Topstitch', 'Inspect'];
    for (let i = 0; i < 10; i++) {
      stations.push({
        id: `sew-${i}`,
        x: z.x0 + 1 + i * 1.6,
        y: z.y0 + 8,
        op: ops[i],
        kind: 'sew_ups',
        row: 0,
        col: i,
      });
    }
    hangers.push({ y: z.y0 + 6, x0: z.x0 + 1, x1: z.x0 + 17 });
    hangers.push({ y: z.y0 + 12, x0: z.x0 + 1, x1: z.x0 + 17 });
  } else if (system === 'MOD' || system === 'Modular') {
    const ops = ['Pre-assembly', 'Body', 'Closing', 'Finish'];
    for (let cell = 0; cell < 4; cell++) {
      const cx = z.x0 + 2 + cell * 4;
      const cy = z.y0 + 4;
      const positions = [
        { dx: 0, dy: 0 }, { dx: 0, dy: 3 }, { dx: 0, dy: 6 },
        { dx: 2, dy: 6 }, { dx: 2, dy: 3 }, { dx: 2, dy: 0 },
      ];
      positions.forEach((p, i) => {
        stations.push({
          id: `sew-${cell}-${i}`,
          x: cx + p.dx,
          y: cy + p.dy,
          op: ops[Math.min(i, 3)],
          kind: 'sew_mod',
          row: cell,
          col: i,
          cell,
        });
      });
    }
  } else if (system === 'MAKE' || system === 'Make-Through') {
    const ops = ['Operator 1', 'Operator 2', 'Operator 3', 'Operator 4', 'Operator 5', 'Operator 6'];
    for (let i = 0; i < 6; i++) {
      stations.push({
        id: `sew-${i}`,
        x: z.x0 + 2 + (i % 3) * 5,
        y: z.y0 + 3 + Math.floor(i / 3) * 8,
        op: ops[i],
        kind: 'sew_make',
        row: Math.floor(i / 3),
        col: i % 3,
      });
    }
  } else if (system === 'STR' || system === 'Straight') {
    const ops = ['Hem', 'Side', 'Shoulder', 'Collar', 'Sleeve', 'Cuff', 'Placket', 'Buttonhole', 'Button', 'Topstitch', 'Trim', 'Inspect'];
    for (let i = 0; i < 12; i++) {
      stations.push({
        id: `sew-${i}`,
        x: z.x0 + 1 + i * 1.4,
        y: z.y0 + 8,
        op: ops[i],
        kind: 'sew_straight',
        row: 0,
        col: i,
      });
    }
    conveyors.push({ y: z.y0 + 9, x0: z.x0 + 1, x1: z.x0 + 17, dir: 1 });
  } else if (system === 'SYN' || system === 'Synchro') {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 8; c++) {
        stations.push({
          id: `sew-${r}-${c}`,
          x: z.x0 + 1 + c * 2,
          y: z.y0 + 4 + r * 8,
          op: `Op ${c + 1}`,
          kind: 'sew_pbs',
          row: r,
          col: c,
          sync: true,
        });
      }
      conveyors.push({ y: z.y0 + 5 + r * 8, x0: z.x0 + 1, x1: z.x0 + 17, dir: 1 });
    }
  } else if (system === 'CLP' || system === 'Clump') {
    for (let g = 0; g < 3; g++) {
      const cx = z.x0 + 3 + g * 5;
      const cy = z.y0 + 8;
      const positions = [
        { dx: -1, dy: -2 }, { dx: 1, dy: -2 }, { dx: 2, dy: 0 },
        { dx: 1, dy: 2 }, { dx: -1, dy: 2 }, { dx: -2, dy: 0 },
      ];
      positions.forEach((p, i) => {
        stations.push({
          id: `sew-${g}-${i}`,
          x: cx + p.dx,
          y: cy + p.dy,
          op: `Cluster ${g + 1}`,
          kind: 'sew_clp',
          row: g,
          col: i,
          cluster: g,
        });
      });
    }
  } else if (system === 'BUN' || system === 'Bundle') {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 5; c++) {
        stations.push({
          id: `sew-${r}-${c}`,
          x: z.x0 + 2 + c * 3,
          y: z.y0 + 4 + r * 8,
          op: `Op ${c + 1}`,
          kind: 'sew_pbs',
          row: r,
          col: c,
        });
      }
    }
  } else {
    return lsBuildSewLayout('PBS');
  }
  return { stations, conveyors, hangers };
}

// Static stations for non-sewing zones
function lsBuildStaticStations(): Station[] {
  return [
    { id: 'dock-in-1', x: 2, y: 6, kind: 'dock_in_bay', op: 'Bay 1', zone: 'dock_in' },
    { id: 'dock-in-2', x: 2, y: 12, kind: 'dock_in_bay', op: 'Bay 2', zone: 'dock_in' },
    { id: 'rack-1', x: 9, y: 6, kind: 'fabric_rack', op: 'Cotton', zone: 'fabric' },
    { id: 'rack-2', x: 9, y: 10, kind: 'fabric_rack', op: 'Poly blend', zone: 'fabric' },
    { id: 'rack-3', x: 9, y: 14, kind: 'fabric_rack', op: 'Knits', zone: 'fabric' },
    { id: 'spread-1', x: 15, y: 6, kind: 'spread_table', op: 'Spread 1', zone: 'spreading' },
    { id: 'spread-2', x: 15, y: 12, kind: 'spread_table', op: 'Spread 2', zone: 'spreading' },
    { id: 'cut-1', x: 22, y: 7, kind: 'cutter', op: 'Auto cutter', zone: 'cutting' },
    { id: 'cut-2', x: 22, y: 13, kind: 'cutter', op: 'Manual cut', zone: 'cutting' },
    { id: 'bun-1', x: 27, y: 7, kind: 'bundle_table', op: 'Bundling', zone: 'bundling' },
    { id: 'bun-2', x: 27, y: 13, kind: 'bundle_table', op: 'Bundling', zone: 'bundling' },
    { id: 'qc-1', x: 50, y: 6, kind: 'qc_table', op: 'QC bench', zone: 'qc' },
    { id: 'qc-2', x: 50, y: 9, kind: 'qc_table', op: 'QC bench', zone: 'qc' },
    { id: 'fin-1', x: 50, y: 15, kind: 'press', op: 'Steam press', zone: 'finishing' },
    { id: 'fin-2', x: 50, y: 18, kind: 'press', op: 'Iron station', zone: 'finishing' },
    { id: 'pack-1', x: 55, y: 7, kind: 'pack_table', op: 'Pack 1', zone: 'pack' },
    { id: 'pack-2', x: 55, y: 13, kind: 'pack_table', op: 'Pack 2', zone: 'pack' },
    { id: 'dock-out-1', x: 60, y: 8, kind: 'dock_out_bay', op: 'Outbound', zone: 'dock_out' },
    { id: 'dock-out-2', x: 60, y: 13, kind: 'dock_out_bay', op: 'Outbound', zone: 'dock_out' },
  ];
}

// ----------------------------------------------------------------------------
// LSSIsoBox — primitive: a 2D rect projected into iso parallelogram
// ----------------------------------------------------------------------------
interface LSSIsoBoxProps {
  x: number;
  y: number;
  w?: number;
  d?: number;
  h?: number;
  fill: string;
  top?: string;
  side1?: string;
  side2?: string;
  stroke?: string;
  strokeW?: number;
  opacity?: number;
}

function LSSIsoBox({
  x,
  y,
  w = 1,
  d = 1,
  h = 0.6,
  fill,
  top,
  side1,
  side2,
  stroke = '#0F1419',
  strokeW = 1,
  opacity = 1,
}: LSSIsoBoxProps) {
  const A = lsIso(x, y, h);
  const B = lsIso(x + w, y, h);
  const C = lsIso(x + w, y + d, h);
  const D = lsIso(x, y + d, h);
  // A0 omitted — the back-bottom corner is hidden by the front faces.
  const B0 = lsIso(x + w, y, 0);
  const C0 = lsIso(x + w, y + d, 0);
  const D0 = lsIso(x, y + d, 0);
  const top_ = top ?? fill;
  const s1 = side1 ?? fill;
  const s2 = side2 ?? (fill && shade(fill, -0.18));
  return (
    <>
      {/* left side (visible from front-right camera): facing +Y direction */}
      <polygon
        points={`${D.x},${D.y} ${C.x},${C.y} ${C0.x},${C0.y} ${D0.x},${D0.y}`}
        fill={s1}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={opacity}
      />
      {/* right side */}
      <polygon
        points={`${B.x},${B.y} ${C.x},${C.y} ${C0.x},${C0.y} ${B0.x},${B0.y}`}
        fill={s2}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={opacity}
      />
      {/* top */}
      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
        fill={top_}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={opacity}
      />
    </>
  );
}

// ----------------------------------------------------------------------------
// Iso ground tile (a parallelogram diamond at z=0)
// ----------------------------------------------------------------------------
interface LSSGroundTileProps {
  x: number;
  y: number;
  w?: number;
  d?: number;
  fill: string;
  opacity?: number;
  stroke?: string;
}

function LSSGroundTile({ x, y, w = 1, d = 1, fill, opacity = 1, stroke }: LSSGroundTileProps) {
  const A = lsIso(x, y, 0);
  const B = lsIso(x + w, y, 0);
  const C = lsIso(x + w, y + d, 0);
  const D = lsIso(x, y + d, 0);
  return (
    <polygon
      points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
      fill={fill}
      opacity={opacity}
      stroke={stroke || 'none'}
      strokeWidth={stroke ? 0.5 : 0}
    />
  );
}

// ----------------------------------------------------------------------------
// LSSWorker — tiny iso human, working pose if working=true
// ----------------------------------------------------------------------------
interface LSSWorkerProps {
  x: number;
  y: number;
  t?: number;
  working?: boolean;
  color?: string;
  walking?: boolean;
  rot?: number;
  highlighted?: boolean;
}

function LSSWorker({
  x,
  y,
  t = 0,
  working = false,
  color = LSS_COL.brand,
  walking = false,
  highlighted = false,
}: LSSWorkerProps) {
  const p = lsIso(x, y, 0);
  const bob = working ? Math.sin(t * 6) * 1.3 : 0;
  const stride = walking ? Math.sin(t * 8) * 2 : 0;
  const headY = -16 + bob;
  return (
    <g transform={`translate(${p.x}, ${p.y})`}>
      {/* shadow */}
      <ellipse cx={0} cy={1} rx={6} ry={2} fill="#0009" />
      {/* legs */}
      <rect x={-3} y={-7 + stride * 0.3} width={2.5} height={7} fill="#1a2230" rx={0.8} />
      <rect x={0.5} y={-7 - stride * 0.3} width={2.5} height={7} fill="#1a2230" rx={0.8} />
      {/* body (smock color = role) */}
      <rect
        x={-4}
        y={headY + 6}
        width={8}
        height={9}
        fill={color}
        stroke="#00000040"
        strokeWidth={0.6}
        rx={1.5}
      />
      {/* arms — animate when working */}
      {working ? (
        <g>
          <rect
            x={-5.5}
            y={headY + 7 + Math.sin(t * 7) * 1.2}
            width={2.2}
            height={5}
            fill={color}
            rx={0.8}
          />
          <rect
            x={3.3}
            y={headY + 7 + Math.sin(t * 7 + Math.PI) * 1.2}
            width={2.2}
            height={5}
            fill={color}
            rx={0.8}
          />
        </g>
      ) : (
        <g>
          <rect x={-5.2} y={headY + 7} width={1.8} height={6} fill={color} rx={0.8} />
          <rect x={3.4} y={headY + 7} width={1.8} height={6} fill={color} rx={0.8} />
        </g>
      )}
      {/* head */}
      <circle cx={0} cy={headY + 2} r={3.6} fill="#E8C9A8" stroke="#00000040" strokeWidth={0.5} />
      {/* hair / cap */}
      <path
        d={`M -3.6,${headY} A 3.6,3.6 0 0 1 3.6,${headY} L 3.6,${headY + 0.5} L -3.6,${headY + 0.5} Z`}
        fill="#2A3340"
      />
      {/* highlight ring */}
      {highlighted && (
        <circle
          cx={0}
          cy={-2}
          r={12}
          fill="none"
          stroke={LSS_COL.brand}
          strokeWidth={1.8}
          strokeDasharray="3 2"
          opacity={0.9}
        />
      )}
    </g>
  );
}

// ----------------------------------------------------------------------------
// LSSBundle — stack of fabric pieces
// ----------------------------------------------------------------------------
interface LSSBundleProps {
  x: number;
  y: number;
  count?: number;
  color?: string;
  t?: number;
}

function LSSBundle({ x, y, count = 6, color = LSS_COL.fabric }: LSSBundleProps) {
  return (
    <g>
      {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
        <g key={i}>
          <LSSIsoBox
            x={x + 0.05 * i * 0}
            y={y + 0.05 * i * 0}
            w={0.55}
            d={0.55}
            h={0.08}
            fill={i % 2 === 0 ? color : shade(color, 0.1)}
          />
        </g>
      ))}
    </g>
  );
}

// ----------------------------------------------------------------------------
// LSSStation — kind-driven station sprite
// ----------------------------------------------------------------------------
interface LSSStationProps {
  station: Station;
  t: number;
  working: boolean;
  highlighted: boolean;
  onClick?: (s: Station) => void;
}

function LSSStation({ station, t, working, highlighted, onClick }: LSSStationProps) {
  const { x, y, kind } = station;
  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick && onClick(station);
  };

  let body: ReactNode = null;
  if (
    kind === 'sew_pbs' ||
    kind === 'sew_ups' ||
    kind === 'sew_mod' ||
    kind === 'sew_make' ||
    kind === 'sew_straight' ||
    kind === 'sew_clp'
  ) {
    body = (
      <g>
        {/* table */}
        <LSSIsoBox x={x - 0.4} y={y - 0.4} w={1.0} d={1.0} h={0.45} fill="#3D4856" />
        {/* sewing machine head */}
        <LSSIsoBox
          x={x - 0.15}
          y={y - 0.2}
          w={0.55}
          d={0.3}
          h={0.35}
          fill={working ? LSS_COL.bobbin : shade(LSS_COL.bobbin, -0.2)}
        />
        {/* needle bob */}
        {working &&
          (() => {
            const p = lsIso(x + 0.12, y - 0.05, 0.8 + Math.sin(t * 12) * 0.05);
            return (
              <line
                x1={p.x}
                y1={p.y}
                x2={p.x}
                y2={p.y + 6}
                stroke={LSS_COL.thread}
                strokeWidth={1.2}
              />
            );
          })()}
      </g>
    );
  } else if (kind === 'cutter') {
    body = (
      <g>
        <LSSIsoBox x={x - 0.5} y={y - 1.2} w={1.4} d={2.6} h={0.5} fill={LSS_COL.brand} />
        {(() => {
          const p = (Math.sin(t * 1.5) + 1) / 2;
          return (
            <LSSIsoBox
              x={x - 0.3}
              y={y - 1.0 + p * 1.8}
              w={0.9}
              d={0.4}
              h={0.7}
              fill={LSS_COL.steelLite}
            />
          );
        })()}
      </g>
    );
  } else if (kind === 'spread_table') {
    body = (
      <g>
        <LSSIsoBox x={x - 0.6} y={y - 1.2} w={1.6} d={2.6} h={0.3} fill={LSS_COL.thread} />
        {/* fabric layers on top */}
        {Array.from({ length: 5 }).map((_, i) => (
          <g key={i}>
            <LSSIsoBox
              x={x - 0.55}
              y={y - 1.15}
              w={1.5}
              d={2.5}
              h={0.32 + i * 0.04}
              fill={i % 2 ? '#fff' : '#f0e8d8'}
              stroke="#0F141950"
              strokeW={0.5}
            />
          </g>
        ))}
      </g>
    );
  } else if (kind === 'fabric_rack') {
    body = (
      <g>
        <LSSIsoBox x={x - 0.4} y={y - 1.0} w={1.0} d={2.2} h={1.6} fill="#2A3340" />
        {[0, 1, 2].map((i) => {
          const p = lsIso(x - 0.2, y - 0.8 + i * 0.7, 0.4 + i * 0.3);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={6}
              fill={i === 0 ? LSS_COL.fabric : i === 1 ? LSS_COL.thread : LSS_COL.trim}
              stroke="#000"
              strokeWidth={0.6}
            />
          );
        })}
      </g>
    );
  } else if (kind === 'bundle_table') {
    body = (
      <g>
        <LSSIsoBox x={x - 0.4} y={y - 0.8} w={1.0} d={1.8} h={0.4} fill={LSS_COL.steelLite} />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <LSSIsoBox
              x={x - 0.3 + (i % 2) * 0.4}
              y={y - 0.7 + Math.floor(i / 2) * 0.5}
              w={0.35}
              d={0.35}
              h={0.55 + i * 0.05}
              fill={[LSS_COL.fabric, LSS_COL.thread, LSS_COL.trim, LSS_COL.bobbin][i]}
            />
          </g>
        ))}
      </g>
    );
  } else if (kind === 'qc_table') {
    body = (
      <g>
        <LSSIsoBox x={x - 0.4} y={y - 0.6} w={1.0} d={1.4} h={0.45} fill={LSS_COL.ok} />
        {/* garment laid out */}
        <LSSIsoBox
          x={x - 0.3}
          y={y - 0.5}
          w={0.8}
          d={1.2}
          h={0.5}
          fill="#fff"
          stroke="#0F141930"
        />
        {/* inspector lamp */}
        {working && (
          <circle
            cx={lsIso(x + 0.3, y, 1).x}
            cy={lsIso(x + 0.3, y, 1).y}
            r={3 + Math.sin(t * 5)}
            fill="#FFFBE0"
            opacity={0.8}
          />
        )}
      </g>
    );
  } else if (kind === 'press') {
    body = (
      <g>
        <LSSIsoBox x={x - 0.4} y={y - 0.5} w={1.0} d={1.2} h={0.5} fill={LSS_COL.press} />
        {/* press head */}
        <LSSIsoBox
          x={x - 0.35}
          y={y - 0.45}
          w={0.9}
          d={1.1}
          h={working ? 0.55 + Math.sin(t * 3) * 0.08 : 0.7}
          fill={shade(LSS_COL.press, -0.25)}
        />
        {/* steam puffs */}
        {working &&
          [0, 1, 2].map((i) => {
            const ph = (t * 1.5 + i * 0.7) % 1;
            const p = lsIso(x + 0.5, y - 0.2, 0.9 + ph * 1.2);
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={3 + ph * 4}
                fill="#fff"
                opacity={(1 - ph) * 0.7}
              />
            );
          })}
      </g>
    );
  } else if (kind === 'fold_table') {
    body = (
      <LSSIsoBox
        x={x - 0.4}
        y={y - 0.5}
        w={1.0}
        d={1.2}
        h={0.4}
        fill="#fff"
        stroke="#0F141930"
      />
    );
  } else if (kind === 'pack_table') {
    body = (
      <g>
        <LSSIsoBox x={x - 0.4} y={y - 0.6} w={1.0} d={1.4} h={0.45} fill={LSS_COL.ship} />
        {/* boxes stack */}
        <LSSIsoBox
          x={x - 0.3}
          y={y - 0.5}
          w={0.5}
          d={0.5}
          h={0.85}
          fill="#C9A87A"
          stroke="#0F141940"
        />
        <LSSIsoBox
          x={x + 0.1}
          y={y - 0.4}
          w={0.4}
          d={0.4}
          h={0.75}
          fill="#B89469"
          stroke="#0F141940"
        />
      </g>
    );
  } else if (kind === 'dock_in_bay' || kind === 'dock_out_bay') {
    body = (
      <g>
        <LSSIsoBox x={x - 0.6} y={y - 1.2} w={1.6} d={2.6} h={0.05} fill="#1a2230" />
        {/* truck (simplified) */}
        <LSSIsoBox
          x={x - 0.4}
          y={y - 1.0}
          w={1.2}
          d={2.2}
          h={1.2}
          fill={kind === 'dock_in_bay' ? LSS_COL.fabric : LSS_COL.ship}
        />
        <LSSIsoBox
          x={x - 0.3}
          y={y + 0.5}
          w={1.0}
          d={0.6}
          h={1.6}
          fill={shade(kind === 'dock_in_bay' ? LSS_COL.fabric : LSS_COL.ship, -0.2)}
        />
      </g>
    );
  } else {
    body = <LSSIsoBox x={x - 0.4} y={y - 0.4} w={1.0} d={1.0} h={0.4} fill={LSS_COL.steel} />;
  }

  return (
    <g onClick={handle} style={{ cursor: 'pointer' }}>
      {body}
      {/* hot/highlight ring */}
      {highlighted &&
        (() => {
          const pad = 0.65;
          const A = lsIso(x - pad, y - pad, 0.05);
          const B = lsIso(x + pad, y - pad, 0.05);
          const C = lsIso(x + pad, y + pad, 0.05);
          const D = lsIso(x - pad, y + pad, 0.05);
          return (
            <polygon
              points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
              fill="none"
              stroke={LSS_COL.brand}
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          );
        })()}
    </g>
  );
}

// ----------------------------------------------------------------------------
// LSSForklift sprite
// ----------------------------------------------------------------------------
interface LSSForkliftProps {
  x: number;
  y: number;
  dir?: number;
  t?: number;
  carrying?: boolean;
}

function LSSForklift({ x, y, dir = 1, carrying = false }: LSSForkliftProps) {
  const p = lsIso(x, y, 0);
  return (
    <g transform={`translate(${p.x}, ${p.y})`}>
      <ellipse cx={0} cy={2} rx={14} ry={4} fill="#0006" />
      {/* body */}
      <LSSIsoBox
        x={-0.25}
        y={-0.25}
        w={0.5}
        d={0.5}
        h={0.45}
        fill={LSS_COL.thread}
        stroke="#0F1419"
        strokeW={1}
      />
      {/* mast + load */}
      {carrying && (
        <g transform={`translate(${dir > 0 ? 14 : -14}, -10)`}>
          <rect x={-2} y={-10} width={4} height={16} fill="#2A3340" />
          <rect x={-8} y={-8} width={16} height={6} fill={LSS_COL.fabric} stroke="#0F1419" />
        </g>
      )}
    </g>
  );
}

// ----------------------------------------------------------------------------
// LSSHanger — trolley wheel + garment on hanger (UPS overhead)
// ----------------------------------------------------------------------------
interface LSSHangerProps {
  x: number;
  y: number;
  t?: number;
  color?: string;
}

function LSSHanger({ x, y, color = LSS_COL.bobbin }: LSSHangerProps) {
  const p = lsIso(x, y, 1.4);
  return (
    <g transform={`translate(${p.x}, ${p.y})`}>
      {/* trolley wheel */}
      <circle cx={0} cy={0} r={2.5} fill="#2A3340" />
      {/* hook */}
      <path d="M 0,2 Q 0,5 -1,6" stroke="#2A3340" strokeWidth={1} fill="none" />
      {/* garment on hanger */}
      <path
        d="M -7,7 L -5,18 L 5,18 L 7,7 L 4,6 L -4,6 Z"
        fill={color}
        stroke="#0F1419"
        strokeWidth={0.6}
      />
    </g>
  );
}

// ----------------------------------------------------------------------------
// LSSConveyor — animated conveyor segment
// ----------------------------------------------------------------------------
interface LSSConveyorProps {
  x0: number;
  x1: number;
  y: number;
  t: number;
}

function LSSConveyor({ x0, x1, y, t }: LSSConveyorProps) {
  const A = lsIso(x0, y - 0.3, 0.05);
  const B = lsIso(x1, y - 0.3, 0.05);
  const C = lsIso(x1, y + 0.3, 0.05);
  const D = lsIso(x0, y + 0.3, 0.05);
  return (
    <g>
      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
        fill="#1a2230"
        stroke="#0F1419"
        strokeWidth={0.6}
      />
      {/* moving stripes */}
      {Array.from({ length: 20 }).map((_, i) => {
        const f = ((i / 20) + ((t * 0.06) % (1 / 20))) % 1;
        const xx = x0 + (x1 - x0) * f;
        const p1 = lsIso(xx, y - 0.25, 0.06);
        const p2 = lsIso(xx, y + 0.25, 0.06);
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="#3D4856"
            strokeWidth={0.6}
          />
        );
      })}
    </g>
  );
}

// ----------------------------------------------------------------------------
// LSSHangerRail — UPS overhead rail
// ----------------------------------------------------------------------------
interface LSSHangerRailProps {
  x0: number;
  x1: number;
  y: number;
  t?: number;
}

function LSSHangerRail({ x0, x1, y }: LSSHangerRailProps) {
  const A = lsIso(x0, y, 1.6);
  const B = lsIso(x1, y, 1.6);
  return (
    <g>
      {/* posts */}
      {[x0, x1, (x0 + x1) / 2].map((px, i) => {
        const top = lsIso(px, y, 1.6);
        const bot = lsIso(px, y, 0);
        return (
          <line
            key={i}
            x1={top.x}
            y1={top.y}
            x2={bot.x}
            y2={bot.y}
            stroke="#2A3340"
            strokeWidth={1.5}
          />
        );
      })}
      {/* rail */}
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#2A3340" strokeWidth={2.5} />
    </g>
  );
}

// ----------------------------------------------------------------------------
// Operator/bundle simulation step + event spawner
// ----------------------------------------------------------------------------
function lsvRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function lsvBuildOperators(layout: Layout): Operator[] {
  const ops: Operator[] = [];
  const r = lsvRand(42);
  const skinTones = ['#E8C9A8', '#C99878', '#A37145', '#8B5A3C', '#6B4423', '#D4A574'];
  const seenStation = new Set<string>();
  const seenOpId = new Set<string>();
  layout.stations.forEach((st, i) => {
    if (seenStation.has(st.id)) return;
    seenStation.add(st.id);
    if (['fabric_rack', 'dock_in_bay', 'dock_out_bay'].includes(st.kind)) return;
    let opId = `op-${st.id}`;
    let suffix = 1;
    while (seenOpId.has(opId)) {
      opId = `op-${st.id}-${suffix++}`;
    }
    seenOpId.add(opId);
    ops.push({
      id: opId,
      stationId: st.id,
      hx: st.x - 0.5,
      hy: st.y + 0.5,
      x: st.x - 0.5,
      y: st.y + 0.5,
      target: null,
      state: 'work',
      skin: skinTones[i % skinTones.length],
      role: st.kind,
      productivity: 0.7 + r() * 0.3,
      pieces: 0,
    });
  });
  // dock loaders (free-roaming)
  ops.push({
    id: 'op-loader-1',
    stationId: 'dock-in-1',
    hx: 4,
    hy: 6,
    x: 4,
    y: 6,
    state: 'work',
    target: null,
    skin: skinTones[0],
    role: 'loader',
    productivity: 0.8,
    pieces: 0,
  });
  ops.push({
    id: 'op-loader-2',
    stationId: 'dock-out-1',
    hx: 58,
    hy: 8,
    x: 58,
    y: 8,
    state: 'work',
    target: null,
    skin: skinTones[1],
    role: 'loader',
    productivity: 0.8,
    pieces: 0,
  });
  return ops;
}

function lsvBuildBundles(_layout: Layout): Bundle[] {
  const bundles: Bundle[] = [];
  for (let i = 0; i < 12; i++) {
    bundles.push({
      id: `b-${i}`,
      x: 5 + i * 4,
      y: 8 + (i % 3) * 2,
      target: null,
      stage: i < 4 ? 'cut' : i < 8 ? 'sew' : 'qc',
      color: [LSS_COL.fabric, LSS_COL.thread, LSS_COL.bobbin, LSS_COL.trim][i % 4],
      pieces: 6,
    });
  }
  return bundles;
}

function stepOperators(ops: Operator[], _layout: Layout, dt: number): void {
  ops.forEach((op) => {
    if (op.role === 'loader') {
      if (!op.target) {
        op.target = {
          x: op.hx + (Math.random() < 0.5 ? 2 : -2),
          y: op.hy + (Math.random() - 0.5) * 2,
        };
      }
      const dx = op.target.x - op.x;
      const dy = op.target.y - op.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.1) {
        op.target = null;
        op.state = 'idle';
      } else {
        op.x += (dx / dist) * dt * 1.2;
        op.y += (dy / dist) * dt * 1.2;
        op.state = 'walk';
      }
    } else {
      if (Math.random() < 0.001 * dt * 60) {
        op.target = {
          x: op.hx + (Math.random() - 0.5) * 3,
          y: op.hy + (Math.random() - 0.5) * 1.5,
        };
        op.state = 'walk';
      }
      if (op.target) {
        const dx = op.target.x - op.x;
        const dy = op.target.y - op.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.15) {
          op.target = null;
          op.state = 'work';
        } else {
          op.x += (dx / dist) * dt * 1.0;
          op.y += (dy / dist) * dt * 1.0;
        }
      } else {
        op.state = 'work';
        op.pieces += op.productivity * dt * 0.1;
      }
    }
  });
}

function stepBundles(bundles: Bundle[], _layout: Layout, dt: number): void {
  bundles.forEach((b) => {
    if (!b.target) {
      b.target = {
        x: Math.min(60, b.x + 1 + Math.random() * 4),
        y: 6 + Math.random() * 10,
      };
    }
    const dx = b.target.x - b.x;
    const dy = b.target.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.2) {
      b.target = null;
      if (b.x > 58) {
        b.x = 5 + Math.random() * 3;
        b.y = 6 + Math.random() * 10;
      }
    } else {
      b.x += (dx / dist) * dt * 1.5;
      b.y += (dy / dist) * dt * 1.5;
    }
  });
}

let _lsv_evtId = 0;
function spawnEvent(
  setEvents: React.Dispatch<React.SetStateAction<SimEvent[]>>,
  layout: Layout,
): void {
  const sewStations = layout.stations.filter((s) => s.kind && s.kind.startsWith('sew_'));
  const station = sewStations[Math.floor(Math.random() * sewStations.length)];
  if (!station) return;
  const kinds: Array<{ kind: SimEvent['kind']; label: string; dur: number }> = [
    { kind: 'breakdown', label: 'MACHINE DOWN', dur: 8 },
    { kind: 'defect', label: 'DEFECT SPIKE', dur: 5 },
    { kind: 'breakdown', label: 'THREAD BREAK', dur: 3 },
    { kind: 'good', label: 'TARGET HIT', dur: 4 },
    { kind: 'defect', label: 'BOTTLENECK', dur: 6 },
  ];
  const k = kinds[Math.floor(Math.random() * kinds.length)];
  const id = ++_lsv_evtId;
  const evt: SimEvent = {
    id,
    kind: k.kind,
    label: k.label,
    station: station.op || station.id,
    stationId: station.id,
    active: true,
    born: performance.now(),
  };
  setEvents((prev) => [...prev.slice(-15), evt]);
  setTimeout(() => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, active: false } : e)));
  }, k.dur * 1000);
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function lsvRoleColor(role: string): string {
  if (role && role.startsWith('sew_')) return LSS_COL.bobbin;
  if (role === 'cutter') return LSS_COL.brand;
  if (role === 'spread_table') return LSS_COL.thread;
  if (role === 'qc_table') return LSS_COL.ok;
  if (role === 'press') return LSS_COL.press;
  if (role === 'pack_table') return LSS_COL.ship;
  if (role === 'bundle_table') return LSS_COL.trim;
  if (role === 'loader') return LSS_COL.steelLite;
  return LSS_COL.brand;
}

function lsvBtn(active?: boolean): CSSProperties {
  return {
    background: active ? LSS_COL.brand : '#ffffff10',
    color: active ? '#fff' : '#ffffffaa',
    border: '1px solid #ffffff20',
    borderRadius: 6,
    padding: '6px 10px',
    fontFamily: LSV_FONTS.mono,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.5px',
  };
}

interface LsvStatProps {
  label: string;
  value: number | string;
  unit?: string;
  color?: string;
}

function LsvStat({ label, value, unit, color }: LsvStatProps) {
  return (
    <div
      style={{
        background: '#ffffff08',
        border: '1px solid #ffffff10',
        borderRadius: 6,
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          fontFamily: LSV_FONTS.mono,
          fontSize: 8.5,
          fontWeight: 700,
          color: '#ffffff80',
          letterSpacing: '1px',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 2 }}>
        <span
          style={{
            fontFamily: LSV_FONTS.display,
            fontSize: 18,
            fontWeight: 900,
            color: color || '#fff',
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: 9,
              color: '#ffffff80',
              fontFamily: LSV_FONTS.mono,
              fontWeight: 600,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LSVIsoView — main 3D iso view
// ----------------------------------------------------------------------------
interface LSVIsoViewProps {
  layout: Layout;
  operators: Operator[];
  bundles: Bundle[];
  t: number;
  zoom: number;
  pan: { x: number; y: number };
  setPan: (updater: (p: { x: number; y: number }) => { x: number; y: number }) => void;
  setSelected: (s: Selected | null) => void;
  selected: Selected | null;
  hotIds: Set<string>;
  system: string;
  events: SimEvent[];
}

function LSVIsoView({
  layout,
  operators,
  bundles,
  t,
  zoom,
  pan,
  setPan,
  setSelected,
  selected,
  hotIds,
}: LSVIsoViewProps) {
  // Pan-by-drag — pointerdown starts a drag session, pointermove updates pan
  // from the start offset, pointerup ends it. We track if the drag actually
  // moved so a clean click on the background still clears the selection.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // only left-button drags
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPan: { x: pan.x, y: pan.y },
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    d.moved = true;
    // Convert screen-pixel deltas into the SVG's coordinate system using the
    // same viewBox-to-pixel ratio used to render the SVG.
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = 1700 / rect.width;
    const scaleY = 900 / rect.height;
    setPan(() => ({ x: d.startPan.x + dx * scaleX, y: d.startPan.y + dy * scaleY }));
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    // Suppress the click-to-clear if the user actually dragged.
    if (d?.moved) e.stopPropagation();
  }
  // Sort entities by depth (y + x for iso painters) for back-to-front rendering
  const renderItems = useMemo(() => {
    const items: Array<
      | { kind: 'station'; x: number; y: number; ref: Station }
      | { kind: 'worker'; x: number; y: number; ref: Operator }
      | { kind: 'bundle'; x: number; y: number; ref: Bundle }
    > = [];
    layout.stations.forEach((s) => items.push({ kind: 'station', x: s.x, y: s.y, ref: s }));
    operators.forEach((o) => items.push({ kind: 'worker', x: o.x, y: o.y, ref: o }));
    bundles.forEach((b) => items.push({ kind: 'bundle', x: b.x, y: b.y, ref: b }));
    items.sort((a, b) => a.x + a.y - (b.x + b.y));
    return items;
    // include t so the iso view re-sorts as entities move
  }, [layout, operators, bundles, t]);

  const vbW = 1700;
  const vbH = 900;
  const tx = vbW / 2 + pan.x;
  const ty = 80 + pan.y;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onClick={(e) => {
        // Don't clear selection if this click was the end of a drag.
        if (dragRef.current?.moved) return;
        // Same guard for the no-longer-current-but-just-finished drag (set
        // to null in pointerup before this fires in some browsers).
        const target = e.target as Element;
        if (target.tagName === 'rect' || target.tagName === 'svg') {
          setSelected(null);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <pattern id="lsv-grid" width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff06" strokeWidth={1} />
        </pattern>
        <radialGradient id="lsv-vig" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.5} />
        </radialGradient>
      </defs>
      <rect width={vbW} height={vbH} fill="url(#lsv-grid)" />

      <g transform={`translate(${tx}, ${ty}) scale(${zoom})`}>
        {/* ground tiles per zone */}
        {LS_ZONE_DEFS.map((z) => (
          <g key={z.id}>
            <LSSGroundTile x={z.x0} y={z.y0} w={z.w} d={z.h} fill={z.color} opacity={0.07} />
            {(() => {
              const p = lsIso(z.x0 + z.w / 2, z.y0 + z.h / 2, 0);
              return (
                <text
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  fill="#ffffff20"
                  fontFamily={LSV_FONTS.display}
                  fontSize={22}
                  fontWeight={900}
                  letterSpacing="2px"
                  style={{ pointerEvents: 'none' }}
                >
                  {z.label}
                </text>
              );
            })()}
          </g>
        ))}
        {/* zone outlines */}
        {LS_ZONE_DEFS.map((z) => {
          const A = lsIso(z.x0, z.y0, 0);
          const B = lsIso(z.x0 + z.w, z.y0, 0);
          const C = lsIso(z.x0 + z.w, z.y0 + z.h, 0);
          const D = lsIso(z.x0, z.y0 + z.h, 0);
          return (
            <polygon
              key={z.id}
              points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
              fill="none"
              stroke={z.color}
              strokeWidth={1.2}
              strokeDasharray="4 3"
              opacity={0.5}
            />
          );
        })}

        {/* conveyors */}
        {layout.conveyors.map((c, i) => (
          <LSSConveyor key={`conv-${i}`} x0={c.x0} x1={c.x1} y={c.y} t={t} />
        ))}
        {/* hanger rails (UPS overhead) */}
        {layout.hangers.map((h, i) => (
          <LSSHangerRail key={`hang-${i}`} x0={h.x0} x1={h.x1} y={h.y} t={t} />
        ))}
        {/* hanging garments traveling along rail */}
        {layout.hangers.flatMap((h, hi) =>
          Array.from({ length: 8 }).map((_, i) => {
            const f = (i / 8 + t * 0.04) % 1;
            const x = h.x0 + (h.x1 - h.x0) * f;
            const colors = [
              LSS_COL.fabric,
              LSS_COL.thread,
              LSS_COL.bobbin,
              LSS_COL.trim,
              LSS_COL.press,
            ];
            return (
              <LSSHanger
                key={`hg-${hi}-${i}`}
                x={x}
                y={h.y}
                t={t}
                color={colors[(hi * 8 + i) % colors.length]}
              />
            );
          }),
        )}

        {/* forklifts roaming (2 of them) */}
        {[
          { x: 4 + ((t * 0.3) % 8), y: 9, dir: 1, carrying: true },
          { x: 14 - ((t * 0.4) % 8), y: 12, dir: -1, carrying: false },
        ].map((f, i) => (
          <LSSForklift
            key={`fk-${i}`}
            x={f.x}
            y={f.y}
            dir={f.dir}
            t={t}
            carrying={f.carrying}
          />
        ))}

        {/* depth-sorted stations + workers + bundles */}
        {renderItems.map((item) => {
          if (item.kind === 'station') {
            const isHot = hotIds.has(item.ref.id);
            const isSel = selected?.kind === 'station' && selected.id === item.ref.id;
            return (
              <LSSStation
                key={`st-${item.ref.id}`}
                station={item.ref}
                t={t}
                working={!isHot}
                highlighted={isHot || isSel}
                onClick={(s) => setSelected({ kind: 'station', id: s.id })}
              />
            );
          } else if (item.kind === 'worker') {
            const o = item.ref;
            const isSel = selected?.kind === 'worker' && selected.id === o.id;
            return (
              <g
                key={`op-${o.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected({ kind: 'worker', id: o.id });
                }}
                style={{ cursor: 'pointer' }}
              >
                <LSSWorker
                  x={o.x}
                  y={o.y}
                  t={t}
                  working={o.state === 'work'}
                  walking={o.state === 'walk'}
                  color={lsvRoleColor(o.role)}
                  highlighted={isSel}
                />
              </g>
            );
          } else if (item.kind === 'bundle') {
            const b = item.ref;
            return (
              <LSSBundle
                key={`b-${b.id}`}
                x={b.x}
                y={b.y}
                count={b.pieces}
                color={b.color}
                t={t}
              />
            );
          }
          return null;
        })}
      </g>
      {/* vignette */}
      <rect
        width={vbW}
        height={vbH}
        fill="url(#lsv-vig)"
        style={{ pointerEvents: 'none' }}
      />
    </svg>
  );
}

// ----------------------------------------------------------------------------
// LSVTopView — 2D blueprint
// ----------------------------------------------------------------------------
interface LSVTopViewProps {
  layout: Layout;
  operators: Operator[];
  bundles: Bundle[];
  t: number;
  zoom: number;
  setSelected: (s: Selected | null) => void;
  selected: Selected | null;
  hotIds: Set<string>;
  events: SimEvent[];
}

function LSVTopView({
  layout,
  operators,
  bundles,
  setSelected,
  selected,
  hotIds,
}: LSVTopViewProps) {
  const CELL = 18;
  const W = LS_GRID_W * CELL;
  const H = LS_GRID_H * CELL;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onClick={() => setSelected(null)}
    >
      <defs>
        <pattern id="lsv-grid-top" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path
            d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
            fill="none"
            stroke="#ffffff10"
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#0d1219" />
      <rect width={W} height={H} fill="url(#lsv-grid-top)" />
      {/* zones */}
      {LS_ZONE_DEFS.map((z) => (
        <g key={z.id}>
          <rect
            x={z.x0 * CELL}
            y={z.y0 * CELL}
            width={z.w * CELL}
            height={z.h * CELL}
            fill={z.color}
            opacity={0.12}
            stroke={z.color}
            strokeWidth={1.2}
            strokeDasharray="4 3"
          />
          <text
            x={z.x0 * CELL + 8}
            y={z.y0 * CELL + 18}
            fill={z.color}
            fontFamily={LSV_FONTS.mono}
            fontSize={11}
            fontWeight={800}
            letterSpacing="1px"
          >
            {z.label}
          </text>
        </g>
      ))}
      {/* conveyors */}
      {layout.conveyors.map((c, i) => (
        <rect
          key={`c-${i}`}
          x={c.x0 * CELL}
          y={c.y * CELL - 6}
          width={(c.x1 - c.x0) * CELL}
          height={12}
          fill="#2A3340"
          stroke="#3D4856"
        />
      ))}
      {/* hanger rails */}
      {layout.hangers.map((h, i) => (
        <line
          key={`h-${i}`}
          x1={h.x0 * CELL}
          x2={h.x1 * CELL}
          y1={h.y * CELL}
          y2={h.y * CELL}
          stroke="#3D4856"
          strokeWidth={3}
        />
      ))}
      {/* stations */}
      {layout.stations.map((s) => {
        const isHot = hotIds.has(s.id);
        const isSel = selected?.kind === 'station' && selected.id === s.id;
        return (
          <g
            key={s.id}
            onClick={(e) => {
              e.stopPropagation();
              setSelected({ kind: 'station', id: s.id });
            }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={s.x * CELL - 8}
              y={s.y * CELL - 8}
              width={16}
              height={16}
              rx={3}
              fill={isHot ? LSS_COL.alarm : lsvRoleColor(s.kind)}
              stroke={isSel ? '#fff' : '#0F1419'}
              strokeWidth={isSel ? 2 : 1}
            />
          </g>
        );
      })}
      {/* bundles */}
      {bundles.map((b) => (
        <rect
          key={b.id}
          x={b.x * CELL - 4}
          y={b.y * CELL - 4}
          width={8}
          height={8}
          fill={b.color}
          stroke="#fff"
          strokeWidth={0.8}
        />
      ))}
      {/* operators */}
      {operators.map((o) => (
        <circle
          key={o.id}
          cx={o.x * CELL}
          cy={o.y * CELL}
          r={4}
          fill={lsvRoleColor(o.role)}
          stroke="#fff"
          strokeWidth={1.2}
          onClick={(e) => {
            e.stopPropagation();
            setSelected({ kind: 'worker', id: o.id });
          }}
          style={{ cursor: 'pointer' }}
        />
      ))}
    </svg>
  );
}

// ----------------------------------------------------------------------------
// LSVHeatView — heatmap of WIP/utilization density
// ----------------------------------------------------------------------------
interface LSVHeatViewProps {
  layout: Layout;
  t: number;
  hotIds: Set<string>;
  events: SimEvent[];
  system: string;
}

function LSVHeatView({ layout, t, hotIds }: LSVHeatViewProps) {
  const CELL = 18;
  const W = LS_GRID_W * CELL;
  const H = LS_GRID_H * CELL;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        {layout.stations.map((s) => {
          const isHot = hotIds.has(s.id);
          const heat = isHot ? 1 : 0.45 + Math.sin(t * 2 + s.x + s.y) * 0.18;
          const col = isHot ? LSS_COL.alarm : LSS_COL.warn;
          return (
            <radialGradient
              key={`s-${s.id}`}
              id={`heat-${s.id}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor={col} stopOpacity={heat} />
              <stop offset="100%" stopColor={col} stopOpacity={0} />
            </radialGradient>
          );
        })}
      </defs>
      <rect width={W} height={H} fill="#0d1219" />
      {/* zone outlines (for orientation) */}
      {LS_ZONE_DEFS.map((z) => (
        <rect
          key={z.id}
          x={z.x0 * CELL}
          y={z.y0 * CELL}
          width={z.w * CELL}
          height={z.h * CELL}
          fill="none"
          stroke="#ffffff20"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}
      {/* heat blobs */}
      {layout.stations.map((s) => (
        <circle
          key={s.id}
          cx={s.x * CELL}
          cy={s.y * CELL}
          r={70}
          fill={`url(#heat-${s.id})`}
          style={{ mixBlendMode: 'screen' }}
        />
      ))}
      {/* station markers */}
      {layout.stations.map((s) => (
        <circle
          key={`pt-${s.id}`}
          cx={s.x * CELL}
          cy={s.y * CELL}
          r={3}
          fill={hotIds.has(s.id) ? LSS_COL.alarm : '#fff'}
          opacity={0.8}
        />
      ))}
      {/* legend */}
      <g transform={`translate(${W - 200}, 30)`}>
        <rect width={180} height={60} fill="#0a0d12cc" stroke="#ffffff20" rx={4} />
        <text
          x={12}
          y={20}
          fill="#fff"
          fontFamily={LSV_FONTS.mono}
          fontSize={10}
          fontWeight={800}
          letterSpacing="1px"
        >
          WIP DENSITY
        </text>
        <rect x={12} y={30} width={156} height={8} fill="url(#heat-gradient-legend)" />
        <text
          x={12}
          y={50}
          fill="#ffffff80"
          fontFamily={LSV_FONTS.mono}
          fontSize={9}
        >
          low
        </text>
        <text
          x={156}
          y={50}
          fill="#ffffff80"
          fontFamily={LSV_FONTS.mono}
          fontSize={9}
          textAnchor="end"
        >
          critical
        </text>
      </g>
      <defs>
        <linearGradient id="heat-gradient-legend" x1="0%" x2="100%">
          <stop offset="0%" stopColor="#1FB36B" />
          <stop offset="60%" stopColor="#F5A623" />
          <stop offset="100%" stopColor="#E74C3C" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// LSVTopHud — top status bar + view + system toggles
// ----------------------------------------------------------------------------
type ViewMode = 'iso' | 'top' | 'heat';

interface LSVTopHudProps {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  system: string;
  setSystem: (s: string) => void;
  playing: boolean;
  hr: number;
  mn: number;
  out: number;
  t: number;
}

function LSVTopHud({
  view,
  setView,
  system,
  setSystem,
  playing,
  hr,
  mn,
}: LSVTopHudProps) {
  const SYSTEMS = [
    { v: 'MAKE', label: 'Make-Through' },
    { v: 'PBS', label: 'PBS' },
    { v: 'UPS', label: 'UPS' },
    { v: 'MOD', label: 'Modular' },
    { v: 'STR', label: 'Straight' },
    { v: 'SYN', label: 'Synchro' },
    { v: 'CLP', label: 'Clump' },
    { v: 'BUN', label: 'Bundle' },
  ];
  return (
    <div
      style={{
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderBottom: '1px solid #ffffff15',
        background: '#0a0d12',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: playing ? LSS_COL.ok : LSS_COL.warn,
            boxShadow: playing ? `0 0 10px ${LSS_COL.ok}` : 'none',
            animation: playing ? 'lsv-pulse 1.2s infinite' : 'none',
          }}
        />
        <span
          style={{
            fontFamily: LSV_FONTS.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '2px',
          }}
        >
          {playing ? 'RUNNING' : 'PAUSED'}
        </span>
      </div>
      <div style={{ width: 1, height: 22, background: '#ffffff20' }} />
      <div
        style={{
          fontFamily: LSV_FONTS.mono,
          fontSize: 22,
          fontWeight: 700,
          color: '#fff',
        }}
      >
        {String(hr).padStart(2, '0')}:{String(mn).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 10, color: '#ffffff80', fontFamily: LSV_FONTS.mono }}>
        SHIFT A · DAY 14
      </div>
      <div style={{ width: 1, height: 22, background: '#ffffff20' }} />
      {/* view toggle */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          background: '#ffffff08',
          padding: 2,
          borderRadius: 6,
        }}
      >
        {(['iso', 'top', 'heat'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              ...lsvBtn(view === v),
              padding: '5px 12px',
              textTransform: 'uppercase',
            }}
          >
            {v === 'iso' ? 'ISO 3D' : v === 'top' ? 'TOP 2D' : 'HEAT'}
          </button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      {/* system pills */}
      <div style={{ display: 'flex', gap: 3 }}>
        {SYSTEMS.map((s) => (
          <button
            key={s.v}
            onClick={() => setSystem(s.v)}
            style={{ ...lsvBtn(system === s.v), padding: '5px 9px' }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LSVOverview — system-summary inspector default
// ----------------------------------------------------------------------------
interface LSVOverviewProps {
  layout: Layout;
  operators: Operator[];
  bundles: Bundle[];
  events: SimEvent[];
  system: string;
  out: number;
  t: number;
}

function LSVOverview({ layout, operators, system, out, t }: LSVOverviewProps) {
  const sysMap: Record<string, string> = {
    MAKE: 'Make-Through',
    PBS: 'Progressive Bundle',
    UPS: 'Unit Production',
    MOD: 'Modular',
    STR: 'Straight Line',
    SYN: 'Synchro',
    CLP: 'Clump',
    BUN: 'Bundle',
  };
  const sys = sysMap[system] || system;
  const sewStations = layout.stations.filter(
    (s) => s.kind && s.kind.startsWith('sew_'),
  ).length;
  return (
    <div style={{ padding: 14 }}>
      <div
        style={{
          fontFamily: LSV_FONTS.mono,
          fontSize: 9,
          fontWeight: 800,
          color: '#ffffff80',
          letterSpacing: '1.5px',
        }}
      >
        SYSTEM
      </div>
      <div
        style={{
          fontFamily: LSV_FONTS.display,
          fontSize: 18,
          fontWeight: 900,
          color: '#fff',
          marginTop: 2,
        }}
      >
        {sys}
      </div>
      <div
        style={{
          fontFamily: LSV_FONTS.mono,
          fontSize: 10,
          color: '#ffffff70',
          marginTop: 2,
        }}
      >
        {sewStations} sewing stations · {operators.length} operators
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          marginTop: 14,
        }}
      >
        <LsvStat label="OUTPUT" value={out} unit="pcs" color={LSS_COL.brand} />
        <LsvStat
          label="THROUGHPUT"
          value={Math.round((out / Math.max(1, t / 60)) * 60)}
          unit="pcs/hr"
          color={LSS_COL.ok}
        />
        <LsvStat
          label="WIP"
          value={Math.floor(80 + Math.sin(t / 10) * 30)}
          unit="bundles"
          color={LSS_COL.thread}
        />
        <LsvStat
          label="EFFICIENCY"
          value={Math.round(72 + Math.sin(t / 15) * 8)}
          unit="%"
          color={LSS_COL.fabric}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <div
          style={{
            fontFamily: LSV_FONTS.mono,
            fontSize: 9,
            fontWeight: 800,
            color: '#ffffff80',
            letterSpacing: '1.5px',
            marginBottom: 6,
          }}
        >
          ZONE BREAKDOWN
        </div>
        {LS_ZONE_DEFS.map((z) => {
          const utilization = Math.round(60 + Math.sin(t / 8 + z.x0) * 25);
          return (
            <div
              key={z.id}
              style={{ padding: '6px 0', borderBottom: '1px solid #ffffff10' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: LSV_FONTS.mono,
                  fontSize: 10,
                  color: '#fff',
                }}
              >
                <span style={{ fontWeight: 700 }}>{z.label}</span>
                <span
                  style={{
                    color:
                      utilization > 85
                        ? LSS_COL.alarm
                        : utilization > 70
                          ? LSS_COL.warn
                          : LSS_COL.ok,
                  }}
                >
                  {utilization}%
                </span>
              </div>
              <div
                style={{
                  height: 3,
                  background: '#ffffff10',
                  borderRadius: 2,
                  marginTop: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: utilization + '%',
                    height: '100%',
                    background: z.color,
                    transition: 'width 0.5s',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontFamily: LSV_FONTS.mono,
            fontSize: 9,
            fontWeight: 800,
            color: '#ffffff80',
            letterSpacing: '1.5px',
            marginBottom: 6,
          }}
        >
          TIP
        </div>
        <div style={{ fontSize: 11, color: '#ffffffcc', lineHeight: 1.5 }}>
          Click any station or worker on the floor to inspect. Switch views above (ISO /
          TOP / HEAT) to see the same factory three ways.
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LSVStationDetail
// ----------------------------------------------------------------------------
interface LSVStationDetailProps {
  station: Station;
  operators: Operator[];
  events: SimEvent[];
  onClear: () => void;
  t: number;
}

function LSVStationDetail({
  station,
  operators,
  events,
  onClear,
  t,
}: LSVStationDetailProps) {
  const op = operators.find((o) => o.stationId === station.id);
  const stEvents = events.filter((e) => e.stationId === station.id);
  return (
    <div style={{ padding: 14, borderBottom: '1px solid #ffffff15' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: LSV_FONTS.mono,
              fontSize: 9,
              fontWeight: 800,
              color: LSS_COL.brand,
              letterSpacing: '1.5px',
            }}
          >
            STATION
          </div>
          <div
            style={{
              fontFamily: LSV_FONTS.display,
              fontSize: 18,
              fontWeight: 900,
              color: '#fff',
              marginTop: 2,
            }}
          >
            {station.op || station.id}
          </div>
          <div
            style={{
              fontFamily: LSV_FONTS.mono,
              fontSize: 10,
              color: '#ffffff70',
              marginTop: 2,
            }}
          >
            {station.kind} · cell ({station.x},{station.y})
          </div>
        </div>
        <button onClick={onClear} style={lsvBtn()}>
          ×
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          marginTop: 12,
        }}
      >
        <LsvStat label="CYCLE TIME" value={(1.2 + (station.x % 5) * 0.3).toFixed(1)} unit="s" />
        <LsvStat label="PIECES" value={op ? Math.floor(op.pieces * 50) : 0} unit="pcs" />
        <LsvStat
          label="UTILIZATION"
          value={Math.round(72 + Math.sin(t / 4 + station.x) * 20)}
          unit="%"
        />
        <LsvStat label="DEFECT RATE" value={(1.4 + Math.sin(t / 6) * 0.6).toFixed(1)} unit="%" />
      </div>
      {op && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: '#ffffff08',
            borderRadius: 6,
            fontFamily: LSV_FONTS.mono,
            fontSize: 10,
            color: '#fff',
          }}
        >
          <div
            style={{
              color: '#ffffff80',
              fontWeight: 700,
              letterSpacing: '1px',
              fontSize: 9,
              marginBottom: 4,
            }}
          >
            OPERATOR
          </div>
          <div>
            {op.id} ·{' '}
            {op.state === 'work' ? 'WORKING' : op.state === 'walk' ? 'WALKING' : 'IDLE'}
          </div>
          <div style={{ color: '#ffffff80', marginTop: 2 }}>
            Productivity {Math.round(op.productivity * 100)}%
          </div>
        </div>
      )}
      {stEvents.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              fontFamily: LSV_FONTS.mono,
              fontSize: 9,
              fontWeight: 800,
              color: '#ffffff80',
              letterSpacing: '1.5px',
              marginBottom: 4,
            }}
          >
            RECENT EVENTS
          </div>
          {stEvents.slice(-3).map((e) => (
            <div
              key={e.id}
              style={{
                fontSize: 10,
                color: e.kind === 'breakdown' ? LSS_COL.alarm : LSS_COL.warn,
                fontFamily: LSV_FONTS.mono,
              }}
            >
              · {e.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// LSVWorkerDetail
// ----------------------------------------------------------------------------
interface LSVWorkerDetailProps {
  worker: Operator;
  layout: Layout;
  onClear: () => void;
  t: number;
}

function LSVWorkerDetail({ worker, layout, onClear }: LSVWorkerDetailProps) {
  const station = layout.stations.find((s) => s.id === worker.stationId);
  return (
    <div style={{ padding: 14, borderBottom: '1px solid #ffffff15' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: LSV_FONTS.mono,
              fontSize: 9,
              fontWeight: 800,
              color: LSS_COL.bobbin,
              letterSpacing: '1.5px',
            }}
          >
            OPERATOR
          </div>
          <div
            style={{
              fontFamily: LSV_FONTS.display,
              fontSize: 18,
              fontWeight: 900,
              color: '#fff',
              marginTop: 2,
            }}
          >
            {worker.id.toUpperCase()}
          </div>
          <div
            style={{
              fontFamily: LSV_FONTS.mono,
              fontSize: 10,
              color: '#ffffff70',
              marginTop: 2,
            }}
          >
            {worker.role} ·{' '}
            {worker.state === 'work'
              ? '⚙ WORKING'
              : worker.state === 'walk'
                ? '→ WALKING'
                : '… IDLE'}
          </div>
        </div>
        <button onClick={onClear} style={lsvBtn()}>
          ×
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          marginTop: 12,
        }}
      >
        <LsvStat
          label="PRODUCTIVITY"
          value={Math.round(worker.productivity * 100)}
          unit="%"
        />
        <LsvStat label="PIECES TODAY" value={Math.floor(worker.pieces * 50)} unit="pcs" />
        <LsvStat label="SHIFT" value="8h" unit="" />
        <LsvStat
          label="SKILL"
          value={['JR', 'MID', 'SR'][Math.floor(worker.productivity * 3)]}
          unit=""
        />
      </div>
      {station && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: '#ffffff08',
            borderRadius: 6,
            fontFamily: LSV_FONTS.mono,
            fontSize: 10,
            color: '#fff',
          }}
        >
          <div
            style={{
              color: '#ffffff80',
              fontWeight: 700,
              letterSpacing: '1px',
              fontSize: 9,
              marginBottom: 4,
            }}
          >
            ASSIGNED STATION
          </div>
          <div>{station.op || station.id}</div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// LSVInspector — right panel
// ----------------------------------------------------------------------------
interface LSVInspectorProps {
  layout: Layout;
  operators: Operator[];
  bundles: Bundle[];
  events: SimEvent[];
  system: string;
  selected: Selected | null;
  selectedStation: Station | null;
  selectedWorker: Operator | null;
  onClear: () => void;
  out: number;
  t: number;
}

function LSVInspector({
  layout,
  operators,
  bundles,
  events,
  system,
  selectedStation,
  selectedWorker,
  onClear,
  out,
  t,
}: LSVInspectorProps) {
  return (
    <div
      style={{
        background: '#0a0d12',
        borderLeft: '1px solid #ffffff15',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {selectedStation ? (
        <LSVStationDetail
          station={selectedStation}
          operators={operators}
          events={events}
          onClear={onClear}
          t={t}
        />
      ) : selectedWorker ? (
        <LSVWorkerDetail
          worker={selectedWorker}
          layout={layout}
          onClear={onClear}
          t={t}
        />
      ) : (
        <LSVOverview
          layout={layout}
          operators={operators}
          bundles={bundles}
          events={events}
          system={system}
          out={out}
          t={t}
        />
      )}

      {/* event log */}
      <div style={{ padding: 14, borderTop: '1px solid #ffffff15' }}>
        <div
          style={{
            fontFamily: LSV_FONTS.mono,
            fontSize: 9,
            fontWeight: 800,
            color: '#ffffff80',
            letterSpacing: '1.5px',
            marginBottom: 8,
          }}
        >
          EVENT LOG
        </div>
        <div
          style={{
            fontFamily: LSV_FONTS.mono,
            fontSize: 10,
            lineHeight: 1.6,
            color: '#ffffffaa',
            maxHeight: 220,
            overflow: 'auto',
          }}
        >
          {events.length === 0 ? (
            <div style={{ color: '#ffffff40', fontStyle: 'italic' }}>
              no events yet…
            </div>
          ) : (
            events
              .slice(-12)
              .reverse()
              .map((e) => (
                <div
                  key={e.id}
                  style={{
                    padding: '3px 0',
                    display: 'flex',
                    gap: 8,
                    opacity: e.active ? 1 : 0.5,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        e.kind === 'breakdown'
                          ? LSS_COL.alarm
                          : e.kind === 'defect'
                            ? LSS_COL.warn
                            : LSS_COL.ok,
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: '#fff', flex: 1 }}>{e.label}</span>
                  <span style={{ color: '#ffffff60' }}>{e.station}</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LSVTransportBar — bottom playback controls
// ----------------------------------------------------------------------------
interface LSVTransportBarProps {
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  t: number;
  setT: (t: number | ((prev: number) => number)) => void;
  onEndShift: () => void;
}

function LSVTransportBar({
  playing,
  setPlaying,
  speed,
  setSpeed,
  t,
  setT,
  onEndShift,
}: LSVTransportBarProps) {
  return (
    <div
      style={{
        padding: '10px 18px',
        background: '#0a0d12',
        borderTop: '1px solid #ffffff15',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <button onClick={() => setT(0)} style={lsvBtn()}>
        ⏮
      </button>
      <button
        onClick={() => setPlaying(!playing)}
        style={{
          ...lsvBtn(true),
          background: playing ? LSS_COL.alarm : LSS_COL.ok,
          padding: '8px 18px',
          fontSize: 12,
        }}
      >
        {playing ? '⏸ PAUSE' : '▶ PLAY'}
      </button>
      <button onClick={() => setT((x) => x + 60)} style={lsvBtn()}>
        ⏭ +60s
      </button>
      <div style={{ width: 1, height: 22, background: '#ffffff20' }} />
      <span
        style={{
          fontFamily: LSV_FONTS.mono,
          fontSize: 10,
          color: '#ffffff80',
          fontWeight: 700,
          letterSpacing: '1px',
        }}
      >
        SPEED
      </span>
      {[0.5, 1, 2, 5, 10].map((s) => (
        <button key={s} onClick={() => setSpeed(s)} style={lsvBtn(speed === s)}>
          {s}×
        </button>
      ))}
      <div
        style={{
          flex: 1,
          position: 'relative',
          height: 24,
          background: '#ffffff08',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: Math.min(100, t / 3.6) + '%',
            background: `linear-gradient(90deg, ${LSS_COL.brand}, ${LSS_COL.thread})`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: LSV_FONTS.mono,
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '1px',
          }}
        >
          DAY 14 · SHIFT A · {Math.min(100, Math.round(t / 3.6))}% complete
        </span>
      </div>
      <button onClick={onEndShift} style={lsvBtn()}>
        End shift →
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LiveSimPage — outer harness (was SWLiveSimRebuilt)
// ----------------------------------------------------------------------------
export function LiveSimPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>('iso');
  const [system, setSystem] = useState<string>('PBS');
  const [playing, setPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1);
  const [t, setT] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selected, setSelected] = useState<Selected | null>(null);
  const [events, setEvents] = useState<SimEvent[]>([]);

  // Build layout & entities (rebuilds when system changes)
  const layout = useMemo<Layout>(() => {
    const sew = lsBuildSewLayout(system);
    const stat = lsBuildStaticStations();
    return {
      stations: [...stat, ...sew.stations],
      conveyors: sew.conveyors || [],
      hangers: sew.hangers || [],
    };
  }, [system]);

  const operatorsRef = useRef<{ system: string; list: Operator[] } | null>(null);
  const bundlesRef = useRef<{ system: string; list: Bundle[] } | null>(null);
  if (operatorsRef.current === null || operatorsRef.current.system !== system) {
    operatorsRef.current = { system, list: lsvBuildOperators(layout) };
    bundlesRef.current = { system, list: lsvBuildBundles(layout) };
  }
  const operators = operatorsRef.current.list;
  const bundles = bundlesRef.current!.list;

  // Animation tick
  useEffect(() => {
    if (!playing) return;
    let raf: number;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * speed;
      last = now;
      setT((prev) => prev + dt);
      stepOperators(operators, layout, dt);
      stepBundles(bundles, layout, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, layout, operators, bundles]);

  // Event spawner
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      spawnEvent(setEvents, layout);
    }, 6000 / speed);
    return () => clearInterval(id);
  }, [playing, speed, layout, system]);

  const elapsedSec = Math.floor(t);
  const hr = 8 + Math.floor(elapsedSec / 360);
  const mn = Math.floor((elapsedSec % 360) / 6);
  const out = Math.floor(t * 0.42);

  // Hot stations from active events
  const hotIds = new Set(events.filter((e) => e.active).map((e) => e.stationId));

  // Selected lookup
  const selectedStation =
    selected?.kind === 'station' ? layout.stations.find((s) => s.id === selected.id) ?? null : null;
  const selectedWorker =
    selected?.kind === 'worker' ? operators.find((o) => o.id === selected.id) ?? null : null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        background: LSS_COL.ink,
        color: LSS_COL.paper,
      }}
    >
      {/* ── HUD ── */}
      <LSVTopHud
        view={view}
        setView={setView}
        system={system}
        setSystem={setSystem}
        playing={playing}
        hr={hr}
        mn={mn}
        out={out}
        t={t}
      />
      {/* ── FLOOR + RIGHT PANEL ── */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
        }}
      >
        {/* left: floor */}
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            background:
              'radial-gradient(ellipse at 50% 30%, #182231 0%, #0a0d12 100%)',
          }}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.max(0.4, Math.min(2.5, z * (e.deltaY < 0 ? 1.08 : 0.93))));
          }}
        >
          {view === 'iso' && (
            <LSVIsoView
              layout={layout}
              operators={operators}
              bundles={bundles}
              t={t}
              zoom={zoom}
              pan={pan}
              setPan={setPan}
              setSelected={setSelected}
              selected={selected}
              hotIds={hotIds}
              system={system}
              events={events}
            />
          )}
          {view === 'top' && (
            <LSVTopView
              layout={layout}
              operators={operators}
              bundles={bundles}
              t={t}
              zoom={zoom}
              setSelected={setSelected}
              selected={selected}
              hotIds={hotIds}
              events={events}
            />
          )}
          {view === 'heat' && (
            <LSVHeatView
              layout={layout}
              t={t}
              hotIds={hotIds}
              events={events}
              system={system}
            />
          )}
          {/* event toasts (floating, top-left of floor) */}
          <div
            style={{
              position: 'absolute',
              left: 16,
              top: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              pointerEvents: 'none',
            }}
          >
            {events
              .slice(-3)
              .reverse()
              .map((e) => (
                <div
                  key={e.id}
                  style={{
                    background:
                      e.kind === 'breakdown'
                        ? '#E74C3Cdd'
                        : e.kind === 'defect'
                          ? '#F5A623dd'
                          : '#1FB36Bdd',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontFamily: LSV_FONTS.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                    animation: 'lsv-toast-in 0.3s ease-out',
                  }}
                >
                  <span style={{ letterSpacing: 1 }}>{e.label}</span>
                  <span style={{ opacity: 0.85, marginLeft: 8 }}>· {e.station}</span>
                </div>
              ))}
          </div>
          {/* zoom controls */}
          <div
            style={{
              position: 'absolute',
              right: 16,
              bottom: 16,
              display: 'flex',
              gap: 4,
            }}
          >
            <button
              onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
              style={lsvBtn()}
            >
              −
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              style={lsvBtn()}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.18))}
              style={lsvBtn()}
            >
              +
            </button>
          </div>
        </div>
        {/* right panel */}
        <LSVInspector
          layout={layout}
          operators={operators}
          bundles={bundles}
          events={events}
          system={system}
          selected={selected}
          selectedStation={selectedStation}
          selectedWorker={selectedWorker}
          onClear={() => setSelected(null)}
          out={out}
          t={t}
        />
      </div>
      {/* ── TRANSPORT BAR ── */}
      <LSVTransportBar
        playing={playing}
        setPlaying={setPlaying}
        speed={speed}
        setSpeed={setSpeed}
        t={t}
        setT={setT}
        onEndShift={() => navigate('/kpi')}
      />
      {/* global keyframes */}
      <style>{`
        @keyframes lsv-toast-in { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes lsv-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes lsv-march { to { stroke-dashoffset: -16; } }
      `}</style>
    </div>
  );
}
