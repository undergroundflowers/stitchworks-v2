/**
 * Live Floor — animated, view-mode-toggleable view of the active twin.
 *
 * Three views over the same data (departments + workstations from the twin
 * store):
 *   • ISO 3D — isometric projection with cuboid fixtures, walking operators,
 *     moving WIP bundles, and heat-tinted bottlenecks.
 *   • TOP 2D — flat blueprint top-down view.
 *   • HEAT  — radial-gradient blobs around each workstation showing
 *     utilisation pressure.
 *
 * Reads:
 *   - twin store (`useTwin`)  — departments & workstations
 *   - sim store (`useSim` config built from active garment) — observed util
 *
 * This is a presentation/visualisation surface only — authoring lives in
 * /builder, KPIs live in /kpi.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SW_COLORS, SW_FONTS } from '../design/tokens';
import { useTwin, selectActiveTwin, type DepartmentColorKey } from '../store/twin';
import {
  ISO_FIXTURE_CATALOG,
  isoProj,
  ptsToStr,
  type IsoFixture,
} from '../domain';
import type { Department, Workstation } from '../domain/twin';

// ============================================================================
// SHARED HELPERS
// ============================================================================

type FloorView = 'iso' | 'top' | 'heat';

const DEPT_COLOR_HEX: Record<DepartmentColorKey, string> = {
  fabric: SW_COLORS.fabric,
  thread: SW_COLORS.thread,
  brand: SW_COLORS.brand,
  red: SW_COLORS.alarm,
  blue: SW_COLORS.bobbin,
  yellow: SW_COLORS.thread,
  green: SW_COLORS.fabric,
  cream: SW_COLORS.paperEdge,
};

function resolveFixture(id: string): IsoFixture | undefined {
  return ISO_FIXTURE_CATALOG.find((f) => f.id === id);
}

/** Pseudo-utilisation when no real KPI run yet — derived from a station's
 *  position so the heatmap looks alive even on a fresh twin. */
function fakeUtil(ws: Workstation, t: number): number {
  const seed = (ws.position.x * 13 + ws.position.y * 7) % 100;
  return 45 + 30 * Math.sin(t * 0.6 + seed) + (seed % 25);
}

