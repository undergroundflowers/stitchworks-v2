import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Button, Stat, SectionHeader, ToggleGroup } from '../components';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

interface TwinTreeNodeProps {
  label: string;
  sub?: string;
  indent?: number;
  expanded?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}

export function FactoryTwinPage() {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState<string>('factory');
  const [selFloor, setSelFloor] = useState<number>(1);
  const [selLine, setSelLine] = useState<string>('L1');

  return (
    <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateColumns: '300px 1fr 320px', background: SW_COLORS.paperDeep }}>
      {/* LEFT — tree + filters */}
      <div style={{ borderRight: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, overflow: 'auto', padding: 16 }}>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 8 }}>FACTORY TREE</div>
        <TwinTreeNode label="STITCHWORKS DEMO" sub="3 floors · 8 lines" expanded onClick={()=>{setZoom('factory');}} active={zoom==='factory'}>
          {[1,2,3].map(f => (
            <TwinTreeNode key={f} indent={1} label={`Floor ${f} · ${['Sewing','Cutting','Finishing'][f-1]}`} sub={`${f===1?4:f===2?2:2} lines`} expanded={selFloor===f}
              onClick={()=>{ setZoom('floor'); setSelFloor(f); }} active={zoom==='floor' && selFloor===f}>
              {(f===1?['L1','L2','L3','L4']:f===2?['L5','L6']:['L7','L8']).map(l => (
                <TwinTreeNode key={l} indent={2} label={`Line ${l}`} sub={`${Math.floor(8+Math.random()*10)} ops · ${['PBS','UPS','Modular','Make-Through','Straight','Synchro','Clump','Bundle'][Math.floor(Math.random()*8)]}`}
                  onClick={()=>{ setZoom('line'); setSelFloor(f); setSelLine(l); }} active={zoom==='line' && selLine===l}/>
              ))}
            </TwinTreeNode>
          ))}
        </TwinTreeNode>

        <div style={{ marginTop: 24, fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 8 }}>OVERLAYS</div>
        {[
          { id:'heat', label:'Bottleneck heat', color: SW_COLORS.alarm, on: true },
          { id:'wip',  label:'WIP density',     color: SW_COLORS.thread, on: true },
          { id:'op',   label:'Operator utilization', color: SW_COLORS.bobbin, on: false },
          { id:'qual', label:'Defect zones',    color: SW_COLORS.press, on: false },
        ].map(ov => (
          <label key={ov.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', cursor:'pointer', fontSize:12, fontWeight:600, color: SW_COLORS.ink }}>
            <input type="checkbox" defaultChecked={ov.on} style={{ accentColor: ov.color }}/>
            <span style={{ width:8, height:8, background: ov.color, borderRadius:2 }}/>
            {ov.label}
          </label>
        ))}
      </div>

      {/* CENTER — viewport */}
      <div style={{ position:'relative', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{
          padding:'12px 18px', background: SW_COLORS.paper,
          borderBottom:`1px solid ${SW_COLORS.line}`,
          display:'flex', alignItems:'center', gap: 12,
        }}>
          <ToggleGroup value={zoom} onChange={setZoom} options={[
            { value:'factory', label:'◰ Factory' },
            { value:'floor',   label:'▦ Floor' },
            { value:'line',    label:'═ Line' },
          ]}/>
          <div style={{ fontSize:12, color: SW_COLORS.muted }}>
            {zoom==='factory' && 'All floors at a glance'}
            {zoom==='floor' && `Floor ${selFloor} — ${['Sewing','Cutting','Finishing'][selFloor-1]}`}
            {zoom==='line' && `Line ${selLine} — close-up of stations`}
          </div>
          <div style={{ flex:1 }}/>
          <Button variant="secondary" size="sm" icon="↻">Reset view</Button>
          <Button variant="dark" size="sm" icon="▶" onClick={()=>navigate('/floor')}>Open in sim</Button>
        </div>

        <div style={{ flex:1, position:'relative', background: `
          linear-gradient(${SW_COLORS.paperEdge}30 1px, transparent 1px),
          linear-gradient(90deg, ${SW_COLORS.paperEdge}30 1px, transparent 1px),
          ${SW_COLORS.paperDeep}
        `, backgroundSize:'24px 24px' }}>
          {zoom==='factory' && <TwinFactoryView/>}
          {zoom==='floor'   && <TwinFloorView floor={selFloor}/>}
          {zoom==='line'    && <TwinLineView line={selLine}/>}
        </div>
      </div>

      {/* RIGHT — context inspector */}
      <div style={{ borderLeft: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, overflow:'auto', padding:16 }}>
        <SectionHeader kicker="Inspector" title={zoom==='factory'?'STITCHWORKS DEMO':zoom==='floor'?`Floor ${selFloor}`:`Line ${selLine}`}/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8, marginBottom: 14 }}>
          <Stat label="EFFICIENCY" value="78" unit="%" color={SW_COLORS.ok}/>
          <Stat label="OUTPUT/HR" value="184" unit="pcs" color={SW_COLORS.brand}/>
          <Stat label="WIP" value="412" unit="bundles" color={SW_COLORS.thread}/>
          <Stat label="DEFECT" value="1.2" unit="%" color={SW_COLORS.alarm}/>
        </div>

        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.2px', marginBottom: 6 }}>LIVE FEED</div>
        <div style={{ fontSize:11, fontFamily: SW_FONTS.mono, lineHeight:1.7 }}>
          {[
            { t:'14:02:18', tag:'BOTTLENECK', col: SW_COLORS.alarm, msg:'OP-08 collar attach (Q=42 bundles)' },
            { t:'14:01:55', tag:'OUTPUT',     col: SW_COLORS.ok,    msg:'+3 pcs from L1 (PBS)' },
            { t:'14:01:40', tag:'IDLE',       col: SW_COLORS.warn,  msg:'OPR-12 idle 90s on OP-04' },
            { t:'14:01:18', tag:'OUTPUT',     col: SW_COLORS.ok,    msg:'+2 pcs from L3 (Modular)' },
            { t:'14:01:02', tag:'DEFECT',     col: SW_COLORS.press, msg:'L1 OP-06 reject — broken stitch' },
            { t:'14:00:30', tag:'M-DOWN',     col: SW_COLORS.alarm, msg:'SM-11 bobbin jam (-3min)' },
          ].map((e,i) => (
            <div key={i} style={{ display:'flex', gap:8, padding:'4px 0', borderTop: i?`1px solid ${SW_COLORS.line}`:'none' }}>
              <span style={{ color: SW_COLORS.muted }}>{e.t}</span>
              <span style={{ color: e.col, fontWeight: 700, width: 78 }}>{e.tag}</span>
              <span style={{ flex:1, color: SW_COLORS.ink }}>{e.msg}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, display:'flex', gap:6 }}>
          <Button variant="primary" full size="sm" onClick={()=>navigate('/floor')}>▶ Run sim</Button>
          <Button variant="secondary" full size="sm" onClick={()=>navigate('/layout')}>▦ Edit layout</Button>
        </div>
      </div>
    </div>
  );
}

