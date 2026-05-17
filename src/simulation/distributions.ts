/**
 * Service-time distribution family for the queueing-theory layer.
 *
 * Each distribution corresponds to a service code in Kendall–Lee notation:
 *   - exp         → M  (exponential)       — memoryless, classical M/M/1 service
 *   - det         → D  (deterministic)     — constant service time, M/D/1
 *   - erlang      → Ek (Erlang-k)          — sum of k exponentials, M/E_k/1
 *   - uniform     → G  (general)           — bounded uniform around the mean
 *   - normal      → G  (general)           — Gaussian, truncated at 0
 *   - triangular  → G  (general)           — min / mode / max — StatFit's TRIA
 *   - lognormal   → G  (general)           — Gaussian on log-scale — StatFit's LOGN
 *   - weibull     → G  (general)           — reliability / lead-time tails — WEIB
 *   - beta        → G  (general)           — bounded on [shift, shift+scale] — BETA
 *
 * `shift` (optional, default 0) is the additive offset that appears in the
 * stochastic-ALB literature as "k + DIST(…)". It models a deterministic
 * floor (the operator can't go faster than k minutes) plus a random tail.
 * Adopted from Hossain & Muneer 2023 and Kursun 2009.
 *
 * Sampling is driven by an external RNG (mulberry32 from priority-queue.ts)
 * so runs stay reproducible per seed — exactly the AnyLogic "fixed seed"
 * mode (Big Book of Simulation Modelling Ch. 15.3).
 */

export type ServiceDist =
  | { kind: 'exp'; mean: number }
  | { kind: 'det'; value: number }
  | { kind: 'uniform'; mean: number; variance: number }
  | { kind: 'erlang'; k: number; mean: number }
  | { kind: 'normal'; mean: number; std: number }
  | { kind: 'triangular'; min: number; mode: number; max: number; shift?: number }
  | { kind: 'lognormal'; mu: number; sigma: number; shift?: number }
  | { kind: 'weibull'; scale: number; shape: number; shift?: number }
  | { kind: 'beta'; alpha: number; betaParam: number; min?: number; scale?: number; shift?: number };

/** Kendall service-time code derived from the distribution kind. */
export type ServiceCode = 'M' | 'D' | 'Ek' | 'G';

/**
 * Draw a single service-time sample. Always returns a value strictly > 0 so
 * the event loop never schedules a zero-duration `opEnd`.
 */
export function sample(d: ServiceDist, rng: () => number): number {
  const MIN = 0.001;
  switch (d.kind) {
    case 'exp': {
      const u = Math.max(1e-12, rng());
      return Math.max(MIN, -Math.log(u) * d.mean);
    }
    case 'det':
      return Math.max(MIN, d.value);
    case 'uniform': {
      // mean ± mean*variance, current engine behaviour.
      const v = d.variance;
      const factor = v > 0 ? 1 + (rng() * 2 - 1) * v : 1;
      return Math.max(MIN, d.mean * factor);
    }
    case 'erlang': {
      // Sum of k iid exponentials with mean d.mean/k → Erlang(k, k/d.mean).
      const k = Math.max(1, Math.floor(d.k));
      const phaseMean = d.mean / k;
      let sum = 0;
      for (let i = 0; i < k; i++) {
        const u = Math.max(1e-12, rng());
        sum += -Math.log(u) * phaseMean;
      }
      return Math.max(MIN, sum);
    }
    case 'normal': {
      // Box-Muller, truncated at MIN.
      const u1 = Math.max(1e-12, rng());
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.max(MIN, d.mean + d.std * z);
    }
    case 'triangular': {
      // Standard inverse-CDF for Triangular(min, mode, max). Matches AnyLogic's
      // triangular(min, mode, max). Used in 11 / 21 of the Hossain & Muneer
      // operations (StatFit fit).
      const shift = d.shift ?? 0;
      const a = d.min;
      const b = d.max;
      const c = d.mode;
      const u = rng();
      const fc = b > a ? (c - a) / (b - a) : 0.5;
      const x = u < fc
        ? a + Math.sqrt(u * (b - a) * (c - a))
        : b - Math.sqrt((1 - u) * (b - a) * (b - c));
      return Math.max(MIN, shift + x);
    }
    case 'lognormal': {
      // exp(Normal(mu, sigma)). `mu` and `sigma` are the underlying normal's
      // mean and stdev (NOT the lognormal's). Matches StatFit's LOGN(mean, stdev)
      // when converted: see parseSmvDist.
      const shift = d.shift ?? 0;
      const u1 = Math.max(1e-12, rng());
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.max(MIN, shift + Math.exp(d.mu + d.sigma * z));
    }
    case 'weibull': {
      // Inverse-CDF: scale · (-ln(1 - U))^(1/shape).
      const shift = d.shift ?? 0;
      const u = Math.max(1e-12, Math.min(1 - 1e-12, rng()));
      const x = d.scale * Math.pow(-Math.log(1 - u), 1 / Math.max(1e-9, d.shape));
      return Math.max(MIN, shift + x);
    }
    case 'beta': {
      // Beta sample via two Gammas: Beta(α, β) = X / (X + Y) where
      // X ~ Gamma(α), Y ~ Gamma(β). Marsaglia-Tsang for the gammas.
      const shift = d.shift ?? 0;
      const scale = d.scale ?? 1;
      const min = d.min ?? 0;
      const x = gammaSample(d.alpha, rng);
      const y = gammaSample(d.betaParam, rng);
      const sum = x + y;
      const b01 = sum > 0 ? x / sum : 0.5;
      return Math.max(MIN, shift + min + scale * b01);
    }
  }
}

