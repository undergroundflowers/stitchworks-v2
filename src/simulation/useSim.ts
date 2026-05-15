/**
 * React hook wrapping the discrete-event Sim engine. Owns the wall-time
 * loop that maps real seconds to model time according to the project's
 * `time.executionMode` and `time.realTimeScale`. Exposes a stable snapshot
 * of state for components to render against.
 *
 * Per *Big Book of Simulation Modelling* (AnyLogic, Ch. 16), the loop
 * distinguishes:
 *   - **virtual** mode: engine bursts to the next event, no wall-clock
 *     pacing. Used for parameter sweeps and "skip ahead" UX.
 *   - **realtime** mode: engine advances `scale` model-time-units per real
 *     second. scale = 1 with unit = minute ⇒ true real time.
 *
 * `speed` is a UI-facing multiplier that the LiveSim transport bar exposes;
 * the effective scale fed to the loop is `realTimeScale × speed`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sim, type SimConfig, type SimState } from './engine';
import { useProject } from '../store';

/** Tick interval for the wall-clock loop (real-time mode only). */
const TICK_MS = 200;

export interface UseSimResult {
  state: SimState;
  playing: boolean;
  /** Multiplier applied on top of the project-level `realTimeScale`. The
   *  effective playback rate is `realTimeScale × speed` model-time-units
   *  per real-second. */
  speed: number;
  /** Execution mode coming from the project store. */
  mode: 'virtual' | 'realtime';
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  reset: () => void;
  /** Step forward by N model-time-units synchronously. */
  step: (units: number) => void;
}

export function useSim(config: SimConfig): UseSimResult {
  // Re-build the engine when `config` identity changes. Callers must memoise
  // the config object (use buildSimConfig() inside a useMemo).
  const sim = useMemo(() => new Sim(config), [config]);
  const simRef = useRef(sim);
  simRef.current = sim;

  const [state, setState] = useState<SimState>(() => sim.snapshot());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Pull the time semantics from the project store so the playback rate is
  // user-controlled (not a hidden constant). Both fields are reactive: changing
  // them mid-run live-updates the loop.
  const mode = useProject((s) => s.time.executionMode);
  const realTimeScale = useProject((s) => s.time.realTimeScale);

  // Reset state when the underlying engine instance changes (config rebuild).
  useEffect(() => {
    setState(sim.snapshot());
  }, [sim]);

  useEffect(() => {
    if (!playing) return;

    if (mode === 'virtual') {
      // Virtual time: ignore wall clock. Burst to next event each frame
      // and let the browser repaint. This is the AnyLogic "virtual time"
      // mode — run as fast as compute allows.
      let cancelled = false;
      const tick = () => {
        if (cancelled) return;
        // Advance by a generous chunk; the engine stops at the next event
        // boundary so this is safe even with no events scheduled.
        const cur = simRef.current.snapshot().time;
        simRef.current.runUntil(cur + 1e9);
        setState(simRef.current.snapshot());
        if (!cancelled) requestAnimationFrame(tick);
      };
      const id = requestAnimationFrame(tick);
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
      };
    }

    // Real-time mode: model time advances at `realTimeScale × speed`
    // model-time-units per real-second. With unit=minute, scale=1, speed=1
    // this is exactly 1 sim-minute per wall-second (true real time).
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000; // real seconds since last tick
      last = now;
      const effectiveScale = Math.max(0, realTimeScale) * Math.max(0, speed);
      const dtSim = dt * effectiveScale;
      const target = simRef.current.snapshot().time + dtSim;
      simRef.current.runUntil(target);
      setState(simRef.current.snapshot());
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed, mode, realTimeScale]);

  const reset = useCallback(() => {
    simRef.current.reset();
    setState(simRef.current.snapshot());
  }, []);

  const step = useCallback((units: number) => {
    const target = simRef.current.snapshot().time + units;
    simRef.current.runUntil(target);
    setState(simRef.current.snapshot());
  }, []);

  return { state, playing, speed, mode, setPlaying, setSpeed, reset, step };
}