function TwinTreeNode({ label, sub, indent=0, expanded, children, onClick, active }: TwinTreeNodeProps) {
  return (
    <div>
      <div onClick={onClick} style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'6px 8px', borderRadius: SW_RADIUS.sm,
        marginLeft: indent*14,
        background: active ? SW_COLORS.brandLite : 'transparent',
        cursor:'pointer',
        borderLeft: active ? `3px solid ${SW_COLORS.brand}` : '3px solid transparent',
      }}>
        <span style={{ fontFamily: SW_FONTS.mono, fontSize:9, color: SW_COLORS.muted }}>{children?'▾':'·'}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, fontWeight:700, color: SW_COLORS.ink }}>{label}</div>
          {sub && <div style={{ fontSize:10, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>{sub}</div>}
        </div>
      </div>
      {expanded && children}
    </div>
  );
}

// Factory level — 3 floors as iso blocks
function TwinFactoryView() {
  return (
    <svg viewBox="0 0 800 500" style={{ width:'100%', height:'100%', display:'block' }}>
      {[
        { id:1, x: 120, y: 180, label:'FLOOR 1 · SEWING',     eff: 78, color: SW_COLORS.brand },
        { id:2, x: 380, y: 220, label:'FLOOR 2 · CUTTING',    eff: 88, color: SW_COLORS.fabric },
        { id:3, x: 540, y: 80,  label:'FLOOR 3 · FINISHING',  eff: 64, color: SW_COLORS.bobbin },
      ].map(f => (
        <g key={f.id} transform={`translate(${f.x},${f.y})`}>
          {/* iso block */}
          <polygon points="0,40 90,0 180,40 90,80" fill={f.color} stroke="#000" strokeOpacity="0.18"/>
          <polygon points="0,40 90,80 90,140 0,100" fill={f.color} fillOpacity="0.7" stroke="#000" strokeOpacity="0.18"/>
          <polygon points="180,40 90,80 90,140 180,100" fill={f.color} fillOpacity="0.55" stroke="#000" strokeOpacity="0.18"/>
          {/* heat dots */}
          {[...Array(8)].map((_,i)=>{
            const cx = 14 + (i%4)*22;
            const cy = 38 + Math.floor(i/4)*14;
            const hot = Math.random()>0.6;
            return <circle key={i} cx={cx + (i%4)*8} cy={cy} r="3" fill={hot?'#fff':'#ffffff70'}/>;
          })}
          <text x="90" y="20" textAnchor="middle" fill={SW_COLORS.ink} fontFamily={SW_FONTS.display} fontSize="11" fontWeight="900">{f.label}</text>
          <text x="90" y="160" textAnchor="middle" fill={SW_COLORS.muted} fontFamily={SW_FONTS.mono} fontSize="10" fontWeight="700">EFF {f.eff}%</text>
        </g>
      ))}
      {/* connecting paths */}
      <path d="M 230 240 Q 320 280 470 280" fill="none" stroke={SW_COLORS.line} strokeWidth="2" strokeDasharray="4 4"/>
      <path d="M 470 240 Q 540 200 600 160" fill="none" stroke={SW_COLORS.line} strokeWidth="2" strokeDasharray="4 4"/>
      {/* moving piece */}
      <circle r="5" fill={SW_COLORS.thread}>
        <animateMotion dur="6s" repeatCount="indefinite" path="M 230 240 Q 320 280 470 280 Q 540 200 600 160"/>
      </circle>
    </svg>
  );
}

