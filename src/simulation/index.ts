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

export {
  Sim,
  type SimConfig,
  type SimState,
  type StationView,
  type HistoryPoint,
  type StationHistoryPoint,
} from './engine';
export { buildSimConfig, efficiencyFromSkillMatrix, type BuildModelOptions } from './model';
export {
  buildSimConfigFromTwin,
  buildLinesFromTwin,
  type BuildFromTwinOptions,
  type BuildFromTwinResult,
  type BuildFromTwinMeta,
  type LineBuild,
  type SkippedWorkstation,
  type TwinStationMeta,
} from './model-from-twin';
export { useSim, type UseSimResult } from './useSim';
export { useMultiSim, mergeSimStates, mergeTwinMetas, type UseMultiSimResult } from './useMultiSim';
export { MinHeap, mulberry32 } from './priority-queue';
export { runReplications, type ReplicationResult, type AggregateKpis } from './replications';
export { aggregateFactoryKpis, type FactoryLineInput } from './factory-aggregate';
export {
  sample,
  meanOf,
  varOf,
  cvOf,
  kendallServiceCode,
  describeDist,
  defaultDist,
  scaleDist,
  type ServiceDist,
  type ServiceCode,
} from './distributions';
export {
  classify,
  analyticalKpis,
  type KendallNotation,
  type AnalyticalKpis,
  type QueueDiscipline,
} from './queueing';
