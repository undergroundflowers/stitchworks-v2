/**
 * Closed-form queueing-theory analytics for sewing-line workstations.
 *
 * The sewing line is modelled as an open **tandem queueing network**: bundles
 * arrive at the first station from cutting, then flow station-by-station
 * through the bulletin. Each workstation has a fixed number of operators
 * (servers), an optional buffer cap (cart / hanger / conveyor space), and a
 * service-time distribution.
 *
 * By Burke's theorem, an M/M/c station with ρ < 1 has a Poisson departure
 * process at the same rate, so the network decomposes into per-station
 * analyses for the all-exponential case. For non-exponential service (M/D/1,
 * M/G/1, M/Ek/1) Burke does not strictly hold, but observed-λ + closed-form
 * per-station KPIs remain a useful approximation against which to validate
 * the simulator's output.
 *
 * Formulas transcribed from Naidu's Operations Research, Unit 5 (the PDF the
 * user attached). Page references appear next to each model.
 */

import {
  cvOf,
  kendallServiceCode,
  meanOf,
  type ServiceCode,
  type ServiceDist,
} from './distributions';

export type QueueDiscipline = 'FCFS' | 'SIRO' | 'Priority';

export interface KendallNotation {
  /** Arrival process — always Poisson (M) for now; sewing-line arrivals
   *  from the cutting dept are modelled as a Poisson stream of bundles. */
  arrival: 'M';
  service: ServiceCode;
  /** c — number of parallel servers (operators) at this workstation. */
  servers: number;
  /** N — system capacity. `Infinity` means unbounded queue. */
  capacity: number;
  discipline: QueueDiscipline;
  /** Pretty label, e.g. "M/M/3 : ∞/FCFS" or "M/D/1 : 8/FCFS". */
  label: string;
}

export interface AnalyticalKpis {
  /** Traffic intensity. For c servers: ρ = λ/(cμ). */
  rho: number;
  /** Probability of zero units in the system. */
  P0: number;
  /** Probability of exactly n units in the system. */
  Pn: (n: number) => number;
  /** Expected queue length (excluding those in service). */
  Lq: number;
  /** Expected wait time in queue (same time-unit as 1/μ). */
  Wq: number;
  /** Expected units in system (queue + in service). */
  L: number;
  /** Expected time in system (queue wait + service). */
  W: number;
  /** Expected non-empty queue size (single-server only); NaN otherwise. */
  D: number;
  /** ρ < 1 for infinite-queue models; always true for finite-capacity. */
  isStable: boolean;
  /** Probability that an arrival waits > w time units in the queue. M/M/1 only. */
  pWaitGreaterThan: (w: number) => number;
  /** Effective arrival rate after balking (= λ for infinite-queue models). */
  lambdaEff: number;
  /** Optional caveat for the UI (e.g. "approximation — not Burke-exact"). */
  note?: string;
}

/** Build a Kendall–Lee notation object from station configuration. */
export function classify(
  serviceDist: ServiceDist,
  servers: number,
  capacity: number,
  discipline: QueueDiscipline = 'FCFS',
): KendallNotation {
  const service = kendallServiceCode(serviceDist);
  const c = Math.max(1, Math.floor(servers));
  const cap = Number.isFinite(capacity) ? Math.max(c, Math.floor(capacity)) : Infinity;
  return {
    arrival: 'M',
    service,
    servers: c,
    capacity: cap,
    discipline,
    label: formatLabel('M', service, c, cap, discipline),
  };
}

function formatLabel(
  a: 'M',
  b: ServiceCode,
  c: number,
  cap: number,
  disc: QueueDiscipline,
): string {
  const capStr = Number.isFinite(cap) ? String(cap) : '∞';
  return `${a}/${b}/${c} : ${capStr}/${disc}`;
}

/**
 * Compute the full set of analytical KPIs for the classified station.
 * `lambda` is the *observed* arrival rate (bundles per hour) and is taken
 * from the sim's per-station arrival counter — that way the analytical
 * layer is fed real data, not the user-input value, which makes the
 * tandem-network case work correctly.
 */