function utilColor(util: number): string {
  if (util >= 92) return SW_COLORS.alarm;
  if (util >= 75) return SW_COLORS.warn;
  return SW_COLORS.ok;
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function LiveFloorPage() {
  const navigate = useNavigate();
  const twin = useTwin(selectActiveTwin);
  const [view, setView] = useState<FloorView>('iso');
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedWs, setSelectedWs] = useState<string | null>(null);

  // Animation tick
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setT((p) => p + dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Synthetic event log — picks a random hotspot every few seconds.
  const [events, setEvents] = useState<{ id: number; ws: string; kind: 'breakdown' | 'defect' | 'milestone'; label: string; t: number }[]>([]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const ws = twin.workstations[Math.floor(Math.random() * twin.workstations.length)];
      if (!ws) return;
      const kinds: Array<{ kind: 'breakdown' | 'defect' | 'milestone'; label: string }> = [
        { kind: 'breakdown', label: 'NEEDLE BREAK' },
        { kind: 'defect', label: 'STITCH DEFECT' },
        { kind: 'milestone', label: 'BUNDLE OUT' },
        { kind: 'defect', label: 'SKIP STITCH' },
        { kind: 'milestone', label: 'CLEAR QUEUE' },
      ];
      const choice = kinds[Math.floor(Math.random() * kinds.length)];
      setEvents((prev) => [
        ...prev.slice(-6),
        { id: Date.now() + Math.random(), ws: ws.id, ...choice, t: Date.now() },
      ]);
    }, 4000);
    return () => clearInterval(id);
  }, [playing, twin.workstations]);

  const hotIds = useMemo(() => {
    const set = new Set<string>();
    events.slice(-3).forEach((e) => {
      if (e.kind !== 'milestone') set.add(e.ws);
    });
    return set;
  }, [events]);

  const elapsed = Math.floor(t);
  const hr = 8 + Math.floor(elapsed / 60);
  const mn = (elapsed % 60).toString().padStart(2, '0');

  const empty = twin.departments.length === 0;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        background: SW_COLORS.ink,
        color: SW_COLORS.paper,
        fontFamily: SW_FONTS.body,
      }}
    >
      {/* ── HUD ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderBottom: '1px solid #ffffff15',
          background: '#0a0d12',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: playing ? SW_COLORS.ok : SW_COLORS.warn,
              boxShadow: playing ? `0 0 10px ${SW_COLORS.ok}` : 'none',
              animation: playing ? 'lf-pulse 1.2s infinite' : 'none',
            }}
          />
          <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, letterSpacing: '2px' }}>
            {playing ? 'RUNNING' : 'PAUSED'}
          </span>
        </div>
        <div style={{ width: 1, height: 22, background: '#ffffff20' }} />
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 22, fontWeight: 700, color: '#fff' }}>
          {hr.toString().padStart(2, '0')}:{mn}
        </div>
        <div style={{ fontSize: 10, color: '#ffffff80', fontFamily: SW_FONTS.mono }}>SHIFT A · DAY 14</div>
        <div style={{ width: 1, height: 22, background: '#ffffff20' }} />

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, background: '#ffffff08', padding: 2, borderRadius: 6 }}>
          {(['iso', 'top', 'heat'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? SW_COLORS.brand : 'transparent',
                color: view === v ? '#fff' : '#ffffffaa',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 14px',
                fontFamily: SW_FONTS.display,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.1em',
                borderRadius: 4,
                textTransform: 'uppercase',
              }}
            >
              {v === 'iso' ? 'ISO 3D' : v === 'top' ? 'TOP 2D' : 'HEAT'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Twin badge */}
        <div
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 10,
            fontWeight: 700,
            color: '#ffffff80',
            letterSpacing: '1.5px',
          }}
        >
          TWIN · {twin.name.toUpperCase()} · {twin.departments.length}D · {twin.workstations.length}W
        </div>

        <button
          onClick={() => navigate('/builder')}
          style={{
            background: '#ffffff10',
            border: '1px solid #ffffff30',
            color: '#fff',
            padding: '6px 12px',
            fontFamily: SW_FONTS.display,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            borderRadius: 4,
          }}
        >
          ✎ EDIT IN BUILDER
        </button>
      </div>

      {/* ── FLOOR + RIGHT INSPECTOR ─────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
        }}
      >
        {/* Stage */}
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: 'radial-gradient(ellipse at 50% 30%, #182231 0%, #0a0d12 100%)',
          }}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.max(0.4, Math.min(2.5, z * (e.deltaY < 0 ? 1.08 : 0.93))));
          }}
        >
          {empty ? (
            <EmptyState onBuild={() => navigate('/builder')} />
          ) : (
            <>
              {view === 'iso' && (
                <IsoView
                  twin={twin}
                  t={t}
                  zoom={zoom}
                  pan={pan}
                  hotIds={hotIds}
                  selectedWs={selectedWs}
                  onSelect={setSelectedWs}
                />
              )}
              {view === 'top' && (
                <TopView
                  twin={twin}
                  t={t}
                  zoom={zoom}
                  hotIds={hotIds}
                  selectedWs={selectedWs}
                  onSelect={setSelectedWs}
                />
              )}
              {view === 'heat' && <HeatView twin={twin} t={t} hotIds={hotIds} />}

              {/* Event toasts */}
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
                {events.slice(-3).reverse().map((e) => (
                  <div
                    key={e.id}
                    style={{
                      background:
                        e.kind === 'breakdown'
                          ? `${SW_COLORS.alarm}dd`
                          : e.kind === 'defect'
                            ? `${SW_COLORS.warn}dd`
                            : `${SW_COLORS.ok}dd`,
                      color: '#fff',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontFamily: SW_FONTS.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                      animation: 'lf-toast-in 0.3s ease-out',
                      letterSpacing: '0.1em',
                    }}
                  >
                    <span>{e.label}</span>
                    <span style={{ opacity: 0.85, marginLeft: 8 }}>
                      · {twin.workstations.find((w) => w.id === e.ws)?.name?.slice(0, 14) ?? '—'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Zoom controls */}
              <div
                style={{
                  position: 'absolute',
                  right: 16,
                  bottom: 16,
                  display: 'flex',
                  gap: 4,
                  background: '#0a0d12',
                  padding: 3,
                  border: '1px solid #ffffff20',
                  borderRadius: 6,
                }}
              >
                <FloorBtn onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}>−</FloorBtn>
                <FloorBtn
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  {Math.round(zoom * 100)}%
                </FloorBtn>
                <FloorBtn onClick={() => setZoom((z) => Math.min(2.5, z * 1.18))}>+</FloorBtn>
              </div>
            </>
          )}
        </div>

        {/* Right inspector */}
        <Inspector
          twin={twin}
          selectedWs={selectedWs}
          onClear={() => setSelectedWs(null)}
          events={events.slice(-8).reverse()}
          t={t}
        />
      </div>

      {/* ── TRANSPORT BAR ───────────────────────────────────────────────── */}
      <div
        style={{
          padding: '12px 18px',
          background: '#0a0d12',
          borderTop: '1px solid #ffffff15',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            background: playing ? SW_COLORS.alarm : SW_COLORS.ok,
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 16px',
            fontFamily: SW_FONTS.display,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '0.1em',
            borderRadius: 4,
          }}
        >
          {playing ? '⏸ PAUSE' : '▶ PLAY'}
        </button>
        <div style={{ width: 1, height: 24, background: '#ffffff20' }} />
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: '#ffffff80', letterSpacing: '0.1em' }}>
          ELAPSED · {elapsed}s
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 10,
            color: '#ffffff60',
            letterSpacing: '0.06em',
          }}
        >
          SCROLL zoom · CLICK workstation to inspect
        </span>
        <button
          onClick={() => navigate('/sim')}
          style={{
            background: SW_COLORS.brand,
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 16px',
            fontFamily: SW_FONTS.display,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.1em',
            borderRadius: 4,
          }}
        >
          ▶ OPEN SIMULATION →
        </button>
      </div>

      {/* keyframes */}
      <style>{`
        @keyframes lf-toast-in { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes lf-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes lf-march { to { stroke-dashoffset: -16; } }
      `}</style>
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState({ onBuild }: { onBuild: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, color: '#ffffff60', letterSpacing: '2px' }}>
        NO TWIN AUTHORED YET
      </div>
      <div
        style={{
          fontFamily: SW_FONTS.display,
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: '-0.01em',
          color: '#fff',
          maxWidth: 520,
          lineHeight: 1.05,
        }}
      >
        Build your factory.<br />
        <span style={{ color: SW_COLORS.brand }}>Then watch it run.</span>
      </div>
      <div style={{ fontSize: 13, color: '#ffffffaa', maxWidth: 440 }}>
        Drop departments and workstations on the canvas in Factory Builder, then come back here for the iso 3D, top-down 2D and heat-map live views.
      </div>
      <button
        onClick={onBuild}
        style={{
          background: SW_COLORS.brand,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          padding: '10px 22px',
          fontFamily: SW_FONTS.display,
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: '0.1em',
          borderRadius: 6,
          marginTop: 8,
        }}
      >
        ◆ OPEN FACTORY BUILDER →
      </button>
    </div>
  );
}

