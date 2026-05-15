/**
 * Operation type — the atomic unit of work in the apparel domain. An
 * operation has a standard minute value (SMV), the machine it runs on, the
 * worker role required to perform it, and (optionally) precedence relative
 * to other operations.
 *
 * The Operation model is shared between line balancing, simulation, and
 * costing — it's the table-stakes data that every Stitchworks feature reads.
 */

import type { MachineCode } from './machines';
import type { SkillId } from './workers';
import type { ServiceDist, QueueDiscipline } from '../simulation';

export type OperationCategory =
  | 'sewing'
  | 'manual'
  | 'cutting'
  | 'spreading'
  | 'pressing'
  | 'fusing'
  | 'inspection'
  | 'embroidery'
  | 'finishing';

export interface Operation {
  /** Unique within a project. Industry codes (e.g. "OP-04") are stored in `code`. */
  id: string;
  /** Optional industry-style code, often shown on tickets and bulletins. */
  code?: string;
  /** Short human-readable name as it appears on the operation bulletin. */
  name: string;
  /** Standard minute value at 100% efficiency. */
  smv: number;
  /** Required machine code from MACHINE_CATALOG. Use 'MNL' for manual. */
  machineCode: MachineCode;
  /** The skill the assigned operator must have. */
  skill: SkillId;
  category: OperationCategory;
  /** Operation ids that must complete before this one starts. */
  precedes?: string[];
  follows?: string[];
  /** Default per-piece defect rate (0..1). */
  defectRate?: number;
  /** True if rejected pieces can be reworked at this op. */
  reworkable?: boolean;
  /** Free-form notes (e.g. "uses pattern guide", "watch needle gauge"). */
  notes?: string;
  // ── Queueing-theory overrides ────────────────────────────────────────────
  /**
   * Service-time distribution for the station running this operation. When
   * present, drives the simulator's sampling and the analytical Kendall
   * classification (M/M/c, M/D/1, M/Ek/1, M/G/1, etc.).
   * Missing ⇒ engine falls back to uniform ±15 % around `smv` (legacy).
   */
  serviceDistribution?: ServiceDist;
  /**
   * System capacity (queue + in-service) at this station. Models cart /
   * hanger / conveyor buffer between stations. Missing ⇒ unbounded.
   */
  queueCapacity?: number;
  /**
   * Queue discipline for tickets at this station. Missing ⇒ FCFS.
   */
  queueDiscipline?: QueueDiscipline;
}

/**
 * KPI helpers derived from a full bulletin.
 */
export function totalSmv(ops: Operation[]): number {
  return ops.reduce((s, o) => s + o.smv, 0);
}

export function targetPerHour(smv: number, efficiency = 1.0): number {
  // 60 minutes / SMV * efficiency
  return smv > 0 ? (60 / smv) * efficiency : 0;
}

/**
 * 100% target / hour for the *line* given a bulletin and worker count, by
 * the bottleneck SMV (slowest single operation per worker).
 */
export function bottleneckSmv(ops: Operation[]): number {
  return ops.reduce((m, o) => Math.max(m, o.smv), 0);
}
