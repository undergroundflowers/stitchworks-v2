/**
 * STITCHWORKS — WORKSTATION DETAIL (level 3)
 * Third-level drill-down from the Department Interior. Renders one
 * workstation: operator card, machine card, current sub-op, output history
 * spark-bars, live KPIs, defect log, and the break schedule.
 *
 * Ported verbatim from .design-import/sw/sw-screens-dept.jsx
 * (SWWorkstationDetail at the bottom of the file). The breadcrumb is shared
 * with the dept-interior screen (re-exported from DeptInterior.tsx).
 *
 * Helpers ported into this file: LocalCard (the source's local <Card>).
 * The shared <Stat>/<Card> from `../components` aren't used here because
 * the source's local helpers have a slightly different visual treatment
 * (paperDeep background, mono unit alignment) we need to preserve.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { DEPT_MACHINE_CATALOG, DEPT_LAYOUT, type DeptMachineId } from '../domain';
import { DeptBreadcrumb } from './DeptInterior';

// ============================================================================
// Layout-shape stubs (mirrors DeptInterior's local types — we only read
// from the persisted layout, so a minimal mirror is enough).
// ============================================================================
interface DeptLayoutLike {
  workstations: Array<{ id: string; x: number; y: number; label: string; subopId: string; machineId: string; operatorId: string }>;
  machines: Array<{ id: string; type: DeptMachineId; x: number; y: number }>;
  operators: Array<{ id: string; name: string; skill: number }>;
  subops: Array<{ id: string; label: string; skill: number; mach: DeptMachineId }>;
}

function loadDeptLayout(deptId: string): DeptLayoutLike | null {
  try {
    const k = 'sw_dept_'+deptId;
    const raw = localStorage.getItem(k);
    if (raw) return JSON.parse(raw) as DeptLayoutLike;
  } catch { /* ignore */ }
  return null;
}

function routeFor(id: string): string {
  if (id === 'menu') return '/';
  if (id === 'twin') return '/twin';
  if (id === 'floor') return '/floor';
  if (id === 'sim') return '/sim';
  if (id.startsWith('dept:')) return '/dept/' + id.slice(5);
  return '/';
}