// ============================================================================
// ISO 3D VIEW
// ============================================================================

interface IsoViewProps {
  twin: ReturnType<typeof selectActiveTwin>;
  t: number;
  zoom: number;
  pan: { x: number; y: number };
  hotIds: Set<string>;
  selectedWs: string | null;
  onSelect: (id: string | null) => void;
}

function IsoView({ twin, t, zoom, pan, hotIds, selectedWs, onSelect }: IsoViewProps) {
  // World-extent bounds → SVG viewBox.
  const cTL = isoProj(0, 0);
  const cTR = isoProj(twin.gridW, 0);
  const cBR = isoProj(twin.gridW, twin.gridH);
  const cBL = isoProj(0, twin.gridH);
  const minX = Math.min(cTL.sx, cBL.sx) - 80;
  const maxX = Math.max(cTR.sx, cBR.sx) + 80;
  const minY = Math.min(cTL.sy, cTR.sy) - 80;
  const maxY = Math.max(cBL.sy, cBR.sy) + 80;
  const vbW = maxX - minX;
  const vbH = maxY - minY;

  const sortedWs = useMemo(
    () =>
      [...twin.workstations].sort((a, b) =>
        a.position.x + a.position.y - (b.position.x + b.position.y),
      ),
    [twin.workstations],
  );

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', userSelect: 'none' }}
      onClick={() => onSelect(null)}
    >
      <defs>
        <pattern id="lf-grid-iso" width={32} height={32} patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#ffffff06" strokeWidth={1} />
        </pattern>
        <radialGradient id="lf-vig" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.6} />
        </radialGradient>
      </defs>
      <rect x={minX} y={minY} width={vbW} height={vbH} fill="url(#lf-grid-iso)" />

      <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: 'center' }}>
        {/* Floor diamond */}
        <polygon
          points={ptsToStr([cTL, cTR, cBR, cBL])}
          fill="#ffffff05"
          stroke="#ffffff20"
          strokeWidth={1.2}
        />
        {/* Iso grid lines */}
        {Array.from({ length: twin.gridW + 1 }, (_, i) => {
          const a = isoProj(i, 0);
          const b = isoProj(i, twin.gridH);
          return <line key={`v-${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#ffffff08" strokeWidth={0.5} />;
        })}
        {Array.from({ length: twin.gridH + 1 }, (_, i) => {
          const a = isoProj(0, i);
          const b = isoProj(twin.gridW, i);
          return <line key={`h-${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#ffffff08" strokeWidth={0.5} />;
        })}

        {/* Departments — coloured zone diamonds */}
        {twin.departments.map((d) => (
          <DeptDiamond key={d.id} dept={d} />
        ))}

        {/* Workstations — depth-sorted iso fixtures */}
        {sortedWs.map((w) => (
          <IsoWorkstation
            key={w.id}
            ws={w}
            isHot={hotIds.has(w.id)}
            isSelected={selectedWs === w.id}
            t={t}
            onClick={() => onSelect(w.id)}
          />
        ))}

        {/* Walking operators — one per workstation, animated */}
        {sortedWs.map((w) => (
          <WalkingOperator key={`op-${w.id}`} ws={w} t={t} />
        ))}

        {/* Travelling WIP bundles — synthesised from dept→dept hops */}
        <WipFlow twin={twin} t={t} />
      </g>

      <rect x={minX} y={minY} width={vbW} height={vbH} fill="url(#lf-vig)" pointerEvents="none" />
    </svg>
  );
}

