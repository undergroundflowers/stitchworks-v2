/**
 * Reference Models — sewing-line case studies extracted from the literature.
 *
 * Each entry carries:
 *   • the published citation
 *   • a `GarmentTemplate` with the paper's operations + SMVs
 *   • baseline KPIs (what the paper reported BEFORE rebalancing)
 *   • proposed KPIs (what the paper achieved AFTER its method)
 *   • the method used (work-sharing, OptQuest, OSL variation, RPW, …)
 *   • the targets to reproduce when running the model inside Stitchworks
 *
 * The corresponding human-readable docs and raw JSON dumps live in
 * `Literature/Reference Models/<paper-slug>/`. Cross-reference by `slug`.
 *
 * Use these to verify Stitchworks: load a reference model, run the sim,
 * check that the reported KPIs land within ±5–10 % of the paper.
 */

import type { Operation } from './operations';
import type { GarmentTemplate, GarmentClass } from './garments';

// ============================================================================
// REFERENCE MODEL TYPE
// ============================================================================

export interface ReferenceKpis {
  operators: number;
  throughputPerDayPcs?: number;
  throughputPerShiftPcs?: number;
  lineEfficiencyPct?: number;
  /** Free-form notes the paper reported alongside the KPIs. */
  notes?: string;
}

/**
 * Multi-scenario papers (e.g. Kursun 2009 with three incremental what-if
 * scenarios) list every step here. The Reference Models page renders one
 * Validate button per scenario and surfaces the paper-reported throughput
 * alongside the Stitchworks-observed value.
 *
 * `reinforcedOpIndices` is 1-based to match the way papers list operation
 * numbers. The numbers are informational — the engine itself only needs
 * `operators` (total pool capacity for the scenario).
 */
export interface ReferenceScenario {
  /** Short id used in URLs / keys, e.g. 'S1', 'S2', 'S3'. */
  id: string;
  /** Display name shown in the Scenarios panel. */
  name: string;
  /** One-line description of what changed vs. baseline. */
  description: string;
  /** Total operator count under this scenario. */
  operators: number;
  /** Paper-reported throughput (pcs / 8h day). */
  throughputPerDayPcs: number;
  /** Uplift vs. baseline (paper-reported), as percent. */
  upliftPct: number;
  /** 1-based indices of ops that the paper duplicated for this scenario. */
  reinforcedOpIndices?: number[];
  /** Marks the paper's headline scenario — shown with brand accent. */
  isBest?: boolean;
}

export interface ReferenceModel {
  /** Stable slug used in URLs and to cross-link with the Literature folder. */
  slug: string;
  /** Display title. */
  title: string;
  /** Paper authors + year, e.g. "Hossain & Muneer 2023". */
  authorYear: string;
  /** Full citation (one line). */
  citation: string;
  /** What's being assembled. */
  garment: string;
  /** Where (factory / institution). */
  setting: string;
  /** What makes this case study interesting to reproduce. */
  pitch: string;
  /** Method used to find the proposed configuration. */
  method: string;
  /** Path to the model.md inside Literature/Reference Models/. */
  literaturePath: string;
  /** Number of operations in the paper's bulletin. */
  operationCount: number;
  /** Operation list as Stitchworks Operations (may be deterministic SMV
   *  derived from a stochastic distribution in the paper). */
  garmentTemplate: GarmentTemplate;
  baseline: ReferenceKpis;
  proposed?: ReferenceKpis;
  /** Optional — papers that report multiple incremental scenarios list them
   *  here. Each scenario adds operators at the running bottleneck. */
  scenarios?: ReferenceScenario[];
}

// ============================================================================
// HELPERS
// ============================================================================

const sumSmv = (ops: Operation[]) => ops.reduce((s, o) => s + o.smv, 0);

const mkTemplate = (
  id: string,
  name: string,
  klass: GarmentClass,
  description: string,
  ops: Operation[],
  bundle: number,
  bestFor: string,
): GarmentTemplate => {
  const total = sumSmv(ops);
  return {
    id,
    name,
    class: klass,
    description,
    operations: ops,
    defaultBundleSize: bundle,
    totalSmv: total,
    hourlyTarget100: total > 0 ? Math.round(60 / (total / ops.length)) : 0,
    bestFor,
  };
};

// ============================================================================
// 01 · HOSSAIN & MUNEER 2023 — KID'S PANT (Arunima Sportswear, Bangladesh)
// ============================================================================

