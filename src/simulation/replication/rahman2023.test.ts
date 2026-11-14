/**
 * Replication check — Rahman, Rahman, Kamal & Tseng (WSC 2023).
 *
 * Three things are compared, and they answer different questions:
 *
 *   ENGINE vs REFERENCE   Is Stitchworks computing this model correctly?
 *     The reference is `scripts/replication/rahman2023_reference.py`: the same
 *     assumptions in another language, with another random number generator
 *     and no shared code. Its means over 200 runs are pasted below. Agreement
 *     here is the claim the test exists to defend.
 *
 *   ENGINE vs CLOSED FORM   Does the line run at the pace arithmetic says?
 *     The slowest station sets the pace; its mean time is a closed form.
 *
 *   ENGINE vs PAPER   Does the model reproduce the publication?
 *     Only where the paper is self-consistent (Scenarios 1, 2 and 5, under
 *     reading A). The rest is recorded, not asserted — see the notes there.
 *
 * Set RAHMAN_SEEDS to run more seeds, and RAHMAN_REPORT to a file path to
 * write the full table as JSON.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getBlockKind } from '../../domain/pml';
import { meanOf } from '../distributions';
import { runPmlSim, type PmlSimResult } from '../pml-engine';
import {
  RAHMAN_LOT,
  RAHMAN_SMV,
  RAHMAN_STATIONS,
  RAHMAN_TABLE_2,
  RAHMAN_TARGET,
  buildRahmanFactory,
  buildRahmanScenario,
  rahmanCrew,
  rahmanGarment,
  type RahmanOptions,
  type RahmanReading,
} from './rahman2023';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const SEED_COUNT = Math.max(4, Number(env.RAHMAN_SEEDS ?? 12));
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 20231210 + i * 7919);

interface Row {
  operators: number;
  minutes: number;
  output: number;
  operatingMinutes: number;
  efficiencyPct: number;
  /** Mean utilisation per operator, in crew order. */
  operatorUtilisation: number[];
}

function run(opts: RahmanOptions, stop: { horizon?: number; target?: number }): Row {
  let minutes = 0;
  let output = 0;
  let operators = 0;
  let util: number[] = [];
  let last: PmlSimResult | null = null;
  for (const seed of SEEDS) {
    const { twin, garmentsById } = buildRahmanScenario(opts);
    const r = runPmlSim({
      twin,
      garmentsById,
      // With a target the clock is only a ceiling, set well clear of it.
      durationMin: stop.horizon ?? 6000,
      stopAtProduced: stop.target,
      seed,
      samplePeriodMin: 0,
    });
    minutes += r.durationMin;
    output += r.totalProduced;
    operators = r.operators.length;
    util = r.operators.map((o, i) => (util[i] ?? 0) + o.utilization);
    last = r;
  }
  // No warning but the three honest ones about non-Poisson sources.
  expect(last!.warnings.filter((w) => !w.includes('Poisson'))).toEqual([]);
  const n = SEEDS.length;
  const m = minutes / n;
  const g = output / n;
  return {
    operators,
    minutes: m,
    output: g,
    operatingMinutes: operators * m,
    efficiencyPct: (100 * g * RAHMAN_SMV) / (operators * m),
    operatorUtilisation: util.map((u) => u / n),
  };
}

function scenarios(reading: RahmanReading, extra: Partial<RahmanOptions> = {}) {
  const o = (config: RahmanOptions['config']): RahmanOptions => ({ reading, config, ...extra });
  return {
    S1: run(o('base'), { horizon: 480 }),
    S2: run(o('base'), { target: RAHMAN_TARGET }),
    'S3@480': run(o('shared34'), { horizon: 480 }),
    'S3@910': run(o('shared34'), { horizon: 910 }),
    S4: run(o('shared34'), { target: RAHMAN_TARGET }),
    S5: run(o('shared5'), { target: RAHMAN_TARGET }),
  };
}

/**
 * Means over 200 runs from `scripts/replication/rahman2023_reference.py`
 * (`rahman2023_reference.json`). `value` is finished pieces for the fixed-
 * length rows and minutes for the run-to-1600 rows.
 */
const REFERENCE: Record<RahmanReading, Record<string, number>> = {
  A: { S1: 907.6, S2: 842.0, 'S3@480': 694.5, 'S3@910': 1324.1, S4: 1079.3, S5: 906.4 },
  B: { S1: 87.0, S2: 1857.4, 'S3@480': 86.7, 'S3@910': 588.2, S4: 1858.6, S5: 2199.9 },
};
const TIMED = new Set(['S2', 'S4', 'S5']);

