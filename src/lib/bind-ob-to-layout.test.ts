import { describe, it, expect } from 'vitest';
import { bindObToLayout, matchStationOps, opNameKey, pickObForLayout } from './bind-ob-to-layout';
import type { GarmentTemplate, Operation } from '../domain';

/**
 * Binding a bulletin to a layout decides which time lands on which station, so
 * a wrong match silently moves the bottleneck. These lock in that matching is
 * exact (never a guess), that work content is conserved when operations are
 * combined on one station or shared across several, and that the layout — not
 * the bulletin's planning hint — decides how many stations an operation gets.
 */

function op(id: string, name: string, smv: number, extra: Partial<Operation> = {}): Operation {
  return { id, code: id.toUpperCase(), name, smv, machineCode: 'SNL', ...extra };
}

function bulletin(ops: Operation[], id = 'ob-1', name = 'Style 4401 shirt'): GarmentTemplate {
  return {
    id,
    name,
    description: '',
    operations: ops,
    totalSmv: ops.reduce((s, o) => s + o.smv, 0),
    hourlyTarget100: 0,
  };
}

const OPS = [
  op('a', 'Collar run stitch', 0.5),
  op('b', 'Placket attach & close', 0.4),
  op('c', 'Shoulder overlock', 0.3),
  op('d', 'Side seam join *2', 0.6),
  op('e', 'Sleeve attach round', 1.4, { servers: 2 }),
  op('f', 'Button attach *9', 0.7),
];

describe('opNameKey', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(opNameKey('COLLAR  RUNSTITCH')).toBe(opNameKey('Collar run-stitch'));
    expect(opNameKey('Side seam join *2')).toBe(opNameKey('side seam join 2'));
  });
});

describe('matchStationOps', () => {
  const keys = new Map(OPS.map((o, i) => [opNameKey(o.name), i]));

  it('matches a name that itself contains "&" as one operation', () => {
    expect(matchStationOps('PLACKET ATTACH & CLOSE', keys)).toEqual([1]);
  });

  it('splits a station that names two operations', () => {
    expect(matchStationOps('Shoulder overlock & Side seam join *2', keys)).toEqual([2, 3]);
  });

  it('segments joined names when one of them contains "&"', () => {
    expect(matchStationOps('Placket attach & close & Shoulder overlock', keys)).toEqual([1, 2]);
  });

  it('refuses a station it only half recognises', () => {
    expect(matchStationOps('Shoulder overlock & Hem', keys)).toEqual([]);
  });

  it('refuses a near miss rather than guessing', () => {
    expect(matchStationOps('Collar stitch', keys)).toEqual([]);
  });
});

describe('bindObToLayout', () => {
  const stations = [
    { name: 'COLLAR RUNSTITCH', codeNo: 1 },
    { name: 'Shoulder overlock & Side seam join *2', codeNo: 2 },
    { name: 'Sleeve attach round', codeNo: 3 },
    { name: 'Sleeve attach round', codeNo: 4 },
    { name: 'Pair front and back', codeNo: 5 },
  ];
  const binding = bindObToLayout(stations, bulletin(OPS), 'Line 3');
  const byId = new Map(binding.garment.operations.map((o) => [o.id, o]));
  const smvAt = (i: number) => byId.get(binding.opIdByStation[i] ?? '')?.smv;

  it('gives every matched station exactly one operation', () => {
    expect(binding.matched).toBe(4);
    expect(binding.garment.operations).toHaveLength(4);
    expect(new Set(binding.opIdByStation.filter(Boolean)).size).toBe(4);
  });

  it('sums operations combined on one station', () => {
    expect(smvAt(1)).toBeCloseTo(0.9, 6);
  });

  it('splits an operation drawn on two stations evenly', () => {
    expect(smvAt(2)).toBeCloseTo(0.7, 6);
    expect(smvAt(3)).toBeCloseTo(0.7, 6);
  });

  it('lets the layout, not the bulletin hint, set the station count', () => {
    // The bulletin plans 2 work stations for the sleeve attach. The layout
    // already draws it twice, so two servers on each would count it four times.
    for (const o of binding.garment.operations) expect(o.servers).toBe(1);
  });

  it('conserves the work content of every placed operation', () => {
    const placed = 0.5 + 0.3 + 0.6 + 1.4;
    expect(binding.garment.totalSmv).toBeCloseTo(placed, 6);
  });

  it('leaves an unrecognised station unbound and says so', () => {
    expect(binding.opIdByStation[4]).toBeNull();
    expect(binding.unmatchedStations).toEqual(['Pair front and back']);
  });

  it('reports bulletin operations no station claimed', () => {
    expect(binding.unplacedOps.map((o) => o.id)).toEqual(['b', 'f']);
  });

  it('numbers station operations from the layout', () => {
    expect(binding.garment.operations.map((o) => o.code)).toEqual(['WS1', 'WS2', 'WS3', 'WS4']);
  });

  it('is stable across re-imports of the same layout', () => {
    const again = bindObToLayout(stations, bulletin(OPS), 'Line 3');
    expect(again.garment.id).toBe(binding.garment.id);
    expect(again.opIdByStation).toEqual(binding.opIdByStation);
  });
});

describe('pickObForLayout', () => {
  const shirt = bulletin(OPS, 'ob-shirt', 'Style 4401 shirt');
  const dress = bulletin(OPS, 'ob-dress', 'Style 7702 dress');

  it('prefers the bulletin read from the same workbook', () => {
    const picked = pickObForLayout(
      { fileName: 'both.xlsx', style: '7702' },
      [{ garment: shirt, fileName: 'both.xlsx' }, { garment: dress, fileName: 'other.xlsx' }],
    );
    expect(picked?.id).toBe('ob-shirt');
  });

  it('falls back to the style number in the garment name', () => {
    const picked = pickObForLayout(
      { fileName: 'layout.xlsx', style: '7702' },
      [{ garment: shirt, fileName: 'a.xlsx' }, { garment: dress }],
    );
    expect(picked?.id).toBe('ob-dress');
  });

  it('binds nothing when two bulletins fit', () => {
    const twin = bulletin(OPS, 'ob-shirt-2', 'Style 4401 shirt rev B');
    expect(pickObForLayout({ fileName: 'l.xlsx', style: '4401' }, [{ garment: shirt }, { garment: twin }])).toBeUndefined();
  });

  it('binds nothing without a usable style number', () => {
    expect(pickObForLayout({ fileName: 'l.xlsx', style: '12' }, [{ garment: shirt }])).toBeUndefined();
    expect(pickObForLayout({ fileName: 'l.xlsx' }, [{ garment: shirt }])).toBeUndefined();
  });

  it('ignores a station bulletin left by an earlier import of the same style', () => {
    const derived = bindObToLayout([{ name: 'Collar run stitch' }], shirt, 'Line 3').garment;
    const picked = pickObForLayout({ fileName: 'l.xlsx', style: '4401' }, [{ garment: shirt }, { garment: derived }]);
    expect(picked?.id).toBe('ob-shirt');
  });
});
