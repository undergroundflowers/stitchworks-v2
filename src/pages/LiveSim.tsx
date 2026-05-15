/**
 * Live Simulation — drives the discrete-event engine in real time, with three
 * synchronised views over the same engine state:
 *
 *   • ISO 3D — isometric line with cuboid sewing-machine sprites, walking
 *     operators, queue stacks, conveyor + WIP dots, bottleneck flag.
 *   • TOP 2D — flat blueprint with the operation flow + per-station card.
 *   • HEAT  — radial-gradient heat blobs sized by queue + utilisation.
 *
 * The engine is unchanged: SimEngine ticks against (garment, operators,
 * efficiency); the views are pure visualisations of `SimState.stations`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Button, ToggleGroup, HudSelect, TimeDisplay } from '../components';
import {
  buildSimConfig,
  efficiencyFromSkillMatrix,
  useSim,
  type StationView,
} from '../simulation';
import {
  fmtModelTime,
  fmtModelCompact,
  fmtCalendar,
  fmtCalendarCompact,
  fmtWallClock,
  simDayNumber,
  shiftProgressPct,
  unitToSeconds,
} from '../simulation/timeUnit';
import { useProject, useGarments } from '../store';
import { isoProj, ptsToStr, CuboidFaces, SW_PAL, shade, PRODUCTION_SYSTEMS, MACHINE_CATALOG, type MachineCode, type ProductionSystem } from '../domain';
import { useTwin, selectActiveTwin } from '../store/twin';
import { runPmlOnTwin, type RunReport } from '../simulation/pml-runner';
import { getBlockSpec, apparelRoleFor } from '../domain/pml';
import type { Workstation } from '../domain/twin';
import { REFERENCE_MODELS, REFERENCE_MODELS_BY_SLUG, type ReferenceModel } from '../domain/reference-models';
import { buildReferenceTwin, buildGarmentTwin } from '../domain/reference-twin';
import type { GarmentTemplate } from '../domain/garments';
import { useReferenceContext } from '../store/reference';

/**
 * Resolve a station's canonical visual asset from `MACHINE_CATALOG`. This
 * is the single source of truth for what each workstation should *look*
 * like — colour and glyph come from the machine type, never from live
 * state. ISO, TOP and LOGIC views all funnel through this helper so an
 * SNL bobbin looks the same everywhere it appears.
 */
function stationAsset(machineCode: string | undefined): {
  color: string;
  glyph: string;
  label: string;
  isManual: boolean;
} {
  const spec = machineCode
    ? MACHINE_CATALOG[machineCode as MachineCode]
    : undefined;
  if (!spec) {
    // Unknown machine type — neutral steel placeholder. Keeps the
    // workstation visually distinguishable from typed peers.
    return { color: SW_PAL.steel, glyph: '?', label: machineCode ?? 'UNKNOWN', isManual: false };
  }
  return {
    color: spec.color,
    glyph: spec.icon,
    label: spec.shortName,
    isManual: !!spec.isManual,
  };
}

/** Total operator pool count for a (paper, variant/scenario) selection.
 *  Falls back to the baseline op count if the chosen variant key is unknown. */
function variantOperatorCount(model: ReferenceModel, key: string): number {
  if (key === 'baseline') return model.baseline.operators;
  if (key === 'proposed') return model.proposed?.operators ?? model.baseline.operators;
  const scenario = model.scenarios?.find((s) => s.id === key);
  return scenario?.operators ?? model.baseline.operators;
}

type SimView = 'iso' | 'top' | 'heat' | 'logic' | 'pml';

interface SimHudStatProps {
  label: string;
  value: number | string;
  unit: string;
  color: string;
}

