/**
 * Reference context — tracks which published case study + variant the user
 * has loaded into the active twin. Lets the Simulation tab show "you are
 * running Paper X / variant Y" and lets Reports surface a paper-vs-observed
 * comparison without each page having to re-derive that state.
 *
 * Persisted to localStorage so the picker remembers the last selection.
 *
 * `variantKey` semantics:
 *   • 'baseline'           — model.baseline
 *   • 'proposed'           — model.proposed (only if defined)
 *   • '<scenario.id>'      — one of model.scenarios (e.g. 'S1', 'S2', 'S3')
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ReferenceContext {
  slug: string | null;
  variantKey: string | null;
}

interface ReferenceState extends ReferenceContext {
  setContext: (ctx: ReferenceContext) => void;
  clear: () => void;
}

export const useReferenceContext = create<ReferenceState>()(
  persist(
    (set) => ({
      slug: null,
      variantKey: null,
      setContext: (ctx) => set({ slug: ctx.slug, variantKey: ctx.variantKey }),
      clear: () => set({ slug: null, variantKey: null }),
    }),
    {
      name: 'stitchworks.reference.v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
