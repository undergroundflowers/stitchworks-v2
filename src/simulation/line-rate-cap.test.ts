import { describe, expect, it } from 'vitest';
import { lineRateCap } from './line-rate-cap';
import type { BlockObserved } from './pml-engine';

const block = (wsId: string, kind: BlockObserved['kind'], produced: number, busyMin: number) =>
  ({ wsId, kind, produced, busyMin }) as BlockObserved;

const one = () => 1;

describe('lineRateCap', () => {
  it('counts pieces, not bundles — the numbers from a real 480-min run', () => {
    // 20-piece bundles at 30 bundles/hr. Station B serves a bundle in ~2 min,
    // so it can pass ~600 pieces an hour and is the bottleneck. The old
    // SMV-based figure called this line 129 pcs/hr while it produced 593.
    const cap = lineRateCap(
      [
        block('src', 'Source', 4800, 0),
        block('a', 'Service', 4780, 112),
        block('b', 'Service', 4760, 475),
        block('c', 'Service', 4740, 237),
        block('sink', 'Sink', 4740, 0),
      ],
      one,
    );
    expect(cap?.wsId).toBe('b');
    expect(Math.round(cap!.pcsPerHour)).toBe(601);
  });

  it('scales with parallel servers', () => {
    const blocks = [block('a', 'Service', 600, 480)];
    expect(lineRateCap(blocks, one)?.pcsPerHour).toBeCloseTo(75);
    expect(lineRateCap(blocks, () => 2)?.pcsPerHour).toBeCloseTo(150);
  });

  it('ignores stations that never finished a piece', () => {
    const cap = lineRateCap(
      [block('idle', 'Service', 0, 0), block('a', 'Service', 600, 480)],
      one,
    );
    expect(cap?.wsId).toBe('a');
  });

  it('returns null when there is nothing to measure', () => {
    expect(lineRateCap([block('src', 'Source', 100, 0)], one)).toBeNull();
    expect(lineRateCap([], one)).toBeNull();
  });
});