const results = { A: scenarios('A'), B: scenarios('B') };

describe('Rahman 2023 — the model is the one in Figure 2', () => {
  const { twin, parts } = buildRahmanScenario({ reading: 'A', config: 'base' });
  const kinds = twin.workstations.map((w) => getBlockKind(w));
  const count = (k: string) => kinds.filter((x) => x === k).length;

  it('has three sources, two joins, thirteen operations and one output', () => {
    expect(count('Source')).toBe(3);
    expect(count('Assembler')).toBe(2);
    expect(count('Service')).toBe(13);
    expect(count('Sink')).toBe(1);
  });

  it('feeds each join from the garment stream and from its own label source', () => {
    for (const ws of twin.workstations.filter((w) => getBlockKind(w) === 'Assembler')) {
      const incoming = twin.connectors.filter((c) => c.toWsId === ws.id);
      expect(incoming.map((c) => c.toPort).sort()).toEqual(['parts1', 'parts2']);
      const label = incoming.find((c) => c.toPort === 'parts2')!;
      const from = twin.workstations.find((w) => w.id === label.fromWsId)!;
      expect(getBlockKind(from)).toBe('Source');
    }
  });

  it('runs the stations in Figure 2 order', () => {
    // Walk the connectors from the body source, collecting the operations.
    const next = new Map(twin.connectors.map((c) => [c.fromWsId, c.toWsId]));
    const body = twin.workstations.find((w) => w.name.startsWith('Input'))!;
    const seen: string[] = [];
    for (let id: string | undefined = body.id; id; id = next.get(id)) {
      const ws = twin.workstations.find((w) => w.id === id)!;
      if (getBlockKind(ws) === 'Service') seen.push(ws.id);
    }
    expect(seen).toEqual(RAHMAN_STATIONS.map((s) => parts.wsIdByKey[s.key]));
  });

  it('carries a bulletin that totals the paper\'s SMV', () => {
    expect(rahmanGarment().totalSmv).toBeCloseTo(RAHMAN_SMV, 9);
  });

  it('seats the crews the paper counts', () => {
    for (const reading of ['A', 'B'] as const) {
      expect(rahmanCrew({ reading, config: 'base' })).toHaveLength(11);
      expect(rahmanCrew({ reading, config: 'shared34' })).toHaveLength(10);
      expect(rahmanCrew({ reading, config: 'shared5' })).toHaveLength(10);
    }
  });

  it('builds the whole study as one three-line factory', () => {
    const { twin: factory } = buildRahmanFactory('A');
    expect(factory.lines).toHaveLength(3);
    expect(new Set(factory.workstations.map((w) => w.lineId)).size).toBe(3);
  });
});

describe('Rahman 2023 — engine vs closed form', () => {
  it('finishes exactly the garments it was asked for, each counted once', () => {
    // 1600 garments each took a body and two labels. Counted as parts that
    // would be 4800.
    expect(results.A.S2.output).toBe(RAHMAN_TARGET);
    expect(results.A.S1.output).toBeLessThan(RAHMAN_LOT);
  });

  it('is paced by its slowest station', () => {
    const neckTape = RAHMAN_STATIONS.find((s) => s.key === 'neckTape')!;
    const [min, mode, max] = neckTape.rate;
    const slowest = meanOf({ kind: 'triangularRate', min, mode, max });
    expect(slowest).toBeCloseTo(0.5232, 4);
    // A shift cannot beat the bottleneck, and start-up plus the work still in
    // the line at the bell cost it about ten pieces.
    expect(results.A.S1.output).toBeLessThan(480 / slowest);
    expect(results.A.S1.output).toBeGreaterThan(480 / slowest - 20);
    // 1600 pieces need at least 1600 bottleneck cycles.
    expect(results.A.S2.minutes).toBeGreaterThan(RAHMAN_TARGET * slowest);
    expect(results.A.S2.minutes).toBeLessThan(RAHMAN_TARGET * slowest + 12);
  });
});

describe('Rahman 2023 — engine vs independent reference', () => {
  for (const reading of ['A', 'B'] as const) {
    for (const [name, expected] of Object.entries(REFERENCE[reading])) {
      it(`reading ${reading} · ${name} agrees with the reference`, () => {
        const row = results[reading][name as keyof (typeof results)['A']];
        const actual = TIMED.has(name) ? row.minutes : row.output;
        // 1 % of the value, or three pieces for the rows that make under 300.
        const tolerance = Math.max(3, expected * 0.01);
        expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
      });
    }
  }
});

