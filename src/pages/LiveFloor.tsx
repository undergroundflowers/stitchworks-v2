import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';

const FLOOR_W_CELLS = 30;
const FLOOR_H_CELLS = 16;

const FLOOR_ZONES_DEFAULT = [
  { id:'fabric',  label:'FABRIC RECEIVING', color:'#FFE9D9', stroke:'#FF5B26', x:0,  y:1,  w:5,  h:4,  roleId:'handler', unitMin:[1.0, 2.5] },
  { id:'spread',  label:'SPREADING',        color:'#FFF1B8', stroke:'#E5A300', x:0,  y:6,  w:5,  h:4,  roleId:'spreader', unitMin:[0.5, 1.5] },
  { id:'cut',     label:'CUTTING',          color:'#D7F5E5', stroke:'#1FB36B', x:0,  y:11, w:5,  h:4,  roleId:'cutter',  unitMin:[0.6, 1.4] },
  { id:'bundle',  label:'BUNDLING',         color:'#E5DBFF', stroke:'#8B5CF6', x:6,  y:1,  w:4,  h:5,  roleId:'bundler', unitMin:[0.4, 1.2] },
  { id:'sew_a',   label:'SEWING LINE A',    color:'#D6E2FF', stroke:'#4F7CFF', x:11, y:1,  w:14, h:4,  roleId:'sewop',   unitMin:[5.0, 9.0], line:true },
  { id:'sew_b',   label:'SEWING LINE B',    color:'#D6E2FF', stroke:'#4F7CFF', x:11, y:6,  w:14, h:4,  roleId:'sewop',   unitMin:[5.0, 9.0], line:true },
  { id:'qc',      label:'INLINE QC',        color:'#FFD7DD', stroke:'#C73E5F', x:11, y:11, w:5,  h:4,  roleId:'qc',      unitMin:[0.4, 1.0] },
  { id:'press',   label:'PRESSING',         color:'#FFE0E6', stroke:'#E74C3C', x:17, y:11, w:4,  h:4,  roleId:'presser', unitMin:[0.6, 1.4] },
  { id:'pack',    label:'PACKING',          color:'#CFEFEF', stroke:'#0EA5A4', x:22, y:11, w:4,  h:4,  roleId:'packer',  unitMin:[0.5, 1.0] },
  { id:'dispatch',label:'DISPATCH',         color:'#E8E2D0', stroke:'#2A3340', x:26, y:1,  w:4,  h:14, roleId:'handler', unitMin:[0.8, 2.0], dock:true },
] as const;

const FLOOR_ROLES_DEFAULT = [
  { id:'handler',  label:'Material handlers', icon:'⏍', color:'#FF5B26', count:4, max:12, costHr:6 },
  { id:'spreader', label:'Spreaders',         icon:'≡', color:'#E5A300', count:3, max:10, costHr:7 },
  { id:'cutter',   label:'Cutters',           icon:'✂', color:'#1FB36B', count:4, max:12, costHr:9 },
  { id:'bundler',  label:'Bundlers',          icon:'◫', color:'#8B5CF6', count:3, max:10, costHr:6 },
  { id:'sewop',    label:'Sewing operators',  icon:'⌃', color:'#4F7CFF', count:24, max:60, costHr:8 },
  { id:'qc',       label:'QC inspectors',     icon:'◎', color:'#C73E5F', count:3, max:10, costHr:9 },
  { id:'presser',  label:'Pressers',          icon:'▤', color:'#E74C3C', count:2, max:8,  costHr:7 },
  { id:'packer',   label:'Packers',           icon:'▣', color:'#0EA5A4', count:3, max:10, costHr:6 },
];

const FLOOR_TROLLEYS_DEFAULT = 6;
const FLOOR_TROLLEY_MAX = 14;

type Zone = {
  id: string;
  label: string;
  color: string;
  stroke: string;
  x: number;
  y: number;
  w: number;
  h: number;
  roleId: string;
  unitMin: readonly [number, number] | number[];
  line?: boolean;
  dock?: boolean;
};

type Role = {
  id: string;
  label: string;
  icon: string;
  color: string;
  count: number;
  max: number;
  costHr: number;
};

type ZoneStatus = 'hot' | 'starved' | 'busy' | 'ok';

type ZoneStateEntry = {
  staffed: number;
  ratePerHr: number;
  util: number;
  wip: number;
  status: ZoneStatus;
};

type ZoneStateMap = Record<string, ZoneStateEntry>;

type OrderParams = {
  interMin: number;
  interMax: number;
  queueCap: number;
  truckMin: number;
  truckMax: number;
};

type ViewMode = 'iso2D' | 'top' | 'heatmap' | 'logic';

type CoachKind = 'warn' | 'info' | 'ok';

type CoachTip = {
  kind: CoachKind;
  msg: string;
  role?: string;
} | null;

const miniInputStyle: React.CSSProperties = {
  width: 44, padding:'2px 5px',
  fontFamily: SW_FONTS.mono, fontWeight: 700, fontSize: 11,
  border:`1px solid ${SW_COLORS.line}`, borderRadius: 3,
  background: '#fff',
};

const transportBtn: React.CSSProperties = {
  width: 28, height: 28,
  background:'transparent', color: SW_COLORS.paper,
  border:'1px solid #ffffff25',
  borderRadius: 3, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center',
  fontSize: 12,
};

const knobStep: React.CSSProperties = {
  width: 22, height: 22,
  background: SW_COLORS.ink, color: '#fff',
  border: 'none', borderRadius: 3, cursor:'pointer',
  fontFamily: SW_FONTS.display, fontWeight: 900, fontSize: 14,
  display:'flex', alignItems:'center', justifyContent:'center',
};