const HOSSAIN_KIDS_PANT_OPS: Operation[] = [
  { id: 'kp-01', code: 'OP-01', name: '2N hem hip pocket',               smv: 0.351, machineCode: 'DNL',   skill: 'stitching',   category: 'sewing',   notes: 'TRIA(0.28, 0.313, 0.46) · 2N Fixed Bar' },
  { id: 'kp-02', code: 'OP-02', name: 'Hip pkt deco & lather join',      smv: 0.545, machineCode: 'SNL',   skill: 'stitching',   category: 'sewing',   notes: 'NORM(0.545, 0.0527)' },
  { id: 'kp-03', code: 'OP-03', name: 'Crease hip pocket',               smv: 0.640, machineCode: 'PRESS', skill: 'pressing',    category: 'pressing', notes: '0.5 + WEIB(0.158, 2.75)' },
  { id: 'kp-04', code: 'OP-04', name: 'Mark hip pocket position',        smv: 0.345, machineCode: 'MNL',   skill: 'bundling',    category: 'manual',   notes: 'NORM(0.345, 0.0302)' },
  { id: 'kp-05', code: 'OP-05', name: '2N set hip pocket',               smv: 0.560, machineCode: 'DNL',   skill: 'stitching',   category: 'sewing',   notes: '0.45 + 0.22·BETA(1.72, 2.04)' },
  { id: 'kp-06', code: 'OP-06', name: 'Mark front pocket & J stitch',    smv: 0.640, machineCode: 'MNL',   skill: 'bundling',    category: 'manual',   notes: 'TRIA(0.51, 0.6, 0.81)' },
  { id: 'kp-07', code: 'OP-07', name: '2N front pocket J-stitch deco',   smv: 0.845, machineCode: 'DNL',   skill: 'stitching',   category: 'sewing',   notes: 'NORM(0.845, 0.103)' },
  { id: 'kp-08', code: 'OP-08', name: 'Assembly part match body',        smv: 0.385, machineCode: 'MNL',   skill: 'bundling',    category: 'manual',   notes: '0.27 + 0.19·BETA(1.99, 3.2)' },
  { id: 'kp-09', code: 'OP-09', name: 'Safety stitch outseam',           smv: 0.505, machineCode: '5OL',   skill: 'overlock',    category: 'sewing',   notes: 'TRIA(0.4, 0.514, 0.6)' },
  { id: 'kp-10', code: 'OP-10', name: '2N top stitch outseam',           smv: 0.555, machineCode: 'FB',    skill: 'feed_of_arm', category: 'sewing',   notes: '0.43 + 0.22·BETA(1.66, 1.47)' },
  { id: 'kp-11', code: 'OP-11', name: 'Gusset mark',                     smv: 0.294, machineCode: 'MNL',   skill: 'bundling',    category: 'manual',   notes: 'NORM(0.294, 0.0222)' },
  { id: 'kp-12', code: 'OP-12', name: 'Gusset join',                     smv: 0.645, machineCode: '5OL',   skill: 'overlock',    category: 'sewing',   notes: '0.53 + LOGN(0.115, 0.0675)' },
  { id: 'kp-13', code: 'OP-13', name: 'Waistband elastic tack',          smv: 0.415, machineCode: 'SNL',   skill: 'stitching',   category: 'sewing',   notes: '0.31 + WEIB(0.105, 2.15)' },
  { id: 'kp-14', code: 'OP-14', name: 'Serge hem',                       smv: 0.341, machineCode: '4OL',   skill: 'overlock',    category: 'sewing',   notes: '0.29 + ERLA(0.0128, 4) · 3-thread O/L' },
  { id: 'kp-15', code: 'OP-15', name: 'Hem elastic tack',                smv: 0.440, machineCode: 'SNL',   skill: 'stitching',   category: 'sewing',   notes: '0.32 + 0.24·BETA(2.02, 3.57)' },
  { id: 'kp-16', code: 'OP-16', name: 'Hem elastic join',                smv: 0.554, machineCode: 'SNL',   skill: 'stitching',   category: 'sewing',   notes: '0.42 + LOGN(0.134, 0.0775)' },
  { id: 'kp-17', code: 'OP-17', name: 'Waistband elastic join',          smv: 0.592, machineCode: 'SNL',   skill: 'stitching',   category: 'sewing',   notes: '0.49 + LOGN(0.102, 0.0624)' },
  { id: 'kp-18', code: 'OP-18', name: 'Attach care label',               smv: 0.232, machineCode: 'SNL',   skill: 'stitching',   category: 'sewing',   notes: '0.18 + 0.13·BETA(2.1, 3.22)' },
  { id: 'kp-19', code: 'OP-19', name: 'Top stitch waistband',            smv: 0.416, machineCode: 'SNL',   skill: 'stitching',   category: 'sewing',   notes: '0.33 + WEIB(0.0968, 1.94) · Waistband M/C' },
  { id: 'kp-20', code: 'OP-20', name: 'Hem bottom',                      smv: 0.856, machineCode: 'SNL',   skill: 'stitching',   category: 'sewing',   notes: 'TRIA(0.68, 0.689, 1.2)' },
  { id: 'kp-21', code: 'OP-21', name: 'Tack front pocket, fly & crotch', smv: 0.374, machineCode: 'BT',    skill: 'bartack',     category: 'sewing',   notes: 'TRIA(0.31, 0.361, 0.45)' },
];

