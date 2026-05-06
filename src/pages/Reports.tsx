import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Card, Button, Stat, SectionHeader, Progress, ToggleGroup } from '../components';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface DonutSlice {
  v: number;
  c: string;
  l: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'SHIFT' | 'DAY' | 'WEEK' | 'MONTH'>('SHIFT');

  return (
    <div style={{ width:'100%', height:'100%', overflow:'auto', background: SW_COLORS.paperDeep, padding: 24 }}>
      <SectionHeader kicker="Reports" title="Production KPIs"
        sub="Snapshot of factory performance for the selected period."
        right={<ToggleGroup value={period} onChange={setPeriod} options={[
          { value:'SHIFT', label:'Shift' },
          { value:'DAY',   label:'Day' },
          { value:'WEEK',  label:'Week' },
          { value:'MONTH', label:'Month' },
        ]}/>}
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        <Stat big label="OUTPUT"     value="1,184" unit="pcs"   color={SW_COLORS.brand}  delta={4.2}/>
        <Stat big label="THROUGHPUT" value="184"   unit="pcs/hr" color={SW_COLORS.ok}    delta={1.8}/>
        <Stat big label="EFFICIENCY" value="78"    unit="%"      color={SW_COLORS.fabric} delta={-1.2}/>
        <Stat big label="DEFECT"     value="1.2"   unit="%"      color={SW_COLORS.alarm}  delta={-0.3}/>
        <Stat big label="DOWNTIME"   value="42"    unit="min"    color={SW_COLORS.warn}/>
        <Stat big label="COST/PC"    value="$3.84" color={SW_COLORS.thread} delta={-0.12}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14 }}>
        <Card padding={20}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:14 }}>
            <div>
              <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900 }}>OUTPUT OVER TIME</div>
              <div style={{ fontSize:12, color: SW_COLORS.muted }}>Pieces produced per 30-min interval · Day 14, Shift A</div>
            </div>
            <div style={{ display:'flex', gap:14, fontSize:11, fontFamily: SW_FONTS.mono, fontWeight:700 }}>
              <span><span style={{ color: SW_COLORS.brand }}>■</span> Actual</span>
              <span><span style={{ color: SW_COLORS.muted }}>┄</span> Target</span>
            </div>
          </div>
          <KpiLineChart/>
        </Card>

        <Card padding={20}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>BY SYSTEM</div>
          {[
            { k:'PBS',     v: 88, n: '524 pcs', col: SW_COLORS.brand },
            { k:'Modular', v: 82, n: '312 pcs', col: SW_COLORS.fabric },
            { k:'UPS',     v: 76, n: '208 pcs', col: SW_COLORS.bobbin },
            { k:'Straight',v: 64, n: '140 pcs', col: SW_COLORS.thread },
          ].map(r => (
            <div key={r.k} style={{ marginBottom: 12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                <span style={{ fontWeight:700, fontSize:13 }}>{r.k}</span>
                <span style={{ fontFamily: SW_FONTS.mono, fontSize:12, fontWeight:700, color: r.col }}>{r.v}%</span>
              </div>
              <Progress value={r.v} color={r.col} height={8}/>
              <div style={{ fontSize:10, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, marginTop:2 }}>{r.n}</div>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 14, marginBottom:14 }}>
        <Card padding={20}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>BOTTLENECKS</div>
          {[
            { op:'OP-04 Collar attach', loss: 28, col: SW_COLORS.alarm },
            { op:'OP-08 Buttonhole',   loss: 14, col: SW_COLORS.thread },
            { op:'OP-02 Cutting',      loss: 8,  col: SW_COLORS.thread },
            { op:'OP-09 Inspect',      loss: 4,  col: SW_COLORS.bobbin },
          ].map((r, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderTop: i?`1px solid ${SW_COLORS.line}`:'none' }}>
              <span style={{ flex:1, fontSize:12, fontWeight:600 }}>{r.op}</span>
              <span style={{ fontFamily: SW_FONTS.mono, fontSize:12, fontWeight:700, color: r.col }}>{r.loss} pcs lost</span>
            </div>
          ))}
        </Card>

        <Card padding={20}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>DEFECTS BREAKDOWN</div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height: 120 }}>
            <DonutChart slices={[
              { v: 38, c: SW_COLORS.alarm, l: 'Stitch' },
              { v: 22, c: SW_COLORS.thread, l: 'Cut' },
              { v: 18, c: SW_COLORS.bobbin, l: 'Fabric' },
              { v: 14, c: SW_COLORS.trim, l: 'Trim' },
              { v: 8,  c: SW_COLORS.fabric, l: 'Other' },
            ]}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:11, marginTop:8 }}>
            {[
              { c: SW_COLORS.alarm, l:'Stitch', v:38 },
              { c: SW_COLORS.thread, l:'Cut', v:22 },
              { c: SW_COLORS.bobbin, l:'Fabric', v:18 },
              { c: SW_COLORS.trim, l:'Trim', v:14 },
            ].map((d, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:8, height:8, background:d.c, borderRadius:2 }}/>
                <span style={{ flex:1 }}>{d.l}</span>
                <span style={{ fontFamily: SW_FONTS.mono, fontWeight:700 }}>{d.v}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={20}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>COST PER GARMENT</div>
          {[
            { k:'Material', v:1.84, col: SW_COLORS.fabric },
            { k:'Labor',    v:1.20, col: SW_COLORS.brand },
            { k:'Overhead', v:0.45, col: SW_COLORS.bobbin },
            { k:'Defect',   v:0.18, col: SW_COLORS.alarm },
            { k:'Energy',   v:0.17, col: SW_COLORS.thread },
          ].map((c, i) => {
            const total = 3.84;
            return (
              <div key={i} style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                  <span style={{ fontWeight:600 }}>{c.k}</span>
                  <span style={{ fontFamily: SW_FONTS.mono, fontWeight:700 }}>${c.v.toFixed(2)}</span>
                </div>
                <Progress value={c.v/total*100} color={c.col} height={5}/>
              </div>
            );
          })}
          <div style={{ marginTop: 12, padding:'10px 12px', background: SW_COLORS.brandLite, borderRadius: SW_RADIUS.sm, display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontWeight:800, fontSize:13 }}>TOTAL</span>
            <span style={{ fontFamily: SW_FONTS.display, fontWeight:900, fontSize:16, color: SW_COLORS.brandDeep }}>$3.84</span>
          </div>
        </Card>
      </div>

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <Button variant="secondary" icon="↓">Export PDF</Button>
        <Button variant="dark" icon="✓" onClick={() => navigate('/twin')}>Back to twin</Button>
      </div>
    </div>
  );
}

