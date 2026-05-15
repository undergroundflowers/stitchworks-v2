/**
 * Self-check for the analytical queueing layer.
 *
 * Each case below is transcribed directly from Naidu's *Operations Research*
 * Unit 5 PDF (the textbook Mandeep shared). The expected values are the
 * answers Naidu publishes. We run our `analyticalKpis()` against the same
 * inputs and report whether each metric matches within tolerance.
 *
 * This stands in for a unit-test framework — the app doesn't ship vitest /
 * jest. Run from the browser console or from a future "Validate against
 * textbook" button in the Queue Analysis panel:
 *
 *   import { runNaiduSelfCheck } from './simulation/queueing.selfcheck';
 *   runNaiduSelfCheck();    // logs a pass/fail report and returns the object
 */

import { analyticalKpis, classify } from './queueing';
import type { ServiceDist } from './distributions';

interface ProblemCase {
  /** Naidu's problem number. */
  id: string;
  /** PDF page reference for citation in the research report. */
  page: number;
  description: string;
  lambda: number; // per hour
  mu: number;    // per hour — used to derive the service distribution
  servers: number;
  capacity: number;
  service: 'M' | 'D' | 'Ek';
  k?: number;     // Erlang shape, if service='Ek'
  expected: Partial<{
    rho: number;
    Lq: number;
    Wq: number;
    L: number;
    W: number;
    P0: number;
    D: number;
  }>;
}

const CASES: ProblemCase[] = [
  {
    id: 'P1',
    page: 7,
    description: 'Telephone booth — λ=7.5/hr, μ=15/hr (M/M/1)',
    lambda: 7.5,
    mu: 15,
    servers: 1,
    capacity: Infinity,
    service: 'M',
    expected: { rho: 0.5, Lq: 0.5, Wq: 0.0667, L: 1, W: 0.1333, D: 2 },
  },
  {
    id: 'P2',
    page: 11,
    description: 'Self-service store — λ=96/hr, μ=120/hr (M/M/1)',
    lambda: 96,
    mu: 120,
    servers: 1,
    capacity: Infinity,
    service: 'M',
    expected: { rho: 0.8, Lq: 3.2, Wq: 0.0333 },
  },
  {
    id: 'P3',
    page: 12,
    description: 'Box office — λ=30/hr, μ=40/hr (M/M/1)',
    lambda: 30,
    mu: 40,
    servers: 1,
    capacity: Infinity,
    service: 'M',
    expected: { rho: 0.75, Lq: 2.25, W: 0.1 },
  },
  {
    id: 'P5',
    page: 15,
    description: 'Bank window — λ=9/hr, μ=12/hr (M/M/1)',
    lambda: 9,
    mu: 12,
    servers: 1,
    capacity: Infinity,
    service: 'M',
    expected: { L: 3, Wq: 0.25 },
  },
  {
    id: 'P6',
    page: 17,
    description: 'Departmental secretary — λ=8/hr, μ=10/hr (M/M/1)',
    lambda: 8,
    mu: 10,
    servers: 1,
    capacity: Infinity,
    service: 'M',
    expected: { W: 0.5, L: 4 },
  },
  {
    id: 'P10',
    page: 21,
    description: 'Municipality hospital — λ=6/hr, μ=10/hr (M/M/1)',
    lambda: 6,
    mu: 10,
    servers: 1,
    capacity: Infinity,
    service: 'M',
    expected: { rho: 0.6, P0: 0.4, L: 1.5, W: 0.25 },
  },
  {
    id: 'P11',
    page: 23,
    description: 'Barber shop — λ=5/hr, μ=6/hr (M/M/1)',
    lambda: 5,
    mu: 6,
    servers: 1,
    capacity: Infinity,
    service: 'M',
    expected: { L: 5, Wq: 0.8333, P0: 0.1667 },
  },
  {
    id: 'P14',
    page: 27,
    description: 'Inspection station — λ=2/hr, μ=2.4/hr (M/M/1)',
    lambda: 2,
    mu: 2.4,
    servers: 1,
    capacity: Infinity,
    service: 'M',
    expected: { Lq: 4.1667, Wq: 2.0833, P0: 0.1667 },
  },
  {
    id: 'MS-P1',
    page: 34,
    description: 'Bank — c=3, λ=6/hr, μ=3.33/hr (M/M/3)',
    lambda: 6,
    mu: 3.33,
    servers: 3,
    capacity: Infinity,
    service: 'M',
    expected: { P0: 0.145, Lq: 0.532, L: 2.334 },
  },
  {
    id: 'MS-P5',
    page: 42,
    description: 'Tax counter — c=3, λ=6/hr, μ=4/hr (M/M/3)',
    lambda: 6,
    mu: 4,
    servers: 3,
    capacity: Infinity,
    service: 'M',
    expected: { P0: 0.210, L: 1.73, W: 0.289 },
  },
];

export interface CheckResult {
  id: string;
  page: number;
  description: string;
  metric: string;
  expected: number;
  actual: number;
  delta: number;
  pass: boolean;
}

export interface SelfCheckSummary {
  total: number;
  passed: number;
  failed: number;
  results: CheckResult[];
}

const TOLERANCE = 0.02; // 2% relative tolerance — Naidu rounds aggressively

function buildDist(c: ProblemCase): ServiceDist {
  // mean service time in minutes = 60/μ (μ is per hour)
  const meanMin = 60 / c.mu;
  switch (c.service) {
    case 'M':  return { kind: 'exp', mean: meanMin };
    case 'D':  return { kind: 'det', value: meanMin };
    case 'Ek': return { kind: 'erlang', k: c.k ?? 2, mean: meanMin };
  }
}

/** Run all Naidu cases. Logs each metric and returns the full summary. */
export function runNaiduSelfCheck(): SelfCheckSummary {
  const results: CheckResult[] = [];
  for (const c of CASES) {
    const dist = buildDist(c);
    const notation = classify(dist, c.servers, c.capacity);
    const kpi = analyticalKpis(notation, c.lambda, dist);
    const computed: Record<string, number> = {
      rho: kpi.rho,
      Lq: kpi.Lq,
      Wq: kpi.Wq,
      L: kpi.L,
      W: kpi.W,
      P0: kpi.P0,
      D: kpi.D,
    };
    for (const [metric, expected] of Object.entries(c.expected)) {
      const actual = computed[metric];
      const delta = actual - (expected as number);
      const rel = Math.abs(delta) / Math.max(1e-9, Math.abs(expected as number));
      const pass = rel <= TOLERANCE;
      results.push({
        id: c.id,
        page: c.page,
        description: c.description,
        metric,
        expected: expected as number,
        actual,
        delta,
        pass,
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const summary: SelfCheckSummary = {
    total: results.length,
    passed,
    failed,
    results,
  };

  // Console-friendly report.
  if (typeof console !== 'undefined') {
    /* eslint-disable no-console */
    console.groupCollapsed(
      `[Queueing self-check] ${passed}/${results.length} checks passed`,
    );
    for (const r of results) {
      const tag = r.pass ? '✓' : '✗';
      const line = `${tag} ${r.id} (p${r.page}) · ${r.metric}: expected ${r.expected.toFixed(4)}, got ${r.actual.toFixed(4)} (Δ ${r.delta.toFixed(4)})`;
      if (r.pass) console.log(line);
      else console.warn(line, `— ${r.description}`);
    }
    console.groupEnd();
    /* eslint-enable no-console */
  }
  return summary;
}
