import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Button, ToggleGroup } from '../components';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ALL_GARMENT_TEMPLATES,
  GARMENT_TEMPLATES,
} from '../domain';
import { buildSimConfig, efficiencyFromSkillMatrix, useSim, type StationView } from '../simulation';
import { useProject } from '../store';

interface SimHudStatProps {
  label: string;
  value: number | string;
  unit: string;
  color: string;
}

interface SimFloorProps {
  stations: StationView[];
  bottleneckOpIndex: number;
  garmentName: string;
  simTime: number;
}

const SHIFT_MIN_PER_DAY = 480;

/**
 * Live Simulation — drives the discrete-event engine in real time.
 *
 * The garment template + operator count + bundle size are bound into a
 * SimConfig (see buildSimConfig). useSim keeps the engine instance stable
 * across renders and ticks it at wall-clock × speed × 6 sim-min-per-second.
 *
 * Every visible KPI on this page is read from sim state — no mock counters.
 */
export function LiveSimPage() {
  const navigate = useNavigate();
  const project = useProject();
  // Defaults flow from the project store so Orders → LiveSim handoff works:
  // changes on Orders are saved to selectedGarmentId / defaultOperators and
  // landed here on next visit.
  const [garmentId, setGarmentId] = useState<string>(project.selectedGarmentId);
  const [operators, setOperators] = useState<number>(project.defaultOperators);

  const garment = GARMENT_TEMPLATES[garmentId];

  // Per-op efficiency derived from the project's skill matrix (live).
  const opEfficiency = useMemo(
    () => efficiencyFromSkillMatrix(project.skillMatrix, garment.operations),
    [project.skillMatrix, garment],
  );

  // Build the sim config. useSim re-instantiates the engine when this
  // identity changes (i.e. when the user picks a different garment / crew
  // size). The dependency array keeps the engine stable otherwise.
  const config = useMemo(
    () => buildSimConfig({ garment, operators, opEfficiency }),
    [garment, operators, opEfficiency],
  );

  const { state, playing, speed, setPlaying, setSpeed, reset, step } = useSim(config);

  const elapsedMin = Math.round(state.time);
  const hr = 8 + Math.floor(elapsedMin / 60);
  const mn = (elapsedMin % 60).toString().padStart(2, '0');

  const throughputPerHr = state.history.length > 0
    ? state.history[state.history.length - 1].throughputPerHr * config.bundleSize
    : 0;

  const efficiencyPct = Math.round(state.utilization * 100);
  const shiftPct = Math.min(100, (state.time / SHIFT_MIN_PER_DAY) * 100);

  return (
    <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateRows: 'auto 1fr auto', background: SW_COLORS.ink, color: SW_COLORS.paper }}>
      {/* HUD */}
      <div style={{ padding:'12px 24px', display:'flex', alignItems:'center', gap:18, borderBottom: '1px solid #ffffff15', flexWrap: 'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background: playing?SW_COLORS.ok:SW_COLORS.warn, boxShadow: playing?`0 0 12px ${SW_COLORS.ok}`:'none', animation: playing ? 'pulse 1s infinite' : undefined }}/>
          <span style={{ fontFamily: SW_FONTS.mono, fontSize:12, fontWeight:700, letterSpacing:'2px' }}>{playing?'RUNNING':'PAUSED'}</span>
        </div>
        <div style={{ width:1, height:20, background:'#ffffff20' }}/>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize:24, fontWeight:700, color:'#fff' }}>{hr.toString().padStart(2,'0')}:{mn}</div>
        <div style={{ fontSize:11, color:'#ffffff80', fontFamily: SW_FONTS.mono }}>SHIFT A · DAY 14</div>

        <div style={{ width:1, height:20, background:'#ffffff20' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:10, fontFamily: SW_FONTS.body, fontSize: 11 }}>
          <span style={{ color:'#ffffff80', fontFamily: SW_FONTS.mono, fontWeight: 700 }}>GARMENT</span>
          <ToggleGroup value={garmentId} onChange={setGarmentId} options={ALL_GARMENT_TEMPLATES.map(g => ({
            value: g.id,
            label: g.name.replace(/\s*\(.*\)/, ''),
          }))}/>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily: SW_FONTS.body, fontSize: 11 }}>
          <span style={{ color:'#ffffff80', fontFamily: SW_FONTS.mono, fontWeight: 700 }}>OPS</span>
          <input type="number" min={4} max={80} value={operators}
            onChange={e => setOperators(Math.max(4, Math.min(80, parseInt(e.target.value) || 4)))}
            style={{ width: 56, padding: '4px 8px', border: `1px solid #ffffff20`, background: '#ffffff10', borderRadius: SW_RADIUS.sm, fontFamily: SW_FONTS.mono, fontWeight: 700, fontSize: 13, color: '#fff' }}/>
        </div>
        <div style={{ flex:1 }}/>
      </div>

      {/* SIMULATION FLOOR */}
      <div style={{ position:'relative', overflow:'hidden', background: `radial-gradient(circle at 50% 30%, #1a2332, ${SW_COLORS.ink})` }}>
        <SimFloor
          stations={state.stations}
          bottleneckOpIndex={state.bottleneckOpIndex}
          garmentName={garment.name}
          simTime={state.time}
        />
        <div style={{ position:'absolute', left:24, top:24, display:'grid', gridTemplateColumns:'repeat(4, auto)', gap: 12 }}>
          <SimHudStat label="OUTPUT" value={state.producedPieces.toLocaleString()} unit="pcs" color={SW_COLORS.brand}/>
          <SimHudStat label="THROUGHPUT" value={Math.round(throughputPerHr).toLocaleString()} unit="pcs/hr" color={SW_COLORS.ok}/>
          <SimHudStat label="WIP" value={state.totalArrivals - state.produced} unit="bundles" color={SW_COLORS.thread}/>
          <SimHudStat label="UTIL" value={efficiencyPct} unit="%" color={SW_COLORS.fabric}/>
        </div>

        <div style={{ position:'absolute', right:24, top:24, width: 280, maxHeight: 'calc(100% - 48px)', display:'flex', flexDirection:'column', gap: 10 }}>
          <div style={{ background:'#ffffff08', border:'1px solid #ffffff15', borderRadius: SW_RADIUS.sm, padding: 12 }}>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color:'#ffffff80', letterSpacing:'1.5px', marginBottom:8 }}>BOTTLENECK</div>
            <div style={{ fontSize:12, color: SW_COLORS.alarm, fontWeight:700, marginBottom:4 }}>
              {state.stations[state.bottleneckOpIndex]?.opCode ?? '—'} · {state.stations[state.bottleneckOpIndex]?.opName ?? '—'}
            </div>
            <div style={{ fontSize:11, color:'#ffffffaa', fontFamily: SW_FONTS.mono }}>
              Q={state.stations[state.bottleneckOpIndex]?.queueLen ?? 0} · BUSY={state.stations[state.bottleneckOpIndex]?.busy ?? 0}/{state.stations[state.bottleneckOpIndex]?.serversTotal ?? 0}
            </div>
          </div>

          <div style={{ background:'#ffffff08', border:'1px solid #ffffff15', borderRadius: SW_RADIUS.sm, padding: 12, overflow:'hidden', flex: 1, display:'flex', flexDirection:'column', minHeight: 120 }}>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color:'#ffffff80', letterSpacing:'1.5px', marginBottom:8, flexShrink:0 }}>EVENT FEED</div>
            <div style={{ fontSize:11, fontFamily: SW_FONTS.mono, lineHeight:1.6, overflow:'auto', flex:1 }}>
              {state.events.length === 0 && (
                <div style={{ color:'#ffffff60', fontStyle:'italic' }}>No events yet — press PLAY.</div>
              )}
              {state.events.map((e,i)=>{
                const eHr = 8 + Math.floor(e.time / 60);
                const eMn = (Math.round(e.time) % 60).toString().padStart(2,'0');
                const col = e.tag === 'OUT' ? SW_COLORS.ok : e.tag === 'STARVE' ? SW_COLORS.warn : SW_COLORS.alarm;
                return (
                  <div key={i} style={{ display:'flex', gap:8, padding:'2px 0' }}>
                    <span style={{ color:'#ffffff60', width:38 }}>{eHr.toString().padStart(2,'0')}:{eMn}</span>
                    <span style={{ color: col, flex:1 }}>{e.msg}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* TRANSPORT BAR */}
      <div style={{ padding:'14px 24px', background:'#0a0d12', borderTop:'1px solid #ffffff15', display:'flex', alignItems:'center', gap:14 }}>
        <Button variant="secondary" size="sm" onClick={reset}>⏮</Button>
        <Button variant={playing?'danger':'success'} size="lg" onClick={()=>setPlaying(!playing)}>{playing?'⏸ PAUSE':'▶ PLAY'}</Button>
        <Button variant="secondary" size="sm" onClick={() => step(60)}>⏭ +1h</Button>
        <div style={{ width:1, height: 28, background:'#ffffff20' }}/>
        <span style={{ fontFamily: SW_FONTS.mono, fontSize:11, color:'#ffffff80', fontWeight:700 }}>SPEED</span>
        {[0.5, 1, 2, 5, 10].map(s => (
          <button key={s} onClick={()=>setSpeed(s)} style={{
            background: speed===s?SW_COLORS.brand:'#ffffff10',
            color: speed===s?'#fff':'#ffffffaa',
            border:'none', borderRadius: SW_RADIUS.sm, padding:'6px 12px',
            fontFamily: SW_FONTS.mono, fontSize:11, fontWeight:700, cursor:'pointer',
          }}>{s}×</button>
        ))}
        <div style={{ flex:1, position:'relative', height: 28, background:'#ffffff08', borderRadius: SW_RADIUS.sm, overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, width: `${shiftPct}%`, background: `linear-gradient(90deg, ${SW_COLORS.brand}, ${SW_COLORS.thread})` }}/>
          <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily: SW_FONTS.mono, fontSize:11, fontWeight:700, color:'#fff' }}>
            DAY 14 · SHIFT A · {Math.round(shiftPct)}% complete · t = {elapsedMin} min
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={()=>navigate('/kpi')}>End shift →</Button>
      </div>
    </div>
  );
}

