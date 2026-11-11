import { describe, expect, it } from 'vitest';
import { liveAggregate } from './live-aggregate';
import { emptyPmlSimState } from './pml-to-sim-state';
import type { SimRunSlot } from './useSimSession';
import type { StationView } from './sim-state';

function slotAt(time: number, producedPieces: number): SimRunSlot {
  const state = {
    ...emptyPmlSimState(),
    time,
    produced: producedPieces,
    producedPieces,
    totalArrivals: producedPieces + 3,
    stations: [{ produced: producedPieces, smv: 1.2, serversTotal: 2 } as StationView],
    bottleneckOpIndex: 0,
  };
  return { state, history: [], result: null } as unknown as SimRunSlot;
}

describe('liveAggregate', () => {
  it('reports the run so far, not the whole shift', () => {
    const agg = liveAggregate(slotAt(120, 100), { operators: 2 });
    expect(agg.producedPieces.mean).toBe(100);
    expect(agg.throughputPerHr.mean).toBeCloseTo(50);
    // 100 pcs × 1.2 SMV over 2 operators × 120 min.
    expect(agg.efficiencyPct.mean).toBeCloseTo(50);
    expect(agg.wipBundles.mean).toBe(3);
  });

  it('is a single run: n = 1 and no spread', () => {
    const agg = liveAggregate(slotAt(120, 100), { operators: 2 });
    expect(agg.n).toBe(1);
    expect(agg.producedPieces.std).toBe(0);
    expect(agg.throughputPerHr.std).toBe(0);
  });

  it('reads zero, not NaN, before the run starts', () => {
    const agg = liveAggregate(slotAt(0, 0), { operators: 2 });
    expect(agg.throughputPerHr.mean).toBe(0);
    expect(agg.efficiencyPct.mean).toBe(0);
    expect(agg.labourProductivity.mean).toBe(0);
  });
});
