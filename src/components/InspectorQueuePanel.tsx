/**
 * Inspector-mounted wrapper around QueueAnalysisPanel.
 *
 * Surfaces the per-station queueing-theory view (M/M/c, Kendall–Lee, ρ, Lq…)
 * inside the Factory Builder's Inspector when a workstation is selected, so
 * the user doesn't have to leave Builder to reason about the block as a
 * queueing object. Mirrors the wiring that `WorkstationDetail` does for its
 * stand-alone route — garment → synthetic twin → usePmlSim → warm-up →
 * StationView (via adapter) → panel — but scoped to a single workstation.
 *
 * In addition to the Kendall + KPI block, this wrapper renders two
 * companion sections that previously lived only on the dedicated
 * Workstation Detail and Queue Analytics pages:
 *
 *  1.  ρ, L, Wq, Lq time-series for the selected station, each with the
 *      analytical steady-state target overlaid as a dashed line. This is
 *      the visual sim-vs-theory comparison.
 *  2.  Cross-station compare — pick one of the four metrics from a toggle
 *      and see every station's time-series stacked, with the currently
 *      inspected workstation highlighted. Lets the user rank the
 *      bottleneck without leaving Builder.
 */

import { useEffect, useMemo, useState } from 'react';
import { QueueAnalysisPanel, type QueueAnalysisChange } from './QueueAnalysisPanel';
import { Card } from './Card';
import { SectionHeader } from './SectionHeader';
import { ToggleGroup } from './ToggleGroup';
import {
  StationTimeseriesChart,
  StationTimeseriesGrid,
  type StationMetric,
} from './StationTimeseriesChart';
import {
  usePmlSim,
  EMPTY_TWIN,
  type ServiceDist,
  type StationView,
} from '../simulation';
import { buildGarmentTwin } from '../domain/reference-twin';
import { useProject } from '../store/project';
import { useGarments } from '../store/garments';
import { GARMENT_TEMPLATES } from '../domain';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import type { Workstation, Twin } from '../domain/twin';

/** Same warm-up length WorkstationDetail uses — long enough for analytical KPIs to stabilise. */
const WARMUP_MINUTES = 480;

