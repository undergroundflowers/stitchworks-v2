import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Card, Button, Stat, SectionHeader, Progress, ToggleGroup, Yamazumi, autoAssign, HideableBox, type OperatorAssignment } from '../components';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  smoothnessIndex,
  balanceLoss,
  lineEfficiency,
  bottleneckSmv,
} from '../domain';
import { buildSimConfig, efficiencyFromSkillMatrix, runReplications, buildLinesFromTwin, aggregateFactoryKpis, type AggregateKpis, type LineBuild } from '../simulation';
import { useProject, useGarments } from '../store';
import { useTwin, selectActiveTwin } from '../store/twin';
import { runPmlOnTwin } from '../simulation/pml-runner';
import { getBlockSpec, apparelRoleFor } from '../domain/pml';
import { REFERENCE_MODELS } from '../domain/reference-models';
import { compareToPaper, type ReferenceVariant } from '../domain/reference-twin';
import { useReferenceContext } from '../store/reference';

const SHIFT_MIN = 480;

/**
 * Production KPIs page. Reads the user's selected garment + operator count
 * from the project store, runs a full shift through the DES engine on
 * mount, then renders KPIs from the resulting state. Yamazumi assignments
 * are user-overridable via drag; overrides are persisted in the project
 * store keyed by garment template id.
 *
 * `embedded` mode drops the outer scroll wrapper and the "Back to twin"
 * footer button so the same content can be mounted inside another page
 * (e.g. underneath the LiveSim view).
 */
