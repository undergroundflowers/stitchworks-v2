/**
 * Discrete-event simulation engine for an apparel sewing line.
 *
 *   buildSimConfig({ garment, operators })   ↦ SimConfig
 *   new Sim(config)                          ↦ Sim instance, time-advanceable
 *   useSim(config)                           ↦ React hook with play/pause/speed/reset
 *
 * Everything in this folder is pure TypeScript; the only React-aware module
 * is useSim.ts.
 */

export { Sim, type SimConfig, type SimState, type StationView, type HistoryPoint } from './engine';
export { buildSimConfig, efficiencyFromSkillMatrix, type BuildModelOptions } from './model';
export { useSim, type UseSimResult } from './useSim';
export { MinHeap, mulberry32 } from './priority-queue';
export { runReplications, type ReplicationResult, type AggregateKpis } from './replications';
