/**
 * React hook wrapping the discrete-event Sim engine. Owns the wall-time
 * loop that maps real seconds to simulation minutes at a configurable
 * speed multiplier, and exposes a stable snapshot of state for components
 * to render against.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sim, type SimConfig, type SimState } from './engine';

/** Sim minutes elapsed per wall second at speed = 1×. */
const SIM_MIN_PER_WALL_SEC_BASE = 6;

/** Tick interval for the wall-clock loop. */
const TICK_MS = 200;

export interface UseSimResult {
  state: SimState;
  playing: boolean;
  speed: number;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  reset: () => void;
  /** Step forward by N sim minutes synchronously. */
  step: (simMinutes: number) => void;
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

  // Reset state when the underlying engine instance changes (config rebuild).
  useEffect(() => {
    setState(sim.snapshot());
  }, [sim]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const dtSim = dt * speed * SIM_MIN_PER_WALL_SEC_BASE;
      const target = simRef.current.snapshot().time + dtSim;
      simRef.current.runUntil(target);
      setState(simRef.current.snapshot());
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  const reset = useCallback(() => {
    simRef.current.reset();
    setState(simRef.current.snapshot());
  }, []);

  const step = useCallback((simMinutes: number) => {
    const target = simRef.current.snapshot().time + simMinutes;
    simRef.current.runUntil(target);
    setState(simRef.current.snapshot());
  }, []);

  return { state, playing, speed, setPlaying, setSpeed, reset, step };
}
