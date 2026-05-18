/**
 * Parallel-engine sibling of `useSim`. Owns N `Sim` instances and drives them
 * from a single wall-clock tick so play/pause/speed/reset operate on all of
 * them as one. Returned `states[]` is parallel to the `configs[]` argument.
 *
 * Existence justified by the model's single-product-per-run guarantee
 * (`buildSimConfigFromTwin` keeps only one garment template). To honestly
 * simulate a sewing department where Line 1 runs knit T-shirts and Line 2
 * runs woven shirts, we need one engine per line — not one engine over a
 * dominant-garment-filtered union. This hook is that mechanism.
 *
 * Tick semantics match `useSim` 1:1 (virtual = burst-on-rAF, realtime =
 * 200 ms setInterval × `realTimeScale × speed`), so a single transport bar
 * can drive either hook without behavioural drift.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sim, type SimConfig, type SimState, type StationView } from './engine';
import type { BuildFromTwinMeta, LineBuild } from './model-from-twin';
import { useProject } from '../store';

const TICK_MS = 200;

export interface UseMultiSimResult {
  /** Parallel to the `configs` argument. Same shape as `useSim().state`. */
  states: SimState[];
  playing: boolean;
  speed: number;
  mode: 'virtual' | 'realtime';
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  reset: () => void;
  step: (units: number) => void;
}

export function useMultiSim(configs: SimConfig[]): UseMultiSimResult {
  const sims = useMemo(() => configs.map((c) => new Sim(c)), [configs]);
  const simsRef = useRef(sims);
  simsRef.current = sims;

  const [states, setStates] = useState<SimState[]>(() => sims.map((s) => s.snapshot()));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const mode = useProject((s) => s.time.executionMode);
  const realTimeScale = useProject((s) => s.time.realTimeScale);

  useEffect(() => {
    setStates(sims.map((s) => s.snapshot()));
  }, [sims]);

  useEffect(() => {
    if (!playing || sims.length === 0) return;

    if (mode === 'virtual') {
      let cancelled = false;
      const tick = () => {
        if (cancelled) return;
        const arr = simsRef.current;
        for (const s of arr) {
          const cur = s.snapshot().time;
          s.runUntil(cur + 1e9);
        }
        setStates(arr.map((s) => s.snapshot()));
        if (!cancelled) requestAnimationFrame(tick);
      };
      const id = requestAnimationFrame(tick);
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
      };
    }

    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const effectiveScale = Math.max(0, realTimeScale) * Math.max(0, speed);
      const dtSim = dt * effectiveScale;
      const arr = simsRef.current;
      for (const s of arr) {
        const target = s.snapshot().time + dtSim;
        s.runUntil(target);
      }
      setStates(arr.map((s) => s.snapshot()));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed, mode, realTimeScale, sims.length]);

  const reset = useCallback(() => {
    for (const s of simsRef.current) s.reset();
    setStates(simsRef.current.map((s) => s.snapshot()));
  }, []);

  const step = useCallback((units: number) => {
    for (const s of simsRef.current) {
      const target = s.snapshot().time + units;
      s.runUntil(target);
    }
    setStates(simsRef.current.map((s) => s.snapshot()));
  }, []);

  return { states, playing, speed, mode, setPlaying, setSpeed, reset, step };
}

// ============================================================================
// Merge helpers — fold per-line engine outputs into a single shape the
// existing view components already understand. Two garments can legitimately
// share an opId (e.g. "BS1" for "back seam 1"), so we namespace opIds with
// `${lineId}::` everywhere they're used as a key (StationView.opId and
// TwinStationMeta.opId). The engine itself never sees the namespaced ids —
// only the merged view layer does.
// ============================================================================

function namespacedOpId(lineId: string, opId: string): string {
  return `${lineId}::${opId}`;
}

/**
 * Concatenate per-line `SimState`s into one shape, namespacing opIds by line
 * so React keys and opId-based layout lookups don't collide across garments.
 *
 * `bottleneckOpIndex` is recomputed as the global bottleneck across all lines
 * (station with the highest utilisation), so the iso/top views can still
 * highlight a single "hot" station factory-wide.
 *
 * Fields that don't compose meaningfully (history, stationHistory at the
 * factory level) are taken from the first line for now — the charts page
 * will be updated to consume per-line history in the follow-up slice.
 */