describe('Rahman 2023 — engine vs the paper', () => {
  // Reading A reproduces the three scenarios the paper reports consistently.
  it('Scenario 1: output of an 8-hour shift within 2 %', () => {
    expect(results.A.S1.operators).toBe(RAHMAN_TABLE_2.S1.operators);
    expect(results.A.S1.output / RAHMAN_TABLE_2.S1.output).toBeGreaterThan(0.98);
    expect(results.A.S1.output / RAHMAN_TABLE_2.S1.output).toBeLessThan(1.02);
  });

  it('Scenario 2: operating minutes for 1600 pieces within 2 %', () => {
    const ratio = results.A.S2.operatingMinutes / RAHMAN_TABLE_2.S2.operatingMinutes;
    expect(ratio).toBeGreaterThan(0.98);
    expect(ratio).toBeLessThan(1.02);
  });

  it('Scenario 5: operating minutes for 1600 pieces within 2 %', () => {
    expect(results.A.S5.operators).toBe(RAHMAN_TABLE_2.S5.operators);
    const ratio = results.A.S5.operatingMinutes / RAHMAN_TABLE_2.S5.operatingMinutes;
    expect(ratio).toBeGreaterThan(0.98);
    expect(ratio).toBeLessThan(1.02);
  });

  it('Scenarios 1, 2 and 5: line efficiency within 2 points', () => {
    // The model runs about 1.5 % behind the paper on Scenarios 1 and 2: the
    // paper's 919 pieces is two more than the bottleneck can average over 480
    // minutes with no start-up at all, so its line was either pre-loaded or a
    // lucky draw. The gap is the paper's, not a tolerance to tune away.
    expect(Math.abs(results.A.S1.efficiencyPct - RAHMAN_TABLE_2.S1.efficiencyPct)).toBeLessThan(2);
    expect(Math.abs(results.A.S2.efficiencyPct - RAHMAN_TABLE_2.S2.efficiencyPct)).toBeLessThan(2);
    expect(Math.abs(results.A.S5.efficiencyPct - RAHMAN_TABLE_2.S5.efficiencyPct)).toBeLessThan(2);
  });

  it('Scenarios 3 and 4: agrees on the direction, not the size', () => {
    // The paper's own figures for this set-up do not agree with each other:
    // 1031 pieces in 910 operator-minutes each is 0.88 min a piece, 1600 in
    // 1310 is 0.82, and its utilisation chart implies 0.61. No single model
    // can match all three, so only the qualitative finding is asserted:
    // taking the tenth operator off this way costs output and efficiency.
    expect(results.A['S3@480'].output).toBeLessThan(results.A.S1.output);
    expect(results.A.S4.minutes).toBeGreaterThan(results.A.S2.minutes);
    expect(results.A.S4.efficiencyPct).toBeLessThan(results.A.S2.efficiencyPct);
    // …and that Scenario 5's pairing is the better way to run ten operators.
    expect(results.A.S5.minutes).toBeLessThan(results.A.S4.minutes);
    expect(results.A.S5.efficiencyPct).toBeGreaterThan(results.A.S4.efficiencyPct);
  });

  it('reading B cannot reach the paper\'s output', () => {
    // One operator on Shoulder joint + Neck joint needs 0.65 min a garment
    // between them, so the line is capped near 737 pieces a shift before
    // anything else is considered — against 919 published.
    expect(results.B.S1.output).toBeLessThan(0.85 * RAHMAN_TABLE_2.S1.output);
  });
});

describe('Rahman 2023 — report', () => {
  it('writes the table when asked', () => {
    if (!env.RAHMAN_REPORT) return;
    const sensitivity = {
      'A · pair with Neck tape joint': scenarios('A', { pairing: 'joint' }),
      'A · longest wait first': scenarios('A', { priority: 'equal' }),
      'A · soap tack (2, 2.5, 3)': scenarios('A', { soapTack: 'symmetric' }),
      'A · soap tack (3, 5, 6)': scenarios('A', { soapTack: 'byCapacity' }),
    };
    writeFileSync(
      env.RAHMAN_REPORT,
      JSON.stringify({ seeds: SEEDS.length, results, sensitivity, reference: REFERENCE, paper: RAHMAN_TABLE_2 }, null, 1),
    );
  });
});
