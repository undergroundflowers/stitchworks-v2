/**
 * Effective-asset hooks — merge the built-in `MACHINE_CATALOG`,
 * `WORKER_ARCHETYPES`, and product list with per-project edits + customs
 * from the project store. Components in the Asset Library page (and any
 * future consumer that needs to honour user edits) should read through
 * these hooks instead of importing the built-ins directly.
 *
 * Each effective spec carries an optional `customImage` (data URL) populated
 * from the per-asset image map in the project store — sprites that honour
 * this field can render the user's uploaded artwork instead of the built-in
 * SVG. `all` excludes user-hidden built-ins; `hidden` lists them so a
 * restore affordance can bring them back.
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
  type ProductEdit,
} from './project';

// ── Machines ──────────────────────────────────────────────────────────────
export type EffectiveMachine =
  | (MachineSpec & { isCustom?: false; customImage?: string })
  | (CustomMachineSpec & { customImage?: string });

export interface EffectiveMachines {
  all: EffectiveMachine[];
  hidden: EffectiveMachine[];
  byCode: Record<string, EffectiveMachine>;
  isCustom: (code: string) => boolean;
  isBuiltIn: (code: string) => boolean;
  hasEdit: (code: string) => boolean;
  isHidden: (code: string) => boolean;
}

export function useMachines(): EffectiveMachines {
  const edits = useProject((s) => s.machineEdits);
  const customs = useProject((s) => s.customMachines);
  const hidden = useProject((s) => s.hiddenMachines);
  const images = useProject((s) => s.machineImages);
  return useMemo(() => {
    const byCode: Record<string, EffectiveMachine> = {};
    for (const m of ALL_MACHINES) {
      const base = edits[m.code] ?? m;
      byCode[m.code] = images[m.code] ? { ...base, customImage: images[m.code] } : base;
    }
    for (const c of Object.values(customs)) {
      byCode[c.code] = images[c.code] ? { ...c, customImage: images[c.code] } : c;
    }
    const all: EffectiveMachine[] = [];
    const hiddenList: EffectiveMachine[] = [];
    for (const m of Object.values(byCode)) {
      if (hidden[m.code]) hiddenList.push(m);
      else all.push(m);
    }
    return {
      all,
      hidden: hiddenList,
      byCode,
      isCustom: (code) => !!customs[code],
      isBuiltIn: (code) => !!(MACHINE_CATALOG as Record<string, MachineSpec>)[code],
      hasEdit: (code) => !!edits[code],
      isHidden: (code) => !!hidden[code],
    };
  }, [edits, customs, hidden, images]);
}

// ── Workers ───────────────────────────────────────────────────────────────
export type EffectiveWorker =
  | (WorkerArchetype & { isCustom?: false; customImage?: string })
  | (CustomWorkerArchetype & { customImage?: string });

export interface EffectiveWorkers {
  all: EffectiveWorker[];
  hidden: EffectiveWorker[];
  byRole: Record<string, EffectiveWorker>;
  isCustom: (role: string) => boolean;
  isBuiltIn: (role: string) => boolean;
  hasEdit: (role: string) => boolean;
  isHidden: (role: string) => boolean;
}

export function useWorkers(): EffectiveWorkers {
  const edits = useProject((s) => s.workerEdits);
  const customs = useProject((s) => s.customWorkers);
  const hidden = useProject((s) => s.hiddenWorkers);
  const images = useProject((s) => s.workerImages);
  return useMemo(() => {
    const byRole: Record<string, EffectiveWorker> = {};
    for (const a of ALL_WORKER_ARCHETYPES) {
      const base = edits[a.role] ?? a;
      byRole[a.role] = images[a.role] ? { ...base, customImage: images[a.role] } : base;
    }
    for (const c of Object.values(customs)) {
      byRole[c.role] = images[c.role] ? { ...c, customImage: images[c.role] } : c;
    }
    const all: EffectiveWorker[] = [];
    const hiddenList: EffectiveWorker[] = [];
    for (const w of Object.values(byRole)) {
      if (hidden[w.role]) hiddenList.push(w);
      else all.push(w);
    }
    return {
      all,
      hidden: hiddenList,
      byRole,
      isCustom: (role) => !!customs[role],
      isBuiltIn: (role) => !!(WORKER_ARCHETYPES as Record<string, WorkerArchetype>)[role],
      hasEdit: (role) => !!edits[role],
      isHidden: (role) => !!hidden[role],
    };
  }, [edits, customs, hidden, images]);
}

// ── Products ──────────────────────────────────────────────────────────────
/** Effective entry for product gallery cards. Built-ins have just a kind +
 *  label; customs add a label override, optional colour, and a base sprite.
 *  Both can carry a user-uploaded `customImage`. */
export type EffectiveProduct = {
  kind: string;
  label: string;
  isCustom: boolean;
  baseSprite: ProductKind;
  color?: string;
  description?: string;
  customImage?: string;
  /** True when a built-in has a non-empty entry in `productEdits`. */
  hasEdit?: boolean;
};

export interface EffectiveProducts {
  all: EffectiveProduct[];
  hidden: EffectiveProduct[];
  byKind: Record<string, EffectiveProduct>;
  isCustom: (kind: string) => boolean;
  isBuiltIn: (kind: string) => boolean;
  isHidden: (kind: string) => boolean;
  hasEdit: (kind: string) => boolean;
}

export function useProducts(): EffectiveProducts {
  const customs = useProject((s) => s.customProducts);
  const edits = useProject((s) => s.productEdits);
  const hidden = useProject((s) => s.hiddenProducts);
  const images = useProject((s) => s.productImages);
  return useMemo(() => {
    const byKind: Record<string, EffectiveProduct> = {};
    for (const k of PRODUCT_KINDS) {
      const edit: ProductEdit | undefined = edits[k];
      const hasEdit = !!edit && Object.keys(edit).length > 0;
      byKind[k] = {
        kind: k,
        label: edit?.label ?? PRODUCT_LABELS[k],
        isCustom: false,
        baseSprite: edit?.baseSprite ?? k,
        color: edit?.color,
        description: edit?.description,
        customImage: images[k],
        hasEdit,
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
        customImage: images[c.kind],
      };
    }
    const all: EffectiveProduct[] = [];
    const hiddenList: EffectiveProduct[] = [];
    for (const p of Object.values(byKind)) {
      if (hidden[p.kind]) hiddenList.push(p);
      else all.push(p);
    }
    return {
      all,
      hidden: hiddenList,
      byKind,
      isCustom: (kind) => !!customs[kind],
      isBuiltIn: (kind) => (PRODUCT_KINDS as readonly string[]).includes(kind),
      isHidden: (kind) => !!hidden[kind],
      hasEdit: (kind) => !!edits[kind] && Object.keys(edits[kind] ?? {}).length > 0,
    };
  }, [customs, edits, hidden, images]);
}

// ── Re-exports the gallery editors use ───────────────────────────────────
export type { CustomMachineSpec, CustomWorkerArchetype, CustomProductSpec, ProductEdit };
export type { MachineSpec, MachineCode, WorkerArchetype, WorkerRole, ProductKind };
