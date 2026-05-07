/**
 * Effective-garments hook + helpers — merges the built-in `GARMENT_TEMPLATES`
 * with per-project edits in `project.garmentEdits`. Pages should consume
 * this hook instead of importing the built-ins directly so user edits flow
 * through to every read site (Yamazumi, LiveSim, Twin, Reports, etc.).
 *
 * `garmentEdits` may also contain garments whose ids are NOT in the
 * built-in catalog — those are user-created from scratch and are appended
 * to the effective list.
 */

import { useMemo } from 'react';
import { GARMENT_TEMPLATES, ALL_GARMENT_TEMPLATES, type GarmentTemplate } from '../domain';
import { useProject } from './project';

export interface EffectiveGarments {
  all: GarmentTemplate[];
  byId: Record<string, GarmentTemplate>;
  /** Whether the given garment is the unedited built-in. */
  isBuiltIn: (id: string) => boolean;
  /** Whether the user has edited this garment id. */
  hasEdit: (id: string) => boolean;
}

export function useGarments(): EffectiveGarments {
  const edits = useProject((s) => s.garmentEdits);
  return useMemo(() => buildEffective(edits), [edits]);
}

/** Pure helper for non-React contexts (tests, sim model builder, etc.). */
export function effectiveGarments(
  edits: Record<string, GarmentTemplate>,
): EffectiveGarments {
  return buildEffective(edits);
}

function buildEffective(edits: Record<string, GarmentTemplate>): EffectiveGarments {
  const byId: Record<string, GarmentTemplate> = {};
  // Built-ins first; an edit with the same id replaces them entirely.
  for (const g of ALL_GARMENT_TEMPLATES) {
    byId[g.id] = edits[g.id] ?? g;
  }
  // Custom garments (ids not in built-ins) tail the list.
  for (const id of Object.keys(edits)) {
    if (!GARMENT_TEMPLATES[id]) byId[id] = edits[id];
  }
  const all = Object.values(byId);
  return {
    all,
    byId,
    isBuiltIn: (id) => !!GARMENT_TEMPLATES[id],
    hasEdit: (id) => !!edits[id],
  };
}