export function mergeSimStates(states: SimState[], lineIds: string[]): SimState {
  if (states.length === 0) {
    return {
      time: 0,
      produced: 0,
      producedPieces: 0,
      totalArrivals: 0,
      meanLeadTime: 0,
      utilization: 0,
      bottleneckOpIndex: -1,
      stations: [],
      history: [],
      stationHistory: [],
      events: [],
    };
  }

  const stations: StationView[] = [];
  const stationHistory: SimState['stationHistory'] = [];
  let bottleneckIdx = -1;
  let bottleneckUtil = -Infinity;
  let produced = 0;
  let producedPieces = 0;
  let totalArrivals = 0;
  let totalBusy = 0;
  let totalCapacity = 0;
  const events: SimState['events'] = [];

  for (let li = 0; li < states.length; li++) {
    const s = states[li];
    const lineId = lineIds[li] ?? `line-${li}`;
    for (let i = 0; i < s.stations.length; i++) {
      const st = s.stations[i];
      const idx = stations.length;
      stations.push({ ...st, opId: namespacedOpId(lineId, st.opId) });
      stationHistory.push(s.stationHistory[i] ?? []);
      if (st.utilization > bottleneckUtil) {
        bottleneckUtil = st.utilization;
        bottleneckIdx = idx;
      }
      totalBusy += st.totalBusyTime;
      totalCapacity += st.serversTotal * Math.max(1e-9, s.time);
    }
    produced += s.produced;
    producedPieces += s.producedPieces;
    totalArrivals += s.totalArrivals;
    for (const ev of s.events) events.push(ev);
  }

  // Lead-time average across the factory: weighted by each line's produced
  // bundle count so a quiet line doesn't drag a busy line's number down.
  // Falls back to the first line's number when no bundle has finished yet.
  let leadNum = 0;
  let leadDen = 0;
  for (const s of states) {
    if (s.produced > 0) {
      leadNum += s.meanLeadTime * s.produced;
      leadDen += s.produced;
    }
  }
  const meanLeadTime = leadDen > 0 ? leadNum / leadDen : states[0].meanLeadTime;

  events.sort((a, b) => b.time - a.time);
  if (events.length > 60) events.length = 60;

  return {
    // Engines tick together so any time is fine; first is canonical.
    time: states[0].time,
    produced,
    producedPieces,
    totalArrivals,
    meanLeadTime,
    utilization: totalCapacity > 0 ? totalBusy / totalCapacity : 0,
    bottleneckOpIndex: bottleneckIdx,
    stations,
    history: states[0].history,
    stationHistory,
    events,
  };
}

/**
 * Concatenate per-line `BuildFromTwinMeta`s so the iso/top/heat/logic views
 * can look up every station's authored Builder coords. Same opId namespacing
 * rule as `mergeSimStates` so the join lines up.
 *
 * Returns null when no line built ok — caller should fall back to non-twin
 * layout in that case (the page already handles this).
 */
export function mergeTwinMetas(lineBuilds: LineBuild[]): BuildFromTwinMeta | null {
  const ok = lineBuilds.filter((lb) => lb.ok);
  if (ok.length === 0) return null;

  const stations: BuildFromTwinMeta['stations'] = [];
  const simulatedWsIds: string[] = [];
  const skipped: BuildFromTwinMeta['skipped'] = [];
  const infrastructure: BuildFromTwinMeta['infrastructure'] = [];
  let seedOperators = 0;
  for (const lb of ok) {
    const lineId = lb.line.id;
    for (const ts of lb.build.meta.stations) {
      stations.push({ ...ts, opId: namespacedOpId(lineId, ts.opId) });
    }
    for (const id of lb.build.meta.simulatedWsIds) simulatedWsIds.push(id);
    for (const sk of lb.build.meta.skipped) skipped.push(sk);
    for (const inf of lb.build.meta.infrastructure) infrastructure.push(inf);
    seedOperators += lb.build.meta.seedOperators;
  }

  const first = ok[0].build.meta;
  return {
    simulatedWsIds,
    skipped,
    infrastructure,
    seedOperators,
    seedBundleSize: first.seedBundleSize,
    topologySource: first.topologySource,
    stations,
    // Header label uses .garment.name; the merged view falls back to the
    // first line's garment. The iso view's garment-name caption gets
    // overridden in LiveSimPage to read "All lines" in multi-mode.
    garment: first.garment,
    garmentPinned: false,
  };
}