interface KPIProps {
  label: string;
  value: number | string;
  unit: string;
  tone: 'ok' | 'alarm' | 'thread' | 'bobbin' | 'steel';
}

function KPI({ label, value, unit, tone }: KPIProps) {
  const colorMap: Record<KPIProps['tone'], string> = { ok: SW_COLORS.ok, alarm: SW_COLORS.alarm, thread: SW_COLORS.thread, bobbin: SW_COLORS.bobbin, steel: SW_COLORS.steel };
  return (
    <div style={{ background: SW_COLORS.paperDeep, padding: 8, borderRadius: SW_RADIUS.sm }}>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1px' }}>{label}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:4, marginTop:2 }}>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 22, fontWeight: 900, color: colorMap[tone] || SW_COLORS.steel, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted }}>{unit}</div>
      </div>
    </div>
  );
}

interface LegendDotProps {
  color: string;
  label: string;
}

function LegendDot({ color, label }: LegendDotProps) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ width: 8, height:8, borderRadius:'50%', background: color }}/>
      <span>{label}</span>
    </div>
  );
}

interface RoleKnobProps {
  role: Role;
  util: number;
  onChange: (count: number) => void;
}

function RoleKnob({ role, util, onChange }: RoleKnobProps) {
  return (
    <div style={{
      background: SW_COLORS.paperDeep, padding: 8, borderRadius: SW_RADIUS.sm,
      border: `1px solid ${SW_COLORS.line}`,
      display:'flex', flexDirection:'column', gap: 5,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap: 5 }}>
        <div style={{ width: 22, height: 22, background: role.color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', borderRadius: 3, fontSize: 13, fontWeight: 800 }}>{role.icon}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'0.5px', textTransform:'uppercase', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{role.label}</div>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
        <button onClick={()=>onChange(role.count - 1)} style={knobStep}>−</button>
        <input type="number" value={role.count} min={0} max={role.max} onChange={e=>onChange(+e.target.value)}
          style={{
            width: 38, padding:'3px 4px',
            fontFamily: SW_FONTS.display, fontWeight: 900, fontSize: 14,
            textAlign:'center',
            border:`1px solid ${SW_COLORS.line}`, borderRadius: 3,
            background: '#fff', color: SW_COLORS.ink,
          }}/>
        <button onClick={()=>onChange(role.count + 1)} style={knobStep}>+</button>
      </div>

      {/* Util bar */}
      <div style={{ height: 4, background: SW_COLORS.line, borderRadius: 2, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${util}%`, background: util > 90 ? SW_COLORS.alarm : util > 70 ? SW_COLORS.thread : SW_COLORS.ok }}/>
      </div>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, display:'flex', justifyContent:'space-between' }}>
        <span>{util}% util</span>
        <span>${role.costHr}/hr</span>
      </div>
    </div>
  );
}

interface FloorIsoViewProps {
  zones: readonly Zone[];
  zoneState: ZoneStateMap;
  t: number;
  showZones: boolean;
  selectedZone: string | null;
  setSelectedZone: (id: string) => void;
  trolleys: number;
  roles: Role[];
}

function FloorIsoView({ zones, zoneState, t, showZones, selectedZone, setSelectedZone, trolleys, roles }: FloorIsoViewProps) {
  const W = 1200, H = 600;
  const CELL_W = W / FLOOR_W_CELLS;
  const CELL_H = (H - 80) / FLOOR_H_CELLS;

  // iso transform: 2.5D shear (top-down with slight angle)
  const skewY = 0.18;

  // Compute people positions per zone — distribute role.count workers in zone bounds
  const people: { cx: number; cy: number; color: string; role: string; zoneId: string }[] = [];
  zones.forEach(z => {
    const role = roles.find(r => r.id === z.roleId);
    if (!role) return;
    const zoneLines = z.line ? Math.min(2, z.h - 1) : 1;
    const slotsPerLine = Math.min(role.count, Math.max(2, z.w - 1));
    const total = z.line ? slotsPerLine : Math.min(role.count, z.w * z.h);
    for (let i = 0; i < total; i++) {
      let cx, cy;
      if (z.line) {
        const lineIdx = i % zoneLines;
        const slotIdx = Math.floor(i / zoneLines);
        cx = (z.x + 1 + slotIdx * ((z.w - 2) / Math.max(1, slotsPerLine - 1))) * CELL_W;
        cy = (z.y + 1 + lineIdx * ((z.h - 1.5) / Math.max(1, zoneLines - 0.5))) * CELL_H + 40;
      } else {
        const cols = Math.max(1, Math.floor(z.w * 0.6));
        const col = i % cols;
        const row = Math.floor(i / cols);
        cx = (z.x + 0.7 + col * 0.9) * CELL_W;
        cy = (z.y + 0.8 + row * 0.7) * CELL_H + 40;
      }
      // tiny wobble
      cx += Math.sin((t + i * 7) / 9) * 2;
      people.push({ cx, cy, color: role.color, role: role.id, zoneId: z.id });
    }
  });

  // Trolleys travelling between zones (along a flow path)
  const flowPath = ['fabric','spread','cut','bundle','sew_a','qc','press','pack','dispatch'];
  const trolleyDots: { cx: number; cy: number }[] = [];
  for (let i = 0; i < trolleys; i++) {
    const phase = ((t * 5 + i * 80) / 600) % 1;
    const segIdx = Math.floor(phase * (flowPath.length - 1));
    const segT = (phase * (flowPath.length - 1)) - segIdx;
    const a = zones.find(z => z.id === flowPath[segIdx]);
    const b = zones.find(z => z.id === flowPath[segIdx + 1]);
    if (!a || !b) continue;
    const ax = (a.x + a.w / 2) * CELL_W;
    const ay = (a.y + a.h / 2) * CELL_H + 40;
    const bx = (b.x + b.w / 2) * CELL_W;
    const by = (b.y + b.h / 2) * CELL_H + 40;
    trolleyDots.push({ cx: ax + (bx - ax) * segT, cy: ay + (by - ay) * segT });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%', display:'block' }}>
      <defs>
        <pattern id="floorTile" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#FBFAF6"/>
          <path d="M0 24 L24 24 M24 0 L24 24" stroke="#0F141915" strokeWidth="0.5"/>
        </pattern>
        <linearGradient id="dockGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#444"/>
          <stop offset="100%" stopColor="#222"/>
        </linearGradient>
      </defs>

      {/* iso shear group */}
      <g transform={`matrix(1, ${skewY}, 0, 1, 0, -40)`}>
        {/* Floor base */}
        <rect x="0" y="40" width={W} height={H - 80} fill="url(#floorTile)"/>

        {/* Zones */}
        {zones.map(z => {
          const px = z.x * CELL_W;
          const py = z.y * CELL_H + 40;
          const pw = z.w * CELL_W;
          const ph = z.h * CELL_H;
          const s = zoneState[z.id];
          const sel = selectedZone === z.id;
          const statusStroke =
            s?.status === 'hot'     ? SW_COLORS.alarm :
            s?.status === 'starved' ? SW_COLORS.bobbin :
            s?.status === 'busy'    ? SW_COLORS.thread :
                                      SW_COLORS.ok;
          return (
            <g key={z.id} onClick={()=>setSelectedZone(z.id)} style={{ cursor:'pointer' }}>
              {/* Zone fill (paper-tinted) */}
              <rect x={px} y={py} width={pw} height={ph}
                fill={showZones ? z.color : '#FBFAF6'}
                stroke={sel ? SW_COLORS.ink : z.stroke}
                strokeWidth={sel ? 3 : 1.5}
                opacity={showZones ? 0.95 : 1}
              />
              {/* Wall band (gives 3D pop on top edge) */}
              <rect x={px} y={py} width={pw} height={5} fill={z.stroke} opacity="0.45"/>

              {/* Status pulse */}
              <circle cx={px + 10} cy={py + 11} r={4} fill={statusStroke}>
                {s?.status === 'hot' && <animate attributeName="r" values="4;7;4" dur="1.2s" repeatCount="indefinite"/>}
              </circle>

              {/* Dock doors */}
              {z.dock && (
                <g>
                  {[0,1,2,3].map(d => (
                    <rect key={d} x={px + 6} y={py + 14 + d * (ph/4 - 4)} width={pw - 12} height={(ph/4) - 18} fill="url(#dockGrad)" rx="2"/>
                  ))}
                </g>
              )}

              {/* Sewing line strip */}
              {z.line && (
                <line x1={px + 14} y1={py + ph/2} x2={px + pw - 14} y2={py + ph/2}
                  stroke={SW_COLORS.steel} strokeWidth="1.5" strokeDasharray="4 3"
                  style={{ animation: 'sw-march 0.8s linear infinite' }}/>
              )}

              {/* Label */}
              <text x={px + 8} y={py + ph - 8}
                fontFamily={SW_FONTS.display} fontSize="10" fontWeight="900"
                fill={SW_COLORS.ink} letterSpacing="0.05em">
                {z.label}
              </text>

              {/* WIP badge */}
              {s?.wip !== undefined && s.wip > 0 && (
                <g transform={`translate(${px + pw - 38}, ${py + 8})`}>
                  <rect x="0" y="0" width="32" height="14" rx="2" fill={SW_COLORS.ink}/>
                  <text x="16" y="10" fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700" fill="#fff" textAnchor="middle">
                    WIP {s.wip}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Worker dots */}
        {people.map((p, i) => (
          <g key={i} transform={`translate(${p.cx}, ${p.cy})`}>
            <ellipse cx="0" cy="3" rx="3.5" ry="1.5" fill="#00000020"/>
            <circle cx="0" cy="0" r="2.6" fill={p.color} stroke="#fff" strokeWidth="0.8"/>
            <rect x="-1.5" y="2" width="3" height="3.5" fill={p.color} rx="0.5"/>
          </g>
        ))}

        {/* Trolleys (yellow rolling boxes) */}
        {trolleyDots.map((d, i) => (
          <g key={i} transform={`translate(${d.cx}, ${d.cy})`}>
            <ellipse cx="0" cy="5" rx="6" ry="2" fill="#00000022"/>
            <rect x="-5" y="-3" width="10" height="6" fill={SW_COLORS.thread} stroke={SW_COLORS.ink} strokeWidth="0.8" rx="1"/>
            <rect x="-3" y="-4" width="6" height="2" fill={SW_COLORS.brand}/>
          </g>
        ))}
      </g>

      {/* Truck dock at right edge (outside iso shear, sits flat) */}
      <g>
        {[0,1,2].map(i => (
          <g key={i} transform={`translate(${W - 60}, ${100 + i * 80})`}>
            <rect x="0" y="0" width="50" height="40" fill="#fff" stroke={SW_COLORS.ink} strokeWidth="1"/>
            <rect x="3" y="3" width="20" height="14" fill="#A8C5FF"/>
            <circle cx="12" cy="36" r="4" fill={SW_COLORS.ink}/>
            <circle cx="40" cy="36" r="4" fill={SW_COLORS.ink}/>
            <text x="35" y="14" fontFamily={SW_FONTS.mono} fontSize="7" fontWeight="700" fill={SW_COLORS.ink}>TRK</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

interface FloorTopViewProps {
  zones: readonly Zone[];
  zoneState: ZoneStateMap;
  t: number;
  showZones: boolean;
  selectedZone: string | null;
  setSelectedZone: (id: string) => void;
  trolleys: number;
  roles: Role[];
}

function FloorTopView({ zones, zoneState, showZones, selectedZone, setSelectedZone }: FloorTopViewProps) {
  const W = 1200, H = 600;
  const CELL_W = W / FLOOR_W_CELLS;
  const CELL_H = (H - 60) / FLOOR_H_CELLS;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%', display:'block' }}>
      <rect x="0" y="0" width={W} height={H} fill={SW_COLORS.paperDeep}/>
      {zones.map(z => {
        const px = z.x * CELL_W, py = z.y * CELL_H + 30;
        const pw = z.w * CELL_W, ph = z.h * CELL_H;
        const s = zoneState[z.id];
        const sel = selectedZone === z.id;
        return (
          <g key={z.id} onClick={()=>setSelectedZone(z.id)} style={{ cursor:'pointer' }}>
            <rect x={px} y={py} width={pw} height={ph}
              fill={showZones ? z.color : '#fff'}
              stroke={sel ? SW_COLORS.ink : z.stroke}
              strokeWidth={sel ? 3 : 1.5}/>
            <text x={px + 6} y={py + 14}
              fontFamily={SW_FONTS.display} fontSize="10" fontWeight="900" fill={SW_COLORS.ink}>
              {z.label}
            </text>
            <text x={px + 6} y={py + 28} fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700" fill={SW_COLORS.muted}>
              {s?.staffed} ppl · {s?.ratePerHr} pcs/hr
            </text>
            <text x={px + pw - 8} y={py + ph - 8}
              fontFamily={SW_FONTS.display} fontSize="18" fontWeight="900"
              textAnchor="end"
              fill={s?.status === 'hot' ? SW_COLORS.alarm : s?.status === 'starved' ? SW_COLORS.bobbin : SW_COLORS.ok}>
              {s?.util}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface FloorHeatViewProps {
  zones: readonly Zone[];
  zoneState: ZoneStateMap;
}

function FloorHeatView({ zones, zoneState }: FloorHeatViewProps) {
  const W = 1200, H = 600;
  const CELL_W = W / FLOOR_W_CELLS;
  const CELL_H = (H - 60) / FLOOR_H_CELLS;

  function heatColor(util: number) {
    if (util >= 92) return '#7A0010';
    if (util >= 80) return '#E74C3C';
    if (util >= 60) return '#F5A623';
    if (util >= 40) return '#1FB36B';
    if (util >= 20) return '#4F7CFF';
    return '#A0B4D0';
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%', display:'block' }}>
      <rect x="0" y="0" width={W} height={H} fill={SW_COLORS.ink}/>
      {zones.map(z => {
        const px = z.x * CELL_W, py = z.y * CELL_H + 30;
        const pw = z.w * CELL_W, ph = z.h * CELL_H;
        const s = zoneState[z.id];
        const c = heatColor(s?.util || 0);
        return (
          <g key={z.id}>
            <rect x={px} y={py} width={pw} height={ph} fill={c} opacity="0.85" stroke="#000" strokeWidth="0.5"/>
            <text x={px + pw/2} y={py + ph/2 - 6}
              fontFamily={SW_FONTS.display} fontSize="22" fontWeight="900"
              fill="#fff" textAnchor="middle">
              {s?.util}%
            </text>
            <text x={px + pw/2} y={py + ph/2 + 12}
              fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700"
              fill="#ffffffcc" textAnchor="middle" letterSpacing="1px">
              {z.label}
            </text>
          </g>
        );
      })}
      {/* Legend */}
      <g transform={`translate(20, ${H - 28})`}>
        {[20,40,60,80,92].map((v, i) => (
          <g key={v} transform={`translate(${i * 70}, 0)`}>
            <rect x="0" y="0" width="60" height="14" fill={heatColor(v)}/>
            <text x="30" y="10" fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700" fill="#fff" textAnchor="middle">{v}%+</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

interface FloorLogicViewProps {
  zones: readonly Zone[];
  zoneState: ZoneStateMap;
}

function FloorLogicView({ zones, zoneState }: FloorLogicViewProps) {
  const W = 1200, H = 600;
  const flow = [
    'fabric','spread','cut','bundle','sew_a','qc','press','pack','dispatch'
  ].map(id => zones.find(z => z.id === id)).filter(Boolean) as Zone[];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%', display:'block' }}>
      <rect x="0" y="0" width={W} height={H} fill={SW_COLORS.paperDeep}/>
      {flow.map((z, i) => {
        const cols = 5;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 60 + col * 230;
        const y = 80 + row * 220;
        const s = zoneState[z.id];
        return (
          <g key={z.id}>
            <rect x={x} y={y} width={180} height={120} fill="#fff" stroke={z.stroke} strokeWidth="2"/>
            <rect x={x} y={y} width={180} height={20} fill={z.stroke}/>
            <text x={x + 8} y={y + 14} fontFamily={SW_FONTS.display} fontSize="10" fontWeight="900" fill="#fff" letterSpacing="0.05em">{z.label}</text>
            <text x={x + 90} y={y + 60} fontFamily={SW_FONTS.display} fontSize="28" fontWeight="900" fill={SW_COLORS.ink} textAnchor="middle">{s?.ratePerHr}</text>
            <text x={x + 90} y={y + 78} fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700" fill={SW_COLORS.muted} textAnchor="middle">PCS/HR</text>
            <text x={x + 90} y={y + 100} fontFamily={SW_FONTS.mono} fontSize="10" fontWeight="700" fill={SW_COLORS.steel} textAnchor="middle">{s?.staffed} ppl · WIP {s?.wip}</text>

            {/* arrow to next */}
            {i < flow.length - 1 && (() => {
              const nextCol = (i + 1) % cols;
              const nextRow = Math.floor((i + 1) / cols);
              const x2 = 60 + nextCol * 230;
              const y2 = 80 + nextRow * 220;
              const startX = x + 180, startY = y + 60;
              if (nextRow === row) {
                return <path d={`M${startX} ${startY} L${x2 - 4} ${startY}`} stroke={SW_COLORS.ink} strokeWidth="2" markerEnd="url(#larr)"/>;
              } else {
                return <path d={`M${startX} ${startY} Q${startX + 30} ${startY} ${startX + 30} ${(y + 200 + y2)/2} L${x2 + 90} ${(y + 200 + y2)/2} L${x2 + 90} ${y2}`} stroke={SW_COLORS.ink} strokeWidth="2" fill="none" markerEnd="url(#larr)"/>;
              }
            })()}
          </g>
        );
      })}
      <defs>
        <marker id="larr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={SW_COLORS.ink}/>
        </marker>
      </defs>
    </svg>
  );
}

export function LiveFloorPage() {
  const navigate = useNavigate();
  const [zones] = useState<readonly Zone[]>(FLOOR_ZONES_DEFAULT as readonly Zone[]);
  const [roles, setRoles] = useState<Role[]>(FLOOR_ROLES_DEFAULT);
  const [trolleys, setTrolleys] = useState<number>(FLOOR_TROLLEYS_DEFAULT);

  // Order arrival params (AnyLogic interarrival time + queue cap)
  const [orderParams, setOrderParams] = useState<OrderParams>({
    interMin: 3.0, interMax: 5.0, queueCap: 24,
    truckMin: 10, truckMax: 20,
  });

  // Sim controls
  const [playing, setPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(2);
  const [view, setView] = useState<ViewMode>('iso2D');
  const [showZones, setShowZones] = useState<boolean>(true);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  // Sim time, in seconds (sim seconds, not real)
  const [t, setT] = useState<number>(0);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT(x => x + speed), 120);
    return () => clearInterval(id);
  }, [playing, speed]);

  // Derive zone state from t and role counts (mock model — fast + readable)
  const zoneState = useMemo<ZoneStateMap>(() => {
    const m: ZoneStateMap = {};
    zones.forEach(z => {
      const role = roles.find(r => r.id === z.roleId);
      const staffed = role ? role.count : 0;
      // capacity proxy: avg unit time / staff
      const avg = (z.unitMin[0] + z.unitMin[1]) / 2;
      const ratePerHr = staffed > 0 ? (60 / avg) * staffed * (z.line ? 1.0 : 1.0) : 0;

      // utilization: noisy oscillation around a base set by demand vs capacity
      const demand = 80; // pieces/hr target
      const baseUtil = ratePerHr > 0 ? Math.min(98, (demand / ratePerHr) * 100) : 0;
      const wave = Math.sin((t + z.x * 4) / 20) * 6;
      const util = Math.max(8, Math.min(99, baseUtil + wave));

      // wip: queue waiting at this zone, 0..40
      const wipBase = ratePerHr > 0 ? Math.max(0, (demand - ratePerHr) * 0.4) : 30;
      const wipWave = (Math.sin((t + z.x * 7) / 14) + 1) * 5;
      const wip = Math.floor(Math.max(0, wipBase + wipWave + (util > 90 ? 8 : 0)));

      const status: ZoneStatus =
        wip > 25 || util > 92 ? 'hot' :
        util < 30             ? 'starved' :
        util > 75             ? 'busy' : 'ok';

      m[z.id] = { staffed, ratePerHr: Math.round(ratePerHr*10)/10, util: Math.round(util), wip, status };
    });
    return m;
  }, [zones, roles, t]);

  // Roll up KPIs
  const kpis = useMemo(() => {
    const totalLabor = roles.reduce((s, r) => s + r.count, 0);
    const totalCostHr = roles.reduce((s, r) => s + r.count * r.costHr, 0);
    // Throughput = bottleneck
    const rates = zones.filter(z => z.id !== 'dispatch').map(z => zoneState[z.id]?.ratePerHr || 0);
    const throughput = Math.min(...rates);
    const totalWip = zones.reduce((s, z) => s + (zoneState[z.id]?.wip || 0), 0);
    const avgUtil = Math.round(zones.reduce((s, z) => s + (zoneState[z.id]?.util || 0), 0) / zones.length);
    const elapsedMin = Math.floor(t / 5);
    const piecesOut = Math.floor((throughput / 60) * elapsedMin);
    const costPerPc = piecesOut > 0 ? (totalCostHr * (elapsedMin/60)) / piecesOut : 0;
    const target = 480; // 1 shift target
    const onTimePct = Math.min(100, Math.round((piecesOut / target) * 100));
    const bottleneck = zones.filter(z => z.id !== 'dispatch')
      .reduce<Zone | undefined>((bn, z) => (zoneState[z.id]?.ratePerHr || 999) < (zoneState[bn?.id ?? '']?.ratePerHr || 999) ? z : bn, zones[0]);
    return { totalLabor, totalCostHr, throughput: Math.round(throughput), totalWip, avgUtil, elapsedMin, piecesOut, costPerPc, target, onTimePct, bottleneck };
  }, [zoneState, roles, zones, t]);

  // Coach tip
  const coachTip = useMemo<CoachTip>(() => {
    if (!kpis.bottleneck) return null;
    const bn = zoneState[kpis.bottleneck.id];
    if (bn?.status === 'hot') return { kind:'warn', msg:`${kpis.bottleneck.label} is choking — add ${kpis.bottleneck.roleId}s or trolleys.`, role: kpis.bottleneck.roleId };
    const starved = zones.find(z => zoneState[z.id]?.status === 'starved');
    if (starved) return { kind:'info', msg:`${starved.label} is starved — upstream bottleneck is ${kpis.bottleneck.label}.`, role: starved.roleId };
    if (kpis.avgUtil > 88) return { kind:'ok', msg:`Line is humming. Try +5 orders/shift to push the limit.` };
    if (kpis.avgUtil < 50) return { kind:'info', msg:`Capacity unused — reduce labor or pull a bigger order.` };
    return { kind:'ok', msg:`Balanced flow. Watch ${kpis.bottleneck.label} as orders ramp.` };
  }, [kpis, zoneState, zones]);

  function setRoleCount(id: string, count: number) {
    setRoles(rs => rs.map(r => r.id === id ? { ...r, count: Math.max(0, Math.min(r.max, count)) } : r));
  }

  // Sim time pretty
  const simHr = 8 + Math.floor(kpis.elapsedMin / 60);
  const simMn = (kpis.elapsedMin % 60).toString().padStart(2, '0');

  return (
    <div style={{
      height: '100%', display: 'grid',
      gridTemplateColumns: '1fr 280px',
      gridTemplateRows: '1fr auto',
      background: SW_COLORS.paperDeep,
      fontFamily: SW_FONTS.body,
    }}>
      {/* ============= MAIN STAGE ============= */}
      <div style={{
        gridColumn:'1', gridRow:'1',
        display:'flex', flexDirection:'column',
        minHeight: 0, position:'relative',
      }}>
        {/* Title bar / view tabs (AnyLogic style) */}
        <div style={{
          display:'flex', alignItems:'center', gap:14,
          padding:'10px 18px',
          background: SW_COLORS.paper,
          borderBottom: `1px solid ${SW_COLORS.line}`,
        }}>
          <div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900, letterSpacing:'-0.01em' }}>
              APPAREL FLOOR — POLO S/S CLASSIC
            </div>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, fontWeight: 700, letterSpacing:'0.5px' }}>
              PO-4421 · 1,200 PCS · UPS SYSTEM · LINE A+B
            </div>
          </div>
          <div style={{ flex:1 }}/>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, fontFamily: SW_FONTS.mono, fontWeight:700, color: SW_COLORS.muted }}>
            <input type="checkbox" checked={showZones} onChange={e=>setShowZones(e.target.checked)} style={{ accentColor: SW_COLORS.brand }}/>
            <span>SHOW ZONES</span>
          </div>
          <div style={{ width:1, height:22, background: SW_COLORS.line }}/>
          {([
            { id:'iso2D',   label:'2.5D' },
            { id:'top',     label:'TOP' },
            { id:'heatmap', label:'HEAT' },
            { id:'logic',   label:'LOGIC' },
          ] as const).map(v => {
            const active = view === v.id;
            return (
              <button key={v.id} onClick={()=>setView(v.id)} style={{
                background: active ? SW_COLORS.ink : 'transparent',
                color: active ? SW_COLORS.paper : SW_COLORS.steel,
                border: `1px solid ${active ? SW_COLORS.ink : SW_COLORS.line}`,
                fontFamily: SW_FONTS.display, fontSize: 11, fontWeight: 900, letterSpacing:'0.06em',
                padding:'5px 11px', borderRadius: SW_RADIUS.sm, cursor:'pointer',
              }}>{v.label}</button>
            );
          })}
        </div>

        {/* Stage canvas */}
        <div style={{
          flex:1, minHeight: 0, position:'relative',
          background: `repeating-linear-gradient(0deg, transparent 0 23px, ${SW_COLORS.line} 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, ${SW_COLORS.line} 23px 24px), ${SW_COLORS.paperDeep}`,
          overflow:'hidden',
        }}>
          {view === 'iso2D' && <FloorIsoView zones={zones} zoneState={zoneState} t={t} showZones={showZones} selectedZone={selectedZone} setSelectedZone={setSelectedZone} trolleys={trolleys} roles={roles}/>}
          {view === 'top'   && <FloorTopView zones={zones} zoneState={zoneState} t={t} showZones={showZones} selectedZone={selectedZone} setSelectedZone={setSelectedZone} trolleys={trolleys} roles={roles}/>}
          {view === 'heatmap' && <FloorHeatView zones={zones} zoneState={zoneState}/>}
          {view === 'logic' && <FloorLogicView zones={zones} zoneState={zoneState}/>}

          {/* Legend (top-right inside stage) */}
          <div style={{
            position:'absolute', top:14, right:14, background: SW_COLORS.paper,
            border: `1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm,
            padding:'8px 10px', display:'flex', flexDirection:'column', gap:4,
            fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color: SW_COLORS.steel,
          }}>
            <div style={{ fontSize: 9, color: SW_COLORS.muted, letterSpacing:'1px', marginBottom:2 }}>STATUS</div>
            <LegendDot color={SW_COLORS.ok}    label="OK / FLOWING"/>
            <LegendDot color={SW_COLORS.thread} label="BUSY 75–92%"/>
            <LegendDot color={SW_COLORS.alarm} label="HOT / CHOKED"/>
            <LegendDot color={SW_COLORS.bobbin} label="STARVED"/>
          </div>

          {/* Coach card (bottom-left over stage) */}
          {coachTip && (
            <div style={{
              position:'absolute', left:14, bottom:14, maxWidth: 380,
              background: SW_COLORS.ink, color: SW_COLORS.paper,
              border: `2px solid ${coachTip.kind === 'warn' ? SW_COLORS.alarm : coachTip.kind === 'ok' ? SW_COLORS.ok : SW_COLORS.bobbin}`,
              borderRadius: SW_RADIUS.md,
              padding:'10px 12px', display:'flex', gap:10, alignItems:'flex-start',
            }}>
              <div style={{
                width: 32, height:32, borderRadius:'50%',
                background: coachTip.kind === 'warn' ? SW_COLORS.alarm : coachTip.kind === 'ok' ? SW_COLORS.ok : SW_COLORS.bobbin,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily: SW_FONTS.display, fontWeight: 900, fontSize: 16, flexShrink: 0,
              }}>!</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, color:'#ffffff80', letterSpacing:'1.5px', fontWeight: 700, marginBottom: 2 }}>SUPERVISOR COACH</div>
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35 }}>{coachTip.msg}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============= RIGHT KPI RAIL ============= */}
      <div style={{
        gridColumn:'2', gridRow:'1',
        background: SW_COLORS.paper,
        borderLeft: `1px solid ${SW_COLORS.line}`,
        overflow:'auto',
        display:'flex', flexDirection:'column',
      }}>
        {/* Sim clock */}
        <div style={{
          background: SW_COLORS.ink, color: SW_COLORS.paper,
          padding:'14px 16px',
          display:'flex', alignItems:'center', gap:10, justifyContent:'space-between',
        }}>
          <div>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, color:'#ffffff80', letterSpacing:'1.5px', fontWeight: 700 }}>SIM CLOCK</div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 26, fontWeight: 900, letterSpacing:'-0.02em', lineHeight: 1 }}>
              {String(simHr).padStart(2,'0')}:{simMn}
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap: 3 }}>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, color:'#ffffff80', letterSpacing:'1.5px', fontWeight: 700 }}>SHIFT TARGET</div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900, color: kpis.onTimePct < 70 ? SW_COLORS.alarm : SW_COLORS.thread }}>
              {kpis.piecesOut}<span style={{ fontSize: 10, opacity: 0.5 }}>/{kpis.target}</span>
            </div>
          </div>
        </div>

        {/* Big metric cards */}
        <div style={{ padding: 14, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
          <KPI label="THROUGHPUT" value={kpis.throughput} unit="pcs/hr" tone="ok"/>
          <KPI label="WIP TOTAL"   value={kpis.totalWip}   unit="pcs"    tone={kpis.totalWip > 80 ? 'alarm' : 'thread'}/>
          <KPI label="AVG UTIL"    value={kpis.avgUtil}    unit="%"      tone={kpis.avgUtil > 85 ? 'alarm' : kpis.avgUtil > 60 ? 'ok' : 'bobbin'}/>
          <KPI label="LABOR"       value={kpis.totalLabor} unit="ppl"    tone="steel"/>
          <KPI label="$/PIECE"     value={kpis.costPerPc.toFixed(2)} unit="USD" tone="steel"/>
          <KPI label="ON-TIME"     value={kpis.onTimePct}  unit="%"      tone={kpis.onTimePct > 80 ? 'ok' : 'alarm'}/>
        </div>

        {/* Bottleneck card */}
        {kpis.bottleneck && (
          <div style={{ margin: '0 14px 14px', border:`2px solid ${SW_COLORS.alarm}`, borderRadius: SW_RADIUS.sm, padding: 10, background:'#FFF1ED' }}>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.alarm, letterSpacing:'1.5px' }}>⚠ BOTTLENECK</div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, marginTop: 2 }}>{kpis.bottleneck.label}</div>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, marginTop: 2 }}>
              {zoneState[kpis.bottleneck.id]?.ratePerHr} pcs/hr · WIP {zoneState[kpis.bottleneck.id]?.wip}
            </div>
          </div>
        )}

        {/* Per-zone rate list */}
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 6 }}>PER-ZONE RATE</div>
          {zones.filter(z => z.id !== 'dispatch').map(z => {
            const s = zoneState[z.id];
            return (
              <div key={z.id} onClick={()=>setSelectedZone(z.id)} style={{
                display:'flex', alignItems:'center', gap:8, padding: '5px 0',
                borderBottom: `1px solid ${SW_COLORS.line}`,
                cursor:'pointer',
                background: selectedZone === z.id ? SW_COLORS.brandLite : 'transparent',
              }}>
                <div style={{ width: 6, height: 24, background: z.stroke, borderRadius: 1 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: SW_FONTS.body, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{z.label}</div>
                  <div style={{ height: 3, background: SW_COLORS.line, borderRadius: 1, marginTop: 3, overflow:'hidden' }}>
                    <div style={{
                      height:'100%', width:`${s?.util || 0}%`,
                      background: s?.status === 'hot' ? SW_COLORS.alarm : s?.status === 'busy' ? SW_COLORS.thread : s?.status === 'starved' ? SW_COLORS.bobbin : SW_COLORS.ok,
                    }}/>
                  </div>
                </div>
                <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, textAlign:'right' }}>
                  {s?.ratePerHr}
                  <div style={{ fontSize: 9, color: SW_COLORS.muted }}>pcs/hr</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============= BOTTOM CONTROL DECK (AnyLogic-style) ============= */}
      <div style={{
        gridColumn:'1 / 3', gridRow:'2',
        background: SW_COLORS.paper,
        borderTop: `2px solid ${SW_COLORS.ink}`,
        padding: '12px 18px 14px',
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap: 18 }}>
          {/* Roles row (the AnyLogic counter knobs) */}
          <div style={{ flex: 1, display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap: 10 }}>
            {roles.map(r => {
              const utilForRole = (() => {
                const zs = zones.filter(z => z.roleId === r.id).map(z => zoneState[z.id]?.util || 0);
                return zs.length ? Math.round(zs.reduce((a,b)=>a+b,0)/zs.length) : 0;
              })();
              return <RoleKnob key={r.id} role={r} util={utilForRole} onChange={(c)=>setRoleCount(r.id, c)}/>;
            })}
          </div>
          {/* Trolleys + orders block */}
          <div style={{ width: 280, display:'flex', flexDirection:'column', gap: 8 }}>
            <div style={{ display:'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1px' }}>TROLLEYS</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop: 2 }}>
                  <div style={{ width: 22, height: 22, background: SW_COLORS.steel, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', borderRadius: 3, fontSize: 13 }}>⏍</div>
                  <input type="number" value={trolleys} min={0} max={FLOOR_TROLLEY_MAX}
                    onChange={e=>setTrolleys(Math.max(0, Math.min(FLOOR_TROLLEY_MAX, +e.target.value)))}
                    style={{ width: 50, padding:'3px 5px', fontFamily: SW_FONTS.mono, fontWeight: 700, fontSize: 13, border:`1px solid ${SW_COLORS.line}`, borderRadius: 3 }}/>
                  <input type="range" min={0} max={FLOOR_TROLLEY_MAX} value={trolleys} onChange={e=>setTrolleys(+e.target.value)} style={{ flex: 1, accentColor: SW_COLORS.brand }}/>
                </div>
              </div>
            </div>

            <div style={{ background: SW_COLORS.paperDeep, padding: 8, borderRadius: SW_RADIUS.sm, border:`1px solid ${SW_COLORS.line}` }}>
              <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1px', marginBottom: 4 }}>ORDERS</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                <span style={{ width:90 }}>Interarrival</span>
                <input type="number" value={orderParams.interMin} step={0.5} onChange={e=>setOrderParams({...orderParams, interMin: +e.target.value})} style={miniInputStyle}/>
                <span>–</span>
                <input type="number" value={orderParams.interMax} step={0.5} onChange={e=>setOrderParams({...orderParams, interMax: +e.target.value})} style={miniInputStyle}/>
                <span style={{ fontFamily: SW_FONTS.mono, fontSize:10, color: SW_COLORS.muted }}>min</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, marginTop: 4 }}>
                <span style={{ width:90 }}>Queue cap</span>
                <input type="number" value={orderParams.queueCap} onChange={e=>setOrderParams({...orderParams, queueCap: +e.target.value})} style={miniInputStyle}/>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, marginTop: 4 }}>
                <span style={{ width:90 }}>Truck arrive</span>
                <input type="number" value={orderParams.truckMin} onChange={e=>setOrderParams({...orderParams, truckMin: +e.target.value})} style={miniInputStyle}/>
                <span>–</span>
                <input type="number" value={orderParams.truckMax} onChange={e=>setOrderParams({...orderParams, truckMax: +e.target.value})} style={miniInputStyle}/>
                <span style={{ fontFamily: SW_FONTS.mono, fontSize:10, color: SW_COLORS.muted }}>min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Transport bar */}
        <div style={{
          marginTop: 12, display:'flex', alignItems:'center', gap: 10,
          background: SW_COLORS.ink, color: SW_COLORS.paper,
          padding:'8px 12px', borderRadius: SW_RADIUS.sm,
        }}>
          <button onClick={()=>setPlaying(p=>!p)} style={transportBtn}>
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={()=>{ setT(0); }} style={transportBtn}>⏮</button>
          <button onClick={()=>setSpeed(Math.max(1, speed-1))} style={transportBtn}>−</button>
          <div style={{ background: SW_COLORS.brand, color:'#fff', padding:'5px 12px', borderRadius: 3, fontFamily: SW_FONTS.display, fontWeight: 900, minWidth: 44, textAlign:'center' }}>×{speed}</div>
          <button onClick={()=>setSpeed(Math.min(20, speed+1))} style={transportBtn}>+</button>

          <div style={{ width:1, height:20, background:'#ffffff20', margin:'0 4px' }}/>

          {/* Progress through shift */}
          <div style={{ flex: 1, height: 6, background:'#ffffff15', borderRadius: 3, overflow:'hidden', position:'relative' }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${Math.min(100, (kpis.elapsedMin/480)*100)}%`, background: SW_COLORS.brand }}/>
          </div>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color:'#ffffff90' }}>
            {kpis.elapsedMin}/480 MIN
          </div>

          <div style={{ width:1, height:20, background:'#ffffff20', margin:'0 4px' }}/>

          <div style={{ display:'flex', alignItems:'center', gap: 5 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background: playing ? SW_COLORS.ok : SW_COLORS.warn, animation: playing ? 'sw-blink 1.2s infinite' : 'none' }}/>
            <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, letterSpacing:'1px' }}>{playing ? 'RUNNING' : 'PAUSED'}</span>
          </div>

          <button onClick={()=>navigate('/layout')} style={{ ...transportBtn, fontFamily: SW_FONTS.display, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', padding: '6px 10px' }}>▦ LAYOUT</button>
          <button onClick={()=>navigate('/kpi')} style={{ ...transportBtn, fontFamily: SW_FONTS.display, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', padding: '6px 10px' }}>⌬ REPORT</button>
        </div>
      </div>

      <style>{`
        @keyframes sw-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes sw-march { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -16; } }
      `}</style>
    </div>
  );
}