export function analyticalKpis(
  notation: KendallNotation,
  lambda: number,
  serviceDist: ServiceDist,
): AnalyticalKpis {
  const meanSvc = meanOf(serviceDist);
  const mu = meanSvc > 0 ? 60 / meanSvc : 0; // per-hour
  const c = notation.servers;
  const cap = notation.capacity;

  // Guard against degenerate inputs.
  if (mu <= 0 || lambda < 0) {
    return zeroKpis(0);
  }

  // Branch on (service-code, server count, capacity).
  if (Number.isFinite(cap) && cap < Infinity) {
    if (c === 1) return mm1n(lambda, mu, cap);
    return mmcN(lambda, mu, c, cap);
  }

  // Infinite-queue branch.
  if (c === 1) {
    switch (notation.service) {
      case 'M':  return mm1(lambda, mu);
      case 'D':  return md1(lambda, mu);
      case 'Ek': return mEk1(lambda, mu, erlangShape(serviceDist));
      case 'G':  return mg1(lambda, mu, cvOf(serviceDist));
    }
  }
  // Multi-server, infinite queue. We have closed-forms for M/M/c only;
  // for M/D/c, M/Ek/c, M/G/c we fall back to an M/G/c approximation.
  if (notation.service === 'M') return mmc(lambda, mu, c);
  return mgcApprox(lambda, mu, c, cvOf(serviceDist));
}

function zeroKpis(rho: number): AnalyticalKpis {
  return {
    rho,
    P0: 1,
    Pn: () => 0,
    Lq: 0,
    Wq: 0,
    L: 0,
    W: 0,
    D: NaN,
    isStable: false,
    pWaitGreaterThan: () => 0,
    lambdaEff: 0,
  };
}

function erlangShape(d: ServiceDist): number {
  return d.kind === 'erlang' ? Math.max(1, Math.floor(d.k)) : 1;
}

// ── Model I — M/M/1 : ∞ / FCFS (Naidu page 4–6) ───────────────────────────
function mm1(lambda: number, mu: number): AnalyticalKpis {
  const rho = lambda / mu;
  const stable = rho < 1;
  if (!stable) {
    // System explodes; surface infinities so the UI flags it.
    return {
      rho,
      P0: 0,
      Pn: () => 0,
      Lq: Infinity,
      Wq: Infinity,
      L: Infinity,
      W: Infinity,
      D: Infinity,
      isStable: false,
      pWaitGreaterThan: () => 1,
      lambdaEff: lambda,
      note: 'Unstable: ρ ≥ 1 means the queue grows without bound.',
    };
  }
  const P0 = 1 - rho;
  const Lq = (lambda * lambda) / (mu * (mu - lambda));
  const Wq = Lq / lambda;
  const L = Lq + rho;
  const W = Wq + 1 / mu;
  return {
    rho,
    P0,
    Pn: (n) => (n < 0 ? 0 : P0 * Math.pow(rho, n)),
    Lq,
    Wq,
    L,
    W,
    D: mu / (mu - lambda),
    isStable: true,
    pWaitGreaterThan: (w) => rho * Math.exp((lambda - mu) * w),
    lambdaEff: lambda,
  };
}

// ── Model II — M/M/1/N (Naidu page 4, finite-capacity) ────────────────────
function mm1n(lambda: number, mu: number, N: number): AnalyticalKpis {
  const rho = lambda / mu;
  let P0: number;
  let PN: number;
  const Pn = (n: number): number => {
    if (n < 0 || n > N) return 0;
    if (rho === 1) return 1 / (N + 1);
    return ((1 - rho) * Math.pow(rho, n)) / (1 - Math.pow(rho, N + 1));
  };
  if (rho === 1) {
    P0 = 1 / (N + 1);
    PN = 1 / (N + 1);
  } else {
    P0 = (1 - rho) / (1 - Math.pow(rho, N + 1));
    PN = P0 * Math.pow(rho, N);
  }
  const lambdaEff = lambda * (1 - PN);
  let L: number;
  if (rho === 1) {
    L = N / 2;
  } else {
    const num = rho * (1 - (N + 1) * Math.pow(rho, N) + N * Math.pow(rho, N + 1));
    const den = (1 - rho) * (1 - Math.pow(rho, N + 1));
    L = num / den;
  }
  const Lq = L - (1 - P0);
  const Wq = lambdaEff > 0 ? Lq / lambdaEff : 0;
  const W = lambdaEff > 0 ? L / lambdaEff : 0;
  return {
    rho,
    P0,
    Pn,
    Lq,
    Wq,
    L,
    W,
    D: rho < 1 ? mu / (mu - lambda) : Infinity,
    isStable: true,
    pWaitGreaterThan: () => NaN,
    lambdaEff,
    note: `Finite buffer N=${N}. Balking probability = ${(PN * 100).toFixed(2)}%.`,
  };
}

