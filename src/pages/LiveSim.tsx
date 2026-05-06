import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Button, ToggleGroup } from '../components';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface SimHudStatProps {
  label: string;
  value: number | string;
  unit: string;
  color: string;
}

interface SimFloorProps {
  t: number;
  system: string;
}

export function LiveSimPage() {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1);
  const [t, setT] = useState<number>(0);
  const [system, setSystem] = useState<string>('PBS');

  useEffect(()=>{
    if (!playing) return;
    const id = setInterval(()=> setT(x => x + speed), 200);
    return ()=> clearInterval(id);
  }, [playing, speed]);

  const elapsedMin = Math.floor(t/3);
  const hr = 8 + Math.floor(elapsedMin/60);
  const mn = (elapsedMin%60).toString().padStart(2,'0');
  const out = Math.floor(t * 0.42);

  return (
    <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateRows: 'auto 1fr auto', background: SW_COLORS.ink, color: SW_COLORS.paper }}>
      {/* HUD */}
      <div style={{ padding:'12px 24px', display:'flex', alignItems:'center', gap:18, borderBottom: '1px solid #ffffff15' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background: playing?SW_COLORS.ok:SW_COLORS.warn, boxShadow: playing?`0 0 12px ${SW_COLORS.ok}`:'none' }}>
            {playing && <div style={{ animation: 'pulse 1s infinite' }}/>}
          </div>
          <span style={{ fontFamily: SW_FONTS.mono, fontSize:12, fontWeight:700, letterSpacing:'2px' }}>{playing?'RUNNING':'PAUSED'}</span>
        </div>
        <div style={{ width:1, height:20, background:'#ffffff20' }}/>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize:24, fontWeight:700, color:'#fff' }}>{hr.toString().padStart(2,'0')}:{mn}</div>
        <div style={{ fontSize:11, color:'#ffffff80', fontFamily: SW_FONTS.mono }}>SHIFT A · DAY 14</div>
        <div style={{ flex:1 }}/>
        <ToggleGroup value={system} onChange={setSystem} options={[
          { value:'MAKE', label:'Make-Through' },
          { value:'PBS',  label:'PBS' },
          { value:'UPS',  label:'UPS' },
          { value:'MOD',  label:'Modular' },
          { value:'STR',  label:'Straight' },
          { value:'SYN',  label:'Synchro' },
          { value:'CLP',  label:'Clump' },
          { value:'BUN',  label:'Bundle' },
        ]}/>
      </div>

      {/* SIMULATION FLOOR */}
      <div style={{ position:'relative', overflow:'hidden', background: `radial-gradient(circle at 50% 30%, #1a2332, ${SW_COLORS.ink})` }}>
        <SimFloor t={t} system={system}/>
        <div style={{ position:'absolute', left:24, top:24, display:'grid', gridTemplateColumns:'repeat(4, auto)', gap: 12 }}>
          <SimHudStat label="OUTPUT"     value={out} unit="pcs" color={SW_COLORS.brand}/>
          <SimHudStat label="THROUGHPUT" value={Math.floor(out/Math.max(1,elapsedMin)*60)} unit="pcs/hr" color={SW_COLORS.ok}/>
          <SimHudStat label="WIP"        value={Math.floor(80+Math.sin(t/15)*40)} unit="bundles" color={SW_COLORS.thread}/>
          <SimHudStat label="EFFICIENCY" value={Math.round(72+Math.sin(t/20)*8)} unit="%" color={SW_COLORS.fabric}/>
        </div>

        <div style={{ position:'absolute', right:24, top:24, width: 240 }}>
          <div style={{ background:'#ffffff08', border:'1px solid #ffffff15', borderRadius: SW_RADIUS.sm, padding: 12 }}>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color:'#ffffff80', letterSpacing:'1.5px', marginBottom:8 }}>EVENT FEED</div>
            <div style={{ fontSize:11, fontFamily: SW_FONTS.mono, lineHeight:1.7 }}>
              {[
                { t:`${hr}:${mn}`, msg:`+1 pc out (L1 ${system})`, col: SW_COLORS.ok },
                { t:`${hr}:${(parseInt(mn)-1+60)%60}`.padEnd(5,'0'), msg:`OPR-08 finished bundle`, col: SW_COLORS.bobbin },
                { t:`${hr}:${(parseInt(mn)-2+60)%60}`.padEnd(5,'0'), msg:`Bottleneck @ collar (Q42)`, col: SW_COLORS.alarm },
              ].map((e,i)=>(
                <div key={i} style={{ display:'flex', gap:8, padding:'2px 0' }}>
                  <span style={{ color:'#ffffff60', width:38 }}>{e.t}</span>
                  <span style={{ color: e.col, flex:1 }}>{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* TRANSPORT BAR */}
      <div style={{ padding:'14px 24px', background:'#0a0d12', borderTop:'1px solid #ffffff15', display:'flex', alignItems:'center', gap:14 }}>
        <Button variant="secondary" size="sm" onClick={()=>setT(0)}>⏮</Button>
        <Button variant={playing?'danger':'success'} size="lg" onClick={()=>setPlaying(!playing)}>{playing?'⏸ PAUSE':'▶ PLAY'}</Button>
        <Button variant="secondary" size="sm" onClick={()=>setT(x=>x+60)}>⏭ +1min</Button>
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
          <div style={{ position:'absolute', inset:0, width: `${Math.min(100, t/5)}%`, background: `linear-gradient(90deg, ${SW_COLORS.brand}, ${SW_COLORS.thread})` }}/>
          <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily: SW_FONTS.mono, fontSize:11, fontWeight:700, color:'#fff' }}>
            DAY 14 · SHIFT A · {Math.min(100, Math.round(t/5))}% complete
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

function SimFloor({ t, system }: SimFloorProps) {
  const stations = 9;
  return (
    <svg viewBox="0 0 1200 600" style={{ width:'100%', height:'100%' }}>
      {/* floor grid */}
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff08" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="1200" height="600" fill="url(#grid)"/>

      {/* line: progressive bundle */}
      <line x1="100" y1="320" x2="1100" y2="320" stroke="#ffffff20" strokeWidth="3" strokeDasharray="6 6"/>

      {[...Array(stations)].map((_,i)=>{
        const x = 130 + i * 110;
        const isHot = i === ((Math.floor(t/30)) % stations);
        const wip = Math.floor(3 + ((Math.sin((t+i*10)/15)+1)*8));
        return (
          <g key={i} transform={`translate(${x}, 320)`}>
            {/* station block */}
            <rect x="-30" y="-50" width="60" height="100" rx="6" fill={isHot?`${SW_COLORS.alarm}30`:`${SW_COLORS.brand}20`} stroke={isHot?SW_COLORS.alarm:`${SW_COLORS.brand}80`} strokeWidth="2"/>
            <text x="0" y="-30" textAnchor="middle" fill="#ffffffaa" fontFamily={SW_FONTS.mono} fontSize="9" fontWeight="700">OP-{i+1}</text>
            {/* operator */}
            <circle cx="0" cy="0" r="14" fill={isHot?SW_COLORS.alarm:SW_COLORS.bobbin} stroke="#fff" strokeWidth="2"/>
            <text x="0" y="4" textAnchor="middle" fill="#fff" fontFamily={SW_FONTS.display} fontSize="11" fontWeight="900">{i+1}</text>
            {/* sewing animation */}
            <circle cx="0" cy="0" r={18 + Math.sin(t/2 + i)*3} fill="none" stroke={SW_COLORS.brand} strokeWidth="1" opacity="0.4"/>
            {/* WIP queue */}
            <g transform="translate(-25, 25)">
              {[...Array(Math.min(wip, 12))].map((_,k)=>(
                <rect key={k} x={(k%4)*7} y={Math.floor(k/4)*5} width="6" height="4" fill={SW_COLORS.thread} opacity={0.9-k*0.04}/>
              ))}
              {wip>12 && <text x="36" y="14" fill={SW_COLORS.thread} fontFamily={SW_FONTS.mono} fontSize="10" fontWeight="700">+{wip-12}</text>}
            </g>
            {/* alert */}
            {isHot && (
              <g>
                <circle cx="22" cy="-42" r="6" fill={SW_COLORS.alarm}>
                  <animate attributeName="r" values="6;9;6" dur="0.8s" repeatCount="indefinite"/>
                </circle>
                <text x="22" y="-38" textAnchor="middle" fill="#fff" fontFamily={SW_FONTS.display} fontSize="9" fontWeight="900">!</text>
              </g>
            )}
          </g>
        );
      })}
      {/* Moving bundles */}
      {[...Array(8)].map((_,i)=>{
        const phase = (t*4 + i*60) % 1100;
        const cx = 100 + phase;
        if (cx > 1100) return null;
        const cy = 320 + Math.sin((t + i*8)/3) * 4;
        return <circle key={i} cx={cx} cy={cy} r="6" fill={SW_COLORS.fabric} stroke="#fff" strokeWidth="1.5"/>;
      })}
      <text x="600" y="30" textAnchor="middle" fill="#ffffff80" fontFamily={SW_FONTS.mono} fontSize="11" fontWeight="700" letterSpacing="2px">{system} SYSTEM · LIVE</text>
    </svg>
  );
}
