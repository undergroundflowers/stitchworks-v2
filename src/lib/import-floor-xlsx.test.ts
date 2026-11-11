import { describe, it, expect, beforeEach } from 'vitest';
import { parseLayoutRows, placeLayoutStations, commitFloorImport } from './import-floor-xlsx';
import { bindObToLayout } from './bind-ob-to-layout';
import { useTwin, selectActiveTwin } from '../store/twin';
import { getBlockKind, getBlockParams } from '../domain/pml';
import { BOTTLENECK_TARGET_RHO } from '../domain/reference-twin';
import { runPmlSim } from '../simulation/pml-engine';
import type { GarmentTemplate, Operation } from '../domain';

/**
 * An imported layout has to RUN. The regression these guard: a layout import
 * wrote only the operator positions, so the line had no Source and no Sink,
 * its helper tables had no capacity limit, and a full shift reported zero
 * pieces. Binding a bulletin additionally has to put that bulletin's times on
 * the stations and keep stations it does not cover out of the flow.
 *
 * The sheet below is synthetic, in the shape `sheet_to_json(header: 1)` gives
 * for a two-sided machine layout: head of the line at the bottom.
 */
const LAYOUT_ROWS: unknown[][] = [
  ['MACHINE LAYOUT', null, null, null, null, null, null],
  ['DESCRIPTION', 'SHIRT', 'LINE NO.', 7, null, 'MACHINE', 4],
  ['Style No.', 4401, null, null, null, 'MACHINE SMV', 2.1],
  ['Buyer', 'TEST', null, null, null, 'No of Work Stations:-', 7],
  ['OPERATION', 'CODE NO.', 'TYPE OF M/C', null, 'TYPE OF M/C', 'CODE NO.', 'OPERATION'],
  ['FINAL CHECK POINT', 7, 'TABLE', null, null, null, null],
  ['Sleeve attach round', 6, 'SN', null, 'SN', 5, 'Sleeve attach round'],
  ['Pair front and back', 4, 'HD', null, 'OL5', 3, 'Shoulder overlock & Side seam join *2'],
  ['Collar margin trim', 2, 'E/C', null, 'SN', 1, 'Collar run stitch'],
  [null, null, 'LOADING', null, null, null, null],
];

function op(id: string, name: string, smv: number): Operation {
  return { id, code: id, name, smv, machineCode: 'SNL', skill: 'stitching', category: 'sewing' };
}

const BULLETIN: GarmentTemplate = {
  id: 'ob-test',
  name: 'Style 4401 shirt',
  class: 'shirt' as GarmentTemplate['class'],
  description: '',
  operations: [
    op('a', 'Collar run stitch', 0.5),
    op('b', 'Collar margin trim', 0.3),
    op('c', 'Shoulder overlock', 0.3),
    op('d', 'Side seam join *2', 0.6),
    op('e', 'Sleeve attach round', 1.4),
    op('f', 'Button attach *9', 0.7),
  ],
  defaultBundleSize: 20,
  totalSmv: 3.8,
  hourlyTarget100: 0,
  bestFor: '',
};

const parsed = parseLayoutRows(LAYOUT_ROWS, 'test.xlsx', 'layout');
const placement = placeLayoutStations(parsed);

const activeTwin = () => selectActiveTwin(useTwin.getState());
const lineStations = (lineId: string) => activeTwin().workstations.filter((w) => w.lineId === lineId);
const kinds = (lineId: string) => lineStations(lineId).map((w) => getBlockKind(w));