// ============================================================================
// 02 · ELNAGGAR 2019 — FORMAL SHIRT (KAU, Saudi Arabia)
// ============================================================================

// Times in the paper are PER BOX OF 20 SHIRTS; divided by 20 here for per-piece SMV.
const ELNAGGAR_FORMAL_SHIRT_OPS: Operation[] = [
  { id: 'fs-01', code: 'OP-01', name: 'Collar run stitch',           smv: 0.880, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-02', code: 'OP-02', name: 'Collar turn & iron',          smv: 0.340, machineCode: 'PRESS', skill: 'pressing',   category: 'pressing' },
  { id: 'fs-03', code: 'OP-03', name: 'Attach band to collar',       smv: 1.790, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing',  notes: 'Bottleneck across all OSL profiles' },
  { id: 'fs-04', code: 'OP-04', name: 'Cuff hem & run stitch',       smv: 0.600, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-05', code: 'OP-05', name: 'Cuff turn & iron',            smv: 0.250, machineCode: 'PRESS', skill: 'pressing',   category: 'pressing' },
  { id: 'fs-06', code: 'OP-06', name: 'Cuff topstitch',              smv: 0.550, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-07', code: 'OP-07', name: 'Mark & iron pocket',          smv: 0.260, machineCode: 'PRESS', skill: 'pressing',   category: 'pressing' },
  { id: 'fs-08', code: 'OP-08', name: 'Pocket hem & crease',         smv: 0.250, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-09', code: 'OP-09', name: 'Attach button placket',       smv: 0.780, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing',  notes: 'Bottleneck' },
  { id: 'fs-10', code: 'OP-10', name: 'Attach yoke',                 smv: 1.010, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-11', code: 'OP-11', name: 'Attach sleeve placket',       smv: 1.510, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing',  notes: 'Bottleneck' },
  { id: 'fs-12', code: 'OP-12', name: 'Attach pocket & label',       smv: 0.450, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-13', code: 'OP-13', name: 'Shoulder joint',              smv: 0.740, machineCode: '4OL',   skill: 'overlock',   category: 'sewing'   },
  { id: 'fs-14', code: 'OP-14', name: 'Attach sleeves',              smv: 0.375, machineCode: '4OL',   skill: 'overlock',   category: 'sewing'   },
  { id: 'fs-15', code: 'OP-15', name: 'Close side & under-arm seam', smv: 0.920, machineCode: '4OL',   skill: 'overlock',   category: 'sewing'   },
  { id: 'fs-16', code: 'OP-16', name: 'Attach collar',               smv: 0.700, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-17', code: 'OP-17', name: 'Attach cuff',                 smv: 0.710, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-18', code: 'OP-18', name: 'Bottom hem',                  smv: 0.780, machineCode: 'SNL',   skill: 'stitching',  category: 'sewing'   },
  { id: 'fs-19', code: 'OP-19', name: 'Buttonholes',                 smv: 0.370, machineCode: 'BH',    skill: 'buttonhole', category: 'sewing'   },
  { id: 'fs-20', code: 'OP-20', name: 'Attach buttons',              smv: 0.430, machineCode: 'BS',    skill: 'button_sew', category: 'sewing'   },
];

// ============================================================================
// 05 · KURSUN & KALAOGLU 2009 — SWEATSHIRT (Enterprise Dynamics, Turkey)
// ============================================================================
//
// 33-op pullover-sweatshirt line; all distributions fitted via StatFit +
// Kolmogorov–Smirnov GoF at 95 % CI (Table 1, p. 69). SMVs below are
// the mean of the fitted distribution, in minutes (paper reports seconds).
// Bottleneck notes mark which ops the three incremental what-if scenarios
// reinforce (ops 4, 5, 27, 28).

const KURSUN_SWEATSHIRT_OPS: Operation[] = [
  { id: 'sw33-01', code: 'OP-01', name: 'Mark pocket welt position',     smv: 0.133, machineCode: 'MNL',  skill: 'bundling',   category: 'manual',     notes: 'Lognormal(8, 1.03, 0.529) sec' },
  { id: 'sw33-02', code: 'OP-02', name: 'Fuse interlining',              smv: 0.175, machineCode: 'FUSE', skill: 'fusing',     category: 'fusing',     notes: 'Uniform(8, 13) sec' },
  { id: 'sw33-03', code: 'OP-03', name: 'Sew pocket welt',               smv: 0.408, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Uniform(20, 29) sec' },
  { id: 'sw33-04', code: 'OP-04', name: 'Stitch down pocket belt',       smv: 0.858, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Lognormal(47, 56) sec — Bottleneck reinforced in S1/S2/S3' },
  { id: 'sw33-05', code: 'OP-05', name: 'Runstitch pocket pouch',        smv: 0.792, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Lognormal(47, 1.18, 0.692) sec — Reinforced in S2/S3' },
  { id: 'sw33-06', code: 'OP-06', name: 'Serge pocket pouch',            smv: 0.625, machineCode: '4OL',  skill: 'overlock',   category: 'sewing',     notes: 'Lognormal(33, 42) sec' },
  { id: 'sw33-07', code: 'OP-07', name: 'Stitch down pocket welt',       smv: 0.383, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Uniform(19, 27) sec' },
  { id: 'sw33-08', code: 'OP-08', name: 'Shoulder seam',                 smv: 0.275, machineCode: '4OL',  skill: 'overlock',   category: 'sewing',     notes: 'Lognormal(15, 1.49, 0.319) sec' },
  { id: 'sw33-09', code: 'OP-09', name: 'Attach sleeve',                 smv: 0.500, machineCode: '4OL',  skill: 'overlock',   category: 'sewing',     notes: 'Lognormal(30, 1.46, 0.567) sec' },
  { id: 'sw33-10', code: 'OP-10', name: 'Cover seam on sleeve',          smv: 0.417, machineCode: 'FL',   skill: 'flatlock',   category: 'sewing',     notes: 'Uniform(20, 30) sec' },
  { id: 'sw33-11', code: 'OP-11', name: 'Attach tape on sleeve',         smv: 0.417, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Uniform(20, 30) sec' },
  { id: 'sw33-12', code: 'OP-12', name: 'Cut & fold quality label',      smv: 0.075, machineCode: 'MNL',  skill: 'bundling',   category: 'manual',     notes: 'Lognormal(2, 0.675, 0.391) sec' },
  { id: 'sw33-13', code: 'OP-13', name: 'Sleeve & side seam',            smv: 0.683, machineCode: '4OL',  skill: 'overlock',   category: 'sewing',     notes: 'Exponential(38, 3.35) sec' },
  { id: 'sw33-14', code: 'OP-14', name: 'Close sleeve cuff',             smv: 0.275, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Lognormal(12, 0.9, 0.451) sec' },
  { id: 'sw33-15', code: 'OP-15', name: 'Fold sleeve cuff',              smv: 0.267, machineCode: 'MNL',  skill: 'bundling',   category: 'manual',     notes: 'Uniform(11, 21) sec' },
  { id: 'sw33-16', code: 'OP-16', name: 'Attach cuffs',                  smv: 0.475, machineCode: '4OL',  skill: 'overlock',   category: 'sewing',     notes: 'Lognormal(20, 1.58, 0.625) sec' },
  { id: 'sw33-17', code: 'OP-17', name: 'Cover seam on cuffs',           smv: 0.567, machineCode: 'FL',   skill: 'flatlock',   category: 'sewing',     notes: 'Lognormal(25, 1.45, 0.594) sec' },
  { id: 'sw33-18', code: 'OP-18', name: 'Serge facing',                  smv: 0.250, machineCode: '4OL',  skill: 'overlock',   category: 'sewing',     notes: 'Lognormal(11, 0.982, 0.506) sec' },
  { id: 'sw33-19', code: 'OP-19', name: 'Attach facing',                 smv: 0.300, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Lognormal(13, 0.957, 0.684) sec' },
  { id: 'sw33-20', code: 'OP-20', name: 'Attach waist band',             smv: 0.500, machineCode: '4OL',  skill: 'overlock',   category: 'sewing',     notes: 'Uniform(25, 35) sec' },
  { id: 'sw33-21', code: 'OP-21', name: 'Cover seam on waist band',      smv: 0.400, machineCode: 'FL',   skill: 'flatlock',   category: 'sewing',     notes: 'Uniform(20, 28) sec' },
  { id: 'sw33-22', code: 'OP-22', name: 'Mark collar position',          smv: 0.067, machineCode: 'MNL',  skill: 'bundling',   category: 'manual',     notes: 'Exponential(4, 1.85) sec' },
  { id: 'sw33-23', code: 'OP-23', name: 'Sew collar edge to facing',     smv: 0.300, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Lognormal(18, 1.43, 0.506) sec' },
  { id: 'sw33-24', code: 'OP-24', name: 'Attach collar',                 smv: 0.350, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Lognormal(21, 1.48, 0.508) sec' },
  { id: 'sw33-25', code: 'OP-25', name: 'Cover seam on collar',          smv: 0.417, machineCode: 'FL',   skill: 'flatlock',   category: 'sewing',     notes: 'Lognormal(25, 1.65, 0.716) sec' },
  { id: 'sw33-26', code: 'OP-26', name: 'Tack facing and pocket',        smv: 0.367, machineCode: 'BT',   skill: 'bartack',    category: 'sewing',     notes: 'Lognormal(22, 1.85, 0.407) sec' },
  { id: 'sw33-27', code: 'OP-27', name: 'Attach zipper',                 smv: 0.942, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Uniform(50, 63) sec — Bottleneck reinforced in S2/S3' },
  { id: 'sw33-28', code: 'OP-28', name: 'Stitch down zipper',            smv: 0.825, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Uniform(44, 55) sec — Reinforced in S3' },
  { id: 'sw33-29', code: 'OP-29', name: 'Cut & fold',                    smv: 0.100, machineCode: 'MNL',  skill: 'bundling',   category: 'manual',     notes: 'Lognormal(6, 0.675, 0.537) sec' },
  { id: 'sw33-30', code: 'OP-30', name: 'Attach brand label',            smv: 0.117, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing',     notes: 'Lognormal(7, 1.39, 0.583) sec' },
  { id: 'sw33-31', code: 'OP-31', name: 'Trim residual threads',         smv: 0.333, machineCode: 'MNL',  skill: 'bundling',   category: 'manual',     notes: 'Exponential(20, 4) sec' },
  { id: 'sw33-32', code: 'OP-32', name: 'Inspection',                    smv: 0.250, machineCode: 'INSP', skill: 'inspection', category: 'inspection', notes: 'Lognormal(15, 1.36, 0.661) sec' },
  { id: 'sw33-33', code: 'OP-33', name: 'Finish',                        smv: 0.350, machineCode: 'MNL',  skill: 'bundling',   category: 'manual',     notes: 'Uniform(16, 26) sec' },
];

// ============================================================================
// 04 · MORSHED & PALASH 2014 — POLO SHIRT (work-sharing study, Bangladesh)
// ============================================================================

const MORSHED_POLO_OPS: Operation[] = [
  { id: 'mp-01', code: 'OP-01', name: 'Back & front matching',          smv: 0.25, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-02', code: 'OP-02', name: 'Shoulder join',                  smv: 0.23, machineCode: '4OL', skill: 'overlock',   category: 'sewing' },
  { id: 'mp-03', code: 'OP-03', name: 'Thread cut & fold',              smv: 0.23, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-04', code: 'OP-04', name: 'Neck rib measure & cut',         smv: 0.22, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-05', code: 'OP-05', name: 'Neck rib make',                  smv: 0.24, machineCode: 'SNL', skill: 'stitching',  category: 'sewing' },
  { id: 'mp-06', code: 'OP-06', name: 'Neck rib join with body',        smv: 0.24, machineCode: '4OL', skill: 'overlock',   category: 'sewing' },
  { id: 'mp-07', code: 'OP-07', name: 'Trim & fold',                    smv: 0.25, machineCode: 'MNL', skill: 'bundling',   category: 'manual', notes: 'Shares last 10 min/hr with op 8' },
  { id: 'mp-08', code: 'OP-08', name: 'Main label attach positioning',  smv: 0.33, machineCode: 'MNL', skill: 'bundling',   category: 'manual', notes: 'Baseline bottleneck (180/hr)' },
  { id: 'mp-09', code: 'OP-09', name: 'Main label attach with body',    smv: 0.24, machineCode: 'SNL', skill: 'stitching',  category: 'sewing' },
  { id: 'mp-10', code: 'OP-10', name: 'Back tape',                      smv: 0.25, machineCode: 'FL',  skill: 'flatlock',   category: 'sewing' },
  { id: 'mp-11', code: 'OP-11', name: 'Thread cut & fold',              smv: 0.25, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-12', code: 'OP-12', name: 'Sleeve match with body',         smv: 0.22, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-13', code: 'OP-13', name: 'Sleeve join with body',          smv: 0.26, machineCode: '4OL', skill: 'overlock',   category: 'sewing', notes: 'Shares last 10 min/hr with op 16' },
  { id: 'mp-14', code: 'OP-14', name: 'Thread cut & fold',              smv: 0.26, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-15', code: 'OP-15', name: 'Care label make',                smv: 0.24, machineCode: 'SNL', skill: 'stitching',  category: 'sewing' },
  { id: 'mp-16', code: 'OP-16', name: 'Side seam with care label',      smv: 0.36, machineCode: '4OL', skill: 'overlock',   category: 'sewing', notes: 'Baseline bottleneck (167/hr); 195/hr after sharing' },
  { id: 'mp-17', code: 'OP-17', name: 'Thread cut & fold',              smv: 0.25, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-18', code: 'OP-18', name: 'Sleeve hem',                     smv: 0.22, machineCode: 'FL',  skill: 'flatlock',   category: 'sewing', notes: 'Shares last 10 min/hr with op 20' },
  { id: 'mp-19', code: 'OP-19', name: 'Thread cut & fold',              smv: 0.22, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-20', code: 'OP-20', name: 'Body hem',                       smv: 0.33, machineCode: 'FL',  skill: 'flatlock',   category: 'sewing', notes: 'Baseline bottleneck (182/hr); 212/hr after sharing' },
  { id: 'mp-21', code: 'OP-21', name: 'Thread cut & fold',              smv: 0.25, machineCode: 'MNL', skill: 'bundling',   category: 'manual' },
  { id: 'mp-22', code: 'OP-22', name: 'Quality inspection',             smv: 0.50, machineCode: 'INSP',skill: 'inspection', category: 'inspection' },
];

// ============================================================================
// 07 · KOÇ & ERYÜRÜK 2025 — LADIES' TROUSER D6250 (Istanbul Technical, Turkey)
// ============================================================================

const KOC_LADIES_TROUSER_OPS: Operation[] = [
  { id: 'lt-01', code: 'OP-01', name: 'Belt ironing',                     smv: 0.296, machineCode: 'PRESS', skill: 'pressing',  category: 'pressing' },
  { id: 'lt-02', code: 'OP-02', name: 'Elastic joining',                  smv: 0.206, machineCode: 'KS',    skill: 'kansai',    category: 'sewing' },
  { id: 'lt-03', code: 'OP-03', name: 'Belt elastic marking',             smv: 0.264, machineCode: 'MNL',   skill: 'bundling',  category: 'manual' },
  { id: 'lt-04', code: 'OP-04', name: 'Elastic holding',                  smv: 0.560, machineCode: 'FL',    skill: 'flatlock',  category: 'sewing' },
  { id: 'lt-05', code: 'OP-05', name: 'Belt joining',                     smv: 0.294, machineCode: 'SNL',   skill: 'stitching', category: 'sewing' },
  { id: 'lt-06', code: 'OP-06', name: 'Belt closing',                     smv: 0.496, machineCode: 'FL',    skill: 'flatlock',  category: 'sewing' },
  { id: 'lt-07', code: 'OP-07', name: 'Cuff ribbing attachment',          smv: 0.698, machineCode: 'SNL',   skill: 'stitching', category: 'sewing' },
  { id: 'lt-08', code: 'OP-08', name: 'Front panel attachment',           smv: 0.480, machineCode: 'SNL',   skill: 'stitching', category: 'sewing' },
  { id: 'lt-09', code: 'OP-09', name: 'Front seam joining (×2)',          smv: 0.599, machineCode: 'SNL',   skill: 'stitching', category: 'sewing' },
  { id: 'lt-10', code: 'OP-10', name: 'Back panel joining',               smv: 0.555, machineCode: 'SNL',   skill: 'stitching', category: 'sewing' },
  { id: 'lt-11', code: 'OP-11', name: 'Inner seam joining',               smv: 0.867, machineCode: 'SNL',   skill: 'stitching', category: 'sewing', notes: 'Bottleneck (cycle 0.626 → needs 1.38 ops)' },
  { id: 'lt-12', code: 'OP-12', name: 'Belt attachment + thread cleaning',smv: 0.618, machineCode: '4OL',   skill: 'overlock',  category: 'sewing' },
  { id: 'lt-13', code: 'OP-13', name: 'Belt cuff',                        smv: 0.591, machineCode: 'FL',    skill: 'flatlock',  category: 'sewing' },
  { id: 'lt-14', code: 'OP-14', name: 'Hem bartack (×2) + thread cleaning',smv: 0.345, machineCode: 'BT',   skill: 'bartack',   category: 'sewing' },
  { id: 'lt-15', code: 'OP-15', name: 'Label attachment',                 smv: 0.315, machineCode: 'FL',    skill: 'flatlock',  category: 'sewing' },
  { id: 'lt-16', code: 'OP-16', name: 'Label removal (×9) + turn & stack',smv: 0.309, machineCode: 'MNL',   skill: 'bundling',  category: 'manual' },
  { id: 'lt-17', code: 'OP-17', name: 'First control',                    smv: 0.505, machineCode: 'MNL',   skill: 'inspection',category: 'inspection' },
  { id: 'lt-18', code: 'OP-18', name: 'Ironing',                          smv: 0.587, machineCode: 'PRESS', skill: 'pressing',  category: 'pressing' },
  { id: 'lt-19', code: 'OP-19', name: 'Quality control',                  smv: 0.606, machineCode: 'INSP',  skill: 'inspection',category: 'inspection' },
];

// ============================================================================
// REGISTRY
// ============================================================================

export const REFERENCE_MODELS: ReferenceModel[] = [
  {
    slug: 'hossain-2023-kids-pant',
    title: "Kid's Pant — Arunima Sportswear",
    authorYear: 'Hossain & Muneer 2023',
    citation:
      'Hossain, A., & Muneer, K. I. (2023). Assembly Line Balancing and Sensitivity Analysis of a Single-Model Stochastic Sewing Line Using Arena Simulation Modelling. IJIEM, 4(3), 533–548.',
    garment: "Kid's pant (knit)",
    setting: 'Arunima Sportswear Ltd., Ashulia, Dhaka, Bangladesh',
    pitch:
      'Gold-standard stochastic ALB model. 21 ops, every operation has a fitted distribution, OptQuest finds +22 % throughput by adding 4 machines.',
    method: 'Arena 14 + OptQuest, 200 replications, 4 h warm-up, 8 h run',
    literaturePath: 'Literature/Reference Models/01-hossain-2023-kids-pant/model.md',
    operationCount: 21,
    garmentTemplate: mkTemplate(
      'ref-kids-pant-hossain-2023',
      "Kid's Pant (Hossain 2023)",
      'bottom',
      "21-operation kid's pant line. Mean per-op SMVs derived from the paper's stochastic fits (TRIA/NORM/BETA/WEIB/LOGN/ERLA). See notes per op.",
      HOSSAIN_KIDS_PANT_OPS,
      36,
      "Verifying Stitchworks' stochastic engine. Bundle = 36 every 10 min.",
    ),
    baseline: {
      operators: 28,
      throughputPerDayPcs: 741,
      lineEfficiencyPct: 75.76,
      notes: 'Validated against 20-day field data: t₀ = 1.54 < 2.024 (95 % CI).',
    },
    proposed: {
      operators: 32,
      throughputPerDayPcs: 904,
      lineEfficiencyPct: 92.43,
      notes: 'Added +2 SNL, +1 5OL, +1 FB (OptQuest sim #1, fewest machines added).',
    },
  },

  {
    slug: 'elnaggar-2019-formal-shirt',
    title: 'Formal Shirt — OSL Study',
    authorYear: 'Elnaggar 2019',
    citation:
      'Elnaggar, G. (2019). Effect of Operator Skill Level on Assembly Line Balancing in Apparel Manufacturing. IEOM Riyadh, 308–315.',
    garment: 'Formal shirt (women\'s tunic)',
    setting: 'King Abdulaziz University, Jeddah · simulation model',
    pitch:
      'Same 20-op shirt run under 4 Operator Skill Levels (OSL). Tests how skill heterogeneity changes the optimal operator count and completion time.',
    method: 'Arena + OptQuest, U(x₁, x₂) task times derived from OSL profile',
    literaturePath: 'Literature/Reference Models/02-elnaggar-2019-formal-shirt/model.md',
    operationCount: 20,
    garmentTemplate: mkTemplate(
      'ref-formal-shirt-elnaggar-2019',
      'Formal Shirt (Elnaggar 2019)',
      'top',
      '20-op formal shirt; times reported per 20-shirt box in the paper, converted to per-piece SMV here.',
      ELNAGGAR_FORMAL_SHIRT_OPS,
      20,
      'Verifying operator-skill modelling — completion time should grow as OSL degrades.',
    ),
    baseline: {
      operators: 31,
      lineEfficiencyPct: undefined,
      notes: 'OSL 1 unconstrained: 31 ops, 7.19 h completion. Bottlenecks at ops 1, 3, 9, 11.',
    },
    proposed: {
      operators: 53,
      notes: 'OSL 4 unconstrained: 53 ops, 15.41 h — illustrates skill-degradation cost.',
    },
  },

  {
    slug: 'morshed-2014-polo-shirt',
    title: 'Polo Shirt — Work-Sharing',
    authorYear: 'Morshed & Palash 2014',
    citation:
      'Morshed, M. N., & Palash, K. S. (2014). Assembly Line Balancing to Improve Productivity using Work Sharing Method in Apparel Industry. GJRE-G, 14(3), 39–45.',
    garment: 'Polo shirt (knit)',
    setting: 'Khulna University of Engineering & Technology, Bangladesh',
    pitch:
      'No simulation — pure work-study. Three bottleneck ops recover capacity by having upstream ops share the last 10 min/hr. Cleanest deterministic case in the set.',
    method: 'Manual work-sharing: process X works 50 min then helps process Y for 10 min/hr',
    literaturePath: 'Literature/Reference Models/04-morshed-2014-polo-shirt/model.md',
    operationCount: 22,
    garmentTemplate: mkTemplate(
      'ref-polo-morshed-2014',
      'Polo (Morshed 2014, work-share)',
      'top',
      '22-op polo bulletin with bottlenecks at ops 8, 16, 20. Three work-sharing pairs free 3 operators while raising output.',
      MORSHED_POLO_OPS,
      30,
      'Verifying line-balancer + capacity calc on a deterministic line with known bottlenecks.',
    ),
    baseline: {
      operators: 27,
      throughputPerDayPcs: 1100,
      lineEfficiencyPct: 44,
      notes: 'Bottleneck = side seam @ 167 pcs/hr. Benchmark target 201 pcs/hr @ 80 %.',
    },
    proposed: {
      operators: 24,
      throughputPerDayPcs: 1190,
      lineEfficiencyPct: 53,
      notes: '3 operators freed via work-sharing pairs 7→8, 13→16, 18→20. New benchmark 180 pcs/hr.',
    },
  },

  {
    slug: 'kursun-2009-sweatshirt',
    title: 'Sweatshirt — 33-op Line',
    authorYear: 'Kursun & Kalaoglu 2009',
    citation:
      'Kursun, S., & Kalaoglu, F. (2009). Simulation of Production Line Balancing in Apparel Manufacturing. Fibres & Textiles in Eastern Europe, 17(4)(75), 68–71.',
    garment: 'Pullover sweatshirt',
    setting: 'Istanbul Technical University · Enterprise Dynamics Student',
    pitch:
      'Three what-if scenarios incrementally add operators at the running bottleneck. 455 → 489 → 566 → 693 pcs/day (+52 %). Cleanest demonstration of iterative debottlenecking.',
    method: 'Enterprise Dynamics + StatFit (Lognormal/Uniform/Exponential, KS @ 95 %)',
    literaturePath: 'Literature/Reference Models/05-kursun-2009-sweatshirt/model.md',
    operationCount: 33,
    garmentTemplate: mkTemplate(
      'ref-sweatshirt-kursun-2009',
      'Sweatshirt (Kursun 2009)',
      'top',
      '33-op pullover sweatshirt line. Mean per-op SMVs derived from the paper\'s fitted distributions (Lognormal/Uniform/Exponential, KS at 95 % CI). Bottlenecks: ops 4, 5, 27, 28.',
      KURSUN_SWEATSHIRT_OPS,
      30,
      'Verifying iterative add-operator-at-bottleneck improvement loops.',
    ),
    baseline: {
      operators: 33,
      throughputPerDayPcs: 455,
      notes:
        'Paper Table 2: 455.48 pcs/day (95 % CI 455.23–455.73). Avg WIP 90.57 jobs in queue, wait time 136.09 s. One worker per machine.',
    },
    proposed: {
      operators: 37,
      throughputPerDayPcs: 693,
      notes:
        'Scenario S3 (paper Table 3): +1 op at processes 4, 5, 27, 28. +52 % vs. baseline. Near-balanced — avg jobs in queue 135, wait 132 s.',
    },
    scenarios: [
      {
        id: 'S1',
        name: '+1 op at process 4',
        description: 'Add a second operator at the running bottleneck (Stitch down pocket belt).',
        operators: 34,
        throughputPerDayPcs: 489,
        upliftPct: 7,
        reinforcedOpIndices: [4],
      },
      {
        id: 'S2',
        name: '+1 op at processes 4, 5, 27',
        description: 'Add operators at the next two bottlenecks revealed once op 4 is unblocked (Runstitch pocket pouch + Attach zipper).',
        operators: 36,
        throughputPerDayPcs: 566,
        upliftPct: 24,
        reinforcedOpIndices: [4, 5, 27],
      },
      {
        id: 'S3',
        name: '+1 op at processes 4, 5, 27, 28',
        description: 'Final scenario: also reinforce Stitch-down zipper. Near-balanced line, +52 % output.',
        operators: 37,
        throughputPerDayPcs: 693,
        upliftPct: 52,
        reinforcedOpIndices: [4, 5, 27, 28],
        isBest: true,
      },
    ],
  },

  {
    slug: 'koc-2025-ladies-trouser-d6250',
    title: "Ladies' Trouser D6250 — Digital RPW",
    authorYear: 'Koç & Eryürük 2025',
    citation:
      'Koç, B., & Eryürük, S. H. (2025). Optimizing Sewing Line Balancing in Apparel Manufacturing through Digitalization. Fibres & Textiles in Eastern Europe, 33(1), 10–26.',
    garment: "Ladies' trouser model D6250",
    setting: 'Turkish factory exporting to Europe (20+ years operation)',
    pitch:
      'Real-time PMD (process-monitoring device) data + Ranked Positional Weight algorithm. Total SMV 9.19 min; target 862 units at 100 % productivity.',
    method: 'Position-weighted RPW with PMD performance feedback (Industry 4.0 stack)',
    literaturePath: 'Literature/Reference Models/07-koc-2025-ladies-trouser-d6250/model.md',
    operationCount: 19,
    garmentTemplate: mkTemplate(
      'ref-ladies-trouser-koc-2025',
      "Ladies' Trouser D6250 (Koç 2025)",
      'bottom',
      '19 work elements, SMVs from PMD-collected data. Cycle time tc = 540/862 = 0.626 min for 100 % target.',
      KOC_LADIES_TROUSER_OPS,
      30,
      'Verifying RPW line-balancer + capacity calculator integration.',
    ),
    baseline: {
      operators: 22,
      lineEfficiencyPct: 79.68,
      notes: 'Pre-balancing efficiency. Daily working time 540 min, target 862 units.',
    },
    proposed: {
      operators: 20,
      lineEfficiencyPct: 88.31,
      notes: 'Per-operator output +10 % after RPW + PMD-driven re-allocation.',
    },
  },
];

export const REFERENCE_MODELS_BY_SLUG: Record<string, ReferenceModel> =
  Object.fromEntries(REFERENCE_MODELS.map((m) => [m.slug, m]));