function DeptDiamond({ dept }: { dept: Department }) {
  const tl = isoProj(dept.bounds.x, dept.bounds.y);
  const tr = isoProj(dept.bounds.x + dept.bounds.w, dept.bounds.y);
  const br = isoProj(dept.bounds.x + dept.bounds.w, dept.bounds.y + dept.bounds.h);
  const bl = isoProj(dept.bounds.x, dept.bounds.y + dept.bounds.h);
  const cx = (tl.sx + tr.sx + br.sx + bl.sx) / 4;
  const cy = (tl.sy + tr.sy + br.sy + bl.sy) / 4;
  const fill = DEPT_COLOR_HEX[dept.color];
  return (
    <g>
      <polygon points={ptsToStr([tl, tr, br, bl])} fill={fill} fillOpacity={0.16} />
      <polygon
        points={ptsToStr([tl, tr, br, bl])}
        fill="none"
        stroke={fill}
        strokeWidth={1.4}
        strokeDasharray="4 3"
        opacity={0.7}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={SW_FONTS.display}
        fontSize={18}
        fontWeight={900}
        fill={fill}
        opacity={0.45}
        style={{ pointerEvents: 'none', letterSpacing: '0.15em' }}
      >
        {dept.name.toUpperCase()}
      </text>
    </g>
  );
}

