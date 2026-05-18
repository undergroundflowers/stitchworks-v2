/**
 * Inspector-mounted wrapper around QueueAnalysisPanel.
 *
 * Surfaces the per-station queueing-theory view (M/M/c, Kendall–Lee, ρ, Lq…)
 * inside the Factory Builder's Inspector when a workstation is selected, so
 * the user doesn't have to leave Builder to reason about the block as a
 * queueing object. Mirrors the wiring that `WorkstationDetail` does for its
 * stand-alone route — config → useSim → warm-up → StationView → panel — but
 * scoped to a single workstation surfaced from the Twin.
 */

import { useEffect, useMemo } from 'react';
import { QueueAnalysisPanel, type QueueAnalysisChange } from './QueueAnalysisPanel';
import {
  buildSimConfig,
  efficiencyFromSkillMatrix,
  useSim,
  type ServiceDist,
} from '../simulation';
import { useGarments } from '../store/garments';
import { useProject } from '../store/project';
import { GARMENT_TEMPLATES } from '../domain';
import { SW_COLORS, SW_FONTS } from '../design/tokens';
import type { Workstation } from '../domain/twin';

/** Same warm-up length WorkstationDetail uses — long enough for analytical KPIs to stabilise. */
const WARMUP_MINUTES = 480;

export function InspectorQueuePanel({ ws }: { ws: Workstation }) {
  const garments = useGarments();
  const projectSelectedGarmentId = useProject((s) => s.selectedGarmentId);
  const skillMatrix = useProject((s) => s.skillMatrix);
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

  // Memoise the SimConfig so useSim doesn't rebuild the engine every render.
  // Dependencies match the inputs that materially change the steady state.
  const opEfficiency = useMemo(
    () => (garment ? efficiencyFromSkillMatrix(skillMatrix, garment.operations) : {}),
    [skillMatrix, garment],
  );
  // useSim is a hook — must be called unconditionally. When there's no garment
  // (degenerate workspace) feed it a stub built from the first available
  // template and gate rendering below. Memoised so the sim engine isn't
  // rebuilt every render.
  const config = useMemo(() => {
    if (garment) return buildSimConfig({ garment, operators: defaultOperators, opEfficiency });
    const fallback = garments.all[0];
    if (!fallback) return null;
    return buildSimConfig({ garment: fallback, operators: 1, opEfficiency: {} });
  }, [garment, defaultOperators, opEfficiency, garments.all]);

  const { state, step } = useSim(config!);

  // Warm the sim once per (workstation, op) change so the KPIs aren't all
  // zeros. Re-running on opIndex change covers the case where the user clicks
  // a different workstation in Builder without re-mounting the panel.
  useEffect(() => {
    if (opIndex < 0) return;
    if (state.time === 0) step(WARMUP_MINUTES);
    // step's identity is stable from useSim; intentionally omitting it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opIndex, config]);

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

  const station = state.stations[opIndex];
  if (!station) return <Note>Warming up the simulator…</Note>;

  const handleChange = (patch: QueueAnalysisChange) => {
    const opPatch: Partial<{
      serviceDistribution: ServiceDist;
      queueCapacity: number;
      queueDiscipline: typeof patch.queueDiscipline;
    }> = {};
    if (patch.serviceDistribution) opPatch.serviceDistribution = patch.serviceDistribution;
    if (patch.queueCapacity != null) opPatch.queueCapacity = patch.queueCapacity;
    if (patch.queueDiscipline) opPatch.queueDiscipline = patch.queueDiscipline;
    if (Object.keys(opPatch).length === 0) return;
    updateOperation(garment.id, GARMENT_TEMPLATES[garment.id], opId, opPatch);
  };

  return <QueueAnalysisPanel station={station} onChange={handleChange} />;
}

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