/**
 * Marsaglia-Tsang sampler for Gamma(shape, 1) — used internally for Beta.
 * Handles shape ≥ 1 directly; for shape < 1 uses the Ahrens-Dieter boost
 * Gamma(α + 1) · U^(1/α).
 */
function gammaSample(shape: number, rng: () => number): number {
  const k = Math.max(1e-9, shape);
  if (k < 1) {
    return gammaSample(k + 1, rng) * Math.pow(Math.max(1e-12, rng()), 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let iter = 0; iter < 100; iter++) {
    let x: number;
    let v: number;
    do {
      const u1 = Math.max(1e-12, rng());
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d; // pathological — fall back to the mean
}

/** Analytical mean of the distribution (E[S]). */
export function meanOf(d: ServiceDist): number {
  switch (d.kind) {
    case 'exp': return d.mean;
    case 'det': return d.value;
    case 'uniform': return d.mean;
    case 'erlang': return d.mean;
    case 'normal': return d.mean;
    case 'triangular':
      return (d.shift ?? 0) + (d.min + d.mode + d.max) / 3;
    case 'lognormal':
      // E[shift + exp(N(mu, sigma²))] = shift + exp(mu + sigma²/2)
      return (d.shift ?? 0) + Math.exp(d.mu + (d.sigma * d.sigma) / 2);
    case 'weibull':
      // Mean = scale · Γ(1 + 1/shape). Lanczos-free approx good to 6 dp.
      return (d.shift ?? 0) + d.scale * gammaFn(1 + 1 / Math.max(1e-9, d.shape));
    case 'beta': {
      // E[Beta(α,β) on [min, min+scale]] = min + scale · α/(α+β), then + shift.
      const total = d.alpha + d.betaParam;
      const b01 = total > 0 ? d.alpha / total : 0.5;
      return (d.shift ?? 0) + (d.min ?? 0) + (d.scale ?? 1) * b01;
    }
  }
}

/** Analytical variance of the distribution (Var[S]). */
export function varOf(d: ServiceDist): number {
  switch (d.kind) {
    case 'exp':
      // Var = mean²
      return d.mean * d.mean;
    case 'det':
      return 0;
    case 'uniform': {
      // Uniform on [m(1-v), m(1+v)] → range = 2mv → Var = (2mv)²/12 = (mv)²/3
      const half = d.mean * d.variance;
      return (half * half) / 3;
    }
    case 'erlang':
      // Var = mean²/k (k-stage Erlang with mean d.mean)
      return (d.mean * d.mean) / Math.max(1, Math.floor(d.k));
    case 'normal':
      return d.std * d.std;
    case 'triangular': {
      const a = d.min;
      const b = d.max;
      const c = d.mode;
      return (a * a + b * b + c * c - a * b - a * c - b * c) / 18;
    }
    case 'lognormal': {
      // Var = (e^{σ²} - 1) · e^{2μ + σ²}. Shift cancels.
      const s2 = d.sigma * d.sigma;
      return (Math.exp(s2) - 1) * Math.exp(2 * d.mu + s2);
    }
    case 'weibull': {
      const k = Math.max(1e-9, d.shape);
      const g1 = gammaFn(1 + 1 / k);
      const g2 = gammaFn(1 + 2 / k);
      return d.scale * d.scale * (g2 - g1 * g1);
    }
    case 'beta': {
      const a = d.alpha;
      const b = d.betaParam;
      const total = a + b;
      const v01 = total > 0
        ? (a * b) / (total * total * (total + 1))
        : 0;
      const range = d.scale ?? 1;
      return range * range * v01;
    }
  }
}

/**
 * Lanczos approximation of the Gamma function. Accurate to ~15 dp for x > 0.
 * Used by `meanOf` / `varOf` to derive Weibull moments without a table.
 */
function gammaFn(x: number): number {
  if (x < 0.5) {
    return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  }
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const xx = x - 1;
  let a = p[0];
  for (let i = 1; i < g + 2; i++) a += p[i] / (xx + i);
  const t = xx + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, xx + 0.5) * Math.exp(-t) * a;
}

/** Coefficient of variation Cs = std/mean. Needed for the Pollaczek–Khinchine
 *  formula in M/G/1. */
export function cvOf(d: ServiceDist): number {
  const m = meanOf(d);
  if (m <= 0) return 0;
  return Math.sqrt(varOf(d)) / m;
}

/** Map a distribution kind onto its Kendall–Lee service-time symbol. */
export function kendallServiceCode(d: ServiceDist): ServiceCode {
  switch (d.kind) {
    case 'exp': return 'M';
    case 'det': return 'D';
    case 'erlang': return 'Ek';
    case 'uniform':
    case 'normal':
    case 'triangular':
    case 'lognormal':
    case 'weibull':
    case 'beta':
      return 'G';
  }
}

/** Human-friendly distribution label for UI labels and tooltips. */
export function describeDist(d: ServiceDist): string {
  const shift = (d as { shift?: number }).shift ?? 0;
  const prefix = shift > 0 ? `${shift.toFixed(2)} + ` : '';
  switch (d.kind) {
    case 'exp': return `Exponential (μ⁻¹=${d.mean.toFixed(2)} min)`;
    case 'det': return `Deterministic (${d.value.toFixed(2)} min)`;
    case 'uniform': return `Uniform (${d.mean.toFixed(2)} ± ${(d.variance * 100).toFixed(0)}%)`;
    case 'erlang': return `Erlang-${Math.max(1, Math.floor(d.k))} (mean ${d.mean.toFixed(2)} min)`;
    case 'normal': return `Normal (μ=${d.mean.toFixed(2)}, σ=${d.std.toFixed(2)})`;
    case 'triangular':
      return `${prefix}TRIA(${d.min.toFixed(2)}, ${d.mode.toFixed(2)}, ${d.max.toFixed(2)})`;
    case 'lognormal':
      return `${prefix}LOGN(μ=${d.mu.toFixed(3)}, σ=${d.sigma.toFixed(3)})`;
    case 'weibull':
      return `${prefix}WEIB(scale=${d.scale.toFixed(3)}, shape=${d.shape.toFixed(2)})`;
    case 'beta':
      return `${prefix}BETA(α=${d.alpha.toFixed(2)}, β=${d.betaParam.toFixed(2)})`;
  }
}

/** Default distribution used when an operation has no explicit override.
 *  Preserves the pre-queueing-theory engine behaviour (uniform ±15 %). */
export function defaultDist(smv: number): ServiceDist {
  return { kind: 'uniform', mean: Math.max(0.001, smv), variance: 0.15 };
}

/**
 * Parse a StatFit-style distribution string into a `ServiceDist`.
 *
 * The reference-models data carries the paper's fitted distribution per
 * operation as a plain string in `op.notes`, e.g.:
 *
 *   TRIA(0.28, 0.313, 0.46)
 *   NORM(0.545, 0.0527)
 *   0.5 + WEIB(0.158, 2.75)
 *   0.45 + 0.22·BETA(1.72, 2.04)
 *   0.53 + LOGN(0.115, 0.0675)
 *   0.29 + ERLA(0.0128, 4)
 *
 * Grammar (informal):
 *
 *   expr      := [shift '+'] [scale '·'|'*'] DIST '(' nums ')' [' · 'text]
 *   shift,    := number
 *   scale     := number
 *   DIST      := TRIA | NORM | LOGN | WEIB | BETA | ERLA | UNIF | EXPO
 *   nums      := number (',' number){0..}
 *
 * Anything that doesn't match returns `null` so the caller can fall back to
 * its preferred default. The parser is lenient about whitespace and the
 * decorative `·` separator that appears in some notes.
 */
export function parseStatfitDist(notes: string | undefined): ServiceDist | null {
  if (!notes) return null;
  // Strip everything after a trailing " · …" annotation so machine codes /
  // human notes don't trip the parser.
  const head = notes.split(/[·]/)[0].trim();
  // Patterns we accept. Each group is optional except DIST(args).
  // shift+? + scale·? + DIST(args)
  const re =
    /^\s*(?:([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\+\s*)?(?:([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[·*]\s*)?(TRIA|NORM|LOGN|WEIB|BETA|ERLA|UNIF|EXPO)\s*\(([^)]+)\)\s*$/i;
  const m = head.match(re);
  if (!m) return null;
  const shift = m[1] ? Number(m[1]) : 0;
  const scaleMul = m[2] ? Number(m[2]) : 1;
  const dist = m[3].toUpperCase();
  const args = m[4]
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));

  switch (dist) {
    case 'TRIA': {
      // StatFit: TRIA(min, mode, max). Paper notes follow that order.
      if (args.length < 3) return null;
      const [min, mode, max] = args;
      return {
        kind: 'triangular',
        min: min * scaleMul,
        mode: mode * scaleMul,
        max: max * scaleMul,
        shift,
      };
    }
    case 'NORM': {
      // StatFit: NORM(mean, stdev). No shift in the paper's NORM forms.
      if (args.length < 2) return null;
      const [mean, std] = args;
      return {
        kind: 'normal',
        mean: shift + mean * scaleMul,
        std: std * Math.abs(scaleMul),
      };
    }
    case 'LOGN': {
      // StatFit: LOGN(mean, stdev) — those are moments of the LOGNORMAL
      // itself, not of the underlying normal. Convert with method-of-moments:
      //   σ² = ln(1 + Var/Mean²)
      //   μ  = ln(Mean) - σ²/2
      if (args.length < 2) return null;
      const [m1, sd] = args;
      const mean = Math.max(1e-9, m1 * scaleMul);
      const sigma2 = Math.log(1 + (sd * sd * scaleMul * scaleMul) / (mean * mean));
      const mu = Math.log(mean) - sigma2 / 2;
      return {
        kind: 'lognormal',
        mu,
        sigma: Math.sqrt(sigma2),
        shift,
      };
    }
    case 'WEIB': {
      // StatFit: WEIB(scale, shape). Paper notes follow that order.
      if (args.length < 2) return null;
      const [scale, shape] = args;
      return {
        kind: 'weibull',
        scale: scale * scaleMul,
        shape,
        shift,
      };
    }
    case 'BETA': {
      // StatFit: BETA(α, β) on [0, 1]. When the form is "shift + s·BETA(...)",
      // the leading scale `s` becomes the range; otherwise the support is [0,1].
      if (args.length < 2) return null;
      const [alpha, betaP] = args;
      return {
        kind: 'beta',
        alpha,
        betaParam: betaP,
        min: 0,
        scale: m[2] ? scaleMul : 1,
        shift,
      };
    }
    case 'ERLA': {
      // StatFit: ERLA(beta, k) — mean = β · k.
      if (args.length < 2) return null;
      const [beta, k] = args;
      return {
        kind: 'erlang',
        k,
        mean: shift + beta * k * scaleMul,
      };
    }
    case 'UNIF': {
      // UNIF(min, max). Map to uniform(mean, variance).
      if (args.length < 2) return null;
      const [a, b] = args;
      const mean = ((a + b) / 2) * scaleMul + shift;
      const half = ((b - a) / 2) * Math.abs(scaleMul);
      const variance = mean > 0 ? half / mean : 0;
      return { kind: 'uniform', mean, variance };
    }
    case 'EXPO': {
      // EXPO(mean) — single-parameter exponential.
      if (args.length < 1) return null;
      return { kind: 'exp', mean: shift + args[0] * scaleMul };
    }
    default:
      return null;
  }
}

/**
 * Resolve a per-operation distribution from a free-text `notes` field and
 * a known mean SMV. Used by the reference-twin builder to attach the
 * paper's fitted distribution to each Service block.
 *
 * Priority:
 *   1. Successful StatFit parse → use the parsed distribution as-is.
 *   2. Notes empty or unparseable → return null so the caller can choose
 *      between "fall back to deterministic" and "synthesize a triangular
 *      with ±25 % spread".
 */
export function distFromOpNotes(notes: string | undefined): ServiceDist | null {
  return parseStatfitDist(notes);
}

/**
 * Synthesize a triangular distribution around a known mean SMV, for ops
 * whose paper doesn't publish a fit. AnyLogic Ch. 15.1 recommends
 * Triangular(min, mode, max) when sample data is limited — which is
 * exactly the case for most reference-paper bulletins.
 *
 * The spread defaults to ±25 % around the mean (matching AnyLogic's
 * default Service-block triangular(0.5, 1, 1.5) shape relative to the mode).
 */
export function syntheticTriangular(meanSmv: number, spreadPct = 0.25): ServiceDist {
  const m = Math.max(0.001, meanSmv);
  return {
    kind: 'triangular',
    min: m * (1 - spreadPct),
    mode: m,
    max: m * (1 + spreadPct),
    shift: 0,
  };
}

/** Scale a distribution's mean by a multiplier (used for efficiency, where
 *  effective service time = base / efficiency). Returns a new distribution.
 *  Both location and scale parameters are multiplied so the *whole* sample
 *  scales — preserves the CV and the shape of the distribution. */
export function scaleDist(d: ServiceDist, factor: number): ServiceDist {
  const f = factor > 0 ? factor : 1;
  switch (d.kind) {
    case 'exp':     return { kind: 'exp', mean: d.mean * f };
    case 'det':     return { kind: 'det', value: d.value * f };
    case 'uniform': return { kind: 'uniform', mean: d.mean * f, variance: d.variance };
    case 'erlang':  return { kind: 'erlang', k: d.k, mean: d.mean * f };
    case 'normal':  return { kind: 'normal', mean: d.mean * f, std: d.std * f };
    case 'triangular':
      return {
        kind: 'triangular',
        min: d.min * f,
        mode: d.mode * f,
        max: d.max * f,
        shift: (d.shift ?? 0) * f,
      };
    case 'lognormal':
      // exp(mu + log f) = f · exp(mu) — preserves sigma. Shift scales linearly.
      return {
        kind: 'lognormal',
        mu: d.mu + Math.log(f),
        sigma: d.sigma,
        shift: (d.shift ?? 0) * f,
      };
    case 'weibull':
      return {
        kind: 'weibull',
        scale: d.scale * f,
        shape: d.shape,
        shift: (d.shift ?? 0) * f,
      };
    case 'beta':
      return {
        kind: 'beta',
        alpha: d.alpha,
        betaParam: d.betaParam,
        min: (d.min ?? 0) * f,
        scale: (d.scale ?? 1) * f,
        shift: (d.shift ?? 0) * f,
      };
  }
}
