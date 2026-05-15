import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag, Button, SectionHeader } from '../components';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import {
  REFERENCE_MODELS,
  type ReferenceModel,
  type ReferenceScenario,
} from '../domain/reference-models';
import {
  buildReferenceTwin,
  compareToPaper,
  type ReferenceVariant,
  type ValidationRow,
} from '../domain/reference-twin';
import { useTwin } from '../store/twin';
import { runPmlOnTwin } from '../simulation/pml-runner';

/**
 * Reference Models — sewing lines extracted from the literature.
 *
 * Each card surfaces the paper's case study so you can:
 *   • read the citation + setting + method,
 *   • inspect the operation bulletin the paper used,
 *   • see the baseline vs. proposed KPIs you should be able to reproduce in
 *     Stitchworks once you load the model.
 *
 * The corresponding markdown lives in `Literature/Reference Models/`.
 */
export function ReferenceModelsPage() {
  const [selectedSlug, setSelectedSlug] = useState<string>(REFERENCE_MODELS[0].slug);
  const selected = useMemo(
    () => REFERENCE_MODELS.find((m) => m.slug === selectedSlug) ?? REFERENCE_MODELS[0],
    [selectedSlug],
  );

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        background: SW_COLORS.paperDeep,
        padding: '24px 28px 80px',
      }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 11,
            fontWeight: 700,
            color: SW_COLORS.brand,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          LITERATURE · CASE STUDIES
        </div>
        <h1
          style={{
            fontFamily: SW_FONTS.display,
            fontSize: 36,
            fontWeight: 900,
            margin: 0,
            color: SW_COLORS.ink,
            letterSpacing: '-0.02em',
          }}
        >
          Reference Models
        </h1>
        <p
          style={{
            fontSize: 14,
            color: SW_COLORS.muted,
            marginTop: 8,
            maxWidth: 740,
            lineHeight: 1.55,
          }}
        >
          Sewing-line case studies extracted from peer-reviewed papers in the
          Literature folder. Each one is a real factory line you can rebuild in
          Stitchworks and verify against the paper's published KPIs.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '360px 1fr',
            gap: 18,
            marginTop: 24,
            alignItems: 'start',
          }}
        >
          {/* ── LEFT: paper list ─────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                fontFamily: SW_FONTS.mono,
                fontSize: 10,
                fontWeight: 700,
                color: SW_COLORS.muted,
                letterSpacing: '1.5px',
                marginBottom: 2,
              }}
            >
              {REFERENCE_MODELS.length} MODELS
            </div>
            {REFERENCE_MODELS.map((m) => (
              <PaperListCard
                key={m.slug}
                model={m}
                selected={m.slug === selected.slug}
                onSelect={() => setSelectedSlug(m.slug)}
              />
            ))}
          </div>

          {/* ── RIGHT: selected model detail ─────────────────────────── */}
          <ModelDetail model={selected} />
        </div>
      </div>
    </div>
  );
}

// ── List card ───────────────────────────────────────────────────────────────
function PaperListCard({
  model,
  selected,
  onSelect,
}: {
  model: ReferenceModel;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      hover
      onClick={onSelect}
      padding={14}
      accent={selected ? SW_COLORS.brand : undefined}
      style={{
        borderColor: selected ? SW_COLORS.brand : SW_COLORS.line,
        background: selected ? `${SW_COLORS.brand}08` : SW_COLORS.paper,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 10,
            fontWeight: 700,
            color: SW_COLORS.muted,
            letterSpacing: '1px',
          }}
        >
          {model.authorYear.toUpperCase()}
        </span>
        <Tag soft color={SW_COLORS.brand}>{model.operationCount} OPS</Tag>
      </div>
      <div
        style={{
          fontFamily: SW_FONTS.display,
          fontSize: 14,
          fontWeight: 800,
          color: SW_COLORS.ink,
          lineHeight: 1.25,
          marginBottom: 4,
        }}
      >
        {model.title}
      </div>
      <div style={{ fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.4 }}>
        {model.garment} · {model.baseline.operators} operators
      </div>
    </Card>
  );
}

