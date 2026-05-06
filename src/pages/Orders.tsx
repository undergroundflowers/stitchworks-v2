import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Card, Button, Stat, SectionHeader } from '../components';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface OrderState {
  po: string;
  client: string;
  style: string;
  qty: number;
  deadline: number;
  sam: number;
  target: string;
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderState>({
    po: 'PO-4422', client: 'Northwind Apparel Co.', style: 'Polo S/S Classic',
    qty: 1200, deadline: 5, sam: 18.4, target: 'AQL 2.5'
  });
  const [system, setSystem] = useState<string>('PBS');

  return (
    <div style={{ width:'100%', height:'100%', overflow:'auto', padding: 32, background: SW_COLORS.paperDeep }}>
      <div style={{ maxWidth: 1180, margin:'0 auto' }}>
        <SectionHeader kicker="Plan a job" title="New production order"
          sub="Enter order specs. We'll suggest the line, system and crew based on what's free."
          right={<Button variant="dark" onClick={()=>navigate('/twin')}>Cancel</Button>}
        />

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
          <Card padding={20}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>ORDER DETAILS</div>
            {[
              { k:'po', label:'PO Number' }, { k:'client', label:'Client' }, { k:'style', label:'Style' },
            ].map(f => (
              <div key={f.k} style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color: SW_COLORS.muted, marginBottom:4 }}>{f.label}</div>
                <input value={order[f.k as keyof OrderState] as string} onChange={e => setOrder({ ...order, [f.k]: e.target.value })}
                  style={{ width:'100%', padding:'10px 12px', borderRadius: SW_RADIUS.sm, border:`1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.body, fontSize:13, fontWeight:600, color: SW_COLORS.ink, background: SW_COLORS.paper }}/>
              </div>
            ))}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color: SW_COLORS.muted, marginBottom:4 }}>Quantity</div>
                <input type="number" value={order.qty} onChange={e=>setOrder({...order, qty: +e.target.value})}
                  style={{ width:'100%', padding:'10px 12px', borderRadius: SW_RADIUS.sm, border:`1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.mono, fontSize:14, fontWeight:700 }}/>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color: SW_COLORS.muted, marginBottom:4 }}>Deadline (days)</div>
                <input type="number" value={order.deadline} onChange={e=>setOrder({...order, deadline:+e.target.value})}
                  style={{ width:'100%', padding:'10px 12px', borderRadius: SW_RADIUS.sm, border:`1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.mono, fontSize:14, fontWeight:700 }}/>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize:11, fontWeight:700, color: SW_COLORS.muted, marginBottom:6 }}>Garment template (preset operations)</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                {['T-shirt','Polo','Shirt','Trouser'].map(g => (
                  <div key={g} style={{ padding:'10px 8px', textAlign:'center', borderRadius: SW_RADIUS.sm, border:`1.5px solid ${g==='Polo'?SW_COLORS.brand:SW_COLORS.line}`, background: g==='Polo'?SW_COLORS.brandLite:SW_COLORS.paper, fontSize:12, fontWeight:700, cursor:'pointer' }}>{g}</div>
                ))}
              </div>
            </div>
          </Card>

          <Card padding={20}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>SYSTEM RECOMMENDATION</div>
            <div style={{ background: SW_COLORS.brandLite, padding:14, borderRadius: SW_RADIUS.sm, marginBottom:14, border: `1px solid ${SW_COLORS.brand}40` }}>
              <div style={{ fontSize:11, color: SW_COLORS.brandDeep, fontWeight:700, fontFamily: SW_FONTS.mono, letterSpacing:'1px', marginBottom:4 }}>RECOMMENDED FOR THIS ORDER</div>
              <div style={{ fontFamily: SW_FONTS.display, fontSize:18, fontWeight:900, color: SW_COLORS.ink }}>Progressive Bundle System (PBS)</div>
              <div style={{ fontSize:12, color: SW_COLORS.ink, opacity:0.8, marginTop:4 }}>1200 polos × 5 days fits PBS sweet spot. Predictable, low setup cost.</div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
              {['Make-Through','PBS','UPS','Modular','Straight','Synchro','Clump','Bundle','Unit Handle'].map(s => {
                const active = system === s;
                return (
                  <div key={s} onClick={()=>setSystem(s)} style={{
                    padding:'8px 10px', textAlign:'center',
                    borderRadius: SW_RADIUS.sm,
                    border:`1.5px solid ${active?SW_COLORS.ink:SW_COLORS.line}`,
                    background: active?SW_COLORS.ink:SW_COLORS.paper,
                    color: active?SW_COLORS.paper:SW_COLORS.ink,
                    fontSize:11, fontWeight:700, cursor:'pointer',
                  }}>{s}</div>
                );
              })}
            </div>

            <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <Stat label="EST. SAM" value={order.sam} unit="min"/>
              <Stat label="EST. CYCLE" value={`${Math.round((order.qty * order.sam)/(60*8*15))}d`} color={SW_COLORS.brand}/>
              <Stat label="CREW NEEDED" value={Math.ceil(order.sam/2)} unit="ops"/>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 18, display:'flex', justifyContent:'flex-end', gap:10 }}>
          <Button variant="secondary" onClick={()=>navigate('/twin')}>Save draft</Button>
          <Button variant="primary" size="lg" onClick={()=>navigate('/layout')}>Plan line layout →</Button>
        </div>
      </div>
    </div>
  );
}