export function InspectorQueuePanel({ ws }: { ws: Workstation }) {
  const garments = useGarments();
  const projectSelectedGarmentId = useProject((s) => s.selectedGarmentId);
  const defaultOperators = useProject((s) => s.defaultOperators);
  const updateOperation = useProject((s) => s.updateOperation);

  // Workstation's operation may target a specific garment; otherwise inherit
  // the project's active selection so the lookup matches what the rest of the
  // app uses (LiveSim, Reports).
  const garmentId = ws.operation.garmentId ?? projectSelectedGarmentId;
  const garment = garments.byId[garmentId] ?? garments.all[0];

  const opId = ws.operation.opId;
  const opIndex = useMemo(() => {
    if (!garment || !opId) return -1;
    return garment.operations.findIndex((o) => o.id === opId);
  }, [garment, opId]);

  // Synthesize a single-line twin from the garment so the PML engine has a
  // graph to chew on. The Inspector view is per-op queueing-theory; running
  // the full bulletin once and reading the matching station is the cleanest
  // way to populate the analytical fields the panel reads.
  // Hook order rule: usePmlSim must be called unconditionally. Fall back to
  // the first available garment when the workspace is empty; gate rendering
  // below on `garment`.
  const twin = useMemo<Twin | null>(() => {
    const g = garment ?? garments.all[0];
    if (!g) return null;
    return buildGarmentTwin(g, defaultOperators);
  }, [garment, defaultOperators, garments.all]);

  const { state, step, reset } = usePmlSim(twin ?? EMPTY_TWIN, { garment: garment ?? undefined });

  // Warm the playback once per (workstation, op) change so the KPIs aren't
  // all zeros. Re-running on opIndex change covers the case where the user
  // clicks a different workstation in Builder without re-mounting the panel.
  useEffect(() => {
    if (opIndex < 0) return;
    if (state.time === 0) step(WARMUP_MINUTES);
    // step's identity is stable from usePmlSim; intentionally omitting it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opIndex, twin]);

  const [compareMetric, setCompareMetric] = useState<StationMetric>('rho');

  // ── Empty / not-found states ───────────────────────────────────────────
  if (!garment) return <Note>No garment template loaded.</Note>;

  if (!opId) {
    return (
      <Note>
        This workstation isn't bound to an operation yet. Set <strong>Op id</strong> in the
        Operations lens to see its queueing analysis.
      </Note>
    );
  }

  if (opIndex < 0) {
    return (
      <Note>
        Operation <Code>{opId}</Code> wasn't found in <strong>{garment.name}</strong>'s bulletin.
        Pick an op id that exists in the active garment.
      </Note>
    );
  }

  // Lookup by opId — robust to the adapter's ordering (which mirrors the
  // synthesized twin's workstation order, not the garment's operation index).
  const stationIdx = state.stations.findIndex((s) => s.opId === opId);
  const station = stationIdx >= 0 ? state.stations[stationIdx] : undefined;
  if (!station) return <Note>Warming up the simulator…</Note>;

  const history = state.stationHistory[stationIdx] ?? [];

  const handleChange = (patch: QueueAnalysisChange) => {
    const opPatch: Partial<{
      serviceDistribution: ServiceDist;
      queueCapacity: number;
      queueDiscipline: typeof patch.queueDiscipline;
      servers: number;
    }> = {};
    if (patch.serviceDistribution) opPatch.serviceDistribution = patch.serviceDistribution;
    if (patch.queueCapacity != null) opPatch.queueCapacity = patch.queueCapacity;
    if (patch.queueDiscipline) opPatch.queueDiscipline = patch.queueDiscipline;
    if (patch.servers != null) opPatch.servers = patch.servers;
    if (Object.keys(opPatch).length === 0) return;
    updateOperation(garment.id, GARMENT_TEMPLATES[garment.id], opId, opPatch);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <QueueAnalysisPanel station={station} onChange={handleChange} />

      <Card>
        <SectionHeader
          title="Sim vs theory — this station"
          sub={`Last ${history.length * 5} sim-min. Solid line is what the simulator saw; dashed line is the steady-state target from queueing theory.`}
          right={
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => {
                  reset();
                  step(WARMUP_MINUTES);
                }}
                style={miniBtn}
                title="Re-run the 8-hour warm-up"
              >
                ⟲ Re-run
              </button>
              <button
                type="button"
                onClick={() => step(60)}
                style={{ ...miniBtn, background: SW_COLORS.brand, color: SW_COLORS.paper, border: 'none' }}
                title="Advance the sim by 1 hour"
              >
                +1 hr
              </button>
            </div>
          }
        />
        <StationTimeseriesGrid station={station} history={history} height={80} />
      </Card>

      <Card>
        <SectionHeader
          title="Focus one metric"
          sub="Zoom in on a single observable for this station. Same data as the 2×2 grid above, but bigger so subtle drift from the target line is easy to read."
          right={
            <ToggleGroup<StationMetric>
              value={compareMetric}
              options={[
                { value: 'rho', label: 'Saturation' },
                { value: 'L', label: 'At station' },
                { value: 'Wq', label: 'Wait' },
                { value: 'Lq', label: 'Waiting' },
              ]}
              onChange={setCompareMetric}
            />
          }
        />
        <StationTimeseriesChart
          history={history}
          metric={compareMetric}
          analyticalRef={analyticalRefFor(station, compareMetric)}
          height={180}
        />
      </Card>
    </div>
  );
}

function analyticalRefFor(station: StationView, metric: StationMetric): number {
  switch (metric) {
    case 'rho': return station.analytical.rho;
    case 'L':   return station.analytical.L;
    case 'Lq':  return station.analytical.Lq;
    case 'Wq':  return station.analytical.Wq * 60; // queueing.ts returns hours
  }
}

const miniBtn: React.CSSProperties = {
  background: SW_COLORS.paper,
  border: `1px solid ${SW_COLORS.line}`,
  borderRadius: SW_RADIUS.sm,
  padding: '5px 9px',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: SW_FONTS.body,
  color: SW_COLORS.ink,
};

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: SW_COLORS.muted,
        lineHeight: 1.5,
        padding: 8,
        background: SW_COLORS.paperDeep,
        border: `1px solid ${SW_COLORS.line}`,
        borderRadius: 6,
      }}
    >
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: SW_FONTS.mono,
        fontSize: 11,
        background: SW_COLORS.paper,
        padding: '1px 5px',
        borderRadius: 3,
        border: `1px solid ${SW_COLORS.line}`,
      }}
    >
      {children}
    </code>
  );
}
