/**
 * Changeover cost model — drives how long a sewing line is frozen when
 * it transitions from producing garment A to garment B.
 *
 * The duration is:
 *   ProductionSystemDef.changeoverMin × styleDistance(from, to)
 *
 * `styleDistance` is a 0..1+ multiplier where:
 *   • 0.0  — same garment family, identical bulletin (no real setup)
 *   • 0.3  — close cousin (T-shirt → polo, same machines + thread)
 *   • 0.6  — same class, different family (T-shirt → sweatshirt)
 *   • 1.0  — full re-rig (T-shirt → trouser, woven vs knit, new attachments)
 *
 * The matrix below is intentionally short — only the seeded garments. New
 * pairs default to 1.0 (worst case), which is the safer assumption when
 * the IE hasn't characterised the transition yet.
 */

/** Pair key used by the lookup. Order doesn't matter — we normalise. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const STYLE_DISTANCE: Record<string, number> = {
  // Same garment ⇒ 0 (handled directly in styleDistance, no entry needed).
  [pairKey('tshirt', 'polo')]: 0.3,
  [pairKey('tshirt', 'sweatshirt')]: 0.6,
  [pairKey('polo', 'sweatshirt')]: 0.5,
  [pairKey('tshirt', 'shirt')]: 0.7,
  [pairKey('polo', 'shirt')]: 0.6,
  [pairKey('shirt', 'sweatshirt')]: 0.8,
  [pairKey('tshirt', 'trouser')]: 1.0,
  [pairKey('polo', 'trouser')]: 1.0,
  [pairKey('shirt', 'trouser')]: 0.9,
  [pairKey('sweatshirt', 'trouser')]: 1.0,
};

/**
 * Multiplier in [0..1.x] that scales the line's base changeoverMin. Use a
 * value > 1 for an outlier transition that requires more than a full
 * standard changeover (e.g. swapping the entire trim attachment set).
 *
 * Defaults to 0 for identical garments and 1.0 for unknown pairs.
 */
export function styleDistance(fromGarmentId: string, toGarmentId: string): number {
  if (fromGarmentId === toGarmentId) return 0;
  return STYLE_DISTANCE[pairKey(fromGarmentId, toGarmentId)] ?? 1.0;
}

/**
 * Final changeover duration in MINUTES given the line's production system
 * baseline and the from/to garment ids. The engine reads this when a
 * CHANGEOVER_BEGIN event fires.
 */
export function changeoverDurationMin(opts: {
  baseChangeoverMin: number;
  fromGarmentId: string;
  toGarmentId: string;
}): number {
  const dist = styleDistance(opts.fromGarmentId, opts.toGarmentId);
  return Math.max(0, opts.baseChangeoverMin * dist);
}