describe('layout parsing', () => {
  it('reads the stations in flow order', () => {
    expect(placement.stations.map((s) => s.codeNo)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('maps an "E/C" edge cutter to the single-needle fixture without a warning', () => {
    const ec = placement.stations.find((s) => s.rawMachine === 'E/C');
    expect(ec?.catalogId).toBe('a_snls');
    expect(parsed.warnings.filter((w) => w.includes('E/C'))).toEqual([]);
  });
});

describe('commitFloorImport — layout only', () => {
  beforeEach(() => useTwin.getState().resetTwin());

  it('adds a Source, a Sink and an operator pool on the same line', () => {
    const res = commitFloorImport(useTwin.getState(), parsed, placement);
    const k = kinds(res.lineId);
    expect(k.filter((x) => x === 'Source')).toHaveLength(1);
    expect(k.filter((x) => x === 'Sink')).toHaveLength(1);
    expect(k.filter((x) => x === 'ResourcePool')).toHaveLength(1);
    expect(res.workstationCount).toBe(7);
  });

  it('makes every layout position a one-operator Service', () => {
    const res = commitFloorImport(useTwin.getState(), parsed, placement);
    // Includes the helper table and the check point, whose catalogue defaults
    // are Delay (no capacity limit) and SelectOutput (an unwired fail branch).
    expect(kinds(res.lineId).filter((x) => x === 'Service')).toHaveLength(7);
  });

  it('wires one unbroken chain from Source to Sink', () => {
    const res = commitFloorImport(useTwin.getState(), parsed, placement);
    const twin = activeTwin();
    const flows = twin.connectors.filter((c) => c.kind === 'flow');
    expect(flows).toHaveLength(8);
    expect(res.connectorCount).toBe(8);
    const outOf = new Map(flows.map((c) => [c.fromWsId, c.toWsId]));
    expect(outOf.size).toBe(8); // no station feeds two others
    let at = twin.workstations.find((w) => getBlockKind(w) === 'Source')!.id;
    const visited: string[] = [];
    while (outOf.has(at)) { at = outOf.get(at)!; visited.push(at); }
    expect(visited).toHaveLength(8);
    expect(getBlockKind(twin.workstations.find((w) => w.id === at)!)).toBe('Sink');
  });

  it('sizes the operator pool to the stations', () => {
    const res = commitFloorImport(useTwin.getState(), parsed, placement);
    const pool = lineStations(res.lineId).find((w) => getBlockKind(w) === 'ResourcePool')!;
    expect(getBlockParams(pool).capacity).toBe(7);
  });

  it('runs a shift and produces pieces', () => {
    commitFloorImport(useTwin.getState(), parsed, placement);
    const run = runPmlSim({ twin: activeTwin(), durationMin: 480, seed: 42 });
    expect(run.totalProduced).toBeGreaterThan(0);
  });
});

describe('commitFloorImport — with a bulletin bound', () => {
  beforeEach(() => useTwin.getState().resetTwin());

  const binding = bindObToLayout(placement.stations, BULLETIN, 'Line 7');
  const commit = () => commitFloorImport(useTwin.getState(), parsed, placement, { binding });
  const stationNamed = (lineId: string, name: string) => lineStations(lineId).filter((w) => w.name === name);

  it('matches five of the seven stations', () => {
    expect(binding.matched).toBe(5);
    expect(binding.unmatchedStations).toEqual(['Pair front and back', 'FINAL CHECK POINT']);
  });

  it('bakes each station\'s bulletin time into its block', () => {
    const res = commit();
    const cycleMin = (name: string) => stationNamed(res.lineId, name).map((w) => getBlockParams(w).cycleS / 60);
    expect(cycleMin('Collar run stitch')[0]).toBeCloseTo(0.5, 6);
    expect(cycleMin('Shoulder overlock & Side seam join *2')[0]).toBeCloseTo(0.9, 6);
    // One bulletin operation on two stations: half the work at each.
    expect(cycleMin('Sleeve attach round')).toHaveLength(2);
    for (const c of cycleMin('Sleeve attach round')) expect(c).toBeCloseTo(0.7, 6);
  });

  it('points each bound station at its operation in the station bulletin', () => {
    const res = commit();
    const bound = lineStations(res.lineId).filter((w) => w.operation.opId);
    expect(bound).toHaveLength(5);
    const opIds = new Set(binding.garment.operations.map((o) => o.id));
    for (const w of bound) {
      expect(opIds.has(w.operation.opId!)).toBe(true);
      expect(w.operation.garmentId).toBe(binding.garment.id);
    }
    expect(activeTwin().lines.find((l) => l.id === res.lineId)?.garmentId).toBe(binding.garment.id);
  });

  it('keeps uncovered stations on the floor but out of the flow', () => {
    const res = commit();
    const twin = activeTwin();
    const helper = stationNamed(res.lineId, 'Pair front and back')[0];
    expect(helper).toBeDefined();
    const touching = twin.connectors.filter((c) => c.fromWsId === helper.id || c.toWsId === helper.id);
    expect(touching).toEqual([]);
    expect(res.inFlowCount).toBe(5);
    expect(res.connectorCount).toBe(6); // Source → 5 stations → Sink
  });

  it('feeds the line at the shared fraction of its bottleneck', () => {
    const res = commit();
    // Slowest station is the 0.9-minute overlock.
    expect(res.sourceRatePerHr).toBe(Math.round((60 / 0.9) * BOTTLENECK_TARGET_RHO));
  });

  it('runs at the pace the bulletin sets', () => {
    commit();
    const run = runPmlSim({ twin: activeTwin(), durationMin: 480, seed: 42 });
    // Fed at 85 % of a 66.7 pcs/hr bottleneck: about 57 pcs/hr. On catalogue
    // default cycles (35 s a station) the same line would pass over 85.
    expect(run.throughputPerHr).toBeGreaterThan(48);
    expect(run.throughputPerHr).toBeLessThan(62);
  });

  it('falls back to a plain layout import when the bulletin matches nothing', () => {
    const none = bindObToLayout(placement.stations, { ...BULLETIN, operations: [op('z', 'Unrelated', 1)] }, 'Line 7');
    const res = commitFloorImport(useTwin.getState(), parsed, placement, { binding: none });
    expect(res.inFlowCount).toBe(7);
    expect(lineStations(res.lineId).filter((w) => w.operation.opId)).toHaveLength(0);
  });
});
