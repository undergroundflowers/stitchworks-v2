import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Card, Button, Stat, SectionHeader, Progress, ToggleGroup, Yamazumi, autoAssign, type OperatorAssignment } from '../components';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  smoothnessIndex,
  balanceLoss,
  lineEfficiency,
  bottleneckSmv,
} from '../domain';
import { buildSimConfig, efficiencyFromSkillMatrix, useSim } from '../simulation';
import { useProject, useGarments } from '../store';

interface DonutSlice {
  v: number;
  c: string;
  l: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
}

const SHIFT_MIN = 480;

/**
 * Production KPIs page. Reads the user's selected garment + operator count
 * from the project store, runs a full shift through the DES engine on
 * mount, then renders KPIs from the resulting state. Yamazumi assignments
 * are user-overridable via drag; overrides are persisted in the project
 * store keyed by garment template id.
 */
export function ReportsPage() {
  const navigate = useNavigate();
  const project = useProject();
  const garments = useGarments();
  const setYamazumiOverride = project.setYamazumiOverride;
  const clearYamazumiOverride = project.clearYamazumiOverride;
  const [period, setPeriod] = useState<'SHIFT' | 'DAY' | 'WEEK' | 'MONTH'>('SHIFT');

  // Yamazumi state — picks from store override if present, else LPT auto.
  const [yamGarment, setYamGarment] = useState<string>(project.selectedGarmentId);
  const [yamOperators, setYamOperators] = useState<number>(project.defaultOperators);

  const yamTemplate = garments.byId[yamGarment] ?? garments.all[0];
  const storedOverride = project.yamazumiOverrides[yamGarment];

  const yamAssignments: OperatorAssignment[] = useMemo(() => {
    if (storedOverride && storedOverride.length === yamOperators) {
      // Reconstruct OperatorAssignment from stored opIds + the template's ops.
      const opById = new Map(yamTemplate.operations.map((o) => [o.id, o]));
      return storedOverride.map((s) => ({
        id: s.operatorId,
        operations: s.opIds.map((id) => opById.get(id)).filter((o): o is NonNullable<typeof o> => !!o),
      }));
    }
    return autoAssign(yamTemplate.operations, yamOperators);
  }, [storedOverride, yamOperators, yamTemplate]);

  function handleYamazumiChange(next: OperatorAssignment[]) {
    setYamazumiOverride(yamGarment, next.map((a) => ({ operatorId: a.id, opIds: a.operations.map((o) => o.id) })));
  }

  const stationSmvs = yamAssignments.map((a) =>
    a.operations.reduce((s, o) => s + o.smv, 0),
  );
  const yamTakt = yamTemplate.totalSmv / yamOperators;
  const yamBottleneck = bottleneckSmv(
    yamAssignments.map((a) => ({ smv: a.operations.reduce((s, o) => s + o.smv, 0), id: a.id, code: '', name: '', machineCode: 'MNL', skill: 'stitching', category: 'manual' })),
  );
  const yamBalance = balanceLoss(stationSmvs);
  const yamSmoothness = smoothnessIndex(stationSmvs, yamBottleneck);
  const yamEfficiency = lineEfficiency({
    producedPieces: Math.round((60 / yamBottleneck) * 8),
    sam: yamTemplate.totalSmv,
    operators: yamOperators,
    workMinutes: 60 * 8,
  });

  // ── Real run-driven KPIs from the sim engine ────────────────────────────
  // Per-op efficiency derived from the project's skill matrix — when the
  // user hand-tunes operator proficiency, the sim respects it.
  const opEfficiency = useMemo(
    () => efficiencyFromSkillMatrix(project.skillMatrix, yamTemplate.operations),
    [project.skillMatrix, yamTemplate],
  );
  const skillEntries = Object.keys(opEfficiency).length;
  const runConfig = useMemo(
    () => buildSimConfig({ garment: yamTemplate, operators: yamOperators, opEfficiency }),
    [yamTemplate, yamOperators, opEfficiency],
  );
  const { state: simState, step, reset: simReset } = useSim(runConfig);

  // Auto-run a full shift on mount or whenever config changes. step() is
  // synchronous, fast (the queue is small), and gives us a deterministic
  // post-shift snapshot to render KPIs against.
  useEffect(() => {
    simReset();
    step(SHIFT_MIN);
  }, [runConfig, simReset, step]);

  const samConsumedMin = simState.producedPieces * yamTemplate.totalSmv;
  const efficiency = (samConsumedMin / (yamOperators * SHIFT_MIN)) * 100;
  const throughputPerHr = simState.history.length > 0
    ? (simState.producedPieces / Math.max(1e-6, simState.time)) * 60
    : 0;
  const wipBundles = simState.totalArrivals - simState.produced;

  return (
    <div style={{ width:'100%', height:'100%', overflow:'auto', background: SW_COLORS.paperDeep, padding: 24 }}>
      <SectionHeader kicker="Reports" title="Production KPIs"
        sub={`Snapshot from a 480-min shift run · ${yamTemplate.name} · ${yamOperators} operators · ${skillEntries > 0 ? `${skillEntries} ops respect skill matrix` : 'baseline (no skill overrides)'} · seed ${runConfig.randomSeed}`}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="secondary" size="sm" icon="↻" onClick={() => { simReset(); step(SHIFT_MIN); }}>Re-run shift</Button>
            <Button variant="primary" size="sm" icon="✦"
              onClick={() => {
                const defaultName = `${yamTemplate.name} · ${yamOperators} ops · ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
                const name = prompt('Save as scenario — name?', defaultName);
                if (!name) return;
                const bottleneck = simState.stations[simState.bottleneckOpIndex];
                project.saveScenario({
                  name,
                  kpis: {
                    producedPieces: simState.producedPieces,
                    throughputPerHr: throughputPerHr,
                    efficiencyPct: efficiency,
                    meanLeadTime: simState.meanLeadTime,
                    utilization: simState.utilization,
                    wipBundles,
                    bottleneckOpName: bottleneck?.opName ?? '—',
                    bottleneckQueue: bottleneck?.queueLen ?? 0,
                  },
                });
                navigate('/scenarios');
              }}
            >
              Save scenario
            </Button>
            <ToggleGroup value={period} onChange={setPeriod} options={[
              { value:'SHIFT', label:'Shift' },
              { value:'DAY',   label:'Day' },
              { value:'WEEK',  label:'Week' },
              { value:'MONTH', label:'Month' },
            ]}/>
          </div>
        }
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        <Stat big label="OUTPUT"     value={simState.producedPieces.toLocaleString()} unit="pcs"   color={SW_COLORS.brand}/>
        <Stat big label="THROUGHPUT" value={Math.round(throughputPerHr).toLocaleString()} unit="pcs/hr" color={SW_COLORS.ok}/>
        <Stat big label="EFFICIENCY" value={efficiency.toFixed(1)}    unit="%"      color={efficiency >= 75 ? SW_COLORS.fabric : SW_COLORS.thread}/>
        <Stat big label="MEAN LEAD"  value={simState.meanLeadTime.toFixed(1)}   unit="min"      color={SW_COLORS.bobbin}/>
        <Stat big label="WIP"        value={wipBundles}    unit="bundles"    color={SW_COLORS.warn}/>
        <Stat big label="UTIL"       value={(simState.utilization * 100).toFixed(0)} unit="%" color={SW_COLORS.thread}/>
      </div>

      {/* Yamazumi — drag operations between operators to rebalance */}
      <Card padding={20} style={{ marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10, gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900 }}>YAMAZUMI · LINE BALANCE</div>
            <div style={{ fontSize:12, color: SW_COLORS.muted }}>
              Operator-by-operation SMV stack with takt-line overlay. Drag any segment onto another operator's bar to rebalance manually. Bars over the takt line are bottlenecks.
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap: 14, flexWrap: 'wrap' }}>
            <ToggleGroup value={yamGarment} onChange={setYamGarment} options={garments.all.map(g => ({ value: g.id, label: g.name.replace(/\s*\(.*\)/, '') }))}/>
            <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
              <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>OPS</span>
              <input type="number" min={4} max={60} value={yamOperators}
                onChange={e => setYamOperators(Math.max(4, Math.min(60, parseInt(e.target.value) || 4)))}
                style={{ width: 56, padding: '4px 8px', border: `1px solid ${SW_COLORS.line}`, borderRadius: SW_RADIUS.sm, fontFamily: SW_FONTS.mono, fontWeight: 700, fontSize: 13 }}/>
            </div>
            {storedOverride && (
              <Button variant="ghost" size="sm" onClick={() => clearYamazumiOverride(yamGarment)}>Reset to auto</Button>
            )}
          </div>
        </div>
        <Yamazumi assignments={yamAssignments} taktMin={yamTakt} height={300} onChange={handleYamazumiChange}/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 8 }}>
          <Stat label="GARMENT SAM" value={yamTemplate.totalSmv.toFixed(2)} unit="min"/>
          <Stat label="TAKT" value={yamTakt.toFixed(3)} unit="min" color={SW_COLORS.brand}/>
          <Stat label="BOTTLENECK" value={yamBottleneck.toFixed(3)} unit="min" color={SW_COLORS.alarm}/>
          <Stat label="BALANCE LOSS" value={yamBalance.toFixed(1)} unit="%" color={yamBalance > 25 ? SW_COLORS.alarm : SW_COLORS.thread}/>
          <Stat label="LINE EFF" value={yamEfficiency.toFixed(1)} unit="%" color={yamEfficiency >= 80 ? SW_COLORS.ok : SW_COLORS.thread}/>
        </div>
        <div style={{ marginTop: 8, fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>
          Smoothness index {yamSmoothness.toFixed(3)} (lower = smoother) · {storedOverride ? `Manual override (${storedOverride.length} operators)` : 'LPT auto-assignment'} · Source bulletin: {yamTemplate.operations.length} operations from {yamTemplate.name}
        </div>
      </Card>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14 }}>
        <Card padding={20}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:14 }}>
            <div>
              <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900 }}>OUTPUT OVER TIME</div>
              <div style={{ fontSize:12, color: SW_COLORS.muted }}>Bundles produced per 5-min interval — sampled live from the engine.</div>
            </div>
            <div style={{ display:'flex', gap:14, fontSize:11, fontFamily: SW_FONTS.mono, fontWeight:700 }}>
              <span><span style={{ color: SW_COLORS.brand }}>■</span> Cumulative produced</span>
              <span><span style={{ color: SW_COLORS.bobbin }}>■</span> WIP</span>
            </div>
          </div>
          <KpiLineChart history={simState.history}/>
        </Card>

        <Card padding={20}>
          <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14 }}>BOTTLENECKS (LIVE)</div>
          {simState.stations.length === 0 ? (
            <div style={{ fontSize:12, color: SW_COLORS.muted }}>Sim has not run yet.</div>
          ) : (
            [...simState.stations]
              .sort((a, b) => b.queueLen - a.queueLen)
              .slice(0, 6)
              .map((s, i) => (
                <div key={s.opId} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderTop: i?`1px solid ${SW_COLORS.line}`:'none' }}>
                  <span style={{ flex:1, fontSize:12, fontWeight:600 }}>
                    <span style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, fontSize: 10, fontWeight: 700, marginRight: 6 }}>{s.opCode}</span>
                    {s.opName}
                  </span>
                  <span style={{ fontFamily: SW_FONTS.mono, fontSize:11, fontWeight:700, color: s.queueLen > 5 ? SW_COLORS.alarm : SW_COLORS.muted }}>Q={s.queueLen}</span>
                  <span style={{ fontFamily: SW_FONTS.mono, fontSize:11, fontWeight:700, color: SW_COLORS.thread }}>{(s.utilization * 100).toFixed(0)}%</span>
                </div>
              ))
          )}
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 14, marginBottom:14 }}>
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

interface KpiLineChartProps {
  history: { time: number; produced: number; wip: number; throughputPerHr: number }[];
}

function KpiLineChart({ history }: KpiLineChartProps) {
  const w = 600, h = 200;
  const padL = 30, padR = 8, padT = 8, padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  if (history.length < 2) {
    return (
      <div style={{ height: h, display:'flex', alignItems:'center', justifyContent:'center', color: SW_COLORS.muted, fontSize: 12 }}>
        Run a shift to see output over time.
      </div>
    );
  }

  const maxT = history[history.length - 1].time;
  const maxProd = Math.max(...history.map((h) => h.produced), 1);
  const maxWip = Math.max(...history.map((h) => h.wip), 1);
  const xs = (t: number) => padL + (t / maxT) * innerW;
  const yProd = (v: number) => padT + innerH - (v / maxProd) * innerH;
  const yWip = (v: number) => padT + innerH - (v / maxWip) * innerH;

  const xTicks = 5;
  const yTicks = 4;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%' }}>
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const v = (maxProd / yTicks) * i;
        return (
          <g key={i}>
            <line x1={padL} y1={yProd(v)} x2={w - padR} y2={yProd(v)} stroke={SW_COLORS.line}/>
            <text x={padL - 4} y={yProd(v) + 3} textAnchor="end" fill={SW_COLORS.muted} fontSize="9" fontFamily={SW_FONTS.mono}>{Math.round(v)}</text>
          </g>
        );
      })}
      {Array.from({ length: xTicks + 1 }).map((_, i) => {
        const t = (maxT / xTicks) * i;
        return (
          <text key={i} x={xs(t)} y={h - 6} textAnchor="middle" fill={SW_COLORS.muted} fontSize="9" fontFamily={SW_FONTS.mono}>
            {Math.round(t)}m
          </text>
        );
      })}
      {/* WIP area, on its own scale */}
      <path
        d={`M ${xs(history[0].time)} ${h - padB} ${history.map((h) => `L ${xs(h.time)} ${yWip(h.wip)}`).join(' ')} L ${xs(history[history.length - 1].time)} ${h - padB} Z`}
        fill={`${SW_COLORS.bobbin}30`}
      />
      {/* Cumulative produced */}
      <path
        d={history.map((h, i) => `${i ? 'L' : 'M'} ${xs(h.time)} ${yProd(h.produced)}`).join(' ')}
        fill="none" stroke={SW_COLORS.brand} strokeWidth="2.5"
      />
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