// ── Model IV — M/D/1 : ∞ / FCFS (Pollaczek-Khinchine, Cs=0) ───────────────
function md1(lambda: number, mu: number): AnalyticalKpis {
  const rho = lambda / mu;
  if (rho >= 1) return unstableSingle(rho, lambda);
  const Lq = (rho * rho) / (2 * (1 - rho));
  return finalizeSingle(rho, lambda, mu, Lq, {
    note: 'M/D/1 — deterministic service. Lq is exactly half of the M/M/1 value at the same ρ.',
  });
}

// ── Model V — M/G/1 : ∞ / FCFS (Pollaczek-Khinchine, general Cs) ──────────
function mg1(lambda: number, mu: number, cs: number): AnalyticalKpis {
  const rho = lambda / mu;
  if (rho >= 1) return unstableSingle(rho, lambda);
  const Lq = (rho * rho * (1 + cs * cs)) / (2 * (1 - rho));
  return finalizeSingle(rho, lambda, mu, Lq, {
    note: `M/G/1 — general service with Cs=${cs.toFixed(2)}. Uses the Pollaczek-Khinchine formula.`,
  });
}

// ── Model VI — M/Ek/1 : ∞ / FCFS (Erlang-k service) ───────────────────────
function mEk1(lambda: number, mu: number, k: number): AnalyticalKpis {
  const rho = lambda / mu;
  if (rho >= 1) return unstableSingle(rho, lambda);
  // Erlang-k has Cs² = 1/k. P-K reduces to:
  const Lq = (rho * rho * (1 + 1 / k)) / (2 * (1 - rho));
  return finalizeSingle(rho, lambda, mu, Lq, {
    note: `M/E_${k}/1 — Erlang-${k} service. As k → ∞, behaviour approaches M/D/1.`,
  });
}

// ── Model VII — M/M/c : ∞ / FCFS (Erlang-C / multi-server) ────────────────
function mmc(lambda: number, mu: number, c: number): AnalyticalKpis {
  const a = lambda / mu; // offered load (in Erlangs)
  const rho = a / c;
  if (rho >= 1) return unstableMulti(rho, lambda, c);

  // P0 = 1 / [Σ_{n=0..c-1} a^n/n!   +   a^c/c! · 1/(1-ρ)]
  let sumLow = 0;
  for (let n = 0; n < c; n++) sumLow += Math.pow(a, n) / factorial(n);
  const tailTerm = (Math.pow(a, c) / factorial(c)) * (1 / (1 - rho));
  const P0 = 1 / (sumLow + tailTerm);

  // Lq = (P0 · a^c · ρ) / (c! · (1-ρ)²)
  const Lq = (P0 * Math.pow(a, c) * rho) / (factorial(c) * Math.pow(1 - rho, 2));
  const L = Lq + a;
  const Wq = Lq / lambda;
  const W = Wq + 1 / mu;

  const Pn = (n: number): number => {
    if (n < 0) return 0;
    if (n <= c) return (P0 * Math.pow(a, n)) / factorial(n);
    return (P0 * Math.pow(a, c) / factorial(c)) * Math.pow(rho, n - c);
  };

  return {
    rho,
    P0,
    Pn,
    Lq,
    Wq,
    L,
    W,
    D: NaN,
    isStable: true,
    pWaitGreaterThan: () => NaN,
    lambdaEff: lambda,
    note: `M/M/${c} — ${c} parallel servers. ρ = λ/(cμ) = ${rho.toFixed(2)}.`,
  };
}