export function LiveSimPage() {
  const navigate = useNavigate();
  const project = useProject();
  const garments = useGarments();
  const [garmentId, setGarmentId] = useState<string>(project.selectedGarmentId);
  const [operators, setOperators] = useState<number>(project.defaultOperators);
  const [view, setView] = useState<SimView>('iso');

  // ── Reference-model picker state ────────────────────────────────────────
  // Lets the user load any published case study (paper × variant/scenario)
  // straight into the PML view for a side-by-side comparison vs. the paper.
  // Read first so we can fold it into the legacy SimEngine inputs below —
  // that way the ISO/TOP/HEAT/LOGIC views also reflect the loaded reference.
  const loadCanonical = useTwin((s) => s.loadCanonical);
  const refCtx = useReferenceContext();
  const setRefContext = useReferenceContext((s) => s.setContext);
  const clearRefContext = useReferenceContext((s) => s.clear);

  // When a reference is loaded, its garment bulletin + operator pool drive the
  // legacy SimEngine too — otherwise the ISO/TOP/HEAT/LOGIC views would still
  // show the project's default garment, which is jarring after LOAD & SIMULATE.
  const refOverride = useMemo(() => {
    if (!refCtx.slug || !refCtx.variantKey) return null;
    const model = REFERENCE_MODELS_BY_SLUG[refCtx.slug];
    if (!model) return null;
    return {
      garment: model.garmentTemplate,
      operators: variantOperatorCount(model, refCtx.variantKey),
    };
  }, [refCtx.slug, refCtx.variantKey]);

  const garment = refOverride?.garment ?? (garments.byId[garmentId] ?? garments.all[0]);
  const effectiveOperators = refOverride?.operators ?? operators;

  // Production-system bundle size — picked up from the Orders wizard. PBS
  // batches 30, modular/UPS/make-through run piece-by-piece (size 1), etc.
  // Reference-paper runs keep the paper's own bundle size, so they're
  // unaffected by this hook-up.
  const productionSystemId = project.selectedProductionSystem;
  const productionSystemDef = PRODUCTION_SYSTEMS[productionSystemId];
  const systemBundleSize = refOverride
    ? undefined
    : productionSystemDef.typicalBatchSize;

  const opEfficiency = useMemo(
    () => efficiencyFromSkillMatrix(project.skillMatrix, garment.operations),
    [project.skillMatrix, garment],
  );

  const config = useMemo(
    () => buildSimConfig({
      garment,
      operators: effectiveOperators,
      opEfficiency,
      bundleSize: systemBundleSize,
      modelTimeUnit: project.time.modelTimeUnit,
    }),
    [garment, effectiveOperators, opEfficiency, systemBundleSize, project.time.modelTimeUnit],
  );

  const { state, playing, speed, setPlaying, setSpeed, reset, step } = useSim(config);

  const [refSlug, setRefSlug] = useState<string>(
    refCtx.slug ?? REFERENCE_MODELS[0].slug,
  );
  const [refVariantKey, setRefVariantKey] = useState<string>(
    refCtx.variantKey ?? 'baseline',
  );
  const [refLoadFlash, setRefLoadFlash] = useState<string | null>(null);

  const refModel: ReferenceModel = useMemo(
    () =>
      REFERENCE_MODELS.find((m) => m.slug === refSlug) ?? REFERENCE_MODELS[0],
    [refSlug],
  );

  // Variant menu derived from the chosen paper.
  const variantOptions = useMemo(() => {
    const opts: { key: string; label: string; tag: string }[] = [
      {
        key: 'baseline',
        label: `Baseline · ${refModel.baseline.operators} ops${
          refModel.baseline.throughputPerDayPcs
            ? ` · ${refModel.baseline.throughputPerDayPcs}/day`
            : ''
        }`,
        tag: 'BASE',
      },
    ];
    if (refModel.proposed) {
      opts.push({
        key: 'proposed',
        label: `Proposed · ${refModel.proposed.operators} ops${
          refModel.proposed.throughputPerDayPcs
            ? ` · ${refModel.proposed.throughputPerDayPcs}/day`
            : ''
        }`,
        tag: 'PROP',
      });
    }
    if (refModel.scenarios) {
      for (const s of refModel.scenarios) {
        opts.push({
          key: s.id,
          label: `${s.id} · ${s.name} · ${s.operators} ops · ${s.throughputPerDayPcs}/day (+${s.upliftPct}%)`,
          tag: s.id,
        });
      }
    }
    return opts;
  }, [refModel]);

  // Reset variant when paper changes if previous key is no longer valid.
  useEffect(() => {
    if (!variantOptions.some((o) => o.key === refVariantKey)) {
      setRefVariantKey(variantOptions[0].key);
    }
  }, [variantOptions, refVariantKey]);

  function handleLoadReference() {
    const opts =
      refVariantKey === 'baseline' || refVariantKey === 'proposed'
        ? { variant: refVariantKey as 'baseline' | 'proposed' }
        : { scenarioId: refVariantKey };
    const twin = buildReferenceTwin(refModel, opts);
    if (!twin) {
      setRefLoadFlash('This paper has no enumerated ops — twin not built.');
      return;
    }
    const r = loadCanonical(twin);
    if (!r.ok) {
      setRefLoadFlash(`Could not load twin: ${r.reason}`);
      return;
    }
    setRefContext({ slug: refModel.slug, variantKey: refVariantKey });
    setView('pml');
    const variantLabel =
      refVariantKey === 'baseline'
        ? 'Baseline'
        : refVariantKey === 'proposed'
          ? 'Proposed'
          : refVariantKey;
    setRefLoadFlash(`Loaded · ${refModel.authorYear} · ${variantLabel}`);
    setTimeout(() => setRefLoadFlash(null), 3000);
  }

  function handleClearReference() {
    clearRefContext();
    setRefLoadFlash(null);
  }

  const refLoadedLabel =
    refCtx.slug && refCtx.variantKey
      ? (() => {
          const m = REFERENCE_MODELS.find((x) => x.slug === refCtx.slug);
          if (!m) return null;
          const vlabel =
            refCtx.variantKey === 'baseline'
              ? 'Baseline'
              : refCtx.variantKey === 'proposed'
                ? 'Proposed'
                : refCtx.variantKey;
          return `${m.authorYear} · ${vlabel}`;
        })()
      : null;

  // Time displays — see `lib/timeUnit`. Three labelled kinds replace the
  // old `hr = 8 + floor(t/60)` fake clock that conflated model time with
  // calendar HH:MM. DAY N is derived from model time (not wall clock) so
  // it stays correct across paused sessions.
  const unit = project.time.modelTimeUnit;
  const dayN = simDayNumber(state.time, unit, project.time.shiftDurationMin);
  const shiftPct = shiftProgressPct(state.time, unit, project.time.shiftDurationMin);
  const modelStr = fmtModelTime(state.time, unit);
  const calStr = fmtCalendar(state.time, unit, project.time.startDate, project.units.dateFormat);

  // Wall clock ticks every second for the corner pin. Recompute via a
  // local interval — does NOT affect the engine, which is wall-clock-free.
  const [wallNow, setWallNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setWallNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const wallStr = fmtWallClock(wallNow);

  // Event log can display model time ("t = 83 min", compact) or its
  // calendar projection ("09:23 Mon 18 May"). User-toggleable so power users
  // can pick whichever helps them reason about the rolling event feed.
  const [eventTimeKind, setEventTimeKind] = useState<'model' | 'cal'>('model');

  const throughputPerHr =
    state.history.length > 0
      ? state.history[state.history.length - 1].throughputPerHr * config.bundleSize
      : 0;

  const efficiencyPct = Math.round(state.utilization * 100);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto',
        background: SW_COLORS.ink,
        color: SW_COLORS.paper,
      }}
    >
      {/* HUD */}
      <div
        style={{
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          borderBottom: '1px solid #ffffff15',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: playing ? SW_COLORS.ok : SW_COLORS.warn,
              boxShadow: playing ? `0 0 12px ${SW_COLORS.ok}` : 'none',
              animation: playing ? 'sim-pulse 1s infinite' : undefined,
            }}
          />
          <span style={{ fontFamily: SW_FONTS.mono, fontSize: 12, fontWeight: 700, letterSpacing: '2px' }}>
            {playing ? 'RUNNING' : 'PAUSED'}
          </span>
        </div>
        <div style={{ width: 1, height: 20, background: '#ffffff20' }} />
        {/* Three labelled clocks — model (sim t), calendar (projection), wall (device). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TimeDisplay
            kind="MODEL"
            surface="dark"
            primarySize={18}
            primary={modelStr}
            secondary={`day ${dayN} · ${Math.round(shiftPct)}% of shift`}
            compact
          />
          <TimeDisplay
            kind="CAL"
            surface="dark"
            primarySize={12}
            primary={calStr}
            compact
          />
        </div>
        <TimeDisplay kind="WALL" surface="dark" primarySize={12} primary={wallStr} compact />

        {/* View toggle */}
        <div style={{ width: 1, height: 20, background: '#ffffff20' }} />
        <div style={{ display: 'flex', gap: 2, background: '#ffffff08', padding: 2, borderRadius: 6 }}>
          {(['iso', 'top', 'heat', 'logic', 'pml'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? SW_COLORS.brand : 'transparent',
                color: view === v ? '#fff' : '#ffffffaa',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 14px',
                fontFamily: SW_FONTS.display,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.1em',
                borderRadius: 4,
              }}
              title={v === 'pml' ? 'PML — block-graph snapshot of the active twin' : undefined}
            >
              {v === 'iso' ? 'ISO 3D' : v === 'top' ? 'TOP 2D' : v === 'heat' ? 'HEAT' : v === 'logic' ? 'LOGIC' : '⚙ PML'}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: '#ffffff20' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: SW_FONTS.body, fontSize: 11 }}>
          <span style={{ color: '#ffffff80', fontFamily: SW_FONTS.mono, fontWeight: 700 }}>GARMENT</span>
          <HudSelect
            value={refOverride ? '__ref__' : garmentId}
            minWidth={220}
            mono
            options={[
              ...(refOverride
                ? [{
                    value: '__ref__',
                    label: refOverride.garment.name.replace(/\s*\(.*\)/, ''),
                    tag: 'REF',
                    disabled: true,
                  }]
                : []),
              ...garments.all.map((g) => ({
                value: g.id,
                label: g.name.replace(/\s*\(.*\)/, ''),
              })),
            ]}
            onChange={(id) => {
              if (id === '__ref__') return;
              // Manual garment pick overrides any active reference selection,
              // so the dropdown stays authoritative.
              if (refOverride) clearRefContext();
              setGarmentId(id);
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: SW_FONTS.body, fontSize: 11 }}>
          <span style={{ color: '#ffffff80', fontFamily: SW_FONTS.mono, fontWeight: 700 }}>OPS</span>
          <input
            type="number"
            min={4}
            max={80}
            value={effectiveOperators}
            onChange={(e) => {
              const next = Math.max(4, Math.min(80, parseInt(e.target.value) || 4));
              // Manual edit detaches from the active reference variant so the
              // user can tweak operator count without snapping back.
              if (refOverride) clearRefContext();
              setOperators(next);
            }}
            style={{
              width: 56,
              padding: '4px 8px',
              border: '1px solid #ffffff20',
              background: '#ffffff10',
              borderRadius: SW_RADIUS.sm,
              fontFamily: SW_FONTS.mono,
              fontWeight: 700,
              fontSize: 13,
              color: '#fff',
            }}
          />
        </div>

        {/* Production-system chip — shows the layout the Orders wizard
            committed to, so the user can confirm the sim respects their
            pick. Reference runs hide this since they ship their own
            paper-specific bundle profile. */}
        {!refOverride && (
          <div
            title={`${productionSystemDef.label} · bundle size ${productionSystemDef.typicalBatchSize}\n${productionSystemDef.description}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              border: `1px solid ${SW_COLORS.brand}55`,
              background: `${SW_COLORS.brand}1a`,
              borderRadius: SW_RADIUS.sm,
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              cursor: 'help',
            }}
          >
            <span style={{ color: SW_COLORS.brand, letterSpacing: '0.1em' }}>SYSTEM</span>
            <span>{productionSystemDef.short}</span>
            <span style={{ color: '#ffffff70' }}>·</span>
            <span style={{ color: '#ffffffaa' }}>bundle {productionSystemDef.typicalBatchSize}</span>
          </div>
        )}
        <div style={{ flex: 1 }} />
      </div>

      {/* REFERENCE-LINE PICKER ─────────────────────────────────────────────
          Compact strip that lets the user materialise any published case
          study (paper × variant/scenario) into the active twin and jump
          straight to the PML view for replication. */}
      <div
        style={{
          padding: '10px 24px',
          borderBottom: '1px solid #ffffff15',
          background: '#ffffff04',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 10,
            fontWeight: 800,
            color: SW_COLORS.brand,
            letterSpacing: '2px',
          }}
        >
          📚 REFERENCE LINE
        </span>

        <HudSelect
          value={refSlug}
          onChange={setRefSlug}
          minWidth={300}
          options={REFERENCE_MODELS.map((m) => ({
            value: m.slug,
            label: `${m.authorYear} — ${m.title}`,
          }))}
        />

        <HudSelect
          value={refVariantKey}
          onChange={setRefVariantKey}
          minWidth={320}
          options={variantOptions.map((o) => ({
            value: o.key,
            label: o.label,
            tag: o.tag,
          }))}
        />

        <Button variant="primary" size="sm" icon="▶" onClick={handleLoadReference}>
          LOAD & SIMULATE
        </Button>

        {refLoadedLabel && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              border: `1px solid ${SW_COLORS.brand}55`,
              background: `${SW_COLORS.brand}18`,
              borderRadius: SW_RADIUS.sm,
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 700,
              color: SW_COLORS.brand,
              letterSpacing: '1px',
            }}
          >
            ACTIVE · {refLoadedLabel}
            <button
              onClick={handleClearReference}
              title="Clear reference context"
              style={{
                background: 'transparent',
                border: 'none',
                color: SW_COLORS.brand,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        {refLoadFlash && (
          <span
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 700,
              color: SW_COLORS.ok,
            }}
          >
            ✓ {refLoadFlash}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <span
          style={{
            fontSize: 11,
            color: '#ffffff80',
            fontFamily: SW_FONTS.mono,
            maxWidth: 280,
            lineHeight: 1.4,
          }}
        >
          Load builds Source → {refModel.garmentTemplate.operations.length} ops → Sink
          with a {variantOptions.find((o) => o.key === refVariantKey)?.tag ?? '—'}-sized operator pool.
        </span>
      </div>

      {/* SIMULATION FLOOR */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at 50% 30%, #182231 0%, #0a0d12 100%)',
        }}
      >
        {view === 'iso' && (
          <SimIsoView
            stations={state.stations}
            bottleneckOpIndex={state.bottleneckOpIndex}
            garmentName={garment.name}
            simTime={state.time}
            system={productionSystemId}
          />
        )}
        {view === 'top' && (
          <SimTopView
            stations={state.stations}
            bottleneckOpIndex={state.bottleneckOpIndex}
            garmentName={garment.name}
            simTime={state.time}
            system={productionSystemId}
          />
        )}
        {view === 'heat' && (
          <SimHeatView
            stations={state.stations}
            bottleneckOpIndex={state.bottleneckOpIndex}
            garmentName={garment.name}
            simTime={state.time}
            system={productionSystemId}
          />
        )}
        {view === 'logic' && (
          <SimLogicView
            stations={state.stations}
            bottleneckOpIndex={state.bottleneckOpIndex}
            garmentName={garment.name}
            simTime={state.time}
            system={productionSystemId}
          />
        )}
        {view === 'pml' && (
          <SimPmlView
            garment={garment}
            operators={effectiveOperators}
            hasReference={!!(refCtx.slug && refCtx.variantKey)}
          />
        )}

        {/* Legend overlay — view-aware key for every glyph on the floor. */}
        <SimLegend view={view} />

        {/* HUD stat tiles — PML view owns its own KPI strip, so hide these there. */}
        {view !== 'pml' && (
          <div style={{ position: 'absolute', left: 24, top: 24, display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: 12 }}>
            <SimHudStat label="OUTPUT" value={state.producedPieces.toLocaleString()} unit="pcs" color={SW_COLORS.brand} />
            <SimHudStat label="THROUGHPUT" value={Math.round(throughputPerHr).toLocaleString()} unit="pcs/hr" color={SW_COLORS.ok} />
            <SimHudStat label="WIP" value={state.totalArrivals - state.produced} unit="bundles" color={SW_COLORS.thread} />
            <SimHudStat label="UTIL" value={efficiencyPct} unit="%" color={SW_COLORS.fabric} />
          </div>
        )}

        {/* Right inspector */}
        {view !== 'pml' && (
        <div
          style={{
            position: 'absolute',
            right: 24,
            top: 24,
            width: 280,
            maxHeight: 'calc(100% - 48px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              background: '#ffffff08',
              border: '1px solid #ffffff15',
              borderRadius: SW_RADIUS.sm,
              padding: 12,
            }}
          >
            <div
              style={{
                fontFamily: SW_FONTS.mono,
                fontSize: 10,
                fontWeight: 700,
                color: '#ffffff80',
                letterSpacing: '1.5px',
                marginBottom: 8,
              }}
            >
              BOTTLENECK
            </div>
            <div style={{ fontSize: 12, color: SW_COLORS.alarm, fontWeight: 700, marginBottom: 4 }}>
              {state.stations[state.bottleneckOpIndex]?.opCode ?? '—'} ·{' '}
              {state.stations[state.bottleneckOpIndex]?.opName ?? '—'}
            </div>
            <div style={{ fontSize: 11, color: '#ffffffaa', fontFamily: SW_FONTS.mono }}>
              Q={state.stations[state.bottleneckOpIndex]?.queueLen ?? 0} · BUSY=
              {state.stations[state.bottleneckOpIndex]?.busy ?? 0}/
              {state.stations[state.bottleneckOpIndex]?.serversTotal ?? 0}
            </div>
          </div>

          <div
            style={{
              background: '#ffffff08',
              border: '1px solid #ffffff15',
              borderRadius: SW_RADIUS.sm,
              padding: 12,
              overflow: 'hidden',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 120,
            }}
          >
            <div
              style={{
                fontFamily: SW_FONTS.mono,
                fontSize: 10,
                fontWeight: 700,
                color: '#ffffff80',
                letterSpacing: '1.5px',
                marginBottom: 8,
                flexShrink: 0,
              }}
            >
              EVENT FEED
            </div>
            {/* Toggle between model time (default) and the calendar projection. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: SW_FONTS.mono, fontSize: 9, color: '#ffffff60', letterSpacing: '1px' }}>SHOW</span>
              <ToggleGroup
                value={eventTimeKind}
                onChange={(v) => setEventTimeKind(v as 'model' | 'cal')}
                options={[
                  { value: 'model', label: 't =' },
                  { value: 'cal',   label: 'CAL' },
                ]}
              />
            </div>
            <div style={{ fontSize: 11, fontFamily: SW_FONTS.mono, lineHeight: 1.6, overflow: 'auto', flex: 1 }}>
              {state.events.length === 0 && (
                <div style={{ color: '#ffffff60', fontStyle: 'italic' }}>No events yet — press PLAY.</div>
              )}
              {state.events.map((e, i) => {
                const col =
                  e.tag === 'OUT'
                    ? SW_COLORS.ok
                    : e.tag === 'STARVE'
                      ? SW_COLORS.warn
                      : SW_COLORS.alarm;
                const label =
                  eventTimeKind === 'cal'
                    ? fmtCalendarCompact(e.time, unit, project.time.startDate)
                    : fmtModelCompact(e.time, unit);
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                    <span style={{ color: '#ffffff60', width: eventTimeKind === 'cal' ? 130 : 50, fontFamily: SW_FONTS.mono }}>
                      {label}
                    </span>
                    <span style={{ color: col, flex: 1 }}>{e.msg}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* TRANSPORT BAR */}
      <div
        style={{
          padding: '14px 24px',
          background: '#0a0d12',
          borderTop: '1px solid #ffffff15',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Button variant="secondary" size="sm" onClick={reset}>
          ⏮
        </Button>
        <Button variant={playing ? 'danger' : 'success'} size="lg" onClick={() => setPlaying(!playing)}>
          {playing ? '⏸ PAUSE' : '▶ PLAY'}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => step(3600 / unitToSeconds(unit))}>
          ⏭ +1h
        </Button>
        <div style={{ width: 1, height: 28, background: '#ffffff20' }} />
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: '#ffffff80', fontWeight: 700 }}>SPEED</span>
        {/*
          Named speed tiers. Tooltip explains the unit translation so the
          user never confuses "1×" for an opaque multiplier. The active tier
          becomes effective when multiplied by the project-level
          realTimeScale (see useSim).
        */}
        {[
          { mult: 1,   label: 'Real-time',     hint: `1 model-${project.time.modelTimeUnit} per real-sec` },
          { mult: 10,  label: '10×',           hint: `10 model-${project.time.modelTimeUnit} per real-sec` },
          { mult: 60,  label: '60× (1 hr/s)',  hint: '1 model-hour per real-sec' },
          { mult: 480, label: 'Shift/sec',     hint: 'Full 8-hr shift in 1 real-sec' },
        ].map((p) => (
          <button
            key={p.mult}
            onClick={() => setSpeed(p.mult)}
            title={p.hint}
            style={{
              background: speed === p.mult ? SW_COLORS.brand : '#ffffff10',
              color: speed === p.mult ? '#fff' : '#ffffffaa',
              border: 'none',
              borderRadius: SW_RADIUS.sm,
              padding: '6px 12px',
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => project.setTime('executionMode',
            project.time.executionMode === 'virtual' ? 'realtime' : 'virtual')}
          title="Toggle virtual mode — engine runs as fast as compute allows, no real-time pacing"
          style={{
            background: project.time.executionMode === 'virtual' ? SW_COLORS.brand : '#ffffff10',
            color: project.time.executionMode === 'virtual' ? '#fff' : '#ffffffaa',
            border: 'none',
            borderRadius: SW_RADIUS.sm,
            padding: '6px 12px',
            fontFamily: SW_FONTS.mono,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Virtual
        </button>
        <div
          style={{
            flex: 1,
            position: 'relative',
            height: 28,
            background: '#ffffff08',
            borderRadius: SW_RADIUS.sm,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${shiftPct}%`,
              background: `linear-gradient(90deg, ${SW_COLORS.brand}, ${SW_COLORS.thread})`,
            }}
          />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            DAY {dayN} · {Math.round(shiftPct)}% complete · {modelStr}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate('/kpi')}>
          End shift →
        </Button>
      </div>

      <style>{`
        @keyframes sim-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes sim-march { to { stroke-dashoffset: -16; } }
      `}</style>
    </div>
  );
}