// ── Detail panel ────────────────────────────────────────────────────────────
function ModelDetail({ model }: { model: ReferenceModel }) {
  const total = model.garmentTemplate.totalSmv;
  const sumOps = model.garmentTemplate.operations.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Headline card */}
      <Card padding={20}>
        <div
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 10,
            fontWeight: 700,
            color: SW_COLORS.brand,
            letterSpacing: '2px',
            marginBottom: 4,
          }}
        >
          {model.authorYear.toUpperCase()}
        </div>
        <h2
          style={{
            fontFamily: SW_FONTS.display,
            fontSize: 26,
            fontWeight: 900,
            margin: 0,
            color: SW_COLORS.ink,
            letterSpacing: '-0.01em',
          }}
        >
          {model.title}
        </h2>
        <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 8, lineHeight: 1.5 }}>
          {model.citation}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            marginTop: 18,
          }}
        >
          <Field label="Garment"  value={model.garment} />
          <Field label="Setting"  value={model.setting} />
          <Field label="Method"   value={model.method} />
          <Field
            label="Bulletin"
            value={
              sumOps === 0
                ? `${model.operationCount} ops · synthetic placeholder (see file)`
                : `${sumOps} ops · total SMV ${total.toFixed(2)} min`
            }
          />
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: SW_RADIUS.sm,
            background: `${SW_COLORS.brand}0c`,
            border: `1px solid ${SW_COLORS.brand}30`,
            fontSize: 12,
            lineHeight: 1.55,
            color: SW_COLORS.ink,
          }}
        >
          <strong>Why this model.</strong> {model.pitch}
        </div>
      </Card>

      {/* Baseline vs proposed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <KpiCard title="BASELINE" subtitle="as reported" kpis={model.baseline} accent={SW_COLORS.muted} />
        <KpiCard
          title="PROPOSED"
          subtitle={model.proposed ? "after method" : "—"}
          kpis={model.proposed ?? null}
          accent={SW_COLORS.brand}
        />
      </div>

      {/* Operations table */}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <SectionHeader title="Operation bulletin" subtitle={`${sumOps} operations · total ${total.toFixed(2)} min`} />
        {sumOps === 0 ? (
          <div style={{ padding: 18, fontSize: 12, color: SW_COLORS.muted, fontStyle: 'italic' }}>
            This paper does not enumerate the {model.operationCount} operations in its
            bulletin. The folder {model.literaturePath.replace('model.md', 'operations.json')} has a
            synthetic placeholder; load that to scaffold the line, then override SMVs with
            field-collected data.
          </div>
        ) : (
          <div style={{ maxHeight: 380, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: SW_COLORS.paperDeep, zIndex: 1 }}>
                <tr>
                  <Th>#</Th>
                  <Th>Operation</Th>
                  <Th align="right">SMV</Th>
                  <Th>Machine</Th>
                  <Th>Skill</Th>
                </tr>
              </thead>
              <tbody>
                {model.garmentTemplate.operations.map((op, i) => (
                  <tr key={op.id} style={{ borderTop: `1px solid ${SW_COLORS.line}` }}>
                    <Td><span style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.muted }}>{i + 1}</span></Td>
                    <Td>
                      <div style={{ fontWeight: 600, color: SW_COLORS.ink }}>{op.name}</div>
                      {op.notes && (
                        <div style={{ fontSize: 10, color: SW_COLORS.muted, marginTop: 2, fontStyle: 'italic' }}>
                          {op.notes}
                        </div>
                      )}
                    </Td>
                    <Td align="right">
                      <span style={{ fontFamily: SW_FONTS.mono, fontWeight: 700 }}>{op.smv.toFixed(3)}</span>
                    </Td>
                    <Td>
                      <Tag soft color={SW_COLORS.steel}>{op.machineCode}</Tag>
                    </Td>
                    <Td><span style={{ fontSize: 11, color: SW_COLORS.muted }}>{op.skill}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Build + validate */}
      <BuildAndValidateCard model={model} />

      {/* Per-scenario validation (only for multi-scenario papers like Kursun) */}
      {model.scenarios && model.scenarios.length > 0 && (
        <ScenariosCard model={model} />
      )}

      {/* Action footer */}
      <Card padding={16}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: SW_COLORS.muted, maxWidth: 560 }}>
            Full markdown writeup, citations and per-paper JSON in
            <code style={{ fontFamily: SW_FONTS.mono, fontSize: 11, marginLeft: 4 }}>
              {model.literaturePath}
            </code>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              try {
                navigator.clipboard?.writeText(
                  JSON.stringify(model.garmentTemplate, null, 2),
                );
                alert('Garment template JSON copied — paste into garments.ts to register it.');
              } catch {
                alert('Open the model.md / operations.json files in the Literature folder.');
              }
            }}
          >
            COPY TEMPLATE JSON
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Build + inline-validate panel ────────────────────────────────────────────
function BuildAndValidateCard({ model }: { model: ReferenceModel }) {
  const navigate = useNavigate();
  const loadCanonical = useTwin((s) => s.loadCanonical);
  const createScenarioFromCanonical = useTwin((s) => s.createScenarioFromCanonical);
  const setActiveScenario = useTwin((s) => s.setActiveScenario);

  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [validation, setValidation] = useState<{
    variant: ReferenceVariant;
    rows: ValidationRow[];
    throughputPerHr: number;
    bottleneckName: string | null;
    replications: number;
    seeds: number[];
  } | null>(null);

  const opsAvailable = model.garmentTemplate.operations.length > 0;

  /** Load BOTH variants into the twin store: canonical = baseline, then
   *  fork a scenario for each what-if (proposed and any per-scenario forks).
   *  Navigates to the Builder when done. */
  function handleBuildAndOpen() {
    const baseline = buildReferenceTwin(model, { variant: 'baseline' });
    if (!baseline) {
      setStatus('This paper has no enumerated ops — cannot build a twin yet.');
      return;
    }
    const r = loadCanonical(baseline);
    if (!r.ok) {
      setStatus(`Failed to load baseline twin: ${r.reason}`);
      return;
    }
    setStatus(null);

    // Helper that creates a scenario, then overwrites its twin payload with
    // the supplied build (so the operator pool reflects the paper's count
    // instead of mirroring the canonical baseline).
    function forkAsScenario(twin: ReturnType<typeof buildReferenceTwin>, name: string, notes: string) {
      if (!twin) return;
      const id = createScenarioFromCanonical({ name, notes, activate: false });
      useTwin.setState((s) => ({
        ...s,
        scenarios: s.scenarios.map((scn) =>
          scn.id === id
            ? { ...scn, twin: { ...twin, isCanonical: false, parentTwinId: s.canonical.id } }
            : scn,
        ),
      }));
    }

    // Multi-scenario papers (Kursun): fork one Stitchworks scenario per
    // published what-if so the user can flip between S1/S2/S3 in the
    // Builder's scenario picker.
    if (model.scenarios && model.scenarios.length > 0) {
      model.scenarios.forEach((s) => {
        forkAsScenario(
          buildReferenceTwin(model, { scenarioId: s.id }),
          `${s.id} — ${s.name} (${s.operators} ops)`,
          `Paper scenario ${s.id}: ${s.description} Paper-reported ${s.throughputPerDayPcs} pcs/day (+${s.upliftPct} %).`,
        );
      });
    } else if (model.proposed) {
      // Single-scenario fallback: just fork "Proposed".
      forkAsScenario(
        buildReferenceTwin(model, { variant: 'proposed' }),
        `Proposed (${model.proposed.operators} ops)`,
        `Auto-built proposed variant from ${model.authorYear}.`,
      );
    }

    setActiveScenario(null);
    navigate('/builder');
  }

  /** Run N replications of the chosen variant in-process and compute a
   *  side-by-side comparison with the paper. Keeps the user on this page
   *  so they don't have to context-switch to validate. */
  function handleRunValidation(variant: ReferenceVariant, replications = 5) {
    const twin = buildReferenceTwin(model, { variant });
    if (!twin) {
      setStatus('This paper has no enumerated ops — cannot validate yet.');
      return;
    }
    setRunning(true);
    setStatus(`Running ${replications} replications…`);

    // The engine is fast enough that running 5 seeds inline (no worker) is
    // imperceptible for a 21-op line. setTimeout 0 lets the spinner paint.
    setTimeout(() => {
      const seeds: number[] = [];
      let throughputSum = 0;
      let bottleneck: string | null = null;
      for (let i = 0; i < replications; i++) {
        const seed = (Date.now() + i * 7919) | 1;
        seeds.push(seed);
        const r = runPmlOnTwin(twin, {
          durationMin: 480,
          seed,
          samplePeriodMin: 0,
        });
        throughputSum += r.throughputPerHr;
        if (!bottleneck && r.bottleneckName) bottleneck = r.bottleneckName;
      }
      const meanThroughputPerHr = throughputSum / replications;
      const kpis = variant === 'proposed' && model.proposed ? model.proposed : model.baseline;
      const rows = compareToPaper({
        model,
        variant,
        observed: {
          throughputPerHr: meanThroughputPerHr,
          operatorsConfigured: kpis.operators,
          totalSmvMin: model.garmentTemplate.totalSmv,
          shiftMin: 480,
        },
      });
      setValidation({
        variant,
        rows,
        throughputPerHr: meanThroughputPerHr,
        bottleneckName: bottleneck,
        replications,
        seeds,
      });
      setStatus(null);
      setRunning(false);
    }, 0);
  }

  if (!opsAvailable) {
    return (
      <Card padding={16}>
        <div style={{ fontSize: 12, color: SW_COLORS.muted, fontStyle: 'italic' }}>
          This paper has no enumerated ops — Stitchworks cannot auto-build the
          twin yet. Once <code>operations.json</code> is filled in for
          {' '}<code>{model.literaturePath.replace('model.md', 'operations.json')}</code>,
          the Build + Validate actions will appear here.
        </div>
      </Card>
    );
  }

  return (
    <Card padding={18} accent={SW_COLORS.brand}>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          color: SW_COLORS.brand,
          letterSpacing: '2px',
          marginBottom: 4,
        }}
      >
        BUILD + VALIDATE
      </div>
      <div
        style={{
          fontFamily: SW_FONTS.display,
          fontSize: 18,
          fontWeight: 800,
          color: SW_COLORS.ink,
          letterSpacing: '-0.01em',
        }}
      >
        Reproduce this paper in Stitchworks
      </div>
      <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 4, lineHeight: 1.5 }}>
        One click materialises the {model.garmentTemplate.operations.length}-op
        bulletin into a runnable twin (Source → ops → Sink, operator pool sized
        to the paper). Run replications inline to verify our engine lands within
        ±10 % of the paper's KPIs.
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 14,
          alignItems: 'center',
        }}
      >
        <Button variant="primary" onClick={handleBuildAndOpen}>
          ◆ BUILD IN FACTORY BUILDER
        </Button>
        <Button
          variant="ghost"
          disabled={running}
          onClick={() => handleRunValidation('baseline', 5)}
        >
          {running && validation?.variant !== 'proposed' ? '⏳' : '▶'}
          {' '}VALIDATE BASELINE
        </Button>
        {model.proposed && (
          <Button
            variant="ghost"
            disabled={running}
            onClick={() => handleRunValidation('proposed', 5)}
          >
            {running && validation?.variant === 'proposed' ? '⏳' : '▶'}
            {' '}VALIDATE PROPOSED
          </Button>
        )}
        {status && (
          <span style={{ fontSize: 11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>
            {status}
          </span>
        )}
      </div>

      {validation && (
        <ValidationResult
          model={model}
          variant={validation.variant}
          rows={validation.rows}
          throughputPerHr={validation.throughputPerHr}
          bottleneckName={validation.bottleneckName}
          replications={validation.replications}
        />
      )}
    </Card>
  );
}

