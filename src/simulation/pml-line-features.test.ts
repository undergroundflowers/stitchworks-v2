/**
 * Four engine capabilities added to reproduce a published AnyLogic line
 * (see `replication/rahman2023.ts`), each tested here on a hand-sized line
 * where the right answer can be worked out on paper:
 *
 *   1. a Combine / Assembler emits ONE garment and fires on its wired ports;
 *   2. a Source can release a fixed lot and stop;
 *   3. a run can end at a piece count instead of a clock time;
 *   4. one operator can serve several stations on demand, with a priority.
 *
 * Every service time is deterministic, so each expectation is arithmetic, not
 * a tolerance band around a random draw.
 */
import { describe, expect, it } from 'vitest';
import { runPmlSim } from './pml-engine';
import { pmlFixtureId, type PmlBlockKind, type PmlBlockParams } from '../domain/pml';
import {
  emptyTwin,
  makeWorkstation,
  newAssignmentId,
  newConnectorId,
  newOperatorId,
  type Twin,
  type Workstation,
} from '../domain/twin';

function block(twin: Twin, kind: PmlBlockKind, name: string, params: PmlBlockParams = {}): Workstation {
  const ws = makeWorkstation({
    lineId: twin.lines[0].id,
    catalogId: kind === 'Service' ? 'a_snls' : pmlFixtureId(kind),
    position: { x: twin.workstations.length * 3, y: 2 },
    name,
  });
  ws.block = { kind, params };
  twin.workstations.push(ws);
  return ws;
}

function wire(twin: Twin, from: Workstation, to: Workstation, toPort?: string): void {
  twin.connectors.push({
    id: newConnectorId(),
    kind: 'flow',
    fromWsId: from.id,
    toWsId: to.id,
    ...(toPort ? { toPort } : {}),
  });
}

/** A fixed-time station: every piece takes exactly `minutes`. */
const fixed = (minutes: number): PmlBlockParams => ({
  cycleS: minutes * 60,
  servers: 1,
  cycleDist: { kind: 'det', value: minutes },
});

const RUN = { seed: 7, samplePeriodMin: 0 } as const;

// ============================================================================
// 1. COMBINE / ASSEMBLER
// ============================================================================

describe('Assembler — joins parts into one garment', () => {
  /** bodies ─┐
   *          ├─ Assembler ─ Sink        labels are always in stock
   *  labels ─┘                                                          */
  function joinLine(kind: 'Assembler' | 'Combine') {
    const twin = emptyTwin('join');
    const bodies = block(twin, 'Source', 'Bodies', { sourceRatePerHr: 60, maxArrivals: 100 });
    const labels = block(twin, 'Source', 'Labels', { sourceRatePerHr: 6000, maxArrivals: 100 });
    const join = block(twin, kind, 'Join');
    const sink = block(twin, 'Sink', 'Out');
    const ports = kind === 'Assembler' ? ['parts1', 'parts2'] : ['in1', 'in2'];
    wire(twin, bodies, join, ports[0]);
    wire(twin, labels, join, ports[1]);
    wire(twin, join, sink);
    return { twin, join, sink };
  }

  it('counts a body with a label sewn in as ONE piece, not two', () => {
    const { twin } = joinLine('Combine');
    const r = runPmlSim({ twin, durationMin: 480, ...RUN });
    // 100 bodies went in. Summing the parts would report 200.
    expect(r.totalProduced).toBe(100);
  });

  it('fires with two of an Assembler\'s three part ports wired', () => {
    // The library Assembler has ports for body, sleeves and collar. Requiring
    // all three meant a body-plus-label join waited forever on the third.
    const { twin } = joinLine('Assembler');
    const r = runPmlSim({ twin, durationMin: 480, ...RUN });
    expect(r.totalProduced).toBe(100);
  });

  it('dates the garment from its body, not from a label that sat in stock', () => {
    const { twin } = joinLine('Assembler');
    const r = runPmlSim({ twin, durationMin: 480, ...RUN });
    // Bodies arrive one a minute and pass straight through, so lead time is
    // zero. Every label was released in the first minute; dating the garment
    // from its label would give a mean lead time of about 50 minutes.
    expect(r.meanLeadTimeMin).toBeCloseTo(0, 6);
  });

  it('reports the garments waiting, not the parts rack, as the queue', () => {
    const { twin, join } = joinLine('Assembler');
    // Stop while 40 bodies have arrived and all 100 labels are in.
    const r = runPmlSim({ twin, durationMin: 40.5, ...RUN });
    const obs = r.blocks.get(join.id)!;
    // 60 labels are still on the rack, but no garment is waiting.
    expect(obs.finalQueueLen).toBe(0);
    // And the join's arrivals are garments: 40 bodies, not 40 + 100.
    expect(obs.arrivals).toBe(40);
  });

  it('holds garments when the part runs out', () => {
    const twin = emptyTwin('starved');
    const bodies = block(twin, 'Source', 'Bodies', { sourceRatePerHr: 600, maxArrivals: 50 });
    const labels = block(twin, 'Source', 'Labels', { sourceRatePerHr: 600, maxArrivals: 30 });
    const join = block(twin, 'Assembler', 'Join');
    const sink = block(twin, 'Sink', 'Out');
    wire(twin, bodies, join, 'parts1');
    wire(twin, labels, join, 'parts2');
    wire(twin, join, sink);
    const r = runPmlSim({ twin, durationMin: 480, ...RUN });
    expect(r.totalProduced).toBe(30);
    expect(r.blocks.get(join.id)!.finalQueueLen).toBe(20);
  });
});

