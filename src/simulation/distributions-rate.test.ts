/**
 * `triangularRate` — service time as the reciprocal of a triangular RATE.
 *
 * The reference values are worked by hand from the closed forms in the
 * module, for the rows of Table 1 in Rahman, Rahman, Kamal & Tseng, "A
 * Simulation-Based Approach for Line Balancing Under Demand Uncertainty in
 * Production Environment" (WSC 2023), which publishes a T-shirt line as
 * pieces-per-minute triangles.
 */
import { describe, expect, it } from 'vitest';
import {
  cvOf,
  kendallServiceCode,
  meanOf,
  sample,
  scaleServiceDist,
  varOf,
  type ServiceDist,
} from './distributions';
import { mulberry32 } from './priority-queue';

const rate = (min: number, mode: number, max: number): ServiceDist => ({
  kind: 'triangularRate',
  min,
  mode,
  max,
});

describe('triangularRate — closed-form moments', () => {
  it('matches the hand-worked mean time for each published row', () => {
    // E[1/X] = (1 − ln 2) + (3·ln 1.5 − 1) for (1, 2, 3)
    expect(meanOf(rate(1, 2, 3))).toBeCloseTo(0.523248, 5);
    // Mode on the minimum: only the falling half contributes.
    expect(meanOf(rate(2, 2, 3))).toBeCloseTo(2 * (3 * Math.log(1.5) - 1), 9);
    expect(meanOf(rate(2, 2, 4))).toBeCloseTo(0.5 * (4 * Math.log(2) - 2), 9);
    // General case, both halves: (1/3)(2 − 3·ln(5/3)) + (2/3)(6·ln(6/5) − 1)
    expect(meanOf(rate(3, 5, 6))).toBeCloseTo(
      (2 - 3 * Math.log(5 / 3)) / 3 + (2 / 3) * (6 * Math.log(6 / 5) - 1),
      9,
    );
    expect(meanOf(rate(3, 5, 6))).toBeCloseTo(0.218461, 5);
    expect(meanOf(rate(4, 6, 7))).toBeCloseTo(
      (2 - 4 * Math.log(1.5)) / 3 + (2 / 3) * (7 * Math.log(7 / 6) - 1),
      9,
    );
    expect(meanOf(rate(4, 6, 7))).toBeCloseTo(0.17875, 5);
  });

  it('is longer than the reciprocal of the mean rate (Jensen)', () => {
    const d = rate(1, 2, 3);
    expect(meanOf(d)).toBeGreaterThan(1 / 2);
  });

  it('has the hand-worked variance for (1, 2, 3)', () => {
    // E[1/X²] = (ln 2 − 1/2) + (1/2 − ln 1.5)
    const m2 = Math.log(2) - 0.5 + (0.5 - Math.log(1.5));
    const m1 = 1 - Math.log(2) + (3 * Math.log(1.5) - 1);
    expect(varOf(rate(1, 2, 3))).toBeCloseTo(m2 - m1 * m1, 9);
    expect(cvOf(rate(1, 2, 3))).toBeGreaterThan(0);
  });

  it('collapses to a constant when the range has no width', () => {
    expect(meanOf(rate(4, 4, 4))).toBeCloseTo(0.25, 9);
    expect(varOf(rate(4, 4, 4))).toBeCloseTo(0, 9);
  });

  it('clamps a mode printed outside the range instead of returning NaN', () => {
    // Sleeve soap tack is printed as min 2, max 3, mode 5.
    const d = rate(2, 5, 3);
    expect(Number.isFinite(meanOf(d))).toBe(true);
    expect(meanOf(d)).toBeCloseTo(meanOf(rate(2, 3, 3)), 9);
  });

  it('classifies as a general service distribution', () => {
    expect(kendallServiceCode(rate(1, 2, 3))).toBe('G');
  });
});

describe('triangularRate — sampling', () => {
  it('stays inside [1/max, 1/min] and converges on the analytical mean', () => {
    const d = rate(1, 2, 3);
    const rng = mulberry32(20231210);
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const t = sample(d, rng);
      if (t < lo) lo = t;
      if (t > hi) hi = t;
      sum += t;
      sumSq += t * t;
    }
    // Asserted once on the extremes, not 200,000 times in the loop.
    expect(lo).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
    expect(hi).toBeLessThanOrEqual(1 + 1e-9);
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(mean).toBeCloseTo(meanOf(d), 2);
    expect(variance).toBeCloseTo(varOf(d), 3);
  });

  it('scales as a TIME: stretching by f divides the rates by f', () => {
    const d = rate(1, 2, 3);
    const doubled = scaleServiceDist(d, 2);
    expect(meanOf(doubled)).toBeCloseTo(2 * meanOf(d), 9);
    // Shape is unchanged, so the coefficient of variation is too.
    expect(cvOf(doubled)).toBeCloseTo(cvOf(d), 9);
  });
});
