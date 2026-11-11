/**
 * A line's top speed in PIECES per hour, set by its slowest sewing station.
 *
 * Read from the finished run's own per-station records, not from bulletin
 * SMVs. The earlier version divided 60 by a station's `smv`, and that was
 * wrong in two ways at once:
 *
 *   - `smv` is not always the time the engine serves at. A station bound to an
 *     operation runs on that operation's service distribution, and one with
 *     no operation runs on its catalog cycle — so the "slowest" station it
 *     picked was often not the bottleneck at all.
 *   - The engine's service time is per AGENT, and an agent is a bundle. A 28 s
 *     cycle on 20-piece bundles is 28 s per twenty pieces, which the old
 *     figure reported as 129 pieces an hour beside a run producing 593.
 *
 * `busyMin / produced` is the server-minutes the station actually spent per
 * piece, whatever mix of bundle size, skill efficiency, operator sharing and
 * distribution produced it. Its inverse, times the parallel servers, is what
 * the station can pass when it never waits for work.
 */

import type { BlockObserved } from './pml-engine';

export interface LineRateCap {
  /** The station that sets the ceiling. */
  wsId: string;
  /** Pieces per hour that station can pass when it never waits for work. */
  pcsPerHour: number;
}

export function lineRateCap(
  blocks: Iterable<BlockObserved>,
  serversOf: (wsId: string) => number,
): LineRateCap | null {
  let cap: LineRateCap | null = null;
  for (const b of blocks) {
    // Only Service blocks do timed work on a piece. One that never finished a
    // piece has no measured pace, so it cannot be ranked.
    if (b.kind !== 'Service' || b.produced <= 0 || b.busyMin <= 0) continue;
    const minPerPiece = b.busyMin / b.produced;
    const pcsPerHour = (Math.max(1, serversOf(b.wsId)) * 60) / minPerPiece;
    if (!cap || pcsPerHour < cap.pcsPerHour) cap = { wsId: b.wsId, pcsPerHour };
  }
  return cap;
}