// ── Model VIII — M/M/c/N : finite-capacity multi-server ───────────────────
function mmcN(lambda: number, mu: number, c: number, N: number): AnalyticalKpis {
  const a = lambda / mu;
  const rho = a / c;

  // P0 normalization: Σ_{n=0..c-1} a^n/n!   +   (a^c/c!) · Σ_{n=c..N} ρ^(n-c)
  let sumLow = 0;
  for (let n = 0; n < c; n++) sumLow += Math.pow(a, n) / factorial(n);
  let tailSum: number;
  if (Math.abs(rho - 1) < 1e-9) {
    tailSum = N - c + 1;
  } else {
    tailSum = (1 - Math.pow(rho, N - c + 1)) / (1 - rho);
  }
  const tailTerm = (Math.pow(a, c) / factorial(c)) * tailSum;
  const P0 = 1 / (sumLow + tailTerm);

  const Pn = (n: number): number => {
    if (n < 0 || n > N) return 0;
    if (n <= c) return (P0 * Math.pow(a, n)) / factorial(n);
    return (P0 * Math.pow(a, c) / factorial(c)) * Math.pow(rho, n - c);
  };

  // Lq = Σ_{n=c+1..N} (n-c)·Pn
  let Lq = 0;
  for (let n = c + 1; n <= N; n++) Lq += (n - c) * Pn(n);

  // Expected idle servers = Σ_{n=0..c-1} (c-n)·Pn  → busy = c - idle  → L = Lq + busy
  let idle = 0;
  for (let n = 0; n < c; n++) idle += (c - n) * Pn(n);
  const busy = c - idle;
  const L = Lq + busy;

  const PN = Pn(N);
  const lambdaEff = lambda * (1 - PN);
  const Wq = lambdaEff > 0 ? Lq / lambdaEff : 0;
  const W = lambdaEff > 0 ? L / lambdaEff : 0;

  return {
    rho,
    P0,
    Pn,
    Lq,
    Wq,
    L,
    W,
    D: NaN,
    isStable: true,
    pWaitGreaterThan: () => NaN,
    lambdaEff,
    note: `M/M/${c}/${N} — finite buffer. Balking probability = ${(PN * 100).toFixed(2)}%.`,
  };
}

// ── M/G/c approximation (no closed form in Naidu) ─────────────────────────
function mgcApprox(lambda: number, mu: number, c: number, cs: number): AnalyticalKpis {
  // Allen-Cunneen approximation: Lq(M/G/c) ≈ Lq(M/M/c) · (1 + Cs²)/2
  const mm = mmc(lambda, mu, c);
  if (!mm.isStable) return mm;
  const factor = (1 + cs * cs) / 2;
  const Lq = mm.Lq * factor;
  const L = Lq + lambda / mu;
  const Wq = Lq / lambda;
  const W = Wq + 1 / mu;
  return {
    ...mm,
    Lq,
    L,
    Wq,
    W,
    note: `M/G/${c} — approximation (Allen–Cunneen). Cs=${cs.toFixed(2)}. Sim is the authoritative value.`,
  };
}

// ── Helpers shared by single-server M/G/1-family models ───────────────────
function finalizeSingle(
  rho: number,
  lambda: number,
  mu: number,
  Lq: number,
  extras: { note?: string } = {},
): AnalyticalKpis {
  const Wq = Lq / lambda;
  const L = Lq + rho;
  const W = Wq + 1 / mu;
  return {
    rho,
    P0: 1 - rho,
    Pn: () => NaN, // closed-form Pₙ depends on the service distribution — not generic for M/G/1
    Lq,
    Wq,
    L,
    W,
    D: mu / (mu - lambda),
    isStable: true,
    pWaitGreaterThan: () => NaN,
    lambdaEff: lambda,
    note: extras.note,
  };
}

function unstableSingle(rho: number, lambda: number): AnalyticalKpis {
  return {
    rho,
    P0: 0,
    Pn: () => 0,
    Lq: Infinity,
    Wq: Infinity,
    L: Infinity,
    W: Infinity,
    D: Infinity,
    isStable: false,
    pWaitGreaterThan: () => 1,
    lambdaEff: lambda,
    note: 'Unstable: ρ ≥ 1 in an infinite-buffer model means the queue grows without bound.',
  };
}

function unstableMulti(rho: number, lambda: number, c: number): AnalyticalKpis {
  return {
    rho,
    P0: 0,
    Pn: () => 0,
    Lq: Infinity,
    Wq: Infinity,
    L: Infinity,
    W: Infinity,
    D: NaN,
    isStable: false,
    pWaitGreaterThan: () => 1,
    lambdaEff: lambda,
    note: `Unstable: ρ = λ/(${c}μ) ≥ 1. Add more servers or reduce arrival rate.`,
  };
}

// ── Factorial for the multi-server formulas. c is small (rarely > 20), so
// caching a small lookup table is enough; no need for Stirling. ───────────
const FACT_CACHE: number[] = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];
function factorial(n: number): number {
  if (n < 0) return NaN;
  if (n < FACT_CACHE.length) return FACT_CACHE[n];
  let v = FACT_CACHE[FACT_CACHE.length - 1];
  for (let i = FACT_CACHE.length; i <= n; i++) {
    v *= i;
    FACT_CACHE[i] = v;
  }
  return v;
}