// ── Multi-scenario card ─────────────────────────────────────────────────────
// Shown only for papers that report multiple what-if scenarios (e.g. Kursun
// 2009 with S1/S2/S3). Each row is a one-click validate against that
// scenario's published throughput.
function ScenariosCard({ model }: { model: ReferenceModel }) {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<
    Record<
      string,
      {
        rows: ValidationRow[];
        throughputPerHr: number;
        bottleneckName: string | null;
      } | undefined
    >
  >({});

  if (!model.scenarios || model.scenarios.length === 0) return null;
  const opsAvailable = model.garmentTemplate.operations.length > 0;

  function handleValidateScenario(scenario: ReferenceScenario, replications = 5) {
    if (!opsAvailable) return;
    const twin = buildReferenceTwin(model, { scenarioId: scenario.id });
    if (!twin) return;
    setRunning(scenario.id);

    setTimeout(() => {
      let throughputSum = 0;
      let bottleneck: string | null = null;
      for (let i = 0; i < replications; i++) {
        const seed = (Date.now() + i * 7919) | 1;
        const r = runPmlOnTwin(twin, { durationMin: 480, seed, samplePeriodMin: 0 });
        throughputSum += r.throughputPerHr;
        if (!bottleneck && r.bottleneckName) bottleneck = r.bottleneckName;
      }
      const meanThroughputPerHr = throughputSum / replications;
      const rows = compareToPaper({
        model,
        variant: 'proposed',
        scenarioId: scenario.id,
        observed: {
          throughputPerHr: meanThroughputPerHr,
          operatorsConfigured: scenario.operators,
          totalSmvMin: model.garmentTemplate.totalSmv,
          shiftMin: 480,
        },
      });
      setResults((prev) => ({
        ...prev,
        [scenario.id]: { rows, throughputPerHr: meanThroughputPerHr, bottleneckName: bottleneck },
      }));
      setRunning(null);
    }, 0);
  }

  return (
    <Card padding={18} accent={SW_COLORS.thread}>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          color: SW_COLORS.thread,
          letterSpacing: '2px',
          marginBottom: 4,
        }}
      >
        WHAT-IF SCENARIOS · {model.scenarios.length} STEPS
      </div>
      <div
        style={{
          fontFamily: SW_FONTS.display,
          fontSize: 18,
          fontWeight: 800,
          color: SW_COLORS.ink,
          letterSpacing: '-0.01em',
        }}
      >
        Iterative debottlenecking — replicate each step
      </div>
      <div style={{ fontSize: 12, color: SW_COLORS.muted, marginTop: 4, lineHeight: 1.5 }}>
        The paper adds operators at the running bottleneck and reports the
        new daily output each time. Each row below validates Stitchworks'
        throughput against that step's published figure.
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {model.scenarios.map((s) => {
          const r = results[s.id];
          const accent = s.isBest ? SW_COLORS.brand : SW_COLORS.thread;
          return (
            <div
              key={s.id}
              style={{
                border: `1px solid ${s.isBest ? SW_COLORS.brand + '50' : SW_COLORS.line}`,
                background: s.isBest ? `${SW_COLORS.brand}06` : SW_COLORS.paper,
                borderRadius: SW_RADIUS.sm,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontFamily: SW_FONTS.mono,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '2px',
                        color: accent,
                        padding: '2px 7px',
                        border: `1px solid ${accent}`,
                        borderRadius: 4,
                      }}
                    >
                      {s.id}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: SW_COLORS.ink }}>
                      {s.name}
                    </span>
                    {s.isBest && <Tag soft color={SW_COLORS.brand}>HEADLINE</Tag>}
                  </div>
                  <div style={{ fontSize: 12, color: SW_COLORS.muted, lineHeight: 1.45 }}>
                    {s.description}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 14,
                      fontFamily: SW_FONTS.mono,
                      fontSize: 11,
                      color: SW_COLORS.muted,
                    }}
                  >
                    <span>
                      <strong style={{ color: SW_COLORS.ink }}>{s.operators}</strong> operators
                    </span>
                    <span>
                      <strong style={{ color: SW_COLORS.ink }}>{s.throughputPerDayPcs}</strong> pcs/day (paper)
                    </span>
                    <span style={{ color: '#1a8a3f' }}>+{s.upliftPct} % vs. baseline</span>
                    {s.reinforcedOpIndices && (
                      <span>reinforced ops: {s.reinforcedOpIndices.join(', ')}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant={s.isBest ? 'primary' : 'ghost'}
                  disabled={running !== null || !opsAvailable}
                  onClick={() => handleValidateScenario(s, 5)}
                >
                  {running === s.id ? '⏳' : '▶'} VALIDATE {s.id}
                </Button>
              </div>

              {r && (
                <ScenarioResultRow
                  scenario={s}
                  rows={r.rows}
                  observedPerHr={r.throughputPerHr}
                  bottleneckName={r.bottleneckName}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ScenarioResultRow({
  scenario,
  rows,
  observedPerHr,
  bottleneckName,
}: {
  scenario: ReferenceScenario;
  rows: ValidationRow[];
  observedPerHr: number;
  bottleneckName: string | null;
}) {
  const throughputRow = rows.find((r) => r.label === 'Throughput');
  const ok = throughputRow ? throughputRow.withinTolerance : true;
  const tone = ok ? '#1a8a3f' : SW_COLORS.thread;
  const observedPerDay = Math.round(observedPerHr * 8);
  const deltaPct = throughputRow?.deltaPct ?? 0;
  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: `1px dashed ${SW_COLORS.line}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'center',
        fontFamily: SW_FONTS.mono,
        fontSize: 11,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          letterSpacing: '1.5px',
          color: tone,
        }}
      >
        {ok ? '✓ WITHIN ±10 %' : '⚠ DRIFTED'}
      </span>
      <span style={{ color: SW_COLORS.muted }}>
        paper <strong style={{ color: SW_COLORS.ink }}>{scenario.throughputPerDayPcs}</strong>
      </span>
      <span style={{ color: SW_COLORS.muted }}>
        stitchworks <strong style={{ color: SW_COLORS.ink }}>{observedPerDay}</strong> pcs/day
      </span>
      <span style={{ color: tone, fontWeight: 700 }}>
        {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)} %
      </span>
      {bottleneckName && (
        <span style={{ color: SW_COLORS.muted }}>⚠ bottleneck: {bottleneckName}</span>
      )}
    </div>
  );
}

// ── Validation result table ──────────────────────────────────────────────────
function ValidationResult({
  model,
  variant,
  rows,
  throughputPerHr,
  bottleneckName,
  replications,
}: {
  model: ReferenceModel;
  variant: ReferenceVariant;
  rows: ValidationRow[];
  throughputPerHr: number;
  bottleneckName: string | null;
  replications: number;
}) {
  const allWithin = rows.every((r) => r.withinTolerance);
  const headlineColor = allWithin ? '#1a8a3f' : SW_COLORS.thread;
  const variantLabel = variant === 'proposed' ? 'Proposed' : 'Baseline';

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: SW_RADIUS.sm,
        background: SW_COLORS.paperDeep,
        border: `1px solid ${SW_COLORS.line}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 10,
              fontWeight: 700,
              color: headlineColor,
              letterSpacing: '2px',
            }}
          >
            {allWithin ? '✓ WITHIN ±10 %' : '⚠ DRIFTED'} · {variantLabel.toUpperCase()}
          </div>
          <div
            style={{
              fontFamily: SW_FONTS.display,
              fontSize: 16,
              fontWeight: 800,
              color: SW_COLORS.ink,
              marginTop: 2,
            }}
          >
            {model.authorYear} replication ({replications} seeds, 480 min/shift)
          </div>
        </div>
        <div style={{ fontSize: 11, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono }}>
          mean {throughputPerHr.toFixed(1)} pcs/hr
          {bottleneckName && <> · ⚠ bottleneck: {bottleneckName}</>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <Th>KPI</Th>
            <Th align="right">Paper</Th>
            <Th align="right">Stitchworks</Th>
            <Th align="right">Δ %</Th>
            <Th>Within ±10 %</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = r.withinTolerance ? '#1a8a3f' : SW_COLORS.thread;
            return (
              <tr key={r.label} style={{ borderTop: `1px solid ${SW_COLORS.line}` }}>
                <Td>
                  <span style={{ fontWeight: 700, color: SW_COLORS.ink }}>{r.label}</span>
                </Td>
                <Td align="right">
                  <span style={{ fontFamily: SW_FONTS.mono }}>
                    {r.paper.toLocaleString()} {r.unit}
                  </span>
                </Td>
                <Td align="right">
                  <span style={{ fontFamily: SW_FONTS.mono, fontWeight: 700 }}>
                    {typeof r.observed === 'number' ? r.observed.toLocaleString() : r.observed} {r.unit}
                  </span>
                </Td>
                <Td align="right">
                  <span style={{ fontFamily: SW_FONTS.mono, color: tone, fontWeight: 700 }}>
                    {r.deltaPct >= 0 ? '+' : ''}
                    {r.deltaPct.toFixed(1)} %
                  </span>
                </Td>
                <Td>
                  <span style={{ color: tone, fontWeight: 700, fontFamily: SW_FONTS.mono }}>
                    {r.withinTolerance ? '✓' : '✗'}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 10, fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.55 }}>
        Stitchworks uses the mean SMV per op (deterministic) — the paper fitted
        per-op stochastic distributions (TRIA / NORM / BETA / WEIB / LOGN /
        ERLA). Small drift is expected; large drift means the graph layout or
        operator pool is mis-sized.
      </div>
    </div>
  );
}

// ── tiny atoms ──────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          color: SW_COLORS.muted,
          letterSpacing: '1px',
          marginBottom: 3,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: SW_COLORS.ink, lineHeight: 1.4 }}>
        {value}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  subtitle,
  kpis,
  accent,
}: {
  title: string;
  subtitle: string;
  kpis: { operators: number; throughputPerDayPcs?: number; throughputPerShiftPcs?: number; lineEfficiencyPct?: number; notes?: string } | null;
  accent: string;
}) {
  return (
    <Card padding={16} accent={accent}>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          color: accent,
          letterSpacing: '2px',
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 11, color: SW_COLORS.muted, marginBottom: 12 }}>{subtitle}</div>
      {!kpis ? (
        <div style={{ fontSize: 12, color: SW_COLORS.muted, fontStyle: 'italic' }}>
          Not reported in this paper.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Metric label="OPERATORS" value={String(kpis.operators)} />
            <Metric
              label="THROUGHPUT"
              value={
                kpis.throughputPerDayPcs
                  ? `${kpis.throughputPerDayPcs} / day`
                  : kpis.throughputPerShiftPcs
                    ? `${kpis.throughputPerShiftPcs} / shift`
                    : '—'
              }
            />
            <Metric
              label="LINE EFF."
              value={kpis.lineEfficiencyPct ? `${kpis.lineEfficiencyPct.toFixed(2)} %` : '—'}
            />
          </div>
          {kpis.notes && (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: SW_COLORS.muted,
                lineHeight: 1.5,
              }}
            >
              {kpis.notes}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 9,
          fontWeight: 700,
          color: SW_COLORS.muted,
          letterSpacing: '1px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: SW_FONTS.display,
          fontSize: 18,
          fontWeight: 900,
          color: SW_COLORS.ink,
          letterSpacing: '-0.01em',
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        fontFamily: SW_FONTS.mono,
        fontSize: 10,
        fontWeight: 700,
        color: SW_COLORS.muted,
        letterSpacing: '1px',
        padding: '10px 12px',
        borderBottom: `1px solid ${SW_COLORS.line}`,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ padding: '8px 12px', textAlign: align, verticalAlign: 'top' }}>{children}</td>
  );
}
