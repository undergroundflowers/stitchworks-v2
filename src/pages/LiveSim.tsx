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
import { Button, ToggleGroup } from '../components';
import {
  buildSimConfig,
  efficiencyFromSkillMatrix,
  useSim,
  type StationView,
} from '../simulation';
import { useProject, useGarments } from '../store';
import { isoProj, ptsToStr, CuboidFaces, SW_PAL, shade } from '../domain';
import { useTwin, selectActiveTwin } from '../store/twin';
import { runPmlOnTwin, type RunReport } from '../simulation/pml-runner';
import { getBlockSpec, apparelRoleFor } from '../domain/pml';
import type { Workstation } from '../domain/twin';
import { REFERENCE_MODELS, REFERENCE_MODELS_BY_SLUG, type ReferenceModel } from '../domain/reference-models';
import { buildReferenceTwin } from '../domain/reference-twin';
import { useReferenceContext } from '../store/reference';

/** Total operator pool count for a (paper, variant/scenario) selection.
 *  Falls back to the baseline op count if the chosen variant key is unknown. */
function variantOperatorCount(model: ReferenceModel, key: string): number {
  if (key === 'baseline') return model.baseline.operators;
  if (key === 'proposed') return model.proposed?.operators ?? model.baseline.operators;
  const scenario = model.scenarios?.find((s) => s.id === key);
  return scenario?.operators ?? model.baseline.operators;
}

type SimView = 'iso' | 'top' | 'heat' | 'logic' | 'pml';