function SimHudStat({ label, value, unit, color }: SimHudStatProps) {
  return (
    <div style={{ background:'#ffffff08', border:'1px solid #ffffff15', borderRadius: SW_RADIUS.sm, padding:'8px 14px', minWidth: 120 }}>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize:9, fontWeight:700, color:'#ffffff80', letterSpacing:'1px' }}>{label}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:4, marginTop:2 }}>
        <span style={{ fontFamily: SW_FONTS.display, fontSize: 22, fontWeight: 900, color }}>{value}</span>
        <span style={{ fontSize:10, color:'#ffffff80', fontFamily: SW_FONTS.mono, fontWeight:600 }}>{unit}</span>
      </div>
    </div>
  );
}

/**
 * Animated floor view. Each station is rendered with its real queue length,
 * server occupancy, and bottleneck flag from the engine. The animation
 * (pulse around busy operators, moving WIP dots) is decorative; numbers
 * are real.
 */
function SimFloor({ stations, bottleneckOpIndex, garmentName, simTime }: SimFloorProps) {
  const VIEWBOX_W = 1200;
  const VIEWBOX_H = 600;
  const stationCount = stations.length;
  if (stationCount === 0) {
    return <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} style={{ width:'100%', height:'100%' }}/>;
  }

  // Lay stations on a single row. Wrap if there are too many to fit.
  const perRow = Math.min(stationCount, 12);
  const rows = Math.ceil(stationCount / perRow);
  const xStep = (VIEWBOX_W - 200) / Math.max(1, perRow - 1 + (perRow === 1 ? 0 : 0));
  const xStart = perRow === 1 ? VIEWBOX_W / 2 : 100;
  const yStart = rows === 1 ? 320 : 200;
  const yStep = rows > 1 ? 200 : 0;

  const positions = stations.map((_, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return {
      x: xStart + col * xStep,
      y: yStart + row * yStep,
    };
  });

  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} style={{ width:'100%', height:'100%' }}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff08" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="url(#grid)"/>

      {/* Connecting line through stations (per row) */}
      {Array.from({ length: rows }).map((_, r) => {
        const startCol = r * perRow;
        const endCol = Math.min(startCol + perRow, stationCount) - 1;
        if (endCol <= startCol) return null;
        const y = positions[startCol].y;
        return (
          <line key={r}
            x1={positions[startCol].x} y1={y}
            x2={positions[endCol].x}   y2={y}
            stroke="#ffffff20" strokeWidth="3" strokeDasharray="6 6"/>
        );
      })}

      {stations.map((s, i) => {
        const { x, y } = positions[i];
        const isHot = i === bottleneckOpIndex && s.queueLen > 0;
        const occupancyPct = s.serversTotal > 0 ? s.busy / s.serversTotal : 0;
        return (
          <g key={s.opId} transform={`translate(${x}, ${y})`}>
            <rect x="-32" y="-50" width="64" height="100" rx="6"
              fill={isHot ? `${SW_COLORS.alarm}30` : `${SW_COLORS.brand}20`}
              stroke={isHot ? SW_COLORS.alarm : `${SW_COLORS.brand}80`}
              strokeWidth="2"/>
            <text x="0" y="-32" textAnchor="middle" fill="#ffffffaa" fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700">{s.opCode ?? `OP-${i + 1}`}</text>
            <text x="0" y="-20" textAnchor="middle" fill="#ffffff60" fontFamily={SW_FONTS.mono} fontSize="7" fontWeight="700">{s.smv.toFixed(2)}m</text>
            {/* Operator (one per server, max 3 shown) */}
            {Array.from({ length: Math.min(s.serversTotal, 3) }).map((_, k) => {
              const cx = (k - (Math.min(s.serversTotal, 3) - 1) / 2) * 18;
              const isWorking = k < s.busy;
              return (
                <g key={k} transform={`translate(${cx}, 0)`}>
                  <circle cx="0" cy="0" r="9"
                    fill={isWorking ? (isHot ? SW_COLORS.alarm : SW_COLORS.bobbin) : '#ffffff30'}
                    stroke="#fff" strokeWidth="1.5"/>
                  {isWorking && (
                    <circle cx="0" cy="0" r={12 + Math.sin(simTime * 2 + i + k) * 2}
                      fill="none" stroke={SW_COLORS.brand} strokeWidth="1" opacity="0.4"/>
                  )}
                </g>
              );
            })}
            {/* WIP queue */}
            <g transform="translate(-26, 25)">
              {Array.from({ length: Math.min(s.queueLen, 12) }).map((_, k) => (
                <rect key={k} x={(k%4)*7} y={Math.floor(k/4)*5} width="6" height="4" fill={SW_COLORS.thread} opacity={0.9 - k * 0.04}/>
              ))}
              {s.queueLen > 12 && (
                <text x="38" y="14" fill={SW_COLORS.thread} fontFamily={SW_FONTS.mono} fontSize="10" fontWeight="700">+{s.queueLen - 12}</text>
              )}
            </g>
            {/* Servers / utilization mini-bar */}
            <g transform="translate(-28, 42)">
              <rect x="0" y="0" width="56" height="3" fill="#ffffff15"/>
              <rect x="0" y="0" width={56 * occupancyPct} height="3" fill={isHot ? SW_COLORS.alarm : SW_COLORS.ok}/>
              <text x="0" y="14" fill="#ffffff80" fontFamily={SW_FONTS.mono} fontSize="7" fontWeight="700">{s.busy}/{s.serversTotal}</text>
            </g>
            {/* Bottleneck alert */}
            {isHot && (
              <g>
                <circle cx="24" cy="-44" r="6" fill={SW_COLORS.alarm}>
                  <animate attributeName="r" values="6;9;6" dur="0.8s" repeatCount="indefinite"/>
                </circle>
                <text x="24" y="-40" textAnchor="middle" fill="#fff" fontFamily={SW_FONTS.display} fontSize="9" fontWeight="900">!</text>
              </g>
            )}
          </g>
        );
      })}

      <text x={VIEWBOX_W / 2} y="30" textAnchor="middle" fill="#ffffff80" fontFamily={SW_FONTS.mono} fontSize="11" fontWeight="700" letterSpacing="2px">
        {garmentName.toUpperCase()} · LIVE DES SIMULATION
      </text>
    </svg>
  );
}