function SimHudStat({ label, value, unit, color }: SimHudStatProps) {
  return (
    <div
      style={{
        background: '#ffffff08',
        border: '1px solid #ffffff15',
        borderRadius: SW_RADIUS.sm,
        padding: '8px 14px',
        minWidth: 120,
      }}
    >
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 700, color: '#ffffff80', letterSpacing: '1px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <span style={{ fontFamily: SW_FONTS.display, fontSize: 22, fontWeight: 900, color }}>{value}</span>
        <span style={{ fontSize: 10, color: '#ffffff80', fontFamily: SW_FONTS.mono, fontWeight: 600 }}>{unit}</span>
      </div>
    </div>
  );
}

// ============================================================================
// LEGEND — view-aware key for every glyph on screen
// ============================================================================
//
// Each simulation view paints a different cast of shapes (cuboids, dots,
// stacked rects, pulsing rings…). This panel translates them into plain
// English so anyone — not just whoever built the view — can read the floor.
// Collapsible header so power users can hide it; reopens with one click.

interface SimLegendEntry {
  glyph: React.ReactNode;
  label: string;
  hint: string;
}

function legendEntriesForView(view: SimView): SimLegendEntry[] {
  switch (view) {
    case 'iso':
      return [
        {
          glyph: <IsoTableGlyph color={SW_COLORS.bobbin} />,
          label: 'Sewing-machine table',
          hint: 'Cuboid colour = machine type from the catalog (SNL, OL, FL…).',
        },
        {
          glyph: <DotGlyph color={SW_COLORS.ok} />,
          label: 'Status pip on machine head',
          hint: 'Green = running healthy · yellow = hot (>70%) · red = alarm.',
        },
        {
          glyph: <OperatorGlyph working />,
          label: 'Operator (working)',
          hint: 'Filled blue circle = an operator currently sewing a bundle.',
        },
        {
          glyph: <OperatorGlyph working={false} />,
          label: 'Operator (idle)',
          hint: 'Faded ring = station seat unoccupied or operator starved.',
        },
        {
          glyph: <PulseRingGlyph />,
          label: 'Active-sewing pulse',
          hint: 'Brand-coloured ring breathing around a working operator.',
        },
        {
          glyph: <WipStackGlyph />,
          label: 'WIP queue (stacked bars)',
          hint: 'Thread-yellow bundles waiting on the inbound side of the station.',
        },
        {
          glyph: <BottleneckGlyph />,
          label: 'Bottleneck flag',
          hint: 'Pulsing red disc with "!" — slowest op, queue is building.',
        },
      ];
    case 'top':
      return [
        {
          glyph: <CardGlyph color={SW_COLORS.brand} />,
          label: 'Operation card',
          hint: 'One sewing operation in the routing — labelled by OP code + SMV.',
        },
        {
          glyph: <OperatorGlyph working />,
          label: 'Operator (working)',
          hint: 'Filled circle on the card = currently processing a bundle.',
        },
        {
          glyph: <OperatorGlyph working={false} />,
          label: 'Operator (idle)',
          hint: 'Faded ring = unmanned seat or no work to pull.',
        },
        {
          glyph: <ConveyorDotGlyph />,
          label: 'Bundle on conveyor',
          hint: 'Yellow dots travelling along dashed lines = WIP moving between ops.',
        },
        {
          glyph: <WipStackGlyph />,
          label: 'Queue at station',
          hint: 'Stacked thread-coloured bars under each card = bundles waiting.',
        },
        {
          glyph: <UtilBarGlyph />,
          label: 'Utilisation bar',
          hint: 'Green fill = busy share · turns red when the station bottlenecks.',
        },
        {
          glyph: <BottleneckGlyph />,
          label: 'Bottleneck flag',
          hint: 'Pulsing red disc with "!" — flags the slowest op in the line.',
        },
      ];
    case 'heat':
      return [
        {
          glyph: <HeatGradientGlyph />,
          label: 'Pressure blob',
          hint: 'Radial glow sized by utilisation × queue. Green → orange → red.',
        },
        {
          glyph: <DotGlyph color="#fff" />,
          label: 'Station marker',
          hint: 'White dot at the centre of each blob = the station\'s anchor point.',
        },
        {
          glyph: <DotGlyph color={SW_COLORS.alarm} />,
          label: 'Bottleneck marker',
          hint: 'Red dot replaces white when the station is the slowest op.',
        },
      ];
    case 'logic':
      return [
        {
          glyph: <CardGlyph color={SW_COLORS.brand} />,
          label: 'Operation block',
          hint: 'Flow card with OP code, SMV, queue, busy/total, throughput.',
        },
        {
          glyph: <ArrowGlyph color={SW_COLORS.ok} />,
          label: 'Healthy connector',
          hint: 'Green arrow — upstream station running under 85% utilisation.',
        },
        {
          glyph: <ArrowGlyph color={SW_COLORS.warn} />,
          label: 'Warming connector',
          hint: 'Orange arrow — upstream station ≥ 85% utilisation.',
        },
        {
          glyph: <ArrowGlyph color={SW_COLORS.alarm} />,
          label: 'Bottleneck connector',
          hint: 'Red arrow — upstream station is the bottleneck with queue building.',
        },
        {
          glyph: <DiamondGlyph />,
          label: 'Bottleneck marker (◆)',
          hint: 'Diamond on a card header = this op is the slowest in the line.',
        },
      ];
    case 'pml':
      return [
        {
          glyph: <CardGlyph color={SW_COLORS.brand} />,
          label: 'PML block (Source / Op / Sink)',
          hint: 'Each card = one node in the Process Modelling Library graph.',
        },
        {
          glyph: <CardGlyph color={SW_COLORS.alarm} />,
          label: 'Bottleneck block',
          hint: 'Red border + dark fill = slowest block in the current run.',
        },
        {
          glyph: <QBadgeGlyph />,
          label: 'Q badge',
          hint: 'Queue length including bundles in service at this block.',
        },
        {
          glyph: <ThroughputGlyph />,
          label: 'Throughput readout',
          hint: 'Big white number = live pieces/hr through this block.',
        },
      ];
  }
}

function SimLegend({ view }: { view: SimView }) {
  const [open, setOpen] = useState(true);
  const entries = legendEntriesForView(view);
  const viewLabel =
    view === 'iso' ? 'ISO 3D'
      : view === 'top' ? 'TOP 2D'
        : view === 'heat' ? 'HEAT'
          : view === 'logic' ? 'LOGIC'
            : 'PML';

  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        bottom: 24,
        width: open ? 320 : 'auto',
        maxHeight: 'calc(100% - 48px)',
        background: '#0a0d12e8',
        border: '1px solid #ffffff20',
        borderRadius: SW_RADIUS.sm,
        boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 5,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          borderBottom: open ? '1px solid #ffffff15' : 'none',
          color: '#fff',
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.2em',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        title={open ? 'Collapse legend' : 'Expand legend'}
      >
        <span style={{ color: SW_COLORS.brand }}>▣</span>
        <span>LEGEND · {viewLabel}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#ffffff80', fontSize: 11 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div
          style={{
            padding: '8px 12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflow: 'auto',
          }}
        >
          {entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 36,
                  height: 28,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {e.glyph}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: SW_FONTS.mono,
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#fff',
                    letterSpacing: '0.04em',
                  }}
                >
                  {e.label}
                </div>
                <div
                  style={{
                    fontFamily: SW_FONTS.body,
                    fontSize: 10.5,
                    color: '#ffffff90',
                    lineHeight: 1.35,
                    marginTop: 2,
                  }}
                >
                  {e.hint}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Glyph primitives — tiny SVGs that mirror what each view actually renders.