const SHIFT_MIN_PER_DAY = 480;

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

  const opEfficiency = useMemo(
    () => efficiencyFromSkillMatrix(project.skillMatrix, garment.operations),
    [project.skillMatrix, garment],
  );

  const config = useMemo(
    () => buildSimConfig({ garment, operators: effectiveOperators, opEfficiency }),
    [garment, effectiveOperators, opEfficiency],
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

  const elapsedMin = Math.round(state.time);
  const hr = 8 + Math.floor(elapsedMin / 60);
  const mn = (elapsedMin % 60).toString().padStart(2, '0');

  const throughputPerHr =
    state.history.length > 0
      ? state.history[state.history.length - 1].throughputPerHr * config.bundleSize
      : 0;

  const efficiencyPct = Math.round(state.utilization * 100);
  const shiftPct = Math.min(100, (state.time / SHIFT_MIN_PER_DAY) * 100);

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
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 24, fontWeight: 700, color: '#fff' }}>
          {hr.toString().padStart(2, '0')}:{mn}
        </div>
        <div style={{ fontSize: 11, color: '#ffffff80', fontFamily: SW_FONTS.mono }}>SHIFT A · DAY 14</div>

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
          <ToggleGroup
            value={refOverride ? '' : garmentId}
            onChange={(id) => {
              // Manual garment pick overrides any active reference selection,
              // so the toggle stays authoritative.
              if (refOverride) clearRefContext();
              setGarmentId(id);
            }}
            options={garments.all.map((g) => ({
              value: g.id,
              label: g.name.replace(/\s*\(.*\)/, ''),
            }))}
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

        <select
          value={refSlug}
          onChange={(e) => setRefSlug(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid #ffffff25',
            background: '#ffffff10',
            borderRadius: SW_RADIUS.sm,
            color: '#fff',
            fontFamily: SW_FONTS.body,
            fontSize: 12,
            fontWeight: 700,
            minWidth: 260,
            cursor: 'pointer',
          }}
        >
          {REFERENCE_MODELS.map((m) => (
            <option key={m.slug} value={m.slug} style={{ color: '#0F1419' }}>
              {m.authorYear} — {m.title}
            </option>
          ))}
        </select>

        <select
          value={refVariantKey}
          onChange={(e) => setRefVariantKey(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid #ffffff25',
            background: '#ffffff10',
            borderRadius: SW_RADIUS.sm,
            color: '#fff',
            fontFamily: SW_FONTS.body,
            fontSize: 12,
            fontWeight: 700,
            minWidth: 280,
            cursor: 'pointer',
          }}
        >
          {variantOptions.map((o) => (
            <option key={o.key} value={o.key} style={{ color: '#0F1419' }}>
              [{o.tag}] {o.label}
            </option>
          ))}
        </select>

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
          />
        )}
        {view === 'top' && (
          <SimTopView
            stations={state.stations}
            bottleneckOpIndex={state.bottleneckOpIndex}
            garmentName={garment.name}
            simTime={state.time}
          />
        )}
        {view === 'heat' && (
          <SimHeatView
            stations={state.stations}
            bottleneckOpIndex={state.bottleneckOpIndex}
            garmentName={garment.name}
            simTime={state.time}
          />
        )}
        {view === 'logic' && (
          <SimLogicView
            stations={state.stations}
            bottleneckOpIndex={state.bottleneckOpIndex}
            garmentName={garment.name}
            simTime={state.time}
          />
        )}
        {view === 'pml' && <SimPmlView />}

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
            <div style={{ fontSize: 11, fontFamily: SW_FONTS.mono, lineHeight: 1.6, overflow: 'auto', flex: 1 }}>
              {state.events.length === 0 && (
                <div style={{ color: '#ffffff60', fontStyle: 'italic' }}>No events yet — press PLAY.</div>
              )}
              {state.events.map((e, i) => {
                const eHr = 8 + Math.floor(e.time / 60);
                const eMn = (Math.round(e.time) % 60).toString().padStart(2, '0');
                const col =
                  e.tag === 'OUT'
                    ? SW_COLORS.ok
                    : e.tag === 'STARVE'
                      ? SW_COLORS.warn
                      : SW_COLORS.alarm;
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                    <span style={{ color: '#ffffff60', width: 38 }}>
                      {eHr.toString().padStart(2, '0')}:{eMn}
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
        <Button variant="secondary" size="sm" onClick={() => step(60)}>
          ⏭ +1h
        </Button>
        <div style={{ width: 1, height: 28, background: '#ffffff20' }} />
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: '#ffffff80', fontWeight: 700 }}>SPEED</span>
        {[0.5, 1, 2, 5, 10].map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            style={{
              background: speed === s ? SW_COLORS.brand : '#ffffff10',
              color: speed === s ? '#fff' : '#ffffffaa',
              border: 'none',
              borderRadius: SW_RADIUS.sm,
              padding: '6px 12px',
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {s}×
          </button>
        ))}
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
            DAY 14 · SHIFT A · {Math.round(shiftPct)}% complete · t = {elapsedMin} min
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

function layoutStations(stations: StationView[]): {
  cells: StationLayout[];
  gridW: number;
  gridH: number;
  perRow: number;
} {
  const n = stations.length;
  if (n === 0) return { cells: [], gridW: 1, gridH: 1, perRow: 1 };
  const perRow = Math.min(n, 6);
  const rows = Math.ceil(n / perRow);
  const stride = 3; // 3 cells between station centres
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
}

function SimIsoView({ stations, bottleneckOpIndex, garmentName, simTime }: SimViewProps) {
  if (stations.length === 0) return <svg style={{ width: '100%', height: '100%' }} />;

  const { cells, gridW, gridH } = layoutStations(stations);

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
  const accent = isHot
    ? SW_PAL.red
    : occupancy > 0.7
      ? SW_PAL.yellow
      : SW_PAL.blue;

  return (
    <g transform={`translate(${origin.sx}, ${origin.sy})`}>
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
      {/* Machine head on top */}
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
          top: accent,
          left: shade(accent, -0.2),
          right: accent,
        })}
      </g>
      {/* Op label badge floating above */}
      {(() => {
        const p = isoProj(w / 2, d / 2, 1.7);
        return (
          <g transform={`translate(${p.sx}, ${p.sy})`} pointerEvents="none">
            <rect x={-34} y={-22} width={68} height={20} rx={4} fill="#0a0d12" stroke="#ffffff20" strokeWidth={1} />
            <text
              x={0}
              y={-13}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={800}
              fill="#fff"
              letterSpacing="0.05em"
            >
              {s.opCode ?? `OP-${index + 1}`}
            </text>
            <text
              x={0}
              y={-3}
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

  const W = 1280;
  const H = 720;
  const CARD_W = 200;
  const CARD_H = 130;
  const cols = Math.min(stations.length, 6);
  const colStep = (W - 80 - CARD_W) / Math.max(1, cols - 1);
  const rowStep = CARD_H + 70;

  const positions = stations.map((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { x: 40 + col * colStep, y: 70 + row * rowStep, col, row };
  });

  // Per-card produced-rate estimate (pieces/hr at this station).
  const totalBusyTime = simTime > 0 ? simTime : 1;
  const stationsThroughput = stations.map((s) => {
    if (totalBusyTime <= 0) return 0;
    return Math.round((s.produced / totalBusyTime) * 60);
  });

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
          id="sim-logic-arrow"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#ffffff90" />
        </marker>
      </defs>
      <rect width={W} height={H} fill="#0d1219" />
      <rect width={W} height={H} fill="url(#sim-logic-grid)" />

      <text
        x={W / 2}
        y={36}
        textAnchor="middle"
        fill="#ffffff80"
        fontFamily={SW_FONTS.mono}
        fontSize={12}
        fontWeight={800}
        letterSpacing="2px"
      >
        {garmentName.toUpperCase()} · LOGIC · OPERATION FLOW SCHEMA
      </text>

      {/* Flow arrows */}
      {stations.map((_, i) => {
        if (i === stations.length - 1) return null;
        const a = positions[i];
        const b = positions[i + 1];
        const sx = a.x + CARD_W;
        const sy = a.y + CARD_H / 2;
        const ex = b.x;
        const ey = b.y + CARD_H / 2;
        let path: string;
        if (a.row === b.row) {
          path = `M ${sx} ${sy} L ${ex - 4} ${ey}`;
        } else {
          const midY = (a.y + CARD_H + b.y) / 2;
          path = `M ${sx} ${sy} L ${sx + 18} ${sy} L ${sx + 18} ${midY} L ${b.x - 18} ${midY} L ${b.x - 18} ${ey} L ${ex - 4} ${ey}`;
        }
        return (
          <path
            key={`flow-${i}`}
            d={path}
            fill="none"
            stroke="#ffffff35"
            strokeWidth={2}
            strokeDasharray="6 5"
            markerEnd="url(#sim-logic-arrow)"
            style={{ animation: 'sim-march 0.9s linear infinite' }}
            pointerEvents="none"
          />
        );
      })}

      {/* Operation flow cards */}
      {stations.map((s, i) => {
        const p = positions[i];
        const isHot = i === bottleneckOpIndex && s.queueLen > 0;
        const occupancy = s.serversTotal > 0 ? s.busy / s.serversTotal : 0;
        const utilCol = isHot ? SW_COLORS.alarm : occupancy >= 0.85 ? SW_COLORS.warn : SW_COLORS.ok;
        const accent = isHot ? SW_COLORS.alarm : SW_COLORS.brand;
        const pcsHr = stationsThroughput[i];

        return (
          <g key={s.opId} transform={`translate(${p.x}, ${p.y})`}>
            <rect
              x={0}
              y={0}
              width={CARD_W}
              height={CARD_H}
              rx={6}
              fill="#0a0d12"
              stroke={accent}
              strokeWidth={isHot ? 2.5 : 1.5}
            />
            {/* Header strip */}
            <rect x={0} y={0} width={CARD_W} height={26} rx={6} fill={accent} />
            <rect x={0} y={20} width={CARD_W} height={6} fill={accent} />
            <text
              x={12}
              y={17}
              fontFamily={SW_FONTS.display}
              fontSize={11}
              fontWeight={900}
              fill="#fff"
              letterSpacing="0.08em"
            >
              {s.opCode ?? `OP-${i + 1}`}
            </text>
            <text
              x={CARD_W - 12}
              y={17}
              textAnchor="end"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={800}
              fill="#ffffffcc"
            >
              {s.smv.toFixed(2)}m
            </text>

            {/* Op name */}
            <text
              x={CARD_W / 2}
              y={44}
              textAnchor="middle"
              fontFamily={SW_FONTS.body}
              fontSize={10}
              fontWeight={700}
              fill="#ffffffcc"
            >
              {s.opName.length > 26 ? s.opName.slice(0, 24) + '…' : s.opName}
            </text>

            {/* Throughput hero */}
            <text
              x={CARD_W / 2}
              y={72}
              textAnchor="middle"
              fontFamily={SW_FONTS.display}
              fontSize={26}
              fontWeight={900}
              fill="#fff"
              letterSpacing="-0.02em"
            >
              {pcsHr}
            </text>
            <text
              x={CARD_W / 2}
              y={86}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={8}
              fontWeight={700}
              fill="#ffffff80"
              letterSpacing="0.1em"
            >
              PCS/HR
            </text>

            {/* Util bar */}
            <rect x={12} y={94} width={CARD_W - 24} height={3} rx={1.5} fill="#ffffff15" />
            <rect
              x={12}
              y={94}
              width={Math.max(0, (CARD_W - 24) * occupancy)}
              height={3}
              rx={1.5}
              fill={utilCol}
            />

            {/* Bottom row: queue + busy/total */}
            <text
              x={12}
              y={114}
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={700}
              fill={s.queueLen > 8 ? SW_COLORS.thread : '#ffffffaa'}
            >
              Q={s.queueLen}
            </text>
            <text
              x={CARD_W / 2}
              y={114}
              textAnchor="middle"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={700}
              fill="#ffffffaa"
            >
              {s.busy}/{s.serversTotal}
            </text>
            <text
              x={CARD_W - 12}
              y={114}
              textAnchor="end"
              fontFamily={SW_FONTS.mono}
              fontSize={9}
              fontWeight={800}
              fill={isHot ? SW_COLORS.alarm : utilCol}
            >
              {Math.round(occupancy * 100)}%
            </text>

            {/* Animated travelling dot for the routing arrow's tail */}
            {Array.from({ length: 3 }).map((_, k) => {
              const phase = ((simTime * 0.04 + k * 0.33 + i * 0.1) % 1 + 1) % 1;
              const dx = 14 + (CARD_W - 28) * phase;
              return (
                <circle
                  key={`dot-${k}`}
                  cx={dx}
                  cy={88}
                  r={1.5}
                  fill={accent}
                  opacity={0.6}
                  pointerEvents="none"
                />
              );
            })}

            {/* Bottleneck flag */}
            {isHot && (
              <g transform={`translate(${CARD_W - 18}, ${CARD_H - 18})`} pointerEvents="none">
                <circle r={6} fill={SW_COLORS.alarm}>
                  <animate attributeName="r" values="6;9;6" dur="0.8s" repeatCount="indefinite" />
                </circle>
                <text
                  textAnchor="middle"
                  y={3}
                  fontFamily={SW_FONTS.display}
                  fontSize={9}
                  fontWeight={900}
                  fill="#fff"
                >
                  !
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${W - 220}, ${H - 60})`}>
        <rect width={200} height={44} fill="#0a0d12cc" stroke="#ffffff20" rx={4} />
        <text
          x={12}
          y={18}
          fill="#fff"
          fontFamily={SW_FONTS.mono}
          fontSize={10}
          fontWeight={900}
          letterSpacing="0.15em"
        >
          LOGIC LEGEND
        </text>
        <text x={12} y={34} fill="#ffffff80" fontFamily={SW_FONTS.mono} fontSize={9}>
          ⬛ op · → routing · ● bottleneck
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

function SimPmlView() {
  const twin = useTwin(selectActiveTwin);
  const setKpiObserved = useTwin((s) => s.setKpiObserved);
  /** Last completed run, retained so the timeline can scrub through it. */
  const [report, setReport] = useState<RunReport | null>(null);
  /** Index into report.raw.samples — the frame currently rendered. */
  const [frame, setFrame] = useState(0);
  /** Wall-clock playback state. Each tick advances `frame` by 1. */
  const [playing, setPlaying] = useState(false);
  /** Sim-minutes per real-second (1× = real time, 60× = 1 sim-min/sec). */
  const [speed, setSpeed] = useState(60);

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
    const r = runPmlOnTwin(twin, { writeKpiObserved: setKpiObserved, samplePeriodMin: 1 });
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
          <select
            value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value))}
            style={{
              padding: '4px 8px',
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 800,
              color: '#fff',
              background: '#ffffff10',
              border: '1px solid #ffffff20',
              borderRadius: 4,
            }}
            title="Sim-minutes per wall-clock-second"
          >
            <option value={15}>15× SLOW</option>
            <option value={60}>60×</option>
            <option value={240}>240× FAST</option>
            <option value={480}>480× FASTEST</option>
          </select>
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