// ============================================================================
// 2. FINITE SOURCE
// ============================================================================

describe('Source — lot size', () => {
  it('releases exactly the lot, then stops', () => {
    const twin = emptyTwin('lot');
    const src = block(twin, 'Source', 'In', { sourceRatePerHr: 600, maxArrivals: 75 });
    const sink = block(twin, 'Sink', 'Out');
    wire(twin, src, sink);
    const r = runPmlSim({ twin, durationMin: 480, ...RUN });
    expect(r.totalProduced).toBe(75);
    expect(r.blocks.get(src.id)!.produced).toBe(75);
  });

  it('is unlimited when the lot size is 0', () => {
    const twin = emptyTwin('endless');
    const src = block(twin, 'Source', 'In', { sourceRatePerHr: 60, maxArrivals: 0 });
    const sink = block(twin, 'Sink', 'Out');
    wire(twin, src, sink);
    const r = runPmlSim({ twin, durationMin: 480, ...RUN });
    // One a minute, first at minute 1, last at minute 480.
    expect(r.totalProduced).toBe(480);
  });
});

// ============================================================================
// 3. STOP AT OUTPUT
// ============================================================================

describe('stopAtProduced — end the run at a piece count', () => {
  /** Lot of 500 → one station at exactly 2 min a piece → Sink. */
  function slowLine() {
    const twin = emptyTwin('stop');
    const src = block(twin, 'Source', 'In', { sourceRatePerHr: 6000, maxArrivals: 500 });
    const st = block(twin, 'Service', 'Sew', fixed(2));
    const sink = block(twin, 'Sink', 'Out');
    wire(twin, src, st);
    wire(twin, st, sink);
    return { twin, st };
  }

  it('ends at the minute the target is reached', () => {
    const { twin } = slowLine();
    const r = runPmlSim({ twin, durationMin: 5000, stopAtProduced: 100, ...RUN });
    expect(r.totalProduced).toBe(100);
    expect(r.stoppedAtTarget).toBe(true);
    // First piece arrives at 0.01 min; the hundredth leaves 200 min later.
    expect(r.durationMin).toBeCloseTo(200.01, 6);
  });

  it('measures rates and utilisation over the shortened run', () => {
    const { twin, st } = slowLine();
    const r = runPmlSim({ twin, durationMin: 5000, stopAtProduced: 100, ...RUN });
    // 100 pieces in 200.01 min is 30 an hour — not 100 in 5000 min.
    expect(r.throughputPerHr).toBeCloseTo((100 * 60) / 200.01, 3);
    // The station never idled after its first piece arrived.
    expect(r.blocks.get(st.id)!.utilization).toBeGreaterThan(0.999);
    expect(r.blocks.get(st.id)!.observedMin).toBeCloseTo(200.01, 6);
  });

  it('runs to the clock when the target is out of reach', () => {
    const { twin } = slowLine();
    const r = runPmlSim({ twin, durationMin: 60, stopAtProduced: 100, ...RUN });
    expect(r.stoppedAtTarget).toBe(false);
    expect(r.durationMin).toBe(60);
    expect(r.totalProduced).toBe(29);
  });

  it('changes nothing when it is off', () => {
    const { twin } = slowLine();
    const a = runPmlSim({ twin, durationMin: 300, ...RUN });
    const b = runPmlSim({ twin, durationMin: 300, stopAtProduced: 0, ...RUN });
    expect(b.totalProduced).toBe(a.totalProduced);
    expect(b.durationMin).toBe(300);
    expect(b.stoppedAtTarget).toBe(false);
  });
});