function IsoTableGlyph({ color }: { color: string }) {
  return (
    <svg width={32} height={24} viewBox="0 0 32 24">
      <polygon points="6,18 16,22 26,18 16,14" fill={SW_PAL.cream} stroke="#0F1419" strokeWidth={0.5} />
      <polygon points="6,18 16,14 16,8 6,12" fill={SW_PAL.creamLo} stroke="#0F1419" strokeWidth={0.5} />
      <polygon points="26,18 16,14 16,8 26,12" fill={SW_PAL.cream} stroke="#0F1419" strokeWidth={0.5} />
      <polygon points="10,10 16,12.4 22,10 16,7.6" fill={color} stroke="#0F1419" strokeWidth={0.5} />
      <polygon points="10,10 16,7.6 16,3.6 10,6" fill={shade(color, -0.2)} stroke="#0F1419" strokeWidth={0.5} />
      <polygon points="22,10 16,7.6 16,3.6 22,6" fill={color} stroke="#0F1419" strokeWidth={0.5} />
    </svg>
  );
}
function DotGlyph({ color }: { color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16">
      <circle cx={8} cy={8} r={4.5} fill={color} stroke="#0F1419" strokeWidth={0.8} />
    </svg>
  );
}
function OperatorGlyph({ working }: { working: boolean }) {
  return (
    <svg width={20} height={24} viewBox="0 0 20 24">
      <ellipse cx={10} cy={20} rx={6} ry={1.8} fill="#0F141955" />
      <circle
        cx={10}
        cy={13}
        r={5}
        fill={working ? SW_COLORS.bobbin : 'transparent'}
        stroke={working ? '#fff' : '#ffffff60'}
        strokeWidth={1.2}
      />
      <circle cx={10} cy={6} r={3} fill="#F0C49B" stroke="#0F1419" strokeWidth={0.6} />
    </svg>
  );
}
function PulseRingGlyph() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={5} fill={SW_COLORS.bobbin} stroke="#fff" strokeWidth={1} />
      <circle cx={12} cy={12} r={9} fill="none" stroke={SW_COLORS.brand} strokeWidth={1.2} opacity={0.7}>
        <animate attributeName="r" values="8;10;8" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
function WipStackGlyph() {
  return (
    <svg width={28} height={20} viewBox="0 0 28 20">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
        <rect
          key={k}
          x={(k % 4) * 6 + 2}
          y={14 - Math.floor(k / 4) * 5}
          width={5}
          height={3.5}
          fill={SW_COLORS.thread}
          opacity={0.9 - k * 0.05}
        />
      ))}
    </svg>
  );
}
function BottleneckGlyph() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20">
      <circle cx={10} cy={10} r={7} fill={SW_COLORS.alarm}>
        <animate attributeName="r" values="6;8;6" dur="0.9s" repeatCount="indefinite" />
      </circle>
      <text x={10} y={13.5} textAnchor="middle" fontFamily={SW_FONTS.display} fontSize={11} fontWeight={900} fill="#fff">
        !
      </text>
    </svg>
  );
}
function CardGlyph({ color }: { color: string }) {
  return (
    <svg width={30} height={22} viewBox="0 0 30 22">
      <rect x={2} y={3} width={26} height={16} rx={3} fill={`${color}25`} stroke={color} strokeWidth={1.2} />
      <rect x={2} y={3} width={26} height={4} rx={3} fill={color} />
    </svg>
  );
}
function ConveyorDotGlyph() {
  return (
    <svg width={32} height={16} viewBox="0 0 32 16">
      <line x1={2} y1={8} x2={30} y2={8} stroke="#ffffff40" strokeWidth={1.5} strokeDasharray="3 2" />
      <circle cx={8} cy={8} r={2.5} fill={SW_COLORS.thread} />
      <circle cx={18} cy={8} r={2.5} fill={SW_COLORS.thread} opacity={0.8} />
      <circle cx={26} cy={8} r={2.5} fill={SW_COLORS.thread} opacity={0.6} />
    </svg>
  );
}
function UtilBarGlyph() {
  return (
    <svg width={32} height={14} viewBox="0 0 32 14">
      <rect x={2} y={5} width={28} height={4} fill="#ffffff20" />
      <rect x={2} y={5} width={18} height={4} fill={SW_COLORS.ok} />
      <text x={2} y={13} fontFamily={SW_FONTS.mono} fontSize={6} fill="#ffffff90" fontWeight={700}>
        2/3
      </text>
    </svg>
  );
}
function HeatGradientGlyph() {
  return (
    <svg width={34} height={18} viewBox="0 0 34 18">
      <defs>
        <linearGradient id="sim-legend-heat" x1="0%" x2="100%">
          <stop offset="0%" stopColor={SW_COLORS.ok} />
          <stop offset="55%" stopColor={SW_COLORS.warn} />
          <stop offset="100%" stopColor={SW_COLORS.alarm} />
        </linearGradient>
      </defs>
      <rect x={1} y={4} width={32} height={10} rx={5} fill="url(#sim-legend-heat)" />
    </svg>
  );
}
function ArrowGlyph({ color }: { color: string }) {
  return (
    <svg width={30} height={14} viewBox="0 0 30 14">
      <line x1={2} y1={7} x2={22} y2={7} stroke={color} strokeWidth={2.2} />
      <polygon points="22,3 28,7 22,11" fill={color} />
    </svg>
  );
}
function DiamondGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18">
      <circle cx={9} cy={9} r={7.5} fill="#ffffff22" />
      <text x={9} y={12.5} textAnchor="middle" fontFamily={SW_FONTS.display} fontSize={12} fontWeight={900} fill="#fff">
        ◆
      </text>
    </svg>
  );
}
function QBadgeGlyph() {
  return (
    <svg width={26} height={16} viewBox="0 0 26 16">
      <rect x={1} y={2} width={24} height={12} rx={3} fill={`${SW_COLORS.thread}25`} stroke={SW_COLORS.thread} strokeWidth={0.8} />
      <text x={13} y={11.5} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={900} fill={SW_COLORS.thread}>
        Q 7
      </text>
    </svg>
  );
}
function ThroughputGlyph() {
  return (
    <svg width={32} height={16} viewBox="0 0 32 16">
      <text x={2} y={12} fontFamily={SW_FONTS.mono} fontSize={11} fontWeight={900} fill="#fff">
        842
      </text>
      <text x={22} y={12} fontFamily={SW_FONTS.mono} fontSize={6} fontWeight={700} fill="#ffffff90">
        pcs/hr
      </text>
    </svg>
  );
}

// ============================================================================
// LAYOUT — map sim stations onto a synthetic grid
// ============================================================================

interface StationLayout {
  s: StationView;
  /** Cell coordinates in world space (1 unit = isoProj cell). */
  gx: number;
  gy: number;
  /** Footprint width / depth in cells. */
  w: number;
  d: number;
}

function layoutStations(
  stations: StationView[],
  system: ProductionSystem,
): {
  cells: StationLayout[];
  gridW: number;
  gridH: number;
  perRow: number;
} {
  const n = stations.length;
  if (n === 0) return { cells: [], gridW: 1, gridH: 1, perRow: 1 };

  // Modular (TSS) — U-shape. Operators face each other across the U so they
  // can rotate between adjacent stations. Pieces flow top-row L→R, turn at
  // the right end, then return along the bottom row R→L.
  if (system === 'modular') {
    const stride = 3;
    const topCount = Math.ceil(n / 2);
    const bottomCount = n - topCount;
    const topY = 2;
    const bottomY = 7;
    const cells: StationLayout[] = stations.map((s, i) => {
      if (i < topCount) {
        return { s, gx: 2 + i * stride, gy: topY, w: 1.4, d: 2 };
      }
      const j = i - topCount;
      const col = topCount - 1 - j; // reverse so flow returns along the bottom
      return { s, gx: 2 + col * stride, gy: bottomY, w: 1.4, d: 2 };
    });
    void bottomCount;
    return {
      cells,
      gridW: 2 + topCount * stride + 2,
      gridH: bottomY + 4,
      perRow: topCount,
    };
  }

  // Make-through — one highly-skilled operator owns the whole garment. All
  // "operations" cluster tightly at the same workbench so the scene reads as
  // a single workstation rather than a multi-station line.
  if (system === 'make_through') {
    const cols = Math.min(2, n);
    const rows = Math.ceil(n / cols);
    const stride = 2;
    const cells: StationLayout[] = stations.map((s, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      return { s, gx: 4 + col * stride, gy: 2 + row * stride, w: 1.4, d: 2 };
    });
    return {
      cells,
      gridW: 4 + cols * stride + 4,
      gridH: 2 + rows * stride + 2,
      perRow: cols,
    };
  }

  // Clump — senior op + helpers grouped around critical operations. Stations
  // split into 2–3 small clusters spaced apart so the topology reads as
  // "clusters" rather than "a single line."
  if (system === 'clump') {
    const clumps = Math.min(3, Math.max(2, Math.ceil(n / 3)));
    const inner = 2;
    const between = 5;
    const cells: StationLayout[] = stations.map((s, i) => {
      const g = i % clumps;
      const within = Math.floor(i / clumps);
      return {
        s,
        gx: 2 + g * between + (within % 2) * inner,
        gy: 2 + Math.floor(within / 2) * (inner + 1),
        w: 1.4,
        d: 2,
      };
    });
    const perGroupRows = Math.ceil(Math.ceil(n / clumps) / 2);
    return {
      cells,
      gridW: 2 + clumps * between + 2,
      gridH: 2 + perGroupRows * (inner + 1) + 2,
      perRow: clumps * 2,
    };
  }

  // Linear default — PBS / straight / synchro / UPS / bundle / unit_handle.
  // PBS-family systems leave wide gaps between stations to suggest bundle
  // buffers; piece-flow systems (straight, synchro, UPS) sit closer.
  const stride =
    system === 'PBS' || system === 'bundle' || system === 'unit_handle' ? 4 : 3;
  const perRow = Math.min(n, 8);
  const rows = Math.ceil(n / perRow);
  const cells: StationLayout[] = stations.map((s, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return {
      s,
      gx: 2 + col * stride,
      gy: 2 + row * (stride + 1),
      w: 1.4,
      d: 2,
    };
  });
  const gridW = 2 + perRow * stride + 2;
  const gridH = 2 + rows * (stride + 1) + 2;
  return { cells, gridW, gridH, perRow };
}

// ============================================================================
// ISO 3D VIEW
// ============================================================================

interface SimViewProps {
  stations: StationView[];
  bottleneckOpIndex: number;
  garmentName: string;
  simTime: number;
  system: ProductionSystem;
}