interface TwinFloorViewProps { floor: number; }

// Floor level — top-down lines
function TwinFloorView({ floor }: TwinFloorViewProps) {
  const lineCount = floor===1?4:floor===2?2:2;
  return (
    <svg viewBox="0 0 800 500" style={{ width:'100%', height:'100%', display:'block' }}>
      <rect x="40" y="40" width="720" height="420" fill={SW_COLORS.paper} stroke={SW_COLORS.line} strokeWidth="1"/>
      <text x="50" y="34" fill={SW_COLORS.muted} fontFamily={SW_FONTS.mono} fontSize="10" fontWeight="700">FLOOR {floor} · TOP-DOWN · 60ft × 35ft</text>

      {[...Array(lineCount)].map((_,i)=>{
        const y = 80 + i * (380/lineCount);
        const stations = 8 + Math.floor(Math.random()*4);
        return (
          <g key={i}>
            <text x="60" y={y+5} fill={SW_COLORS.ink} fontFamily={SW_FONTS.display} fontSize="11" fontWeight="900">L{i+1+(floor===2?4:floor===3?6:0)}</text>
            <line x1="100" y1={y} x2="740" y2={y} stroke={SW_COLORS.line} strokeWidth="1" strokeDasharray="3 3"/>
            {[...Array(stations)].map((_,s)=>{
              const x = 110 + s*(620/stations);
              const wip = Math.floor(Math.random()*40);
              const hot = wip>30;
              return (
                <g key={s} transform={`translate(${x},${y})`}>
                  <rect x="-12" y="-14" width="24" height="28" rx="3" fill={hot?SW_COLORS.alarm:SW_COLORS.brand} fillOpacity={hot?0.95:0.85}/>
                  <text x="0" y="3" textAnchor="middle" fill="#fff" fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700">{s+1}</text>
                  {hot && <circle cx="14" cy="-12" r="4" fill={SW_COLORS.alarm}><animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/></circle>}
                  {/* wip stack */}
                  {[...Array(Math.min(5, Math.ceil(wip/8)))].map((_,k)=>(
                    <rect key={k} x="-10" y={20+k*3} width="20" height="2" fill={SW_COLORS.thread}/>
                  ))}
                </g>
              );
            })}
            {/* moving piece */}
            <circle r="4" fill={SW_COLORS.bobbin}>
              <animateMotion dur={`${4+i*0.5}s`} repeatCount="indefinite" path={`M 110 ${y} L 730 ${y}`}/>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

interface TwinLineViewProps { line: string; }

// Line level — operator workstations
function TwinLineView({ line }: TwinLineViewProps) {
  const stations = ['Spread','Cut','Stitch shoulders','Attach collar','Attach sleeves','Side seam','Hem','Buttonhole','Inspect','Pack'];
  return (
    <svg viewBox="0 0 1000 500" style={{ width:'100%', height:'100%', display:'block' }}>
      <text x="40" y="32" fill={SW_COLORS.muted} fontFamily={SW_FONTS.mono} fontSize="10" fontWeight="700">LINE {line} · STATION-LEVEL · LIVE</text>
      {/* conveyor */}
      <rect x="40" y="240" width="920" height="20" fill={SW_COLORS.paperEdge} stroke={SW_COLORS.line}/>
      {[...Array(40)].map((_,i)=>(
        <line key={i} x1={40+i*23} y1="240" x2={40+i*23} y2="260" stroke={SW_COLORS.line}/>
      ))}
      {stations.map((s,i)=>{
        const x = 80 + i * 92;
        const hot = i===3;
        const idle = i===6;
        return (
          <g key={i} transform={`translate(${x}, 0)`}>
            {/* station box */}
            <rect x="-32" y="120" width="64" height="80" rx="6" fill={hot?`${SW_COLORS.alarm}20`:idle?`${SW_COLORS.warn}20`:SW_COLORS.paper} stroke={hot?SW_COLORS.alarm:idle?SW_COLORS.warn:SW_COLORS.line} strokeWidth="1.5"/>
            <text x="0" y="138" textAnchor="middle" fill={SW_COLORS.muted} fontFamily={SW_FONTS.mono} fontSize="8" fontWeight="700">OP-{(i+1).toString().padStart(2,'0')}</text>
            <text x="0" y="155" textAnchor="middle" fill={SW_COLORS.ink} fontFamily={SW_FONTS.body} fontSize="10" fontWeight="700">{s}</text>
            {/* operator avatar */}
            <circle cx="0" cy="180" r="10" fill={hot?SW_COLORS.alarm:idle?SW_COLORS.warn:SW_COLORS.bobbin}/>
            <text x="0" y="184" textAnchor="middle" fill="#fff" fontFamily={SW_FONTS.display} fontSize="9" fontWeight="900">{i+1}</text>
            {/* WIP queue */}
            <g transform="translate(-30, 280)">
              {[...Array(Math.floor(2+Math.random()*(hot?12:4)))].map((_,k)=>(
                <rect key={k} x={k*5} y={-k*0.5} width="6" height="8" fill={SW_COLORS.thread} opacity={1-k*0.05}/>
              ))}
            </g>
            {/* status dot */}
            {hot && <circle cx="22" cy="128" r="5" fill={SW_COLORS.alarm}><animate attributeName="r" values="5;7;5" dur="0.8s" repeatCount="indefinite"/></circle>}
            {idle && <circle cx="22" cy="128" r="5" fill={SW_COLORS.warn}/>}
          </g>
        );
      })}
      {/* moving bundles on conveyor */}
      {[0,1,2].map(i => (
        <circle key={i} r="5" fill={SW_COLORS.fabric}>
          <animateMotion dur={`${10+i*2}s`} begin={`${i*2}s`} repeatCount="indefinite" path="M 60 250 L 940 250"/>
        </circle>
      ))}
    </svg>
  );
}