function IsoWorkstation({
  ws,
  isHot,
  isSelected,
  t,
  onClick,
}: {
  ws: Workstation;
  isHot: boolean;
  isSelected: boolean;
  t: number;
  onClick: () => void;
}) {
  const fixture = resolveFixture(ws.catalogId);
  if (!fixture) return null;

  const origin = isoProj(ws.position.x, ws.position.y);
  const tl = isoProj(ws.position.x, ws.position.y);
  const tr = isoProj(ws.position.x + fixture.w, ws.position.y);
  const br = isoProj(ws.position.x + fixture.w, ws.position.y + fixture.d);
  const bl = isoProj(ws.position.x, ws.position.y + fixture.d);

  const util = ws.kpiObserved?.utilizationPct ?? fakeUtil(ws, t);

  return (
    <g
      transform={`translate(${origin.sx}, ${origin.sy}) rotate(${ws.rotation})`}
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {fixture.draw({ w: fixture.w, d: fixture.d, h: fixture.h }) as ReactNode}

      {/* Heat tint */}
      <polygon
        points={ptsToStr([
          { sx: 0, sy: 0 },
          { sx: tr.sx - tl.sx, sy: tr.sy - tl.sy },
          { sx: br.sx - tl.sx, sy: br.sy - tl.sy },
          { sx: bl.sx - tl.sx, sy: bl.sy - tl.sy },
        ])}
        fill={utilColor(util)}
        fillOpacity={0.18 + (util / 100) * 0.25}
        pointerEvents="none"
      />

      {/* Selection ring */}
      {isSelected && (
        <polygon
          points={ptsToStr([
            { sx: 0, sy: -8 },
            { sx: tr.sx - tl.sx, sy: tr.sy - tl.sy - 8 },
            { sx: br.sx - tl.sx, sy: br.sy - tl.sy - 8 },
            { sx: bl.sx - tl.sx, sy: bl.sy - tl.sy - 8 },
          ])}
          fill="none"
          stroke={SW_COLORS.brand}
          strokeWidth={2.5}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}

      {/* Bottleneck flag */}
      {isHot && (
        <g transform="translate(0, -28)">
          <circle r={6} fill={SW_COLORS.alarm}>
            <animate attributeName="r" values="6;9;6" dur="0.8s" repeatCount="indefinite" />
          </circle>
          <text
            x={0}
            y={3}
            textAnchor="middle"
            fontFamily={SW_FONTS.display}
            fontSize={9}
            fontWeight={900}
            fill="#fff"
            pointerEvents="none"
          >
            !
          </text>
        </g>
      )}
    </g>
  );
}

function WalkingOperator({ ws, t }: { ws: Workstation; t: number }) {
  // Bob a small dot near the workstation that wanders within 1 cell.
  const ph = (ws.position.x * 0.7 + ws.position.y * 1.3 + t * 0.6) % (Math.PI * 2);
  const ox = ws.position.x + 0.5 + Math.cos(ph) * 0.4;
  const oy = ws.position.y + 0.5 + Math.sin(ph) * 0.4;
  const p = isoProj(ox, oy);
  return (
    <g transform={`translate(${p.sx}, ${p.sy - 8})`} pointerEvents="none">
      <circle cx={0} cy={4} r={4} fill={SW_COLORS.bobbin} stroke="#fff" strokeWidth={1} />
      <circle cx={0} cy={-2} r={2.5} fill="#F0C49B" stroke="#0F1419" strokeWidth={0.6} />
    </g>
  );
}

function WipFlow({ twin, t }: { twin: ReturnType<typeof selectActiveTwin>; t: number }) {
  // Small coloured dots that ride between consecutive workstations.
  if (twin.workstations.length < 2) return null;
  const sorted = [...twin.workstations].sort(
    (a, b) => a.position.x + a.position.y - (b.position.x + b.position.y),
  );
  const colors = [SW_COLORS.thread, SW_COLORS.fabric, SW_COLORS.bobbin, SW_COLORS.trim];
  return (
    <g pointerEvents="none">
      {sorted.slice(0, sorted.length - 1).map((ws, i) => {
        const next = sorted[i + 1];
        const phase = ((t * 0.4 + i * 0.27) % 1 + 1) % 1;
        const x = ws.position.x + (next.position.x - ws.position.x) * phase + 0.5;
        const y = ws.position.y + (next.position.y - ws.position.y) * phase + 0.5;
        const p = isoProj(x, y);
        return (
          <rect
            key={`b-${i}`}
            x={p.sx - 3}
            y={p.sy - 3}
            width={6}
            height={6}
            fill={colors[i % colors.length]}
            stroke="#0F1419"
            strokeWidth={0.6}
            opacity={0.92}
          />
        );
      })}
    </g>
  );
}

// ============================================================================
// TOP 2D VIEW
// ============================================================================

interface TopViewProps {
  twin: ReturnType<typeof selectActiveTwin>;
  t: number;
  zoom: number;
  hotIds: Set<string>;
  selectedWs: string | null;
  onSelect: (id: string | null) => void;
}

function TopView({ twin, t, zoom, hotIds, selectedWs, onSelect }: TopViewProps) {
  const CELL = 28;
  const W = twin.gridW * CELL;
  const H = twin.gridH * CELL;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
      onClick={() => onSelect(null)}
    >
      <defs>
        <pattern id="lf-top-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="#ffffff10" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#0d1219" />
      <rect width={W} height={H} fill="url(#lf-top-grid)" />

      <g style={{ transformOrigin: 'center', transform: `scale(${zoom})` }}>
        {/* Departments */}
        {twin.departments.map((d) => {
          const c = DEPT_COLOR_HEX[d.color];
          return (
            <g key={d.id}>
              <rect
                x={d.bounds.x * CELL}
                y={d.bounds.y * CELL}
                width={d.bounds.w * CELL}
                height={d.bounds.h * CELL}
                fill={c}
                opacity={0.13}
                stroke={c}
                strokeWidth={1.4}
                strokeDasharray="4 3"
              />
              <text
                x={d.bounds.x * CELL + 8}
                y={d.bounds.y * CELL + 18}
                fontFamily={SW_FONTS.mono}
                fontSize={11}
                fontWeight={900}
                fill={c}
                style={{ letterSpacing: '0.1em' }}
              >
                {d.name.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Flow arrows between consecutive stations */}
        {twin.workstations.length > 1 &&
          [...twin.workstations]
            .sort((a, b) => a.position.x + a.position.y - (b.position.x + b.position.y))
            .slice(0, -1)
            .map((ws, i, arr) => {
              const next = arr[i + 1] ?? twin.workstations[twin.workstations.length - 1];
              if (!next) return null;
              return (
                <line
                  key={`flow-${i}`}
                  x1={ws.position.x * CELL + CELL / 2}
                  y1={ws.position.y * CELL + CELL / 2}
                  x2={next.position.x * CELL + CELL / 2}
                  y2={next.position.y * CELL + CELL / 2}
                  stroke="#ffffff30"
                  strokeWidth={1.2}
                  strokeDasharray="6 4"
                  style={{
                    animation: 'lf-march 0.8s linear infinite',
                  }}
                />
              );
            })}

        {/* Workstations */}
        {twin.workstations.map((ws) => {
          const fix = resolveFixture(ws.catalogId);
          const w = (fix?.w ?? 1) * CELL;
          const h = (fix?.d ?? 1) * CELL;
          const isHot = hotIds.has(ws.id);
          const isSel = selectedWs === ws.id;
          const util = ws.kpiObserved?.utilizationPct ?? fakeUtil(ws, t);
          const fill = isHot ? SW_COLORS.alarm : utilColor(util);
          return (
            <g
              key={ws.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(ws.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={ws.position.x * CELL + 2}
                y={ws.position.y * CELL + 2}
                width={Math.max(8, w - 4)}
                height={Math.max(8, h - 4)}
                rx={3}
                fill={fill}
                opacity={0.7 + (util / 100) * 0.3}
                stroke={isSel ? '#fff' : '#0F1419'}
                strokeWidth={isSel ? 2 : 1}
              />
              {isHot && (
                <circle
                  cx={ws.position.x * CELL + w / 2}
                  cy={ws.position.y * CELL + h / 2}
                  r={Math.min(w, h) / 2 + 4}
                  fill="none"
                  stroke={SW_COLORS.alarm}
                  strokeWidth={1.5}
                >
                  <animate
                    attributeName="r"
                    values={`${Math.min(w, h) / 2 + 4};${Math.min(w, h) / 2 + 12};${Math.min(w, h) / 2 + 4}`}
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}

        {/* Operator dots */}
        {twin.workstations.map((ws) => {
          const ph = (ws.position.x * 0.7 + ws.position.y * 1.3 + t * 0.6) % (Math.PI * 2);
          const ox = (ws.position.x + 0.5 + Math.cos(ph) * 0.4) * CELL;
          const oy = (ws.position.y + 0.5 + Math.sin(ph) * 0.4) * CELL;
          return (
            <circle
              key={`op-${ws.id}`}
              cx={ox}
              cy={oy}
              r={3.5}
              fill={SW_COLORS.bobbin}
              stroke="#fff"
              strokeWidth={1}
              pointerEvents="none"
            />
          );
        })}
      </g>
    </svg>
  );
}

// ============================================================================
// HEAT VIEW
// ============================================================================

function HeatView({
  twin,
  t,
  hotIds,
}: {
  twin: ReturnType<typeof selectActiveTwin>;
  t: number;
  hotIds: Set<string>;
}) {
  const CELL = 28;
  const W = twin.gridW * CELL;
  const H = twin.gridH * CELL;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {twin.workstations.map((ws) => {
          const util = ws.kpiObserved?.utilizationPct ?? fakeUtil(ws, t);
          const isHot = hotIds.has(ws.id);
          const intensity = isHot ? 1 : Math.min(1, util / 100 + 0.15);
          const col = isHot ? SW_COLORS.alarm : utilColor(util);
          return (
            <radialGradient key={`hg-${ws.id}`} id={`heat-${ws.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={col} stopOpacity={intensity} />
              <stop offset="100%" stopColor={col} stopOpacity={0} />
            </radialGradient>
          );
        })}
        <linearGradient id="lf-legend" x1="0%" x2="100%">
          <stop offset="0%" stopColor={SW_COLORS.ok} />
          <stop offset="60%" stopColor={SW_COLORS.warn} />
          <stop offset="100%" stopColor={SW_COLORS.alarm} />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="#0d1219" />

      {/* dept outlines for orientation */}
      {twin.departments.map((d) => (
        <rect
          key={d.id}
          x={d.bounds.x * CELL}
          y={d.bounds.y * CELL}
          width={d.bounds.w * CELL}
          height={d.bounds.h * CELL}
          fill="none"
          stroke="#ffffff20"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}

      {/* heat blobs */}
      {twin.workstations.map((ws) => {
        const fix = resolveFixture(ws.catalogId);
        const cx = (ws.position.x + (fix?.w ?? 1) / 2) * CELL;
        const cy = (ws.position.y + (fix?.d ?? 1) / 2) * CELL;
        return (
          <circle
            key={`heat-${ws.id}`}
            cx={cx}
            cy={cy}
            r={90}
            fill={`url(#heat-${ws.id})`}
            style={{ mixBlendMode: 'screen' }}
          />
        );
      })}

      {/* station markers */}
      {twin.workstations.map((ws) => {
        const fix = resolveFixture(ws.catalogId);
        const cx = (ws.position.x + (fix?.w ?? 1) / 2) * CELL;
        const cy = (ws.position.y + (fix?.d ?? 1) / 2) * CELL;
        const isHot = hotIds.has(ws.id);
        return (
          <circle
            key={`pt-${ws.id}`}
            cx={cx}
            cy={cy}
            r={3.5}
            fill={isHot ? SW_COLORS.alarm : '#fff'}
            opacity={0.85}
          />
        );
      })}

      {/* legend */}
      <g transform={`translate(${W - 220}, 20)`}>
        <rect width={200} height={62} fill="#0a0d12cc" stroke="#ffffff20" rx={4} />
        <text
          x={12}
          y={20}
          fill="#fff"
          fontFamily={SW_FONTS.mono}
          fontSize={10}
          fontWeight={900}
          style={{ letterSpacing: '0.15em' }}
        >
          UTILISATION HEAT
        </text>
        <rect x={12} y={30} width={176} height={10} fill="url(#lf-legend)" />
        <text x={12} y={54} fill="#ffffff80" fontFamily={SW_FONTS.mono} fontSize={9}>
          calm
        </text>
        <text
          x={188}
          y={54}
          fill="#ffffff80"
          fontFamily={SW_FONTS.mono}
          fontSize={9}
          textAnchor="end"
        >
          critical
        </text>
      </g>
    </svg>
  );
}

// ============================================================================
// RIGHT INSPECTOR
// ============================================================================

interface InspectorProps {
  twin: ReturnType<typeof selectActiveTwin>;
  selectedWs: string | null;
  onClear: () => void;
  events: { id: number; ws: string; kind: 'breakdown' | 'defect' | 'milestone'; label: string }[];
  t: number;
}

function Inspector({ twin, selectedWs, onClear, events, t }: InspectorProps) {
  const ws = selectedWs ? twin.workstations.find((w) => w.id === selectedWs) : null;
  const dept = ws ? twin.departments.find((d) => d.id === ws.deptId) : null;
  const fix = ws ? resolveFixture(ws.catalogId) : null;
  const util = ws ? ws.kpiObserved?.utilizationPct ?? fakeUtil(ws, t) : 0;

  // Aggregate KPIs across all workstations.
  const kpis = useMemo(() => {
    const totalUtil = twin.workstations.reduce(
      (acc, w) => acc + (w.kpiObserved?.utilizationPct ?? fakeUtil(w, t)),
      0,
    );
    const avg = twin.workstations.length > 0 ? totalUtil / twin.workstations.length : 0;
    const hot = twin.workstations.filter((w) => {
      const u = w.kpiObserved?.utilizationPct ?? fakeUtil(w, t);
      return u >= 85;
    }).length;
    return { avg, hot };
  }, [twin.workstations, t]);

  return (
    <div
      style={{
        background: '#0a0d12',
        borderLeft: '1px solid #ffffff15',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflow: 'auto',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 9,
            fontWeight: 800,
            color: '#ffffff80',
            letterSpacing: '0.18em',
            marginBottom: 8,
          }}
        >
          FACTORY KPIs
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <KpiTile label="Avg util" value={`${kpis.avg.toFixed(0)}%`} accent={utilColor(kpis.avg)} />
          <KpiTile label="Hot stations" value={`${kpis.hot}`} accent={kpis.hot > 0 ? SW_COLORS.alarm : SW_COLORS.ok} />
          <KpiTile label="Departments" value={`${twin.departments.length}`} accent={SW_COLORS.bobbin} />
          <KpiTile label="Workstations" value={`${twin.workstations.length}`} accent={SW_COLORS.thread} />
        </div>
      </div>

      <div
        style={{
          background: '#ffffff05',
          border: '1px solid #ffffff15',
          borderRadius: 6,
          padding: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 9,
              fontWeight: 800,
              color: '#ffffff80',
              letterSpacing: '0.18em',
            }}
          >
            INSPECTOR
          </div>
          {ws && (
            <button
              onClick={onClear}
              style={{
                background: 'transparent',
                color: '#ffffffaa',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: SW_FONTS.mono,
              }}
            >
              ✕ clear
            </button>
          )}
        </div>
        {!ws ? (
          <div style={{ fontSize: 12, color: '#ffffffaa', fontStyle: 'italic' }}>
            Click a workstation to inspect.
          </div>
        ) : (
          <>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900, color: '#fff' }}>
              {ws.name}
            </div>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: '#ffffff80', marginTop: 2 }}>
              {fix?.label ?? ws.catalogId}  ·  {dept?.name ?? '—'}
            </div>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <KpiTile label="Util" value={`${util.toFixed(0)}%`} accent={utilColor(util)} />
              <KpiTile
                label="Workers"
                value={`${ws.resources.workersRequired}`}
                accent={SW_COLORS.bobbin}
              />
              <KpiTile
                label="Capacity/hr"
                value={`${ws.kpiTargets.capacityPerHr ?? '—'}`}
                accent={SW_COLORS.fabric}
              />
              <KpiTile
                label="Op"
                value={ws.operation.opId ?? ws.operation.freeText ?? '—'}
                accent={SW_COLORS.thread}
              />
            </div>
          </>
        )}
      </div>

      <div
        style={{
          background: '#ffffff05',
          border: '1px solid #ffffff15',
          borderRadius: 6,
          padding: 12,
          flex: 1,
          minHeight: 100,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 9,
            fontWeight: 800,
            color: '#ffffff80',
            letterSpacing: '0.18em',
            marginBottom: 8,
          }}
        >
          EVENT FEED
        </div>
        <div style={{ flex: 1, overflow: 'auto', fontFamily: SW_FONTS.mono, fontSize: 11, lineHeight: 1.6 }}>
          {events.length === 0 && (
            <div style={{ color: '#ffffff60', fontStyle: 'italic' }}>No events yet — press PLAY.</div>
          )}
          {events.map((e) => {
            const wsName = twin.workstations.find((w) => w.id === e.ws)?.name?.slice(0, 16) ?? '—';
            const col =
              e.kind === 'milestone'
                ? SW_COLORS.ok
                : e.kind === 'defect'
                  ? SW_COLORS.warn
                  : SW_COLORS.alarm;
            return (
              <div key={e.id} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                <span style={{ color: col, width: 96, fontWeight: 700 }}>{e.label}</span>
                <span style={{ color: '#ffffffaa', flex: 1 }}>· {wsName}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        background: '#ffffff08',
        border: '1px solid #ffffff15',
        borderRadius: 6,
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 9,
          fontWeight: 700,
          color: '#ffffff80',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: SW_FONTS.display,
          fontSize: 18,
          fontWeight: 900,
          color: accent,
          marginTop: 2,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FloorBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#ffffff10',
        color: '#fff',
        border: '1px solid #ffffff20',
        cursor: 'pointer',
        padding: '4px 10px',
        fontFamily: SW_FONTS.mono,
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 4,
        minWidth: 36,
      }}
    >
      {children}
    </button>
  );
}

