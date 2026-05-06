import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';
import { Card, Button, SectionHeader, ToggleGroup, Slider } from '../components';
import { useNavigate } from 'react-router-dom';

export function SettingsPage() {
  const navigate = useNavigate();
  return (
    <div style={{ width:'100%', height:'100%', overflow:'auto', padding: 32, background: SW_COLORS.paperDeep }}>
      <div style={{ maxWidth: 760, margin:'0 auto' }}>
        <SectionHeader kicker="Settings" title="Factory & game configuration"/>

        <Card padding={22} style={{ marginBottom:14 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>SIMULATION</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <Slider label="Default sim speed" value={2} min={0.5} max={10} step={0.5} format={v=>`${v}×`} onChange={()=>{}}/>
            </div>
            <div>
              <Slider label="Random event rate" value={30} min={0} max={100} format={v=>`${v}%`} onChange={()=>{}}/>
            </div>
            <div>
              <Slider label="Operator eff. variance" value={15} min={0} max={50} format={v=>`±${v}%`} onChange={()=>{}}/>
            </div>
            <div>
              <Slider label="Machine breakdown freq." value={2} min={0} max={10} step={1} format={v=>`${v}/shift`} onChange={()=>{}}/>
            </div>
          </div>
        </Card>

        <Card padding={22} style={{ marginBottom:14 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>UNITS & FORMAT</div>
          {[
            { k:'Length',      opts:['Meters','Yards'], v:'Meters' },
            { k:'Currency',    opts:['USD','EUR','INR','BDT'], v:'USD' },
            { k:'SAM display', opts:['Minutes','Seconds'], v:'Minutes' },
            { k:'Date format', opts:['DD/MM','MM/DD','YYYY-MM-DD'], v:'YYYY-MM-DD' },
          ].map(r => (
            <div key={r.k} style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderTop: r.k!=='Length'?`1px solid ${SW_COLORS.line}`:'none' }}>
              <div style={{ flex:1, fontSize:13, fontWeight:700 }}>{r.k}</div>
              <ToggleGroup value={r.v} onChange={()=>{}} options={r.opts.map(o => ({ value:o, label:o }))}/>
            </div>
          ))}
        </Card>

        <Card padding={22} style={{ marginBottom:14 }}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>GAMIFICATION</div>
          {[
            { k:'XP & badges',     desc:'Earn XP, unlock badges', on:true },
            { k:'Difficulty events', desc:'Random crises (sickness, breakdowns, rush orders)', on:true },
            { k:'Tutorial hints',  desc:'Show contextual tips', on:false },
            { k:'Sound effects',   desc:'Sewing machines, alerts, chime', on:false },
          ].map((r, i) => (
            <div key={r.k} style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderTop: i?`1px solid ${SW_COLORS.line}`:'none' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{r.k}</div>
                <div style={{ fontSize:11, color: SW_COLORS.muted }}>{r.desc}</div>
              </div>
              <div style={{ width: 42, height: 24, background: r.on?SW_COLORS.brand:SW_COLORS.paperEdge, borderRadius: 24, position:'relative', cursor:'pointer' }}>
                <div style={{ position:'absolute', top: 2, left: r.on?20:2, width: 20, height: 20, background:'#fff', borderRadius:'50%', transition:'left 100ms', boxShadow: SW_SHADOWS.card }}/>
              </div>
            </div>
          ))}
        </Card>

        <Card padding={22}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>FACTORY</div>
          <div style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 0' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Factory name</div>
              <input defaultValue="STITCHWORKS DEMO" style={{ marginTop:4, width:'100%', padding:'8px 10px', borderRadius: SW_RADIUS.sm, border: `1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.body, fontSize:13, fontWeight:700 }}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <Button variant="secondary" icon="⤓">Export save</Button>
            <Button variant="secondary" icon="⤒">Import save</Button>
            <Button variant="danger" icon="↺">Reset progress</Button>
          </div>
        </Card>

        <div style={{ marginTop: 18, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <Button variant="secondary" onClick={() => navigate('/')}>Back to menu</Button>
          <Button variant="primary" onClick={() => navigate('/twin')}>Save</Button>
        </div>
      </div>
    </div>
  );
}