export function ReportsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const project = useProject();
  const garments = useGarments();
  const setYamazumiOverride = project.setYamazumiOverride;
  const clearYamazumiOverride = project.clearYamazumiOverride;
  const [period, setPeriod] = useState<'SHIFT' | 'DAY' | 'WEEK' | 'MONTH'>('SHIFT');
  // In-page tab nav. Line balance is a part of performance, so it lives as a
  // section under the same Reports umbrella rather than its own route.
  const [tab, setTab] = useState<'performance' | 'balance' | 'validation'>('performance');

  // Save-scenario modal state. We avoid `window.prompt()` because it's
  // suppressed inside many embedded preview / iframe contexts, which silently
  // killed the save flow before this — the button looked like it did nothing.
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNotes, setSaveNotes] = useState('');

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
  const [runs, setRuns] = useState<number>(1);
  const runConfig = useMemo(
    () => buildSimConfig({ garment: yamTemplate, operators: yamOperators, opEfficiency }),
    [yamTemplate, yamOperators, opEfficiency],
  );
  const [agg, setAgg] = useState<AggregateKpis>(() =>
    runReplications({ config: runConfig, replications: runs, simMinutes: SHIFT_MIN }),
  );

  // Re-run when config or replication count changes. Synchronous —
  // typically <100ms even at runs=10.
  useEffect(() => {
    setAgg(runReplications({ config: runConfig, replications: runs, simMinutes: SHIFT_MIN }));
  }, [runConfig, runs]);

  // ── Per-line replication ─────────────────────────────────────────────────
  // When the active twin has more than one wired sewing line, the
  // single-garment KPIs above can't honestly speak for the factory (Line 1
  // is knit, Line 2 is woven, etc.). Run a separate replication on each
  // wired line's config so the Performance tab can show a per-line table
  // alongside the aggregate Yamazumi-driven tiles.
  const reportsTwin = useTwin(selectActiveTwin);
  const lineBuildsForReports: LineBuild[] = useMemo(() => {
    if ((reportsTwin.lines ?? []).length === 0) return [];
    return buildLinesFromTwin({
      twin: reportsTwin,
      garmentsById: garments.byId,
      defaultGarmentId: project.selectedGarmentId,
      opEfficiency: efficiencyFromSkillMatrix(
        project.skillMatrix,
        (garments.byId[project.selectedGarmentId] ?? garments.all[0]).operations,
      ),
      modelTimeUnit: project.time.modelTimeUnit,
    });
  }, [reportsTwin, garments.byId, garments.all, project.selectedGarmentId, project.skillMatrix, project.time.modelTimeUnit]);
  const perLineAggs = useMemo(() => {
    return lineBuildsForReports
      .filter((lb) => lb.ok)
      .map((lb) => ({
        line: lb.line,
        bundleSize: lb.build.config.bundleSize,
        // Operators = sum of parallel servers across stations. Matches the
        // denominator the per-line efficiency calc in replications.ts uses,
        // so the factory-weighted efficiency stays internally consistent.
        operators: lb.build.config.stationServers.reduce((s, c) => s + c, 0),
        // SAM per piece for this line's garment. Drives the SAM-consumed
        // weight in the factory efficiency aggregation.
        totalSmv: lb.build.config.operations.reduce((s, o) => s + o.smv, 0),
        agg: runReplications({ config: lb.build.config, replications: runs, simMinutes: SHIFT_MIN }),
      }));
  }, [lineBuildsForReports, runs]);

  // ── Factory-level aggregate across wired lines ──────────────────────────
  // When the twin has ≥1 wired line, the top KPI tiles (and the FACTORY
  // summary row in the per-line table) describe the whole factory, computed
  // with proper IE weighting (operator-minutes for efficiency, operators for
  // utilisation, pieces for lead time). Without this, the tiles would either
  // (a) show a synthetic Yamazumi-target line that disagreed with the per-
  // line table below, or (b) report a simple arithmetic mean of percentages,
  // which silently misrepresents lines of different sizes.
  const factoryAgg = useMemo<AggregateKpis | null>(() => {
    if (perLineAggs.length === 0) return null;
    return aggregateFactoryKpis(perLineAggs, SHIFT_MIN);
  }, [perLineAggs]);

  // Top KPI tiles read from the factory aggregate when wired lines exist,
  // otherwise from the single-config Yamazumi run. This is the same data that
  // populates the FACTORY summary row in the per-line table, so the two views
  // stay numerically consistent.
  const kpiSource: AggregateKpis = factoryAgg ?? agg;
  const efficiency = kpiSource.efficiencyPct.mean;
  const throughputPerHr = kpiSource.throughputPerHr.mean;
  const producedPieces = kpiSource.producedPieces.mean;
  const meanLeadTime = kpiSource.meanLeadTime.mean;
  const utilization = kpiSource.utilization.mean;
  const wipBundles = kpiSource.wipBundles.mean;

  // ── PML run section data ────────────────────────────────────────────────
  const pmlTwin = useTwin(selectActiveTwin);
  const setKpiObserved = useTwin((s) => s.setKpiObserved);
  /** Force re-render after RUN — selectActiveTwin returns the same Twin
   *  reference on observed-only edits so we need a tick. */
  const [pmlRunBump, setPmlRunBump] = useState(0);

  const pmlBlocks = useMemo(() => {
    void pmlRunBump; // trigger memo on run
    return pmlTwin.workstations
      .filter((w) => w.kpiObserved && w.kpiObserved.capacityPerHr > 0)
      .map((w) => {
        const spec = getBlockSpec(w);
        return {
          ws: w,
          kind: spec.kind,
          role: apparelRoleFor(w),
          throughput: w.kpiObserved!.capacityPerHr,
          util: w.kpiObserved!.utilizationPct,
          bottleneck: w.kpiObserved!.bottleneck,
        };
      })
      .sort((a, b) => b.throughput - a.throughput);
  }, [pmlTwin, pmlRunBump]);

  const pmlSinkThroughput = useMemo(
    () =>
      pmlTwin.workstations
        .filter((w) => getBlockSpec(w).kind === 'Sink')
        .reduce((s, w) => s + (w.kpiObserved?.capacityPerHr ?? 0), 0),
    [pmlTwin, pmlRunBump],
  );
  const pmlBottleneck = pmlBlocks.find((b) => b.bottleneck) ?? null;
  const pmlAnyObserved = pmlBlocks.length > 0;

  // ── Reference paper validation ──────────────────────────────────────────
  // When the user has loaded a published case study into the active twin,
  // surface a paper-vs-observed comparison so they can judge how closely
  // Stitchworks reproduces the literature.
  const refCtx = useReferenceContext();
  const clearRefContext = useReferenceContext((s) => s.clear);
  const refModel = useMemo(
    () =>
      refCtx.slug
        ? REFERENCE_MODELS.find((m) => m.slug === refCtx.slug) ?? null
        : null,
    [refCtx.slug],
  );

  // Auto-run PML once when a reference is loaded but no observed values
  // exist yet — saves the user a click. Stays a no-op for non-reference twins.
  useEffect(() => {
    if (!refModel || !refCtx.variantKey) return;
    if (pmlAnyObserved) return;
    runPmlOnTwin(pmlTwin, { writeKpiObserved: setKpiObserved });
    setPmlRunBump((n) => n + 1);
  }, [refModel, refCtx.variantKey, pmlAnyObserved, pmlTwin, setKpiObserved]);

  const refValidation = useMemo(() => {
    if (!refModel || !refCtx.variantKey) return null;
    if (!pmlAnyObserved) return null;
    const throughputPerHr = pmlSinkThroughput;
    const pool = pmlTwin.workstations.find(
      (w) => w.block?.kind === 'ResourcePool',
    );
    const operatorsConfigured =
      pool && pool.block && pool.block.kind === 'ResourcePool'
        ? (pool.block.params?.capacity ?? 0)
        : 0;
    const totalSmvMin = refModel.garmentTemplate.totalSmv;
    const isScenario = !!refModel.scenarios?.some(
      (s) => s.id === refCtx.variantKey,
    );
    const variant: ReferenceVariant =
      refCtx.variantKey === 'proposed' ? 'proposed' : 'baseline';
    const rows = compareToPaper({
      model: refModel,
      variant,
      scenarioId: isScenario ? refCtx.variantKey : undefined,
      observed: {
        throughputPerHr,
        operatorsConfigured,
        totalSmvMin,
        shiftMin: SHIFT_MIN,
      },
    });
    const variantLabel =
      refCtx.variantKey === 'baseline'
        ? 'Baseline'
        : refCtx.variantKey === 'proposed'
          ? 'Proposed'
          : refModel.scenarios?.find((s) => s.id === refCtx.variantKey)?.name ??
            refCtx.variantKey;
    return {
      rows,
      throughputPerHr,
      operatorsConfigured,
      variantLabel,
      variantKey: refCtx.variantKey,
    };
  }, [refModel, refCtx.variantKey, pmlSinkThroughput, pmlAnyObserved, pmlTwin]);

  // Period scaling for cumulative KPIs. Throughput is a rate and percentages
  // (efficiency, utilization) are intensive — they don't scale. Only OUTPUT
  // and other tally-style numbers multiply by working-day count. Sri Lankan
  // apparel convention: 1 shift/day, 6 working days/week, ~26 working days/month.
  const periodMultiplier = period === 'WEEK' ? 6 : period === 'MONTH' ? 26 : 1;
  const periodLabel = period === 'SHIFT' ? 'SHIFT' : period === 'DAY' ? 'DAY' : period === 'WEEK' ? 'WEEK' : 'MONTH';
  const scaledProducedMean = producedPieces * periodMultiplier;
  const scaledProducedStd = (runs > 1 ? kpiSource.producedPieces.std : 0) * periodMultiplier;
  // True when the headline tiles describe the wired factory rather than the
  // single-config Yamazumi run. Drives the sub-line copy below.
  const factoryScope = factoryAgg !== null;
  const factoryLineCount = perLineAggs.length;

  return (
    <div style={embedded
      ? { width:'100%', background: SW_COLORS.paperDeep, padding: 24 }
      : { width:'100%', height:'100%', overflow:'auto', background: SW_COLORS.paperDeep, padding: 24 }}>
      <SectionHeader
        kicker="Reports"
        title={tab === 'balance' ? 'Line balance' : tab === 'validation' ? 'Model validation' : 'Production performance'}
        sub={`${runs > 1 ? `${runs}-replication mean` : 'Single seed'} · 480-min shift${periodMultiplier > 1 ? ` × ${periodMultiplier} (${periodLabel.toLowerCase()})` : ''} · ${factoryScope ? `Factory of ${factoryLineCount} wired ${factoryLineCount === 1 ? 'line' : 'lines'}` : `${yamTemplate.name} · ${yamOperators} operators`} · ${skillEntries > 0 ? `${skillEntries} operations respect skill matrix` : 'baseline (no skill overrides)'} · seed ${runConfig.randomSeed}${runs > 1 ? `..${runConfig.randomSeed + runs - 1}` : ''}`}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color: SW_COLORS.muted, letterSpacing:'0.5px' }}>RUNS</span>
              <ToggleGroup value={String(runs)} onChange={(v) => setRuns(parseInt(v))} options={[
                { value: '1',  label: '1' },
                { value: '3',  label: '3' },
                { value: '5',  label: '5' },
                { value: '10', label: '10' },
              ]}/>
            </div>
            <Button variant="secondary" size="sm" icon="↻" onClick={() => setAgg(runReplications({ config: runConfig, replications: runs, simMinutes: SHIFT_MIN }))}>
              Re-run
            </Button>
            <Button variant="primary" size="sm" icon="✦"
              onClick={() => {
                // Append device wall-clock so the user can recognise this
                // save later; the "(device)" suffix calls out that the
                // timestamp is wall time, not sim/calendar time.
                const wallStamp = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const defaultName = `${yamTemplate.name} · ${yamOperators} ops · ${runs > 1 ? `${runs}× ` : ''}${wallStamp} (device)`;
                setSaveName(defaultName);
                setSaveNotes('');
                setSaveOpen(true);
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

      {/* ── In-page tabs ─────────────────────────────────────────────────
          Reports is the umbrella. Performance gives the headline KPIs;
          Line Balance gives the Yamazumi authoring surface; Validation
          shows how the model lines up with the reference paper / wired
          block graph. */}
      <ReportTabBar value={tab} onChange={setTab} hasReference={!!(refModel && refCtx.variantKey)} hasPml={pmlAnyObserved} />

      {/* ── Reference paper validation ───────────────────────────────────
          Visible only when the user has loaded a published case study into
          the active twin from the Simulation tab. Side-by-side paper KPIs
          vs. Stitchworks observed, with delta% and pass/fail badges. */}
      {tab === 'validation' && refModel && refCtx.variantKey && (
        <HideableBox style={{ marginBottom: 20 }}>
        <Card padding={20} style={{ borderLeft: `4px solid ${SW_COLORS.brand}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 12, flexWrap: 'wrap', paddingRight: 36 }}>
            <div>
              <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 800, color: SW_COLORS.brand, letterSpacing: '2px', marginBottom: 4 }}>
                📚 PAPER VALIDATION
              </div>
              <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900, color: SW_COLORS.ink }}>
                {refModel.title}
              </div>
              <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 4 }}>
                {refModel.authorYear} · variant <strong style={{ color: SW_COLORS.ink }}>{refValidation?.variantLabel ?? refCtx.variantKey}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                size="sm"
                icon="▶"
                onClick={() => {
                  runPmlOnTwin(pmlTwin, { writeKpiObserved: setKpiObserved });
                  setPmlRunBump((n) => n + 1);
                }}
              >
                Re-run PML
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { clearRefContext(); }}>
                Clear
              </Button>
            </div>
          </div>

          {!refValidation ? (
            <div style={{ padding: '14px 16px', border: `1px dashed ${SW_COLORS.line}`, borderRadius: 6, fontSize: 12, color: SW_COLORS.muted }}>
              Running first PML pass on the loaded reference twin…
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                <Stat label="OPERATORS (CFG)" value={refValidation.operatorsConfigured} unit="" color={SW_COLORS.steel} />
                <Stat label="OBSERVED" value={Math.round(refValidation.throughputPerHr * 8).toLocaleString()} unit="pcs/day" color={SW_COLORS.brand} />
                <Stat
                  label="PAPER THROUGHPUT"
                  value={
                    refValidation.rows.find((r) => r.label === 'Throughput')
                      ? Number(refValidation.rows.find((r) => r.label === 'Throughput')!.paper).toLocaleString()
                      : '—'
                  }
                  unit="pcs/day"
                  color={SW_COLORS.fabric}
                />
                <Stat
                  label="WITHIN ±10%"
                  value={refValidation.rows.every((r) => r.withinTolerance) ? '✓ PASS' : '⚠ DRIFT'}
                  unit=""
                  color={refValidation.rows.every((r) => r.withinTolerance) ? SW_COLORS.ok : SW_COLORS.alarm}
                />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SW_FONTS.mono, fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: `1px solid ${SW_COLORS.line}` }}>
                      <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em' }}>KPI</th>
                      <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em', textAlign: 'right' }}>PAPER</th>
                      <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em', textAlign: 'right' }}>STITCHWORKS</th>
                      <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em', textAlign: 'right' }}>Δ%</th>
                      <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em', textAlign: 'right' }}>±10%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refValidation.rows.map((r) => {
                      const tone = r.withinTolerance ? SW_COLORS.ok : SW_COLORS.alarm;
                      return (
                        <tr key={r.label} style={{ borderBottom: `1px solid ${SW_COLORS.line}` }}>
                          <td style={{ padding: '6px 8px', color: SW_COLORS.ink, fontWeight: 700 }}>{r.label}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: SW_COLORS.ink }}>
                            {Number(r.paper).toLocaleString()} {r.unit}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: SW_COLORS.ink }}>
                            {typeof r.observed === 'number' ? r.observed.toLocaleString() : r.observed} {r.unit}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: tone, fontWeight: 800 }}>
                            {r.deltaPct >= 0 ? '+' : ''}{r.deltaPct.toFixed(1)}%
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: tone, fontWeight: 800 }}>
                            {r.withinTolerance ? '✓' : '✗'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: SW_COLORS.muted, fontStyle: 'italic', lineHeight: 1.55 }}>
                Stitchworks uses mean SMV per op (deterministic); the paper fitted per-op stochastic distributions. Small drift is expected.
              </div>
            </>
          )}
        </Card>
        </HideableBox>
      )}

      {/* ── PML simulation report ───────────────────────────────────────
          Reads observed KPIs that the Builder's PML runner wrote onto
          each workstation. Lets the user re-run from this page so they
          don't have to bounce back to Builder for a quick check. */}
      {tab === 'validation' && (
      <HideableBox style={{ marginBottom: 20 }}>
      <Card padding={20} style={{ borderLeft: `4px solid ${SW_COLORS.brand}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 12, flexWrap: 'wrap', paddingRight: 36 }}>
          <div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900 }}>
              ⚙ PML SIMULATION
            </div>
            <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 2 }}>
              Block-graph DES over the active twin · {pmlTwin.workstations.length} blocks · {pmlTwin.connectors.length} connectors
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              size="sm"
              icon="▶"
              onClick={() => {
                runPmlOnTwin(pmlTwin, { writeKpiObserved: setKpiObserved });
                setPmlRunBump((n) => n + 1);
              }}
            >
              Run PML
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/builder')}>
              Open Builder
            </Button>
          </div>
        </div>

        {!pmlAnyObserved ? (
          <div
            style={{
              padding: '14px 16px',
              border: `1px dashed ${SW_COLORS.line}`,
              borderRadius: 6,
              fontSize: 12,
              color: SW_COLORS.muted,
            }}
          >
            No PML run on this twin yet. Click <strong style={{ color: SW_COLORS.brand }}>▶ Run PML</strong> to simulate the wired graph and populate per-block KPIs.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
              <Stat label="SINK THROUGHPUT" value={Math.round(pmlSinkThroughput).toLocaleString()} unit="pcs/hr" color={SW_COLORS.brand} />
              <Stat label="ACTIVE BLOCKS"   value={String(pmlBlocks.length)}                                  unit="" color={SW_COLORS.fabric} />
              <Stat label="BOTTLENECK"       value={pmlBottleneck ? (() => { const n = pmlBottleneck.ws.name.replace(/^\d+\.\s*/, ''); return n.length > 16 ? n.slice(0, 15) + '…' : n; })() : '—'}  unit=""        color={pmlBottleneck ? SW_COLORS.alarm : SW_COLORS.muted} />
              <Stat label="MAX UTIL"         value={Math.max(0, ...pmlBlocks.map((b) => b.util)).toFixed(0)}    unit="%"       color={SW_COLORS.thread} />
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: SW_FONTS.mono,
                  fontSize: 11,
                }}
              >
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: `1px solid ${SW_COLORS.line}` }}>
                    <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em' }}>BLOCK</th>
                    <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em' }}>KIND</th>
                    <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em' }}>ROLE</th>
                    <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em', textAlign: 'right' }}>PCS/HR</th>
                    <th style={{ padding: '6px 8px', fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '0.08em', textAlign: 'right' }}>UTIL</th>
                  </tr>
                </thead>
                <tbody>
                  {pmlBlocks.slice(0, 20).map((b) => (
                    <tr
                      key={b.ws.id}
                      style={{
                        borderBottom: `1px solid ${SW_COLORS.line}`,
                        background: b.bottleneck ? '#FFE5E5' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '6px 8px', color: SW_COLORS.ink, fontWeight: 700 }}>
                        {b.bottleneck && '◆ '}
                        {b.ws.name}
                      </td>
                      <td style={{ padding: '6px 8px', color: SW_COLORS.steel }}>{b.kind}</td>
                      <td style={{ padding: '6px 8px', color: SW_COLORS.steel }}>{b.role}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: SW_COLORS.ink }}>
                        {Math.round(b.throughput).toLocaleString()}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: SW_COLORS.steel }}>
                        {b.util > 0 ? `${b.util.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pmlBlocks.length > 20 && (
                <div style={{ marginTop: 6, fontSize: 11, color: SW_COLORS.muted, fontStyle: 'italic' }}>
                  +{pmlBlocks.length - 20} more blocks not shown
                </div>
              )}
            </div>
          </>
        )}
      </Card>
      </HideableBox>
      )}

      {tab === 'performance' && (
      <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        <HideableBox toggleSize={22} toggleOffset={6}>
          <KpiTile
            label={`OUTPUT / ${periodLabel}`}
            mean={scaledProducedMean}
            std={scaledProducedStd}
            unit="pcs"
            formatter={(v) => Math.round(v).toLocaleString()}
            color={SW_COLORS.brand}
            info={
              <KpiFormula
                formula="output = pieces produced in one 480-min shift × period multiplier"
                where={[
                  ['pieces produced', 'finished pieces that exited the last station of the line during the shift'],
                  ['period multiplier', `${periodLabel} → ×${periodMultiplier} (SHIFT ×1 · DAY ×1 · WEEK ×6 · MONTH ×26)`],
                ]}
                replication={runs > 1 ? `Mean across ${runs} replications (seeds ${runConfig.randomSeed}..${runConfig.randomSeed + runs - 1}); ± shows std of that mean.` : undefined}
              />
            }
          />
        </HideableBox>
        <HideableBox toggleSize={22} toggleOffset={6}>
          <KpiTile
            label="THROUGHPUT"
            mean={throughputPerHr}
            std={runs > 1 ? kpiSource.throughputPerHr.std : 0}
            unit="pcs/hr"
            formatter={(v) => Math.round(v).toLocaleString()}
            color={SW_COLORS.ok}
            info={
              <KpiFormula
                formula="throughput = pieces produced ÷ shift hours"
                where={[
                  ['shift hours', '480 simulated minutes ÷ 60 = 8 h'],
                  ['pieces produced', 'pieces exiting the line during the shift (post-warm-up)'],
                ]}
                replication={runs > 1 ? `Mean across ${runs} replications; ± shows std across runs.` : undefined}
              />
            }
          />
        </HideableBox>
        <HideableBox toggleSize={22} toggleOffset={6}>
          <KpiTile
            label="EFFICIENCY"
            mean={efficiency}
            std={runs > 1 ? kpiSource.efficiencyPct.std : 0}
            unit="%"
            formatter={(v) => v.toFixed(1)}
            color={efficiency >= 75 ? SW_COLORS.fabric : SW_COLORS.thread}
            info={
              <KpiFormula
                formula="efficiency = (Σ SAM earned ÷ Σ paid operator-minutes) × 100"
                where={[
                  ['SAM earned', 'pieces produced × per-operation SAM, summed over operations'],
                  ['paid operator-minutes', 'operators × shift minutes (480)'],
                ]}
                replication={runs > 1 ? `Mean across ${runs} replications; ± shows std across runs.` : undefined}
              />
            }
          />
        </HideableBox>
        <HideableBox toggleSize={22} toggleOffset={6}>
          <KpiTile
            label="MEAN LEAD"
            mean={meanLeadTime}
            std={runs > 1 ? kpiSource.meanLeadTime.std : 0}
            unit="min"
            formatter={(v) => v.toFixed(1)}
            color={SW_COLORS.bobbin}
            info={
              <KpiFormula
                formula="mean lead = average (exit-time − release-time) across finished bundles"
                where={[
                  ['release-time', 'sim-clock minute the bundle enters the first station'],
                  ['exit-time', 'sim-clock minute the bundle leaves the last station'],
                ]}
                note="Equivalent to Little's Law check: WIP ≈ throughput × lead-time."
                replication={runs > 1 ? `Mean across ${runs} replications; ± shows std across runs.` : undefined}
              />
            }
          />
        </HideableBox>
        <HideableBox toggleSize={22} toggleOffset={6}>
          <KpiTile
            label="WIP"
            mean={wipBundles}
            std={runs > 1 ? kpiSource.wipBundles.std : 0}
            unit="bundles"
            formatter={(v) => Math.round(v).toLocaleString()}
            color={SW_COLORS.warn}
            info={
              <KpiFormula
                formula="WIP = time-averaged number of bundles on the line"
                where={[
                  ['time-averaged', '∫ N(t) dt ÷ shift minutes, with N(t) = bundles released − bundles exited at sim-minute t'],
                ]}
                note="Counted in bundles, not pieces — multiply by bundle size for piece-WIP."
                replication={runs > 1 ? `Mean across ${runs} replications; ± shows std across runs.` : undefined}
              />
            }
          />
        </HideableBox>
        <HideableBox toggleSize={22} toggleOffset={6}>
          <KpiTile
            label="UTIL"
            mean={utilization * 100}
            std={runs > 1 ? kpiSource.utilization.std * 100 : 0}
            unit="%"
            formatter={(v) => v.toFixed(0)}
            color={SW_COLORS.thread}
            info={
              <KpiFormula
                formula="util = (Σ busy operator-minutes ÷ Σ paid operator-minutes) × 100"
                where={[
                  ['busy', 'operator processing a bundle (not idle, not blocked, not starved)'],
                  ['paid', 'operators × shift minutes (480)'],
                ]}
                note="Mean across stations — single bottleneck stations may sit near 100% while the line average is lower."
                replication={runs > 1 ? `Mean across ${runs} replications; ± shows std across runs.` : undefined}
              />
            }
          />
        </HideableBox>
      </div>

      {perLineAggs.length > 1 && factoryAgg && (
        <>
          <PerLineKpiTable rows={perLineAggs} factoryAgg={factoryAgg} periodLabel={periodLabel} periodMultiplier={periodMultiplier} />
          <HideableBox style={{ marginBottom: 20 }}>
            <Card padding={20}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, paddingRight: 36, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900 }}>PER-LINE OUTPUT OVER TIME</div>
                  <div style={{ fontSize: 12, color: SW_COLORS.muted }}>
                    Cumulative pieces produced per line, sampled every 5 sim-minutes and averaged across all {runs} replication{runs === 1 ? '' : 's'}.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, fontFamily: SW_FONTS.mono, fontWeight: 700, flexWrap: 'wrap' }}>
                  {perLineAggs.map((r) => (
                    <span key={r.line.id}>
                      <span style={{ color: DEPT_LINE_COLORS[r.line.color] ?? SW_COLORS.brand }}>■</span> {r.line.name}
                    </span>
                  ))}
                </div>
              </div>
              <MultiLineHistoryChart rows={perLineAggs} />
            </Card>
          </HideableBox>
        </>
      )}
      </>
      )}

      {/* Yamazumi — drag operations between operators to rebalance */}
      {tab === 'balance' && (
      <HideableBox style={{ marginBottom: 14 }}>
        <Card padding={20}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10, gap: 14, flexWrap: 'wrap', paddingRight: 36 }}>
            <div>
              <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900 }}>YAMAZUMI · LINE BALANCE</div>
              <div style={{ fontSize:12, color: SW_COLORS.muted }}>
                Operator-by-operation SMV stack with takt-line overlay. Drag any segment onto another operator's bar to rebalance manually. Bars over the takt line are bottlenecks.
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap: 14, flexWrap: 'wrap' }}>
              {/* Line presets — quick-load a wired line's garment + operator
                  target so the Yamazumi reflects the bulletin that line is
                  actually running. Without this the user has to re-derive
                  Line 2's setup from the LiveSim picker and type it in. */}
              {lineBuildsForReports.filter((lb) => lb.ok && lb.line.garmentId).length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>LOAD LINE</span>
                  {lineBuildsForReports.filter((lb) => lb.ok && lb.line.garmentId).map((lb) => {
                    const accent = DEPT_LINE_COLORS[lb.line.color] ?? SW_COLORS.brand;
                    const lineGarmentId = lb.line.garmentId!;
                    const isActive = yamGarment === lineGarmentId
                      && yamOperators === (lb.line.operatorTarget ?? yamOperators);
                    return (
                      <button
                        key={lb.line.id}
                        onClick={() => {
                          setYamGarment(lineGarmentId);
                          if (lb.line.operatorTarget) setYamOperators(lb.line.operatorTarget);
                        }}
                        title={`Set Yamazumi to ${lb.line.name}: garment "${garments.byId[lineGarmentId]?.name ?? lineGarmentId}"${lb.line.operatorTarget ? ` · ${lb.line.operatorTarget} operators` : ''}`}
                        style={{
                          padding: '4px 10px',
                          border: `1px solid ${isActive ? accent : SW_COLORS.line}`,
                          borderLeft: `4px solid ${accent}`,
                          background: isActive ? `${accent}22` : 'transparent',
                          borderRadius: SW_RADIUS.sm,
                          fontFamily: SW_FONTS.mono,
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '0.05em',
                          color: isActive ? '#fff' : SW_COLORS.ink,
                          cursor: 'pointer',
                        }}
                      >
                        {lb.line.name.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              )}
              <ToggleGroup value={yamGarment} onChange={setYamGarment} options={garments.all.map(g => ({ value: g.id, label: g.name.replace(/\s*\(.*\)/, '') }))}/>
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>OPERATORS</span>
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
      </HideableBox>
      )}

      {tab === 'performance' && (
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14 }}>
        <HideableBox>
          <Card padding={20}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:14, paddingRight: 36 }}>
              <div>
                <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900 }}>OUTPUT OVER TIME</div>
                <div style={{ fontSize:12, color: SW_COLORS.muted }}>
                  {factoryScope
                    ? `Single-line trace from ${yamTemplate.name} — see PER-LINE OUTPUT OVER TIME below for the wired factory's per-line curves.`
                    : 'Bundles produced per 5-min interval — sampled live from the engine.'}
                </div>
              </div>
              <div style={{ display:'flex', gap:14, fontSize:11, fontFamily: SW_FONTS.mono, fontWeight:700 }}>
                <span><span style={{ color: SW_COLORS.brand }}>■</span> Cumulative produced</span>
                <span><span style={{ color: SW_COLORS.bobbin }}>■</span> WIP</span>
              </div>
            </div>
            <KpiLineChart history={agg.firstHistory}/>
          </Card>
        </HideableBox>

        <HideableBox>
          <Card padding={20}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom: 6, paddingRight: 36 }}>BOTTLENECKS (LIVE)</div>
            <div style={{ fontSize: 11, color: SW_COLORS.muted, marginBottom: 10 }}>
              {factoryScope
                ? 'Top-queue stations across all wired lines, labelled with the line they belong to.'
                : `Top-queue stations on ${yamTemplate.name}.`}
            </div>
            {(() => {
              const stations = factoryScope
                ? perLineAggs.flatMap((r) => r.agg.firstStations.map((s) => ({ ...s, lineName: r.line.name })))
                : agg.firstStations.map((s) => ({ ...s, lineName: '' }));
              if (stations.length === 0) {
                return <div style={{ fontSize:12, color: SW_COLORS.muted }}>Sim has not run yet.</div>;
              }
              return stations
                .sort((a, b) => b.queueLen - a.queueLen)
                .slice(0, 6)
                .map((s, i) => (
                  <div key={`${s.lineName}::${s.opId}`} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderTop: i?`1px solid ${SW_COLORS.line}`:'none' }}>
                    <span style={{ flex:1, fontSize:12, fontWeight:600 }}>
                      <span style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, fontSize: 10, fontWeight: 700, marginRight: 6 }}>{s.opCode}</span>
                      {s.opName}
                      {s.lineName && (
                        <span style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, fontSize: 10, fontWeight: 600, marginLeft: 6 }}>· {s.lineName}</span>
                      )}
                    </span>
                    <span style={{ fontFamily: SW_FONTS.mono, fontSize:11, fontWeight:700, color: s.queueLen > 5 ? SW_COLORS.alarm : SW_COLORS.muted }}>Q={s.queueLen}</span>
                    <span style={{ fontFamily: SW_FONTS.mono, fontSize:11, fontWeight:700, color: SW_COLORS.thread }}>{(s.utilization * 100).toFixed(0)}%</span>
                  </div>
                ));
            })()}
          </Card>
        </HideableBox>
      </div>
      )}

      {tab === 'performance' && (
      <div style={{ marginBottom:14 }}>
        <HideableBox>
          <Card padding={20}>
            <div style={{ fontFamily: SW_FONTS.display, fontSize:14, fontWeight:900, marginBottom:14, paddingRight: 36 }}>BY SYSTEM</div>
            {[
              { k:'PBS',     v: 88, basePcs: 524, col: SW_COLORS.brand },
              { k:'Modular', v: 82, basePcs: 312, col: SW_COLORS.fabric },
              { k:'UPS',     v: 76, basePcs: 208, col: SW_COLORS.bobbin },
              { k:'Straight',v: 64, basePcs: 140, col: SW_COLORS.thread },
            ].map(r => ({ ...r, n: `${(r.basePcs * periodMultiplier).toLocaleString()} pcs` })).map(r => (
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
        </HideableBox>
      </div>
      )}

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <Button variant="secondary" icon="↓">Export PDF</Button>
        {!embedded && (
          <Button variant="dark" icon="✓" onClick={() => navigate('/builder')}>Back to builder</Button>
        )}
      </div>

      {saveOpen && (
        <SaveScenarioModal
          name={saveName}
          notes={saveNotes}
          onNameChange={setSaveName}
          onNotesChange={setSaveNotes}
          summary={{
            template: yamTemplate.name,
            operators: yamOperators,
            runs: agg.n,
            throughputPerHr: agg.throughputPerHr.mean,
            efficiencyPct: agg.efficiencyPct.mean,
          }}
          onCancel={() => setSaveOpen(false)}
          onConfirm={() => {
            const trimmed = saveName.trim();
            if (!trimmed) return;
            project.saveScenario({
              name: trimmed,
              notes: saveNotes.trim() || undefined,
              kpis: {
                producedPieces: agg.producedPieces.mean,
                throughputPerHr: agg.throughputPerHr.mean,
                efficiencyPct: agg.efficiencyPct.mean,
                meanLeadTime: agg.meanLeadTime.mean,
                utilization: agg.utilization.mean,
                wipBundles: agg.wipBundles.mean,
                bottleneckOpName: agg.bottleneckOpName,
                bottleneckQueue: agg.bottleneckQueue,
                replicationCount: agg.n,
                std: agg.n > 1 ? {
                  producedPieces: agg.producedPieces.std,
                  throughputPerHr: agg.throughputPerHr.std,
                  efficiencyPct: agg.efficiencyPct.std,
                  meanLeadTime: agg.meanLeadTime.std,
                  utilization: agg.utilization.std,
                  wipBundles: agg.wipBundles.std,
                } : undefined,
              },
            });
            setSaveOpen(false);
            navigate('/scenarios');
          }}
        />
      )}
    </div>
  );
}

type ReportTab = 'performance' | 'balance' | 'validation';

interface ReportTabBarProps {
  value: ReportTab;
  onChange: (next: ReportTab) => void;
  hasReference: boolean;
  hasPml: boolean;
}

/** Underline-style segmented tabs sitting under the Reports SectionHeader.
 *  The badge on the Validation tab tells the user when there's something
 *  to look at — a loaded reference paper, or observed PML KPIs. */
function ReportTabBar({ value, onChange, hasReference, hasPml }: ReportTabBarProps) {
  const tabs: { id: ReportTab; label: string; hint: string; badge?: string }[] = [
    { id: 'performance', label: 'Performance', hint: 'KPIs · output · efficiency' },
    { id: 'balance',     label: 'Line Balance', hint: 'Yamazumi · takt · efficiency' },
    {
      id: 'validation',
      label: 'Validation',
      hint: 'Reference paper · PML run',
      badge: hasReference ? 'PAPER' : hasPml ? 'PML' : undefined,
    },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        marginBottom: 18,
        borderBottom: `1px solid ${SW_COLORS.line}`,
      }}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = SW_COLORS.ink;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = SW_COLORS.muted;
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '10px 18px 12px',
              color: active ? SW_COLORS.ink : SW_COLORS.muted,
              fontFamily: SW_FONTS.body,
              fontSize: 13,
              fontWeight: active ? 800 : 600,
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              position: 'relative',
              transition: 'color 100ms',
            }}
          >
            <span>{t.label}</span>
            <span
              style={{
                fontFamily: SW_FONTS.mono,
                fontSize: 10,
                fontWeight: 600,
                color: active ? SW_COLORS.muted : SW_COLORS.faint,
                letterSpacing: '0.04em',
              }}
            >
              {t.hint}
            </span>
            {t.badge && (
              <span
                style={{
                  fontFamily: SW_FONTS.mono,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  background: SW_COLORS.brandLite,
                  color: SW_COLORS.brandDeep,
                  padding: '2px 5px',
                  borderRadius: 3,
                }}
              >
                {t.badge}
              </span>
            )}
            {active && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: -1,
                  height: 2,
                  background: SW_COLORS.brand,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Save-as-scenario dialog. Replaces the legacy `window.prompt()` call so the
 *  flow works inside embedded preview / iframe contexts that suppress native
 *  prompts. Lets the user edit the auto-generated name and add free-form notes
 *  before committing. */
interface SaveScenarioModalProps {
  name: string;
  notes: string;
  summary: {
    template: string;
    operators: number;
    runs: number;
    throughputPerHr: number;
    efficiencyPct: number;
  };
  onNameChange: (s: string) => void;
  onNotesChange: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function SaveScenarioModal({
  name,
  notes,
  summary,
  onNameChange,
  onNotesChange,
  onCancel,
  onConfirm,
}: SaveScenarioModalProps) {
  const canSave = name.trim().length > 0;
  return (
    <div
      role="dialog"
      aria-label="Save scenario"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 20, 25, 0.45)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 92%)',
          background: SW_COLORS.paper,
          borderRadius: 8,
          border: `1px solid ${SW_COLORS.line}`,
          boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${SW_COLORS.line}`,
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
          }}
        >
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900, letterSpacing: '0.1em' }}>
            ✦ SAVE SCENARIO
          </div>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted }}>
            {summary.template} · {summary.operators} ops · {summary.runs > 1 ? `${summary.runs}× replications` : 'single seed'}
          </div>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '1px' }}>
              NAME
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) onConfirm();
                if (e.key === 'Escape') onCancel();
              }}
              style={{
                padding: '8px 10px',
                border: `1px solid ${SW_COLORS.line}`,
                borderRadius: SW_RADIUS.sm,
                background: '#fff',
                fontFamily: SW_FONTS.body,
                fontSize: 13,
                color: SW_COLORS.ink,
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 800, color: SW_COLORS.muted, letterSpacing: '1px' }}>
              NOTES <span style={{ fontWeight: 500, opacity: 0.6 }}>(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={3}
              placeholder="What did you change vs. baseline? Any caveats worth remembering."
              style={{
                padding: '8px 10px',
                border: `1px solid ${SW_COLORS.line}`,
                borderRadius: SW_RADIUS.sm,
                background: '#fff',
                fontFamily: SW_FONTS.body,
                fontSize: 13,
                color: SW_COLORS.ink,
                resize: 'vertical',
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: 14, fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted }}>
            <span><b style={{ color: SW_COLORS.ink }}>{Math.round(summary.throughputPerHr).toLocaleString()}</b> pcs/hr</span>
            <span><b style={{ color: SW_COLORS.ink }}>{summary.efficiencyPct.toFixed(1)}%</b> efficiency</span>
          </div>
        </div>

        <div
          style={{
            padding: '12px 18px',
            borderTop: `1px solid ${SW_COLORS.line}`,
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="✦"
            onClick={onConfirm}
            disabled={!canSave}
          >
            Save scenario
          </Button>
        </div>
      </div>
    </div>
  );
}

interface KpiTileProps {
  label: string;
  mean: number;
  std: number;
  unit: string;
  formatter: (value: number) => string;
  color: string;
  info?: ReactNode;
}

/**
 * Per-line KPI table — surfaces a row per wired sewing line in twins that
 * carry more than one line. Lets the user see who's contributing what when
 * the aggregate tiles average across heterogeneous garments (e.g. Line 1
 * knit T-shirt + Line 2 woven shirt produce wildly different rates and a
 * single mean would hide that).
 */
function PerLineKpiTable({
  rows,
  factoryAgg,
  periodLabel,
  periodMultiplier,
}: {
  rows: Array<{ line: { id: string; name: string; color: string }; bundleSize: number; agg: AggregateKpis }>;
  /** Pre-computed factory aggregate (extensive sums + IE-weighted intensives).
   *  Sourced from the same helper that feeds the top KPI tiles so the FACTORY
   *  row never disagrees with the headline numbers. */
  factoryAgg: AggregateKpis;
  periodLabel: string;
  periodMultiplier: number;
}) {
  return (
    <Card padding={16} style={{ marginBottom: 20 }}>
      <SectionHeader title="PER LINE" sub="Replication-mean KPIs run independently on each wired sewing line. FACTORY row sums extensive KPIs (output, throughput, WIP) and weights intensives (efficiency by operator-minutes, util by operator count, lead time by pieces)." />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SW_FONTS.mono, fontSize: 12 }}>
          <thead>
            <tr style={{ color: SW_COLORS.muted, fontSize: 10, letterSpacing: '0.1em', textAlign: 'right' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>LINE</th>
              <th style={{ padding: '6px 8px', fontWeight: 700 }}>{`OUTPUT / ${periodLabel}`}</th>
              <th style={{ padding: '6px 8px', fontWeight: 700 }}>THROUGHPUT</th>
              <th style={{ padding: '6px 8px', fontWeight: 700 }}>EFFICIENCY</th>
              <th style={{ padding: '6px 8px', fontWeight: 700 }}>MEAN LEAD</th>
              <th style={{ padding: '6px 8px', fontWeight: 700 }}>WIP</th>
              <th style={{ padding: '6px 8px', fontWeight: 700 }}>UTIL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const accent = DEPT_LINE_COLORS[r.line.color] ?? SW_COLORS.brand;
              return (
                <tr key={r.line.id} style={{ borderTop: `1px solid ${SW_COLORS.line}` }}>
                  <td style={{ padding: '8px', textAlign: 'left' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 1, background: accent }} />
                      <span style={{ fontWeight: 800 }}>{r.line.name}</span>
                    </span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: SW_COLORS.brand, fontWeight: 800 }}>
                    {Math.round(r.agg.producedPieces.mean * periodMultiplier).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: SW_COLORS.ok, fontWeight: 800 }}>
                    {Math.round(r.agg.throughputPerHr.mean).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{r.agg.efficiencyPct.mean.toFixed(1)}%</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{r.agg.meanLeadTime.mean.toFixed(1)} min</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Math.round(r.agg.wipBundles.mean).toLocaleString()}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: SW_COLORS.thread, fontWeight: 800 }}>
                    {Math.round(r.agg.utilization.mean * 100)}%
                  </td>
                </tr>
              );
            })}
            <tr style={{ borderTop: `2px solid ${SW_COLORS.line}`, background: '#ffffff04' }}>
              <td style={{ padding: '8px', textAlign: 'left', fontWeight: 900, letterSpacing: '0.08em' }}>FACTORY</td>
              <td style={{ padding: '8px', textAlign: 'right', color: SW_COLORS.brand, fontWeight: 900 }}>
                {Math.round(factoryAgg.producedPieces.mean * periodMultiplier).toLocaleString()}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', color: SW_COLORS.ok, fontWeight: 900 }}>
                {Math.round(factoryAgg.throughputPerHr.mean).toLocaleString()}
              </td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{factoryAgg.efficiencyPct.mean.toFixed(1)}%</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{factoryAgg.meanLeadTime.mean > 0 ? `${factoryAgg.meanLeadTime.mean.toFixed(1)} min` : '—'}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{Math.round(factoryAgg.wipBundles.mean).toLocaleString()}</td>
              <td style={{ padding: '8px', textAlign: 'right', color: SW_COLORS.thread, fontWeight: 900 }}>
                {Math.round(factoryAgg.utilization.mean * 100)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Per-line cumulative-output chart. Overlays one stroke per sewing line,
 * each in its dept-colour accent, with Y measured in pieces (the engine
 * emits bundle-counted `produced`; we multiply by each line's bundleSize
 * so the unit matches the per-line table above).
 */
function MultiLineHistoryChart({
  rows,
}: {
  rows: Array<{ line: { id: string; name: string; color: string }; bundleSize: number; agg: AggregateKpis }>;
}) {
  const w = 600, h = 220;
  const padL = 36, padR = 8, padT = 8, padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const usable = rows.filter((r) => r.agg.averagedHistory.length >= 2);
  if (usable.length === 0) {
    return (
      <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SW_COLORS.muted, fontSize: 12 }}>
        Run a shift to see per-line output.
      </div>
    );
  }

  const maxT = Math.max(...usable.map((r) => r.agg.averagedHistory[r.agg.averagedHistory.length - 1].time));
  const maxPcs = Math.max(
    1,
    ...usable.map((r) => Math.max(...r.agg.averagedHistory.map((p) => p.produced * r.bundleSize))),
  );

  const xs = (t: number) => padL + (t / maxT) * innerW;
  const ys = (v: number) => padT + innerH - (v / maxPcs) * innerH;
  const xTicks = 5;
  const yTicks = 4;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%' }}>
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const v = (maxPcs / yTicks) * i;
        return (
          <g key={i}>
            <line x1={padL} y1={ys(v)} x2={w - padR} y2={ys(v)} stroke={SW_COLORS.line} />
            <text x={padL - 4} y={ys(v) + 3} textAnchor="end" fill={SW_COLORS.muted} fontSize="9" fontFamily={SW_FONTS.mono}>
              {Math.round(v).toLocaleString()}
            </text>
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
      {usable.map((r) => {
        const stroke = DEPT_LINE_COLORS[r.line.color] ?? SW_COLORS.brand;
        const d = r.agg.averagedHistory
          .map((p, i) => `${i ? 'L' : 'M'} ${xs(p.time)} ${ys(p.produced * r.bundleSize)}`)
          .join(' ');
        return <path key={r.line.id} d={d} fill="none" stroke={stroke} strokeWidth="2.5" />;
      })}
    </svg>
  );
}

/** Department-colour palette mirrored from Builder so per-line rows pick up
 *  the same accent the sewing-line strip uses in LiveSim. */
const DEPT_LINE_COLORS: Record<string, string> = {
  brand: SW_COLORS.brand,
  blue: SW_COLORS.fabric,
  green: SW_COLORS.ok,
  yellow: SW_COLORS.warn,
  red: SW_COLORS.alarm,
  steel: SW_COLORS.steel,
  bobbin: SW_COLORS.bobbin,
  thread: SW_COLORS.thread,
};

/** Renders the structured body of a KPI-tile info popover. */
function KpiFormula({
  formula,
  where,
  note,
  replication,
}: {
  formula: string;
  where?: [string, string][];
  note?: string;
  replication?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: SW_FONTS.mono, fontWeight: 700, color: SW_COLORS.ink }}>
        {formula}
      </div>
      {where && where.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: SW_COLORS.muted, textTransform: 'uppercase' }}>
            where
          </div>
          {where.map(([k, v]) => (
            <div key={k} style={{ fontSize: 11, color: SW_COLORS.steel }}>
              <span style={{ color: SW_COLORS.ink, fontWeight: 700 }}>{k}</span> — {v}
            </div>
          ))}
        </div>
      )}
      {note && (
        <div style={{ fontSize: 11, color: SW_COLORS.steel, fontStyle: 'italic' }}>{note}</div>
      )}
      {replication && (
        <div style={{ fontSize: 10, color: SW_COLORS.muted, borderTop: `1px solid ${SW_COLORS.line}`, paddingTop: 6 }}>
          {replication}
        </div>
      )}
    </div>
  );
}

/** Stat tile that gracefully shows ± std when std > 0. */
function KpiTile({ label, mean, std, unit, formatter, color, info }: KpiTileProps) {
  return (
    <Stat
      big
      label={label}
      value={
        <>
          {formatter(mean)}
          {std > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: SW_COLORS.muted, marginLeft: 4, fontFamily: SW_FONTS.mono }}>
              ±{formatter(std)}
            </span>
          )}
        </>
      }
      unit={unit}
      color={color}
      info={info}
    />
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

