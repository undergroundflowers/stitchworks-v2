/**
 * Effective-asset hooks — merge the built-in `MACHINE_CATALOG`,
 * `WORKER_ARCHETYPES`, and product list with per-project edits + customs
 * from the project store. Components in the Asset Library page (and any
 * future consumer that needs to honour user edits) should read through
 * these hooks instead of importing the built-ins directly.
 */

import { useMemo } from 'react';
import {
  MACHINE_CATALOG,
  ALL_MACHINES,
  type MachineSpec,
  type MachineCode,
} from '../domain/machines';
import {
  WORKER_ARCHETYPES,
  ALL_WORKER_ARCHETYPES,
  type WorkerArchetype,
  type WorkerRole,
} from '../domain/workers';
import {
  PRODUCT_KINDS,
  PRODUCT_LABELS,
  type ProductKind,
} from '../assets';
import {
  useProject,
  type CustomMachineSpec,
  type CustomWorkerArchetype,
  type CustomProductSpec,
} from './project';

// ── Machines ──────────────────────────────────────────────────────────────
export type EffectiveMachine =
  | (MachineSpec & { isCustom?: false })
  | CustomMachineSpec;

export interface EffectiveMachines {
  all: EffectiveMachine[];
  byCode: Record<string, EffectiveMachine>;
  isCustom: (code: string) => boolean;
  isBuiltIn: (code: string) => boolean;
  hasEdit: (code: string) => boolean;
}

export function useMachines(): EffectiveMachines {
  const edits = useProject((s) => s.machineEdits);
  const customs = useProject((s) => s.customMachines);
  return useMemo(() => {
    const byCode: Record<string, EffectiveMachine> = {};
    for (const m of ALL_MACHINES) {
      byCode[m.code] = edits[m.code] ?? m;
    }
    for (const c of Object.values(customs)) {
      byCode[c.code] = c;
    }
    return {
      all: Object.values(byCode),
      byCode,
      isCustom: (code) => !!customs[code],
      isBuiltIn: (code) => !!(MACHINE_CATALOG as Record<string, MachineSpec>)[code],
      hasEdit: (code) => !!edits[code],
    };
  }, [edits, customs]);
}

// ── Workers ───────────────────────────────────────────────────────────────
export type EffectiveWorker =
  | (WorkerArchetype & { isCustom?: false })
  | CustomWorkerArchetype;

export interface EffectiveWorkers {
  all: EffectiveWorker[];
  byRole: Record<string, EffectiveWorker>;
  isCustom: (role: string) => boolean;
  isBuiltIn: (role: string) => boolean;
  hasEdit: (role: string) => boolean;
}

export function useWorkers(): EffectiveWorkers {
  const edits = useProject((s) => s.workerEdits);
  const customs = useProject((s) => s.customWorkers);
  return useMemo(() => {
    const byRole: Record<string, EffectiveWorker> = {};
    for (const a of ALL_WORKER_ARCHETYPES) {
      byRole[a.role] = edits[a.role] ?? a;
    }
    for (const c of Object.values(customs)) {
      byRole[c.role] = c;
    }
    return {
      all: Object.values(byRole),
      byRole,
      isCustom: (role) => !!customs[role],
      isBuiltIn: (role) => !!(WORKER_ARCHETYPES as Record<string, WorkerArchetype>)[role],
      hasEdit: (role) => !!edits[role],
    };
  }, [edits, customs]);
}

// ── Products ──────────────────────────────────────────────────────────────
/** Effective entry for product gallery cards. Built-ins have just a kind +
 *  label; customs add a label override, optional colour, and a base sprite. */
export type EffectiveProduct = {
  kind: string;
  label: string;
  isCustom: boolean;
  baseSprite: ProductKind;
  color?: string;
  description?: string;
};

export interface EffectiveProducts {
  all: EffectiveProduct[];
  byKind: Record<string, EffectiveProduct>;
  isCustom: (kind: string) => boolean;
}

export function useProducts(): EffectiveProducts {
  const customs = useProject((s) => s.customProducts);
  return useMemo(() => {
    const byKind: Record<string, EffectiveProduct> = {};
    for (const k of PRODUCT_KINDS) {
      byKind[k] = {
        kind: k,
        label: PRODUCT_LABELS[k],
        isCustom: false,
        baseSprite: k,
      };
    }
    for (const c of Object.values(customs)) {
      byKind[c.kind] = {
        kind: c.kind,
        label: c.label,
        isCustom: true,
        baseSprite: c.baseSprite,
        color: c.color,
        description: c.description,
      };
    }
    return {
      all: Object.values(byKind),
      byKind,
      isCustom: (kind) => !!customs[kind],
    };
  }, [customs]);
}

// ── Re-exports the gallery editors use ───────────────────────────────────
export type { CustomMachineSpec, CustomWorkerArchetype, CustomProductSpec };
export type { MachineSpec, MachineCode, WorkerArchetype, WorkerRole, ProductKind };