// ============================================================================
// MAIN: WorkstationDetailPage
// ============================================================================
export function WorkstationDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const deptId = params.deptId || '';
  const wsId = params.wsId || '';
  const setRoute = (id: string) => navigate(routeFor(id));
  const onBack = () => navigate(`/dept/${deptId}`);

  const layout = loadDeptLayout(deptId);
  const ws = layout?.workstations.find(w => w.id === wsId);
  const dept = DEPT_LAYOUT[deptId as keyof typeof DEPT_LAYOUT];

  // Mock recent task history. Computed once per render but kept stable for
  // the Math.random() defect-tone — the source recomputes it every render
  // too (intentional, suggests "live data feel").
  const history = useMemo(
    () => Array.from({ length: 24 }).map((_, i) => ({
      t: i,
      count: 4 + Math.floor(Math.sin(i / 3) * 2 + Math.random() * 2),
    })),
    [wsId]
  );

  const defects = [
    { t:'08:24', kind:'broken stitch', sev:'minor' },
    { t:'09:12', kind:'fabric pucker', sev:'minor' },
    { t:'10:48', kind:'skipped stitch', sev:'major' },
    { t:'11:31', kind:'thread tension', sev:'minor' },
  ];

  if (!ws || !dept || !layout) {
    return <div style={{ padding: 40 }}>Workstation not found. <button onClick={onBack}>← Back</button></div>;
  }

  const machInst = layout.machines.find(m => m.id === ws.machineId);
  const mach = machInst ? DEPT_MACHINE_CATALOG[machInst.type] : undefined;
  const op = layout.operators.find(o => o.id === ws.operatorId);
  const sub = layout.subops.find(su => su.id === ws.subopId);

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background: SW_COLORS.paperDeep, fontFamily: SW_FONTS.body }}>
      <DeptBreadcrumb deptId={deptId} setRoute={setRoute} wsId={wsId}/>

      <div style={{ flex:1, overflow:'auto', padding: 24 }}>
        <div style={{ maxWidth: 1200, margin:'0 auto' }}>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap: 18, marginBottom: 18 }}>
            <button onClick={onBack} style={{
              background: SW_COLORS.paper, border:`1px solid ${SW_COLORS.line}`,
              padding:'8px 12px', borderRadius: SW_RADIUS.sm, cursor:'pointer',
              fontFamily: SW_FONTS.display, fontSize: 11, fontWeight: 900, letterSpacing:'0.06em',
            }}>← BACK</button>
            <div>
              <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.brand, letterSpacing:'1.5px' }}>WORKSTATION · {ws.id}</div>
              <div style={{ fontFamily: SW_FONTS.display, fontSize: 32, fontWeight: 900, letterSpacing:'-0.02em' }}>{ws.label}</div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap: 18 }}>
            {/* Left col */}
            <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
              {/* Operator card */}
              <LocalCard title="OPERATOR">
                {op ? (
                  <div style={{ display:'flex', gap: 14 }}>
                    <div style={{ width: 64, height: 64, background: SW_COLORS.brand, color:'#fff', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily: SW_FONTS.display, fontWeight: 900, fontSize: 22 }}>{op.name?.[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900 }}>{op.name}</div>
                      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, marginTop: 2 }}>{op.id} · skill level {op.skill}/5</div>
                      <div style={{ display:'flex', gap: 3, marginTop: 6 }}>
                        {[1,2,3,4,5].map(i => <div key={i} style={{ width: 14, height: 14, background: i <= op.skill ? SW_COLORS.thread : SW_COLORS.line }}/>)}
                      </div>
                    </div>
                  </div>
                ) : <div style={{ color: SW_COLORS.muted }}>(unassigned)</div>}
              </LocalCard>

              {/* Machine card */}
              <LocalCard title="MACHINE">
                {mach ? (
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
                      <div style={{ width: 56, height: 56, background: SW_COLORS.ink, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily: SW_FONTS.display, fontWeight: 900, fontSize: 24 }}>{mach.icon}</div>
                      <div>
                        <div style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900 }}>{mach.label}</div>
                        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>{mach.id} · {mach.cat.toUpperCase()}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 6 }}>
                      <KpiTile lbl="CYCLE" val={`${mach.cycleS[0]}–${mach.cycleS[1]}`} unit="s"/>
                      <KpiTile lbl="DEFECT" val={mach.defectPct.toFixed(2)} unit="%"/>
                      <KpiTile lbl="POWER" val={mach.power} unit="kW"/>
                    </div>
                  </div>
                ) : <div style={{ color: SW_COLORS.muted }}>(no machine)</div>}
              </LocalCard>

              {/* Sub-op + sequence */}
              <LocalCard title="CURRENT SUB-OPERATION">
                {sub ? (
                  <div>
                    <div style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900 }}>{sub.label}</div>
                    <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, marginTop: 2 }}>requires skill {sub.skill}/5 · default machine: {DEPT_MACHINE_CATALOG[sub.mach]?.label}</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: op && op.skill >= sub.skill ? SW_COLORS.ok : SW_COLORS.alarm, fontWeight: 700 }}>
                      {op && op.skill >= sub.skill ? '✓ Operator is qualified' : `⚠ Operator under-skilled (${op?.skill}/${sub.skill})`}
                    </div>
                  </div>
                ) : <div style={{ color: SW_COLORS.muted }}>(no sub-op assigned)</div>}
              </LocalCard>

              {/* Output history sparkline */}
              <LocalCard title="OUTPUT — LAST 24 INTERVALS">
                <svg viewBox="0 0 480 80" style={{ width:'100%', height: 80 }}>
                  {history.map((h, i) => {
                    const bx = i * 20 + 4;
                    const bh = h.count * 8;
                    return <rect key={i} x={bx} y={80 - bh} width={14} height={bh} fill={SW_COLORS.brand}/>;
                  })}
                </svg>
                <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, marginTop: 4 }}>output per 5-min bucket · total {history.reduce((s,h)=>s+h.count,0)} pcs</div>
              </LocalCard>
            </div>

            {/* Right col */}
            <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
              {/* Live KPIs */}
              <LocalCard title="LIVE KPIS">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 6 }}>
                  <KpiTile lbl="UTILIZATION" val={Math.round(60 + Math.random()*30)} unit="%" tone="ok"/>
                  <KpiTile lbl="WIP" val={Math.round(4 + Math.random()*8)} unit="pcs"/>
                  <KpiTile lbl="CYCLE NOW" val={mach ? Math.round((mach.cycleS[0]+mach.cycleS[1])/2) : 30} unit="s"/>
                  <KpiTile lbl="DEFECT 24H" val={defects.length} unit="pcs" tone={defects.length>3?'alarm':'ok'}/>
                </div>
              </LocalCard>

              {/* Defect log */}
              <LocalCard title="DEFECT LOG (TODAY)">
                {defects.map((d, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap: 8, padding:'5px 0', borderBottom:`1px solid ${SW_COLORS.line}` }}>
                    <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, width: 44 }}>{d.t}</div>
                    <div style={{ flex: 1, fontSize: 12 }}>{d.kind}</div>
                    <div style={{ fontFamily: SW_FONTS.display, fontSize: 9, fontWeight: 900, padding:'2px 6px', background: d.sev === 'major' ? SW_COLORS.alarm : SW_COLORS.thread, color:'#fff', borderRadius: 2, letterSpacing:'1px' }}>{d.sev.toUpperCase()}</div>
                  </div>
                ))}
              </LocalCard>

              {/* Break schedule */}
              <LocalCard title="BREAK SCHEDULE">
                {[
                  { time:'10:30 – 10:45', label:'Tea break' },
                  { time:'12:30 – 13:15', label:'Lunch' },
                  { time:'15:30 – 15:45', label:'Tea break' },
                ].map((b,i)=>(
                  <div key={i} style={{ display:'flex', gap: 10, padding:'6px 0', borderBottom: i<2?`1px solid ${SW_COLORS.line}`:'none' }}>
                    <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, fontWeight: 700, color: SW_COLORS.steel, width: 110 }}>{b.time}</div>
                    <div style={{ fontSize: 12 }}>{b.label}</div>
                  </div>
                ))}
              </LocalCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LocalCard — the source's local <Card>. Visually distinct from