function SimIsoView({ stations, bottleneckOpIndex, garmentName, simTime, system }: SimViewProps) {
  if (stations.length === 0) return <svg style={{ width: '100%', height: '100%' }} />;

  const { cells, gridW, gridH } = layoutStations(stations, system);

  const cTL = isoProj(0, 0);
  const cTR = isoProj(gridW, 0);
  const cBR = isoProj(gridW, gridH);
  const cBL = isoProj(0, gridH);
  const minX = Math.min(cTL.sx, cBL.sx) - 80;
  const maxX = Math.max(cTR.sx, cBR.sx) + 80;
  const minY = Math.min(cTL.sy, cTR.sy) - 80;
  const maxY = Math.max(cBL.sy, cBR.sy) + 80;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <defs>
        <pattern id="sim-grid-iso" width={32} height={32} patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#ffffff06" strokeWidth={1} />
        </pattern>
        <radialGradient id="sim-vig" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
        </radialGradient>
      </defs>
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="url(#sim-grid-iso)" />

      {/* Floor */}
      <polygon points={ptsToStr([cTL, cTR, cBR, cBL])} fill="#ffffff05" stroke="#ffffff15" strokeWidth={1} />

      {/* Iso grid lines */}
      {Array.from({ length: gridW + 1 }, (_, i) => {
        const a = isoProj(i, 0);
        const b = isoProj(i, gridH);
        return (
          <line key={`v-${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#ffffff08" strokeWidth={0.5} />
        );
      })}
      {Array.from({ length: gridH + 1 }, (_, i) => {
        const a = isoProj(0, i);
        const b = isoProj(gridW, i);
        return (
          <line key={`h-${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#ffffff08" strokeWidth={0.5} />
        );
      })}

      {/* Conveyor between rows of stations */}
      {cells.length > 1 &&
        cells.slice(0, -1).map((c, i) => {
          const next = cells[i + 1];
          const a = isoProj(c.gx + c.w / 2, c.gy + c.d + 0.2);
          const b = isoProj(next.gx + next.w / 2, next.gy + next.d + 0.2);
          return (
            <line
              key={`conv-${i}`}
              x1={a.sx}
              y1={a.sy}
              x2={b.sx}
              y2={b.sy}
              stroke="#ffffff30"
              strokeWidth={2.4}
              strokeDasharray="6 4"
              style={{ animation: 'sim-march 0.8s linear infinite' }}
            />
          );
        })}

      {/* Stations — depth-sorted */}
      {[...cells]
        .sort((a, b) => a.gx + a.gy - (b.gx + b.gy))
        .map((c, i) => (
          <IsoSewingStation key={c.s.opId} layout={c} index={i} isHot={cells.findIndex((x) => x.s.opId === c.s.opId) === bottleneckOpIndex && c.s.queueLen > 0} simTime={simTime} />
        ))}

      {/* Travelling WIP bundles between adjacent stations */}
      {cells.length > 1 &&
        cells.slice(0, -1).map((c, i) => {
          const next = cells[i + 1];
          const phase = ((simTime * 0.04 + i * 0.27) % 1 + 1) % 1;
          const x = c.gx + c.w / 2 + (next.gx + next.w / 2 - (c.gx + c.w / 2)) * phase;
          const y = c.gy + c.d / 2 + (next.gy + next.d / 2 - (c.gy + c.d / 2)) * phase;
          const p = isoProj(x, y, 0.3);
          const colors = [SW_COLORS.thread, SW_COLORS.fabric, SW_COLORS.bobbin, SW_COLORS.trim];
          return (
            <rect
              key={`wip-${i}`}
              x={p.sx - 4}
              y={p.sy - 4}
              width={8}
              height={8}
              fill={colors[i % colors.length]}
              stroke="#0F1419"
              strokeWidth={0.6}
              opacity={0.92}
            />
          );
        })}

      {/* Title */}
      <text
        x={(minX + maxX) / 2}
        y={minY + 30}
        textAnchor="middle"
        fill="#ffffff80"
        fontFamily={SW_FONTS.mono}
        fontSize={12}
        fontWeight={800}
        letterSpacing="2px"
      >
        {garmentName.toUpperCase()} · LIVE DES SIMULATION · ISO 3D
      </text>

      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="url(#sim-vig)" pointerEvents="none" />
    </svg>
  );
}

function IsoSewingStation({
  layout,
  index,
  isHot,
  simTime,
}: {
  layout: StationLayout;
  index: number;
  isHot: boolean;
  simTime: number;
}) {
  const { s, gx, gy, w, d } = layout;
  const origin = isoProj(gx, gy);
  const occupancy = s.serversTotal > 0 ? s.busy / s.serversTotal : 0;
  // Workstation visual identity is sourced from the global asset library
  // (MACHINE_CATALOG) keyed off the operation's machineCode. SNL → brand,
  // 4OL → bobbin, FL → flatlock steel, BT → yellow, BH → green, etc.
  // The icon never changes with live state; bottleneck/load are surfaced
  // separately via the badge above, the base alarm ring, and the
  // utilization pip.
  const asset = stationAsset(s.machineCode);
  const machineHead = asset.color;

  return (
    <g transform={`translate(${origin.sx}, ${origin.sy})`}>
      {/* Alarm ring around the base — only visible when this station is
          the bottleneck, so the icon itself doesn't need to change colour. */}
      {isHot && (() => {
        const c = isoProj(w / 2, d / 2, 0.02);
        const o = isoProj(0, 0, 0);
        const rx = (w + 0.8) * 16;
        const ry = (d + 0.8) * 8;
        return (
          <ellipse
            cx={c.sx - o.sx}
            cy={c.sy - o.sy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke={SW_COLORS.alarm}
            strokeWidth={2}
            opacity={0.85}
            pointerEvents="none"
          >
            <animate attributeName="opacity" values="0.85;0.35;0.85" dur="0.9s" repeatCount="indefinite" />
          </ellipse>
        );
      })()}
      {/* Sewing-machine table */}
      <g>
        {CuboidFaces({
          w,
          d,
          h: 0.8,
          top: SW_PAL.cream,
          left: SW_PAL.creamLo,
          right: SW_PAL.cream,
        })}
      </g>
      {/* Machine head on top — colour comes from the asset library
          (`MACHINE_CATALOG[machineCode].color`), so an SNL bobbin, a 4OL,
          and a flatlock each read as visually distinct equipment that
          stays consistent across views and runs. */}
      <g
        transform={(() => {
          const a = isoProj(0, d * 0.3, 0.8);
          const o = isoProj(0, 0, 0);
          return `translate(${a.sx - o.sx}, ${a.sy - o.sy})`;
        })()}
      >
        {CuboidFaces({
          w: w * 0.75,
          d: d * 0.4,
          h: 0.6,
          top: machineHead,
          left: shade(machineHead, -0.2),
          right: machineHead,
        })}
      </g>
      {/* Utilization pip on the machine head — small status light, doesn't
          recolour the equipment. Reads green / yellow / red against an
          otherwise-static silhouette. */}
      {(() => {
        const a = isoProj(w * 0.78, d * 0.35, 1.45);
        const o = isoProj(0, 0, 0);
        const pipCol = isHot
          ? SW_COLORS.alarm
          : occupancy > 0.7
            ? SW_PAL.yellow
            : SW_COLORS.ok;
        return (
          <circle
            cx={a.sx - o.sx}
            cy={a.sy - o.sy}
            r={2.4}
            fill={pipCol}
            stroke="#0F1419"
            strokeWidth={0.5}
          />
        );
      })()}
      {/* Op label badge floating above */}
      {(() => {
        const p = isoProj(w / 2, d / 2, 1.7);
        return (
          <g transform={`translate(${p.sx}, ${p.sy})`} pointerEvents="none">
            <rect x={-42} y={-32} width={84} height={30} rx={4} fill="#0a0d12" stroke="#ffffff20" strokeWidth={1} />
            {/* Asset-typed colour chip on the left edge of the badge so the
                badge itself echoes the catalog colour of the workstation. */}
            <rect x={-42} y={-32} width={4} height={30} fill={asset.color} />
            <text
              x={-32}
              y={-21}
              fontFamily={SW_FONTS.mono}
              fontSize={10}
              fontWeight={900}
              fill="#fff"
              letterSpacing="0.05em"
            >
              {s.opCode ?? `OP-${index + 1}`}
            </text>
            <text
              x={36}
              y={-21}
              textAnchor="end"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={800}
              fill={asset.color}
              letterSpacing="0.05em"
            >
              {asset.glyph} {asset.label}
            </text>
            <text
              x={0}
              y={-7}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={8}
              fontWeight={700}
              fill={isHot ? SW_COLORS.alarm : '#ffffffaa'}
            >
              Q={s.queueLen} · {s.busy}/{s.serversTotal}
            </text>
          </g>
        );
      })()}

      {/* Operators bobbing in front of the table */}
      {Array.from({ length: Math.min(s.serversTotal, 3) }).map((_, k) => {
        const slot = (k - (Math.min(s.serversTotal, 3) - 1) / 2) * 0.45;
        const isWorking = k < s.busy;
        const ph = (simTime * 1.6 + k * 0.7 + index * 0.3) % (Math.PI * 2);
        const ox = w / 2 + slot;
        const oy = d + 0.5 + (isWorking ? Math.sin(ph) * 0.08 : 0);
        const p = isoProj(ox, oy, 0);
        return (
          <g key={k} transform={`translate(${p.sx}, ${p.sy})`}>
            <ellipse cx={0} cy={3} rx={6} ry={2.4} fill="#0F141944" />
            <circle
              cx={0}
              cy={-4}
              r={5}
              fill={isWorking ? (isHot ? SW_COLORS.alarm : SW_COLORS.bobbin) : '#ffffff30'}
              stroke="#fff"
              strokeWidth={1}
            />
            <circle cx={0} cy={-9} r={3} fill="#F0C49B" stroke="#0F1419" strokeWidth={0.6} />
            {isWorking && (
              <circle
                cx={0}
                cy={-4}
                r={8 + Math.sin(simTime * 2 + index + k) * 1.4}
                fill="none"
                stroke={isHot ? SW_COLORS.alarm : SW_COLORS.brand}
                strokeWidth={0.8}
                opacity={0.45}
              />
            )}
          </g>
        );
      })}

      {/* WIP queue — small stacked rects on the inbound side */}
      {(() => {
        const visible = Math.min(s.queueLen, 12);
        const p = isoProj(-0.6, d * 0.5, 0.85);
        return (
          <g transform={`translate(${p.sx}, ${p.sy})`}>
            {Array.from({ length: visible }).map((_, k) => (
              <rect
                key={k}
                x={(k % 4) * 5 - 10}
                y={Math.floor(k / 4) * -4}
                width={4}
                height={3}
                fill={SW_COLORS.thread}
                opacity={0.85 - k * 0.04}
              />
            ))}
            {s.queueLen > 12 && (
              <text x={12} y={-2} fill={SW_COLORS.thread} fontFamily={SW_FONTS.mono} fontSize={9} fontWeight={800}>
                +{s.queueLen - 12}
              </text>
            )}
          </g>
        );
      })()}

      {/* Bottleneck flag */}
      {isHot && (() => {
        const p = isoProj(w / 2, d / 2, 2.6);
        return (
          <g transform={`translate(${p.sx}, ${p.sy})`} pointerEvents="none">
            <circle r={7} fill={SW_COLORS.alarm}>
              <animate attributeName="r" values="7;10;7" dur="0.8s" repeatCount="indefinite" />
            </circle>
            <text x={0} y={3} textAnchor="middle" fontFamily={SW_FONTS.display} fontSize={10} fontWeight={900} fill="#fff">
              !
            </text>
          </g>
        );
      })()}
    </g>
  );
}

// ============================================================================
// TOP 2D VIEW
// ============================================================================

function SimTopView({ stations, bottleneckOpIndex, garmentName, simTime }: SimViewProps) {
  if (stations.length === 0) return <svg style={{ width: '100%', height: '100%' }} />;
  const VIEWBOX_W = 1200;
  const VIEWBOX_H = 600;
  const stationCount = stations.length;
  const perRow = Math.min(stationCount, 12);
  const rows = Math.ceil(stationCount / perRow);
  const xStep = (VIEWBOX_W - 200) / Math.max(1, perRow - 1);
  const xStart = perRow === 1 ? VIEWBOX_W / 2 : 100;
  const yStart = rows === 1 ? VIEWBOX_H / 2 : 200;
  const yStep = rows > 1 ? 200 : 0;

  const positions = stations.map((_, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return { x: xStart + col * xStep, y: yStart + row * yStep };
  });

  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} style={{ width: '100%', height: '100%' }}>
      <defs>
        <pattern id="sim-grid-top" width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff10" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="#0d1219" />
      <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="url(#sim-grid-top)" />

      {/* Title */}
      <text
        x={VIEWBOX_W / 2}
        y={28}
        textAnchor="middle"
        fill="#ffffff80"
        fontFamily={SW_FONTS.mono}
        fontSize={12}
        fontWeight={800}
        letterSpacing="2px"
      >
        {garmentName.toUpperCase()} · TOP 2D · BLUEPRINT FLOW
      </text>

      {/* Connecting flow line + animated WIP dots */}
      {Array.from({ length: rows }).map((_, r) => {
        const startCol = r * perRow;
        const endCol = Math.min(startCol + perRow, stationCount) - 1;
        if (endCol <= startCol) return null;
        const y = positions[startCol].y;
        return (
          <g key={`flow-${r}`}>
            <line
              x1={positions[startCol].x}
              y1={y}
              x2={positions[endCol].x}
              y2={y}
              stroke="#ffffff25"
              strokeWidth={3}
              strokeDasharray="6 6"
              style={{ animation: 'sim-march 1s linear infinite' }}
            />
            {/* WIP travelling dots */}
            {Array.from({ length: 6 }).map((_, k) => {
              const phase = ((simTime * 0.03 + k / 6 + r * 0.13) % 1 + 1) % 1;
              const x = positions[startCol].x + (positions[endCol].x - positions[startCol].x) * phase;
              return <circle key={k} cx={x} cy={y} r={4} fill={SW_COLORS.thread} opacity={0.85} />;
            })}
          </g>
        );
      })}

      {stations.map((s, i) => {
        const { x, y } = positions[i];
        const isHot = i === bottleneckOpIndex && s.queueLen > 0;
        const occupancy = s.serversTotal > 0 ? s.busy / s.serversTotal : 0;
        return (
          <g key={s.opId} transform={`translate(${x}, ${y})`}>
            <rect
              x={-36}
              y={-50}
              width={72}
              height={100}
              rx={6}
              fill={isHot ? `${SW_COLORS.alarm}30` : `${SW_COLORS.brand}20`}
              stroke={isHot ? SW_COLORS.alarm : `${SW_COLORS.brand}80`}
              strokeWidth={2}
            />
            <text
              x={0}
              y={-32}
              textAnchor="middle"
              fill="#ffffffaa"
              fontFamily={SW_FONTS.mono}
              fontSize={10}
              fontWeight={800}
            >
              {s.opCode ?? `OP-${i + 1}`}
            </text>
            <text x={0} y={-20} textAnchor="middle" fill="#ffffff60" fontFamily={SW_FONTS.mono} fontSize={8} fontWeight={700}>
              {s.smv.toFixed(2)}m
            </text>
            {/* Operators */}
            {Array.from({ length: Math.min(s.serversTotal, 3) }).map((_, k) => {
              const cx = (k - (Math.min(s.serversTotal, 3) - 1) / 2) * 18;
              const isWorking = k < s.busy;
              return (
                <g key={k} transform={`translate(${cx}, 0)`}>
                  <circle
                    cx={0}
                    cy={0}
                    r={9}
                    fill={isWorking ? (isHot ? SW_COLORS.alarm : SW_COLORS.bobbin) : '#ffffff30'}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                  {isWorking && (
                    <circle
                      cx={0}
                      cy={0}
                      r={12 + Math.sin(simTime * 2 + i + k) * 2}
                      fill="none"
                      stroke={SW_COLORS.brand}
                      strokeWidth={1}
                      opacity={0.4}
                    />
                  )}
                </g>
              );
            })}
            {/* Queue */}
            <g transform="translate(-26, 25)">
              {Array.from({ length: Math.min(s.queueLen, 12) }).map((_, k) => (
                <rect
                  key={k}
                  x={(k % 4) * 7}
                  y={Math.floor(k / 4) * 5}
                  width={6}
                  height={4}
                  fill={SW_COLORS.thread}
                  opacity={0.9 - k * 0.04}
                />
              ))}
              {s.queueLen > 12 && (
                <text x={38} y={14} fill={SW_COLORS.thread} fontFamily={SW_FONTS.mono} fontSize={10} fontWeight={800}>
                  +{s.queueLen - 12}
                </text>
              )}
            </g>
            {/* Util bar */}
            <g transform="translate(-30, 42)">
              <rect x={0} y={0} width={60} height={4} fill="#ffffff15" />
              <rect x={0} y={0} width={60 * occupancy} height={4} fill={isHot ? SW_COLORS.alarm : SW_COLORS.ok} />
              <text x={0} y={16} fill="#ffffff80" fontFamily={SW_FONTS.mono} fontSize={8} fontWeight={700}>
                {s.busy}/{s.serversTotal}
              </text>
            </g>
            {isHot && (
              <g>
                <circle cx={26} cy={-44} r={6} fill={SW_COLORS.alarm}>
                  <animate attributeName="r" values="6;9;6" dur="0.8s" repeatCount="indefinite" />
                </circle>
                <text x={26} y={-40} textAnchor="middle" fill="#fff" fontFamily={SW_FONTS.display} fontSize={9} fontWeight={900}>
                  !
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================================
// HEAT VIEW
// ============================================================================

function SimHeatView({ stations, bottleneckOpIndex, garmentName }: SimViewProps) {
  if (stations.length === 0) return <svg style={{ width: '100%', height: '100%' }} />;
  const VIEWBOX_W = 1200;
  const VIEWBOX_H = 600;
  const perRow = Math.min(stations.length, 12);
  const rows = Math.ceil(stations.length / perRow);
  const xStep = (VIEWBOX_W - 200) / Math.max(1, perRow - 1);
  const xStart = perRow === 1 ? VIEWBOX_W / 2 : 100;
  const yStart = rows === 1 ? VIEWBOX_H / 2 : 200;
  const yStep = rows > 1 ? 200 : 0;
  const positions = stations.map((_, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return { x: xStart + col * xStep, y: yStart + row * yStep };
  });

  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} style={{ width: '100%', height: '100%' }}>
      <defs>
        {stations.map((s, i) => {
          const isHot = i === bottleneckOpIndex && s.queueLen > 0;
          const intensity = isHot
            ? 1
            : Math.min(1, 0.2 + (s.serversTotal > 0 ? s.busy / s.serversTotal : 0) * 0.7 + Math.min(0.5, s.queueLen / 10));
          const col = isHot ? SW_COLORS.alarm : intensity > 0.7 ? SW_COLORS.warn : SW_COLORS.ok;
          return (
            <radialGradient key={`hg-${s.opId}`} id={`sim-heat-${s.opId}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={col} stopOpacity={intensity} />
              <stop offset="100%" stopColor={col} stopOpacity={0} />
            </radialGradient>
          );
        })}
        <linearGradient id="sim-heat-legend" x1="0%" x2="100%">
          <stop offset="0%" stopColor={SW_COLORS.ok} />
          <stop offset="60%" stopColor={SW_COLORS.warn} />
          <stop offset="100%" stopColor={SW_COLORS.alarm} />
        </linearGradient>
      </defs>

      <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="#0d1219" />

      {/* Title */}
      <text
        x={VIEWBOX_W / 2}
        y={28}
        textAnchor="middle"
        fill="#ffffff80"
        fontFamily={SW_FONTS.mono}
        fontSize={12}
        fontWeight={800}
        letterSpacing="2px"
      >
        {garmentName.toUpperCase()} · HEAT · UTIL × QUEUE PRESSURE
      </text>

      {/* Heat blobs */}
      {stations.map((s, i) => (
        <circle
          key={`blob-${s.opId}`}
          cx={positions[i].x}
          cy={positions[i].y}
          r={120}
          fill={`url(#sim-heat-${s.opId})`}
          style={{ mixBlendMode: 'screen' }}
        />
      ))}

      {/* Station markers + label */}
      {stations.map((s, i) => {
        const isHot = i === bottleneckOpIndex && s.queueLen > 0;
        return (
          <g key={`mk-${s.opId}`} transform={`translate(${positions[i].x}, ${positions[i].y})`}>
            <circle r={5} fill={isHot ? SW_COLORS.alarm : '#fff'} opacity={0.9} />
            <text
              y={-14}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={800}
              fill={isHot ? SW_COLORS.alarm : '#ffffffcc'}
              letterSpacing="0.05em"
            >
              {s.opCode ?? `OP-${i + 1}`}
            </text>
            <text y={20} textAnchor="middle" fontFamily={SW_FONTS.mono} fontSize={8} fill="#ffffff80">
              Q={s.queueLen} · {s.busy}/{s.serversTotal}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${VIEWBOX_W - 220}, 50)`}>
        <rect width={200} height={62} fill="#0a0d12cc" stroke="#ffffff20" rx={4} />
        <text x={12} y={20} fill="#fff" fontFamily={SW_FONTS.mono} fontSize={10} fontWeight={900} letterSpacing="0.15em">
          PRESSURE HEAT
        </text>
        <rect x={12} y={30} width={176} height={10} fill="url(#sim-heat-legend)" />
        <text x={12} y={54} fill="#ffffff80" fontFamily={SW_FONTS.mono} fontSize={9}>
          flowing
        </text>
        <text x={188} y={54} fill="#ffffff80" fontFamily={SW_FONTS.mono} fontSize={9} textAnchor="end">
          choked
        </text>
      </g>
    </svg>
  );
}

// ============================================================================
// LOGIC VIEW — block-flow / schema diagram (AnyLogic-style)
// ============================================================================
//
// Each operation becomes a flow card with its OP code, SMV, queue length,
// busy/total servers, and live throughput. Cards are connected in routing
// order with marching arrows, so the user can see WHERE in the logical flow
// the bottleneck sits — independent of physical layout.

function SimLogicView({ stations, bottleneckOpIndex, garmentName, simTime }: SimViewProps) {
  if (stations.length === 0) return <svg style={{ width: '100%', height: '100%' }} />;

  // Wrap into rows of up to 4 cards so each card stays large enough to read.
  // Cards carry an explicit label for every number; flow connectors are
  // bright and thick so the routing reads at a glance.
  const W = 1200;
  const CARD_W = 260;
  const CARD_H = 210;
  const cols = Math.min(stations.length, 4);
  const rows = Math.ceil(stations.length / cols);
  const PAD_X = 40;
  const PAD_TOP = 70;
  const PAD_BOTTOM = 110;
  const ROW_GAP = 70;
  // Distribute cards evenly across the available width.
  const usableW = W - PAD_X * 2;
  const colStep = cols > 1 ? (usableW - CARD_W) / (cols - 1) : 0;
  const H = PAD_TOP + rows * CARD_H + (rows - 1) * ROW_GAP + PAD_BOTTOM;

  const positions = stations.map((_, i) => {
    const row = Math.floor(i / cols);
    // Snake-wrap so adjacent ops in the bulletin stay visually adjacent.
    const rawCol = i % cols;
    const col = row % 2 === 0 ? rawCol : cols - 1 - rawCol;
    return {
      x: PAD_X + col * colStep,
      y: PAD_TOP + row * (CARD_H + ROW_GAP),
      col,
      row,
    };
  });

  const totalBusyTime = simTime > 0 ? simTime : 1;
  const stationsThroughput = stations.map((s) => {
    if (totalBusyTime <= 0) return 0;
    return Math.round((s.produced / totalBusyTime) * 60);
  });

  // Connector colour follows the upstream station's utilization tier so the
  // routing line itself communicates pressure: green = healthy flow, orange
  // = warming, red = bottleneck. Brighter than the previous translucent
  // dashed stroke so the path stays legible on the dark grid.
  function connectorColor(i: number): string {
    const s = stations[i];
    if (!s) return '#ffffff80';
    if (i === bottleneckOpIndex && s.queueLen > 0) return SW_COLORS.alarm;
    const occ = s.serversTotal > 0 ? s.busy / s.serversTotal : 0;
    if (occ >= 0.85) return SW_COLORS.warn;
    return SW_COLORS.ok;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <pattern id="sim-logic-grid" width={32} height={32} patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#ffffff06" strokeWidth={1} />
        </pattern>
        <marker
          id="sim-logic-arrow-ok"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={SW_COLORS.ok} />
        </marker>
        <marker
          id="sim-logic-arrow-warn"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={SW_COLORS.warn} />
        </marker>
        <marker
          id="sim-logic-arrow-alarm"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={SW_COLORS.alarm} />
        </marker>
      </defs>
      <rect width={W} height={H} fill="#0d1219" />
      <rect width={W} height={H} fill="url(#sim-logic-grid)" />

      <text
        x={W / 2}
        y={36}
        textAnchor="middle"
        fill="#ffffffcc"
        fontFamily={SW_FONTS.mono}
        fontSize={13}
        fontWeight={800}
        letterSpacing="2px"
      >
        {garmentName.toUpperCase()} · LOGIC · OPERATION FLOW SCHEMA
      </text>

      {/* Flow connectors — colour-coded by the upstream station's pressure. */}
      {stations.map((_, i) => {
        if (i === stations.length - 1) return null;
        const a = positions[i];
        const b = positions[i + 1];
        const sx = a.x + CARD_W;
        const sy = a.y + CARD_H / 2;
        const ex = b.x;
        const ey = b.y + CARD_H / 2;
        const col = connectorColor(i);
        const markerKey = col === SW_COLORS.alarm ? 'alarm' : col === SW_COLORS.warn ? 'warn' : 'ok';
        let path: string;
        if (a.row === b.row) {
          // Same-row hop — direct horizontal segment.
          path = `M ${sx} ${sy} L ${ex - 6} ${ey}`;
        } else {
          // Row wrap — snake-routed through the gap so the line returns to
          // the opposite end of the canvas without crossing cards.
          const midY = (a.y + CARD_H + b.y) / 2;
          const exitX = a.col === cols - 1 || b.col < a.col ? sx + 20 : sx + 20;
          const entryX = b.col === 0 || b.x < a.x ? b.x - 20 : b.x - 20;
          path = `M ${sx} ${sy} L ${exitX} ${sy} L ${exitX} ${midY} L ${entryX} ${midY} L ${entryX} ${ey} L ${ex - 6} ${ey}`;
        }
        return (
          <path
            key={`flow-${i}`}
            d={path}
            fill="none"
            stroke={col}
            strokeWidth={3}
            strokeOpacity={0.85}
            strokeDasharray="8 5"
            markerEnd={`url(#sim-logic-arrow-${markerKey})`}
            style={{ animation: 'sim-march 0.9s linear infinite' }}
            pointerEvents="none"
          />
        );
      })}

      {/* Operation cards — each metric carries its own label. */}
      {stations.map((s, i) => {
        const p = positions[i];
        const isHot = i === bottleneckOpIndex && s.queueLen > 0;
        const occupancy = s.serversTotal > 0 ? s.busy / s.serversTotal : 0;
        const utilCol = isHot ? SW_COLORS.alarm : occupancy >= 0.85 ? SW_COLORS.warn : SW_COLORS.ok;
        // Card accent = machine-type colour from the asset library. Stays
        // stable as the sim runs; bottleneck state is communicated by a
        // separate red outline + alarm pip below, not by recolouring the
        // identity strip itself.
        const cardAsset = stationAsset(s.machineCode);
        const accent = cardAsset.color;
        const pcsHr = stationsThroughput[i];
        const queueOver = s.queueLen > 8;

        return (
          <g key={s.opId} transform={`translate(${p.x}, ${p.y})`}>
            <rect
              x={0}
              y={0}
              width={CARD_W}
              height={CARD_H}
              rx={8}
              fill="#0a0d12"
              stroke={isHot ? SW_COLORS.alarm : accent}
              strokeWidth={isHot ? 3 : 1.5}
            />
            {/* Header strip — machine-type colour. */}
            <rect x={0} y={0} width={CARD_W} height={32} rx={8} fill={accent} />
            <rect x={0} y={24} width={CARD_W} height={8} fill={accent} />
            <text
              x={14}
              y={21}
              fontFamily={SW_FONTS.display}
              fontSize={13}
              fontWeight={900}
              fill="#fff"
              letterSpacing="0.08em"
            >
              {s.opCode ?? `OP-${i + 1}`}
            </text>
            {/* Machine-type tag on the right of the header strip — single
                glyph + short name pulled from the asset library so the
                card always announces the equipment that runs this op. */}
            <text
              x={CARD_W - 14}
              y={21}
              textAnchor="end"
              fontFamily={SW_FONTS.mono}
              fontSize={11}
              fontWeight={900}
              fill="#fff"
              letterSpacing="0.1em"
            >
              {cardAsset.glyph} {cardAsset.label}
            </text>

            {/* Op name + SMV. */}
            <text
              x={CARD_W / 2}
              y={52}
              textAnchor="middle"
              fontFamily={SW_FONTS.body}
              fontSize={12}
              fontWeight={700}
              fill="#fff"
            >
              {s.opName.length > 30 ? s.opName.slice(0, 28) + '…' : s.opName}
            </text>
            <text
              x={CARD_W / 2}
              y={66}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={10}
              fontWeight={700}
              fill="#ffffff80"
              letterSpacing="0.05em"
            >
              SMV {s.smv.toFixed(2)} min
            </text>

            {/* Throughput hero. Inline label sits underneath so the meaning
                of the big number is unmistakable. */}
            <text
              x={CARD_W / 2}
              y={92}
              textAnchor="middle"
              fontFamily={SW_FONTS.display}
              fontSize={32}
              fontWeight={900}
              fill={SW_COLORS.brand}
              letterSpacing="-0.02em"
            >
              {pcsHr}
            </text>
            <text
              x={CARD_W / 2}
              y={107}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={800}
              fill="#ffffff80"
              letterSpacing="0.15em"
            >
              THROUGHPUT (PCS/HR)
            </text>

            {/* Util bar with explicit "UTIL" label on the left and the % on
                the right so it doesn't read as a mystery percentage. */}
            <text
              x={14}
              y={130}
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={800}
              fill="#ffffff90"
              letterSpacing="0.1em"
            >
              UTIL
            </text>
            <text
              x={CARD_W - 14}
              y={130}
              textAnchor="end"
              fontFamily={SW_FONTS.mono}
              fontSize={11}
              fontWeight={800}
              fill={utilCol}
            >
              {Math.round(occupancy * 100)}%
            </text>
            <rect x={14} y={136} width={CARD_W - 28} height={6} rx={3} fill="#ffffff15" />
            <rect
              x={14}
              y={136}
              width={Math.max(0, (CARD_W - 28) * occupancy)}
              height={6}
              rx={3}
              fill={utilCol}
            />

            {/* Bottom metric tiles — Queue & Busy/Servers, each with a label. */}
            <g transform={`translate(14, ${CARD_H - 50})`}>
              <rect width={(CARD_W - 38) / 2} height={36} rx={4} fill="#ffffff08" />
              <text
                x={10}
                y={14}
                fontFamily={SW_FONTS.mono}
                fontSize={8}
                fontWeight={800}
                fill="#ffffff80"
                letterSpacing="0.1em"
              >
                QUEUE
              </text>
              <text
                x={10}
                y={29}
                fontFamily={SW_FONTS.mono}
                fontSize={14}
                fontWeight={900}
                fill={queueOver ? SW_COLORS.alarm : '#fff'}
              >
                {s.queueLen}
              </text>
              <text
                x={(CARD_W - 38) / 2 - 10}
                y={29}
                textAnchor="end"
                fontFamily={SW_FONTS.mono}
                fontSize={9}
                fontWeight={700}
                fill="#ffffff70"
              >
                pcs
              </text>
            </g>
            <g transform={`translate(${14 + (CARD_W - 38) / 2 + 10}, ${CARD_H - 50})`}>
              <rect width={(CARD_W - 38) / 2} height={36} rx={4} fill="#ffffff08" />
              <text
                x={10}
                y={14}
                fontFamily={SW_FONTS.mono}
                fontSize={8}
                fontWeight={800}
                fill="#ffffff80"
                letterSpacing="0.1em"
              >
                BUSY / SERVERS
              </text>
              <text
                x={10}
                y={29}
                fontFamily={SW_FONTS.mono}
                fontSize={14}
                fontWeight={900}
                fill="#fff"
              >
                {s.busy}/{s.serversTotal}
              </text>
            </g>

            {/* Bottleneck flag — diamond on the header strip's right side. */}
            {isHot && (
              <g transform={`translate(${CARD_W - 18}, 16)`} pointerEvents="none">
                <circle r={9} fill="#fff" opacity={0.18}>
                  <animate attributeName="r" values="9;14;9" dur="0.9s" repeatCount="indefinite" />
                </circle>
                <text
                  textAnchor="middle"
                  y={5}
                  fontFamily={SW_FONTS.display}
                  fontSize={13}
                  fontWeight={900}
                  fill="#fff"
                >
                  ◆
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Legend — colour-coded swatches with explicit labels for each tier. */}
      <g transform={`translate(${PAD_X}, ${H - 80})`}>
        <rect width={W - PAD_X * 2} height={56} fill="#0a0d12cc" stroke="#ffffff20" rx={6} />
        <text
          x={16}
          y={22}
          fill="#fff"
          fontFamily={SW_FONTS.mono}
          fontSize={11}
          fontWeight={900}
          letterSpacing="0.2em"
        >
          LEGEND
        </text>
        {[
          { color: SW_COLORS.ok, label: 'Healthy flow (util < 85%)' },
          { color: SW_COLORS.warn, label: 'Warming (util ≥ 85%)' },
          { color: SW_COLORS.alarm, label: 'Bottleneck (queue building)' },
          { color: SW_COLORS.brand, label: 'Operation card · throughput' },
        ].map((it, i) => (
          <g key={i} transform={`translate(${90 + i * 245}, 14)`}>
            <rect width={14} height={14} rx={3} fill={it.color} />
            <text
              x={22}
              y={11}
              fill="#ffffffcc"
              fontFamily={SW_FONTS.mono}
              fontSize={10}
              fontWeight={700}
            >
              {it.label}
            </text>
          </g>
        ))}
        <text
          x={16}
          y={42}
          fill="#ffffff80"
          fontFamily={SW_FONTS.mono}
          fontSize={10}
          fontWeight={600}
        >
          Connectors flow left-to-right and snake across rows. Arrow colour matches the upstream station's pressure tier.
        </text>
      </g>
    </svg>
  );
}

// ============================================================================
// PML VIEW — block-graph snapshot of the active twin
// ============================================================================
//
// Reads `kpiObserved` off each workstation in the active twin and renders
// a card grid sorted by throughput. Inline `▶ Run PML` button kicks off
// a fresh sim against the active twin without leaving this page. Skips
// the per-tick streaming animation that the legacy views have — the PML
// engine is one-shot for v1; per-minute timeseries playback is scoped to
// a follow-up turn (the engine needs to record samples first).

interface SimPmlViewProps {
  garment: GarmentTemplate;
  operators: number;
  /** True when a reference paper has been loaded — currently unused beyond
   *  the playback-reset effect since we always build from the garment prop
   *  (which already folds in the reference's garmentTemplate when loaded). */
  hasReference: boolean;
}

// The PML view always synthesises a Source → ops → Sink twin from the
// garment prop, so picking a different garment in LiveSim's HUD immediately
// reshapes the block grid. The store's active twin is only used as a safety
// fallback if the garment carries no operations.
function SimPmlView({ garment, operators, hasReference }: SimPmlViewProps) {
  const activeTwin = useTwin(selectActiveTwin);
  const garmentTwin = useMemo(
    () => buildGarmentTwin(garment, operators),
    [garment, operators],
  );
  const twin = garmentTwin ?? activeTwin;
  /** Last completed run, retained so the timeline can scrub through it. */
  const [report, setReport] = useState<RunReport | null>(null);
  /** Index into report.raw.samples — the frame currently rendered. */
  const [frame, setFrame] = useState(0);
  /** Wall-clock playback state. Each tick advances `frame` by 1. */
  const [playing, setPlaying] = useState(false);
  /** Sim-minutes per real-second (1× = real time, 60× = 1 sim-min/sec). */
  const [speed, setSpeed] = useState(60);

  // When the user switches garment / operator count / reference flag, the
  // previous report's workstation ids no longer match the new twin's stations
  // — every block card would vanish. Reset playback state so the user sees
  // the empty "Run PML" prompt for the new twin instead of stale empty cards.
  useEffect(() => {
    setReport(null);
    setFrame(0);
    setPlaying(false);
  }, [hasReference, garment.id, operators]);

  const samples = report?.raw.samples ?? [];
  const lastFrame = Math.max(0, samples.length - 1);
  const currentSample = samples[Math.min(frame, lastFrame)];
  const simMin = currentSample?.time ?? 0;

  // Playback loop. Advances `frame` every 50ms by `speed/20` sim-minutes
  // (so speed=60 → 3 sim-min per 50ms = 60 sim-min/sec wall-clock).
  // Uses setInterval rather than rAF so playback continues smoothly even
  // when the tab is in the background or under a hidden preview frame.
  useEffect(() => {
    if (!playing || samples.length === 0) return;
    const STEP_MS = 50;
    const id = setInterval(() => {
      setFrame((f) => {
        const advance = Math.max(1, Math.round((speed * STEP_MS) / 1000));
        const next = f + advance;
        if (next >= lastFrame) {
          setPlaying(false);
          return lastFrame;
        }
        return next;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing, samples.length, speed, lastFrame]);
  // Suppress unused-import lint until/unless we revisit rAF playback.
  void useRef;

  /** Build the per-block render list for the current frame. Throughput
   *  is computed from cumulative pieces / elapsed sim hours, so the
   *  numbers ramp up smoothly as playback advances. */
  const blockData = useMemo(() => {
    if (!currentSample || samples.length === 0) return [];
    const elapsedHr = currentSample.time / 60;
    return twin.workstations
      .map((w) => {
        const snap = currentSample.blocks.get(w.id);
        if (!snap) return null;
        const spec = getBlockSpec(w);
        const tputPerHr = elapsedHr > 0 ? snap.producedPieces / elapsedHr : 0;
        const obs = report?.raw.blocks.get(w.id);
        return {
          ws: w,
          spec,
          role: apparelRoleFor(w),
          producedPieces: snap.producedPieces,
          queueLen: snap.queueLen,
          inService: snap.inService,
          throughputPerHr: tputPerHr,
          // util only makes sense for resource-using blocks at the run-end;
          // mid-playback we show the live queue instead.
          utilizationPct: obs?.utilization ? obs.utilization * 100 : 0,
          bottleneck: obs?.bottleneck ?? false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((b) => b.producedPieces > 0 || b.queueLen > 0 || b.inService > 0)
      .sort((a, b) => b.throughputPerHr - a.throughputPerHr);
  }, [twin, currentSample, samples.length, report]);

  const sinkThroughput = blockData
    .filter((b) => b.spec.kind === 'Sink')
    .reduce((s, b) => s + b.throughputPerHr, 0);
  const bottleneck = blockData.find((b) => b.bottleneck);

  const runIt = () => {
    // Synthesised twin's workstation ids aren't in the store, so we skip
    // writeKpiObserved — a silent no-op anyway. The Reports page still has
    // its own auto-run that writes against the active store twin.
    const r = runPmlOnTwin(twin, { samplePeriodMin: 1 });
    setReport(r);
    setFrame(0);
    setPlaying(true);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: 24,
        overflow: 'auto',
        color: '#fff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900, letterSpacing: '0.06em' }}>
          ⚙ PML SIMULATION
        </div>
        <div style={{ fontSize: 12, color: '#ffffffaa', fontFamily: SW_FONTS.mono }}>
          {twin.name} · {twin.workstations.length} blocks · {twin.connectors.length} connectors
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="▶" onClick={runIt}>
          Run PML
        </Button>
      </div>

      {/* Playback strip — only shown after a run has produced samples. */}
      {samples.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
            padding: '8px 12px',
            background: '#ffffff08',
            border: '1px solid #ffffff20',
            borderRadius: 6,
          }}
        >
          <button
            onClick={() => setPlaying((p) => !p)}
            disabled={frame >= lastFrame && !playing}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: playing ? SW_COLORS.alarm : SW_COLORS.brand,
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 900,
              cursor: 'pointer',
            }}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            onClick={() => {
              setFrame(0);
              setPlaying(false);
            }}
            style={{
              padding: '4px 10px',
              fontFamily: SW_FONTS.mono,
              fontSize: 10,
              fontWeight: 800,
              color: '#fff',
              background: 'transparent',
              border: '1px solid #ffffff30',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title="Restart"
          >
            ↻ RESTART
          </button>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 13, fontWeight: 700, minWidth: 80, color: SW_COLORS.brand }}>
            t = {simMin.toFixed(0)} min
          </div>
          <input
            type="range"
            min={0}
            max={lastFrame}
            value={frame}
            onChange={(e) => {
              setFrame(parseInt(e.target.value));
              setPlaying(false);
            }}
            style={{ flex: 1, accentColor: SW_COLORS.brand }}
          />
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: '#ffffff80' }}>
            {frame + 1} / {samples.length}
          </div>
          <HudSelect
            value={String(speed)}
            onChange={(v) => setSpeed(parseInt(v))}
            mono
            size="sm"
            minWidth={150}
            title="Sim-minutes per wall-clock-second"
            options={[
              { value: '15', label: '15×', meta: 'SLOW' },
              { value: '60', label: '60×' },
              { value: '240', label: '240×', meta: 'FAST' },
              { value: '480', label: '480×', meta: 'FASTEST' },
            ]}
          />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <SimHudStat label="SINK THROUGHPUT" value={Math.round(sinkThroughput).toLocaleString()} unit="pcs/hr" color={SW_COLORS.brand} />
        <SimHudStat label="SUNK PIECES"     value={(currentSample?.totalSunkPieces ?? 0).toLocaleString()}    unit=""        color={SW_COLORS.fabric} />
        <SimHudStat label="BOTTLENECK"      value={bottleneck ? bottleneck.ws.name.slice(0, 18) : '—'}        unit=""        color={bottleneck ? SW_COLORS.alarm : '#ffffff60'} />
        <SimHudStat label="MAX UTIL"        value={Math.max(0, ...blockData.map((b) => b.utilizationPct)).toFixed(0)} unit="%" color={SW_COLORS.thread} />
      </div>

      {blockData.length === 0 ? (
        <div
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            border: '1px dashed #ffffff30',
            borderRadius: 8,
            color: '#ffffff80',
            fontFamily: SW_FONTS.mono,
          }}
        >
          {samples.length === 0
            ? <>No PML run on this twin yet. Click <strong style={{ color: SW_COLORS.brand }}>▶ Run PML</strong> to simulate the wired graph.</>
            : 'No flow yet at this time. Press play to advance the timeline.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {blockData.map((b) => (
            <SimPmlCard key={b.ws.id} block={b} />
          ))}
        </div>
      )}
    </div>
  );
}

interface PmlCardData {
  ws: Workstation;
  spec: ReturnType<typeof getBlockSpec>;
  role: string;
  producedPieces: number;
  queueLen: number;
  inService: number;
  throughputPerHr: number;
  utilizationPct: number;
  bottleneck: boolean;
}

/** One block card in the PML view, fed by a per-frame snapshot so values
 *  ramp up as playback advances. */
function SimPmlCard({ block: b }: { block: PmlCardData }) {
  return (
    <div
      style={{
        padding: 12,
        background: b.bottleneck ? '#3a1212' : '#ffffff08',
        border: `1px solid ${b.bottleneck ? SW_COLORS.alarm : '#ffffff20'}`,
        borderLeft: `4px solid ${b.bottleneck ? SW_COLORS.alarm : SW_COLORS.brand}`,
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        color: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 14, fontWeight: 900, color: SW_COLORS.brand }}>
          {b.spec.spec.glyph}
        </span>
        <span style={{ fontFamily: SW_FONTS.display, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#ffffffcc' }}>
          {b.spec.kind.toUpperCase()}
        </span>
        {b.bottleneck && (
          <span style={{ marginLeft: 'auto', fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 800, color: SW_COLORS.alarm, letterSpacing: '0.1em' }}>
            ◆ BOTTLENECK
          </span>
        )}
      </div>
      <div style={{ fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
        {b.ws.name}
      </div>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: '#ffffff80' }}>
        {b.role}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
        <div>
          <span style={{ fontFamily: SW_FONTS.mono, fontSize: 18, fontWeight: 900, color: '#fff' }}>
            {Math.round(b.throughputPerHr).toLocaleString()}
          </span>
          <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: '#ffffff80', marginLeft: 4 }}>
            pcs/hr
          </span>
        </div>
        {b.queueLen + b.inService > 0 && (
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.thread }}>
            Q {b.queueLen + b.inService}
          </div>
        )}
      </div>
    </div>
  );
}


