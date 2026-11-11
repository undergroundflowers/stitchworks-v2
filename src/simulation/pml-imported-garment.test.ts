import { describe, it, expect } from 'vitest';
import { runPmlSim } from './pml-engine';
import { buildGarmentTwin } from '../domain/reference-twin';
import { GARMENT_TEMPLATES } from '../domain/garments';
import { getBlockKind } from '../domain/pml';
import type { GarmentTemplate, Operation } from '../domain';
import type { Twin } from '../domain/twin';

/**
 * A station bound to an IMPORTED bulletin must run at that bulletin's time.
 *
 * The op-derived cycle used to be read off the frozen built-in catalogue only.
 * A garment the user imported or authored is not in it, so the lookup missed
 * and every station fell through to the fixture's generic cycle — two lines
 * sewing garments four times apart in work content ran at the same pace. The
 * servers, the buffer and the discipline already resolved through the
 * effective catalogue; the cycle was the one field that did not.
 */

function customGarment(id: string, smv: number): GarmentTemplate {
  const ops: Operation[] = [1, 2, 3].map((n) => ({
    id: `${id}-op${n}`,
    name: `Operation ${n}`,
    smv,
    machineCode: 'SNL',
    skill: 'stitching',
    category: 'sewing',
  }));
  return {
    id,
    name: id,
    class: 'shirt' as GarmentTemplate['class'],
    description: '',
    operations: ops,
    defaultBundleSize: 1,
    totalSmv: smv * ops.length,
    hourlyTarget100: Math.round(60 / smv),
    bestFor: '',
  };
}

/** A line whose stations carry ONLY the op binding — no baked cycle, which is
 *  what a station bound by hand in the Inspector looks like — fed far beyond
 *  capacity so the stations, not the arrivals, set the pace. */
function boundOnlyTwin(garment: GarmentTemplate): Twin {
  const twin = buildGarmentTwin(garment, garment.operations.length)!;
  for (const ws of twin.workstations) {
    const kind = getBlockKind(ws);
    if (kind === 'Service') {
      ws.block = { kind: 'Service' };
      ws.operation = { ...ws.operation, bundleSize: 1 };
      const props = { ...ws.props };
      delete props.cycle_s;
      ws.props = props;
    }
    if (kind === 'Source') {
      ws.block = { kind: 'Source', params: { sourceRatePerHr: 600, piecesPerAgent: 1 } };
    }
  }
  return twin;
}

describe('cycle time from an imported bulletin', () => {
  const fast = customGarment('custom-fast', 0.5);
  const slow = customGarment('custom-slow', 2.0);
  const catalog = { ...GARMENT_TEMPLATES, [fast.id]: fast, [slow.id]: slow };
  const run = (g: GarmentTemplate, withCatalog = true) =>
    runPmlSim({
      twin: boundOnlyTwin(g),
      durationMin: 480,
      seed: 7,
      garmentsById: withCatalog ? catalog : undefined,
    });

  it('is not one of the built-ins (or this test proves nothing)', () => {
    expect(GARMENT_TEMPLATES[fast.id]).toBeUndefined();
    expect(GARMENT_TEMPLATES[slow.id]).toBeUndefined();
  });

  it('paces the line by the bulletin SMV', () => {
    // Saturated, so output per hour is the station rate: 60 / SMV.
    expect(run(fast).throughputPerHr).toBeGreaterThan(110);
    expect(run(fast).throughputPerHr).toBeLessThanOrEqual(120);
    expect(run(slow).throughputPerHr).toBeGreaterThan(27);
    expect(run(slow).throughputPerHr).toBeLessThanOrEqual(30);
  });

  it('tells a 0.5-minute garment from a 2-minute one', () => {
    const ratio = run(fast).totalProduced / run(slow).totalProduced;
    expect(ratio).toBeGreaterThan(3.8);
    expect(ratio).toBeLessThan(4.2);
  });

  it('cannot see the bulletin without the catalogue (the old behaviour)', () => {
    // Without the effective catalogue both lines fall back to the same generic
    // fixture cycle — which is exactly what every run used to do.
    expect(run(fast, false).totalProduced).toBe(run(slow, false).totalProduced);
  });
});