// '../components/Card' (mono small-caps title row) so we keep it inline.
// ============================================================================
interface LocalCardProps {
  title: string;
  children: ReactNode;
}
function LocalCard({ title, children }: LocalCardProps) {
  return (
    <div style={{ background: SW_COLORS.paper, border:`1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.md, padding: 16 }}>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

// ============================================================================
// KpiTile — workstation-detail-flavoured stat. The source uses its `Stat`
// (lbl/val/unit/tone) helper — same shape as the dept-interior LocalStat.
// ============================================================================
interface KpiTileProps {
  lbl: string;
  val: number | string;
  unit: string;
  tone?: 'alarm' | 'ok' | 'bobbin';
}
function KpiTile({ lbl, val, unit, tone }: KpiTileProps) {
  const c =
    tone === 'alarm' ? SW_COLORS.alarm :
    tone === 'ok' ? SW_COLORS.ok :
    tone === 'bobbin' ? SW_COLORS.bobbin :
    SW_COLORS.ink;
  const wrap: CSSProperties = { background: SW_COLORS.paperDeep, padding: 8, borderRadius: SW_RADIUS.sm };
  return (
    <div style={wrap}>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight:700, color: SW_COLORS.muted, letterSpacing:'1px' }}>{lbl}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:3, marginTop:2 }}>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 20, fontWeight: 900, color: c, letterSpacing:'-0.02em' }}>{val}</div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted }}>{unit}</div>
      </div>
    </div>
  );
}