function KpiLineChart() {
  const target = [10, 12, 15, 17, 18, 17, 16, 18, 20, 19, 18, 17, 16, 14, 13, 12];
  const actual = [8, 11, 14, 18, 20, 16, 14, 17, 21, 18, 16, 19, 17, 15, 12, 13];
  const max = 24, w = 600, h = 180;
  const xs = (i: number) => i * (w/(actual.length-1));
  const ys = (v: number) => h - (v/max)*h;
  return (
    <svg viewBox={`0 0 ${w} ${h+30}`} style={{ width:'100%' }}>
      {[0,6,12,18,24].map(g => (
        <g key={g}>
          <line x1="0" y1={ys(g)} x2={w} y2={ys(g)} stroke={SW_COLORS.line}/>
          <text x="-4" y={ys(g)+4} textAnchor="end" fill={SW_COLORS.muted} fontSize="9" fontFamily={SW_FONTS.mono}>{g}</text>
        </g>
      ))}
      <path d={target.map((v,i) => `${i?'L':'M'} ${xs(i)} ${ys(v)}`).join(' ')} fill="none" stroke={SW_COLORS.muted} strokeWidth="1.5" strokeDasharray="4 3"/>
      <path d={actual.map((v,i) => `${i?'L':'M'} ${xs(i)} ${ys(v)}`).join(' ')} fill="none" stroke={SW_COLORS.brand} strokeWidth="2.5"/>
      {actual.map((v,i)=> <circle key={i} cx={xs(i)} cy={ys(v)} r="3" fill={SW_COLORS.brand}/>)}
      {actual.map((_,i) => i%2===0 && <text key={i} x={xs(i)} y={h+18} textAnchor="middle" fill={SW_COLORS.muted} fontSize="9" fontFamily={SW_FONTS.mono}>{8 + Math.floor(i/2)}:{(i%2)*30||'00'}</text>)}
    </svg>
  );
}

function DonutChart({ slices }: DonutChartProps) {
  const total = slices.reduce((s, x) => s + x.v, 0);
  const r = 50, R = 60;
  let acc = 0;
  return (
    <svg viewBox="-70 -70 140 140" style={{ width:140, height:140 }}>
      {slices.map((s, i) => {
        const a0 = (acc/total) * Math.PI*2 - Math.PI/2;
        acc += s.v;
        const a1 = (acc/total) * Math.PI*2 - Math.PI/2;
        const big = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = Math.cos(a0)*R, y0 = Math.sin(a0)*R;
        const x1 = Math.cos(a1)*R, y1 = Math.sin(a1)*R;
        const xx0 = Math.cos(a0)*r, yy0 = Math.sin(a0)*r;
        const xx1 = Math.cos(a1)*r, yy1 = Math.sin(a1)*r;
        return (
          <path key={i} d={`M ${x0} ${y0} A ${R} ${R} 0 ${big} 1 ${x1} ${y1} L ${xx1} ${yy1} A ${r} ${r} 0 ${big} 0 ${xx0} ${yy0} Z`} fill={s.c}/>
        );
      })}
      <text x="0" y="0" textAnchor="middle" fontFamily={SW_FONTS.display} fontSize="14" fontWeight="900" fill={SW_COLORS.ink}>1.2%</text>
      <text x="0" y="14" textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize="8" fill={SW_COLORS.muted}>DEFECT RATE</text>
    </svg>
  );
}
