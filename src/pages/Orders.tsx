import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Card, Button, Stat, SectionHeader } from '../components';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ALL_PRODUCTION_SYSTEMS,
  PRODUCTION_SYSTEMS,
  type ProductionSystem,
  pitchTime,
  labourRequired,
} from '../domain';
import { useProject, useGarments } from '../store';

interface OrderState {
  po: string;
  client: string;
  style: string;
  qty: number;
  deadlineDays: number;
  garmentTemplateId: string;
  target: string;
}

/**
 * Order setup — the user enters PO/client/style/qty/deadline, picks a
 * garment template (T-shirt / Polo / Shirt / Trouser / Sweatshirt, all
 * sourced from the apparel domain layer with literature-backed SMVs), and
 * picks a production system. Stitchworks computes pitch time, theoretical
 * crew size and recommends the system that best fits qty × deadline.
 */
export function OrdersPage() {
  const navigate = useNavigate();
  const project = useProject();
  const garments = useGarments();
  const [order, setOrder] = useState<OrderState>({
    po: 'PO-4422',
    client: 'Northwind Apparel Co.',
    style: 'Polo S/S Classic',
    qty: 1200,
    deadlineDays: 5,
    garmentTemplateId: project.selectedGarmentId,
    target: 'AQL 2.5',
  });
  const [system, setSystem] = useState<ProductionSystem>('PBS');

  /**
   * Save the order's chosen garment + computed crew to the project store,
   * then navigate. Downstream pages (LiveSim, Reports, Resources skill tab)
   * pick the new defaults up automatically.
   */
  function commit(target: '/sim') {
    project.setSelectedGarment(order.garmentTemplateId);
    project.setDefaultOperators(crewSize);
    navigate(target);
  }

  const template = garments.byId[order.garmentTemplateId];
  const recommended = recommendSystem(order.qty, order.deadlineDays);

  // Pitch time + crew size based on the chosen template's SAM and an
  // 8-hour shift target = qty / deadline_days / 8 = pcs/hour demand.
  const demandPerHour = order.qty / Math.max(1, order.deadlineDays) / 8;
  const crewSize = Math.ceil(
    labourRequired({
      sam: template.totalSmv,
      demandPerHour,
      attendancePct: 90,
      utilisationPct: 80,
      bsiPct: 95,
    }),
  );
  const pitchSec = pitchTime({ sam: template.totalSmv, operators: crewSize });
  const cycleDays = Math.ceil((order.qty * template.totalSmv) / (60 * 8 * crewSize));

  return (
    <div style={{ width:'100%', height:'100%', overflow:'auto', padding: 32, background: SW_COLORS.paperDeep }}>
      <div style={{ maxWidth: 1180, margin:'0 auto' }}>
        <SectionHeader kicker="Plan a job" title="New production order"
          sub="Enter order specs. We'll suggest the line, system and crew based on the garment template's SAM."
          right={<Button variant="dark" onClick={()=>navigate('/builder')}>Cancel</Button>}
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
                <input type="number" value={order.deadlineDays} onChange={e=>setOrder({...order, deadlineDays:+e.target.value})}
                  style={{ width:'100%', padding:'10px 12px', borderRadius: SW_RADIUS.sm, border:`1px solid ${SW_COLORS.line}`, fontFamily: SW_FONTS.mono, fontSize:14, fontWeight:700 }}/>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize:11, fontWeight:700, color: SW_COLORS.muted, marginBottom:6 }}>Garment template (preset operations)</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:8 }}>
                {garments.all.map(g => {
                  const active = g.id === order.garmentTemplateId;
                  return (
                    <div key={g.id} onClick={() => setOrder({ ...order, garmentTemplateId: g.id })}
                      style={{
                        padding:'10px 8px', textAlign:'center', borderRadius: SW_RADIUS.sm,
                        border:`1.5px solid ${active?SW_COLORS.brand:SW_COLORS.line}`,
                        background: active?SW_COLORS.brandLite:SW_COLORS.paper,
                        fontSize:12, fontWeight:700, cursor:'pointer',
                      }}>
                      <div>{g.name}</div>
                      <div style={{ fontSize:10, fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, fontWeight:600, marginTop:3 }}>
                        {g.totalSmv.toFixed(2)} min · {g.operations.length} ops
                      </div>
                    </div>
                  );
                })}
              </div>
              {template && (
                <div style={{ marginTop: 10, padding: 10, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.5 }}>
                  <strong style={{ color: SW_COLORS.ink }}>{template.name}</strong> — {template.description} <em>Best for: {template.bestFor}</em>
                </div>
              )}
            </div>
          </Card>

          <Card padding={20}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>SYSTEM RECOMMENDATION</div>
            <div style={{ background: SW_COLORS.brandLite, padding:14, borderRadius: SW_RADIUS.sm, marginBottom:14, border: `1px solid ${SW_COLORS.brand}40` }}>
              <div style={{ fontSize:11, color: SW_COLORS.brandDeep, fontWeight:700, fontFamily: SW_FONTS.mono, letterSpacing:'1px', marginBottom:4 }}>RECOMMENDED FOR THIS ORDER</div>
              <div style={{ fontFamily: SW_FONTS.display, fontSize:18, fontWeight:900, color: SW_COLORS.ink }}>
                {PRODUCTION_SYSTEMS[recommended].label}
              </div>
              <div style={{ fontSize:12, color: SW_COLORS.ink, opacity:0.8, marginTop:4 }}>
                {PRODUCTION_SYSTEMS[recommended].bestFor}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
              {ALL_PRODUCTION_SYSTEMS.map(s => {
                const active = system === s.id;
                return (
                  <div key={s.id} onClick={()=>setSystem(s.id)} title={s.description} style={{
                    padding:'8px 10px', textAlign:'center',
                    borderRadius: SW_RADIUS.sm,
                    border:`1.5px solid ${active?SW_COLORS.ink:SW_COLORS.line}`,
                    background: active?SW_COLORS.ink:SW_COLORS.paper,
                    color: active?SW_COLORS.paper:SW_COLORS.ink,
                    fontSize:11, fontWeight:700, cursor:'pointer',
                  }}>{s.short}</div>
                );
              })}
            </div>

            <div style={{ marginTop:16, padding:10, background:SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, fontSize:11, color: SW_COLORS.muted, lineHeight:1.5 }}>
              <strong style={{ color: SW_COLORS.ink }}>{PRODUCTION_SYSTEMS[system].label}</strong> — bundle size {PRODUCTION_SYSTEMS[system].typicalBatchSize}, typical line ~{PRODUCTION_SYSTEMS[system].typicalLineSize} ops, ~{PRODUCTION_SYSTEMS[system].typicalWipPieces} pcs WIP. {PRODUCTION_SYSTEMS[system].description}
            </div>

            <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
              <Stat label="GARMENT SAM" value={template.totalSmv.toFixed(2)} unit="min"/>
              <Stat label="PITCH TIME" value={pitchSec.toFixed(1)} unit="sec" color={SW_COLORS.brand}/>
              <Stat label="EST. CYCLE" value={`${cycleDays}d`} color={SW_COLORS.thread}/>
              <Stat label="CREW NEEDED" value={crewSize} unit="ops" color={SW_COLORS.ok}/>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 18, display:'flex', justifyContent:'flex-end', gap:10, flexWrap:'wrap' }}>
          <Button variant="secondary" onClick={()=>navigate('/builder')}>Save draft</Button>
          <Button variant="primary" size="lg" onClick={() => commit('/sim')}>Run simulation →</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Heuristic system recommendation — matches the literature's rules of thumb:
 *   - very small batch / sample volume → make-through
 *   - tight deadline + small qty → modular (one-piece flow, low WIP)
 *   - mid-volume mixed → modular or UPS
 *   - high-volume basics → PBS
 *   - massive piece-rate runs → unit-handle
 */
function recommendSystem(qty: number, days: number): ProductionSystem {
  const dailyDemand = qty / Math.max(1, days);
  if (qty <= 50) return 'make_through';
  if (dailyDemand < 100) return 'modular';
  if (dailyDemand < 400) return 'modular';
  if (dailyDemand < 1500) return 'PBS';
  if (dailyDemand < 3000) return 'UPS';
  return 'unit_handle';
}
