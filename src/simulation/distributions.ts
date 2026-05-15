/**
 * Service-time distribution family for the queueing-theory layer.
 *
 * Each distribution corresponds to a service code in Kendall–Lee notation:
 *   - exp     → M (exponential)        — memoryless, classical M/M/1 service
 *   - det     → D (deterministic)      — constant service time, M/D/1
 *   - erlang  → E_k (Erlang-k)         — sum of k exponentials, M/E_k/1
 *   - uniform → G (general)            — bounded uniform around the mean
 *   - normal  → G (general)            — Gaussian, truncated at 0
 *
 * Sampling is driven by an external RNG (mulberry32 from priority-queue.ts)
 * so runs stay reproducible per seed.
 */

export type ServiceDist =
  | { kind: 'exp'; mean: number }
  | { kind: 'det'; value: number }
  | { kind: 'uniform'; mean: number; variance: number }
  | { kind: 'erlang'; k: number; mean: number }
  | { kind: 'normal'; mean: number; std: number };

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
  }
}

/** Analytical mean of the distribution (E[S]). */
export function meanOf(d: ServiceDist): number {
  switch (d.kind) {
    case 'exp': return d.mean;
    case 'det': return d.value;
    case 'uniform': return d.mean;
    case 'erlang': return d.mean;
    case 'normal': return d.mean;
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
  }
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
      return 'G';
  }
}

/** Human-friendly distribution label for UI labels and tooltips. */
export function describeDist(d: ServiceDist): string {
  switch (d.kind) {
    case 'exp': return `Exponential (μ⁻¹=${d.mean.toFixed(2)} min)`;
    case 'det': return `Deterministic (${d.value.toFixed(2)} min)`;
    case 'uniform': return `Uniform (${d.mean.toFixed(2)} ± ${(d.variance * 100).toFixed(0)}%)`;
    case 'erlang': return `Erlang-${Math.max(1, Math.floor(d.k))} (mean ${d.mean.toFixed(2)} min)`;
    case 'normal': return `Normal (μ=${d.mean.toFixed(2)}, σ=${d.std.toFixed(2)})`;
  }
}

/** Default distribution used when an operation has no explicit override.
 *  Preserves the pre-queueing-theory engine behaviour (uniform ±15 %). */
export function defaultDist(smv: number): ServiceDist {
  return { kind: 'uniform', mean: Math.max(0.001, smv), variance: 0.15 };
}

/** Scale a distribution's mean by a multiplier (used for efficiency, where
 *  effective service time = base / efficiency). Returns a new distribution. */
export function scaleDist(d: ServiceDist, factor: number): ServiceDist {
  const f = factor > 0 ? factor : 1;
  switch (d.kind) {
    case 'exp':     return { kind: 'exp', mean: d.mean * f };
    case 'det':     return { kind: 'det', value: d.value * f };
    case 'uniform': return { kind: 'uniform', mean: d.mean * f, variance: d.variance };
    case 'erlang':  return { kind: 'erlang', k: d.k, mean: d.mean * f };
    case 'normal':  return { kind: 'normal', mean: d.mean * f, std: d.std * f };
  }
}