// ============================================================================
// 4. ON-DEMAND SHARED OPERATOR
// ============================================================================

describe('on-demand operator — one person, two stations', () => {
  /**
   * Lot of 200 → A (1 min) → B (2 min) → Sink, with ONE operator covering both.
   * `mode` picks how their time is dealt out.
   */
  function pairLine(mode: 'onDemand' | 'timeSplit', priorityB = 1) {
    const twin = emptyTwin('pair');
    const src = block(twin, 'Source', 'In', { sourceRatePerHr: 6000, maxArrivals: 200 });
    const a = block(twin, 'Service', 'A', fixed(1));
    const b = block(twin, 'Service', 'B', fixed(2));
    const sink = block(twin, 'Sink', 'Out');
    wire(twin, src, a);
    wire(twin, a, b);
    wire(twin, b, sink);
    const opr = {
      id: newOperatorId(),
      lineId: twin.lines[0].id,
      name: 'OPR-01',
      skills: [],
      ...(mode === 'onDemand' ? { shareMode: 'onDemand' as const } : {}),
    };
    twin.operators = [opr];
    twin.assignments = [
      { id: newAssignmentId(), operatorId: opr.id, wsId: a.id, role: 'primary', shareFrac: 0.5, priority: 1 },
      { id: newAssignmentId(), operatorId: opr.id, wsId: b.id, role: 'primary', shareFrac: 0.5, priority: priorityB },
    ];
    return { twin, a, b, opr };
  }

  it('never works two stations at once', () => {
    const { twin, a, b } = pairLine('onDemand', 2);
    const r = runPmlSim({ twin, durationMin: 300, seed: 7, samplePeriodMin: 0.25 });
    for (const s of r.samples) {
      expect(s.blocks[a.id].inService + s.blocks[b.id].inService).toBeLessThanOrEqual(1);
    }
  });

  it('with A first, clears all of A before B sees the operator', () => {
    // A always has work until the lot is through it, so strict priority keeps
    // the operator there for 200 min. B then needs 2 min a piece.
    const { twin } = pairLine('onDemand', 2);
    const early = runPmlSim({ twin, durationMin: 199, ...RUN });
    expect(early.totalProduced).toBe(0);
    const done = runPmlSim({ twin, durationMin: 5000, stopAtProduced: 200, ...RUN });
    // 200 × 1 min at A, then 200 × 2 min at B (+ the first arrival at 0.01).
    expect(done.durationMin).toBeCloseTo(600.01, 6);
  });

  it('with B first, alternates: one at A, then straight to B', () => {
    // B outranks A, and B has work the moment A finishes a piece. So the
    // operator does A, B, A, B … — three minutes a garment from the start.
    const { twin } = pairLine('onDemand', 1);
    twin.assignments![0].priority = 2;
    const r = runPmlSim({ twin, durationMin: 5000, stopAtProduced: 50, ...RUN });
    expect(r.durationMin).toBeCloseTo(150.01, 6);
  });

  it('with no priority, serves whichever piece has waited longest', () => {
    // "Waited" is measured from arrival at the station the piece is AT, the
    // way a FIFO request queue would see it. The lot lands on A one piece
    // every 0.01 min, so it is all there by minute 2.00.
    //
    //   minute   1.01  piece 1 leaves A and joins B. A's next piece has been
    //                  waiting since 0.02, so A keeps the operator.
    //   minute ~100    A has done about a hundred pieces. Its next one arrived
    //                  around 1.01 — as piece 1 reached B. B is served, once.
    //   two min later  piece 1 is out. B's next piece arrived at 2.01, later
    //                  than everything still at A, so the operator goes back.
    //
    // (Piece 101 reaches A at 1.01, the same instant piece 1 reaches B, so
    // which of the two wins is a floating-point tie. The checks below sit
    // clear of it on both sides.)
    //
    // One piece by minute 199, then: exactly what the rule says, and exactly
    // why dumping a lot on the first station of a shared pair starves the
    // second.
    const { twin } = pairLine('onDemand', 1);
    const early = runPmlSim({ twin, durationMin: 100, ...RUN });
    expect(early.totalProduced).toBe(0);
    const later = runPmlSim({ twin, durationMin: 199, ...RUN });
    expect(later.totalProduced).toBe(1);
  });

  it('reports the operator, and where their time went', () => {
    const { twin, a, b, opr } = pairLine('onDemand', 2);
    const r = runPmlSim({ twin, durationMin: 5000, stopAtProduced: 200, ...RUN });
    expect(r.operators).toHaveLength(1);
    const o = r.operators[0];
    expect(o.operatorId).toBe(opr.id);
    expect(o.mode).toBe('onDemand');
    // Busy from the first arrival to the last piece: 200 min at A, 400 at B.
    expect(o.utilization).toBeGreaterThan(0.999);
    expect(o.stations.find((s) => s.wsId === a.id)!.busyMin).toBeCloseTo(200, 6);
    expect(o.stations.find((s) => s.wsId === b.id)!.busyMin).toBeCloseTo(400, 6);
  });

  it('differs from a fixed 50/50 split, which is left exactly as it was', () => {
    // Time-split: each station runs at half speed, forever. A takes 2 min a
    // piece, B takes 4, so B paces the line at 4 min a garment.
    const split = runPmlSim({
      twin: pairLine('timeSplit').twin,
      durationMin: 5000,
      stopAtProduced: 100,
      ...RUN,
    });
    // Garment k leaves A at 2k and B needs 4 min each: the hundredth is out
    // at 2 + 100 × 4 (+ the first arrival at 0.01).
    expect(split.durationMin).toBeCloseTo(402.01, 6);
    expect(split.operators[0].mode).toBe('timeSplit');

    // On demand, alternating, the same hundred take 3 min each.
    const demand = pairLine('onDemand', 1);
    demand.twin.assignments![0].priority = 2;
    const od = runPmlSim({ twin: demand.twin, durationMin: 5000, stopAtProduced: 100, ...RUN });
    expect(od.durationMin).toBeCloseTo(300.01, 6);
  });

  it('leaves a line with only dedicated operators untouched', () => {
    const twin = emptyTwin('dedicated');
    const src = block(twin, 'Source', 'In', { sourceRatePerHr: 6000, maxArrivals: 200 });
    const a = block(twin, 'Service', 'A', fixed(1));
    const sink = block(twin, 'Sink', 'Out');
    wire(twin, src, a);
    wire(twin, a, sink);
    const bare = runPmlSim({ twin, durationMin: 150, ...RUN });
    const opr = { id: newOperatorId(), lineId: twin.lines[0].id, name: 'OPR-01', skills: [] };
    twin.operators = [opr];
    twin.assignments = [
      { id: newAssignmentId(), operatorId: opr.id, wsId: a.id, role: 'primary', shareFrac: 1 },
    ];
    const staffed = runPmlSim({ twin, durationMin: 150, ...RUN });
    expect(staffed.totalProduced).toBe(bare.totalProduced);
    expect(staffed.operators[0].mode).toBe('dedicated');
    expect(staffed.operators[0].utilization).toBeCloseTo(
      staffed.blocks.get(a.id)!.utilization,
      9,
    );
  });
});
