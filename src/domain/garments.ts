/**
 * Garment templates — pre-loaded operation bulletins for the four most
 * common knit-and-woven categories. Stitchworks ships these so a new project
 * can pick a template and have a runnable simulation in minutes.
 *
 * The T-shirt bulletin is sourced from the real Brandix Unit-3 operation
 * breakdown sheet (Operation-Breakdown-and-SMV-of-T-shirt-of-Knit-Garments.xlsx)
 * — total SAM 8.41 min, 25 operations, 100% target 178 pcs/hr.
 */

import type { Operation } from './operations';

export type GarmentClass = 'top' | 'bottom' | 'dress' | 'outerwear' | 'accessory';

export interface GarmentTemplate {
  id: string;
  name: string;
  class: GarmentClass;
  description: string;
  /** Canonical operation list, in suggested execution order. */
  operations: Operation[];
  /** Default bundle size (pieces per ticket). */
  defaultBundleSize: number;
  /** Total SMV for the full garment — sum of operation SMVs. */
  totalSmv: number;
  /** Industry-typical 100% hourly target (pieces / hour). */
  hourlyTarget100: number;
  /** Hint about when this template is a good starting point. */
  bestFor: string;
}

// ── T-shirt template — sourced from Brandix Unit-3 SMV sheet ──────────────
// Total SAM: 8.41 min · 100% target/hr: 178 · 25 operators
const TSHIRT_OPS: Operation[] = [
  { id: 'ts-01', code: 'OP-01', name: 'Care label attach',                    smv: 0.12, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-02', code: 'OP-02', name: 'Placket attach position mark',         smv: 0.25, machineCode: 'MNL', skill: 'bundling',    category: 'manual' },
  { id: 'ts-03', code: 'OP-03', name: 'Placket rolling & mark',               smv: 0.32, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-04', code: 'OP-04', name: 'Placket attach',                       smv: 0.40, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-05', code: 'OP-05', name: 'Placket cut & nose tack',              smv: 0.27, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-06', code: 'OP-06', name: 'Front & back part match',              smv: 0.15, machineCode: 'MNL', skill: 'bundling',    category: 'manual' },
  { id: 'ts-07', code: 'OP-07', name: 'Shoulder joint',                       smv: 0.30, machineCode: '4OL', skill: 'overlock',    category: 'sewing' },
  { id: 'ts-08', code: 'OP-08', name: 'Nose neck rib measure & cut',          smv: 0.20, machineCode: 'MNL', skill: 'bundling',    category: 'manual' },
  { id: 'ts-09', code: 'OP-09', name: 'Nose neck rib tack with body',         smv: 0.32, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-10', code: 'OP-10', name: 'Nose neck rib join',                   smv: 0.32, machineCode: '4OL', skill: 'overlock',    category: 'sewing' },
  { id: 'ts-11', code: 'OP-11', name: 'Neck top-stitch',                      smv: 0.25, machineCode: 'FL',  skill: 'flatlock',    category: 'sewing' },
  { id: 'ts-12', code: 'OP-12', name: 'Placket close & 1/16 lower',           smv: 0.32, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-13', code: 'OP-13', name: 'Placket close & 1/16 upper',           smv: 0.32, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-14', code: 'OP-14', name: 'Placket box',                          smv: 0.40, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-15', code: 'OP-15', name: 'Neck piping',                          smv: 0.23, machineCode: 'FB',  skill: 'feed_of_arm', category: 'sewing' },
  { id: 'ts-16', code: 'OP-16', name: 'Main label attach with corner fold',   smv: 0.32, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-17', code: 'OP-17', name: 'Sleeve hem',                           smv: 0.33, machineCode: 'FL',  skill: 'flatlock',    category: 'sewing' },
  { id: 'ts-18', code: 'OP-18', name: 'Sleeve and body match',                smv: 0.15, machineCode: 'MNL', skill: 'bundling',    category: 'manual' },
  { id: 'ts-19', code: 'OP-19', name: 'Sleeve joint',                         smv: 0.45, machineCode: '4OL', skill: 'overlock',    category: 'sewing' },
  { id: 'ts-20', code: 'OP-20', name: 'Arm hole top-stitch',                  smv: 0.32, machineCode: 'FL',  skill: 'flatlock',    category: 'sewing' },
  { id: 'ts-21', code: 'OP-21', name: 'Side seam',                            smv: 0.70, machineCode: '4OL', skill: 'overlock',    category: 'sewing' },
  { id: 'ts-22', code: 'OP-22', name: 'Sleeve close & open tack',             smv: 0.37, machineCode: 'SNL', skill: 'stitching',   category: 'sewing' },
  { id: 'ts-23', code: 'OP-23', name: 'Body hem',                             smv: 0.33, machineCode: 'FL',  skill: 'flatlock',    category: 'sewing' },
  { id: 'ts-24', code: 'OP-24', name: 'Buttonhole',                           smv: 0.30, machineCode: 'BH',  skill: 'buttonhole',  category: 'sewing' },
  { id: 'ts-25', code: 'OP-25', name: 'Button attach mark',                   smv: 0.27, machineCode: 'BS',  skill: 'button_sew',  category: 'sewing' },
  { id: 'ts-26', code: 'OP-26', name: 'Button push',                          smv: 0.20, machineCode: 'MNL', skill: 'bundling',    category: 'manual' },
  { id: 'ts-27', code: 'OP-27', name: 'Final thread cut & sticker remove',    smv: 0.50, machineCode: 'MNL', skill: 'bundling',    category: 'manual', notes: 'End-of-line manual finishing' },
];

// ── Polo template — placeholder, derive from T-shirt + extras (collar) ────
const POLO_OPS: Operation[] = [
  ...TSHIRT_OPS.slice(0, 6),
  { id: 'po-collar-fuse', code: 'OP-CF', name: 'Collar fuse',                 smv: 0.40, machineCode: 'FUSE', skill: 'fusing',     category: 'fusing' },
  { id: 'po-collar-make', code: 'OP-CM', name: 'Collar make / runstitch',     smv: 0.55, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'po-collar-tk',   code: 'OP-CT', name: 'Collar top-stitch',           smv: 0.45, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  ...TSHIRT_OPS.slice(7),
  { id: 'po-collar-att',  code: 'OP-CA', name: 'Collar attach to neck',       smv: 0.65, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
];

// ── Shirt template — placeholder, woven characteristics ───────────────────
const SHIRT_OPS: Operation[] = [
  { id: 'sh-01', code: 'OP-01', name: 'Yoke join',                  smv: 0.40, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-02', code: 'OP-02', name: 'Yoke top-stitch',            smv: 0.45, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-03', code: 'OP-03', name: 'Pocket make',                smv: 0.55, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-04', code: 'OP-04', name: 'Pocket attach',              smv: 0.70, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-05', code: 'OP-05', name: 'Placket make',               smv: 0.50, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-06', code: 'OP-06', name: 'Placket attach',             smv: 0.60, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-07', code: 'OP-07', name: 'Collar fuse',                smv: 0.40, machineCode: 'FUSE', skill: 'fusing',   category: 'fusing' },
  { id: 'sh-08', code: 'OP-08', name: 'Collar runstitch',           smv: 0.55, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-09', code: 'OP-09', name: 'Collar top-stitch',          smv: 0.45, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-10', code: 'OP-10', name: 'Collar attach',              smv: 0.65, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-11', code: 'OP-11', name: 'Cuff make',                  smv: 0.50, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-12', code: 'OP-12', name: 'Cuff attach',                smv: 0.60, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-13', code: 'OP-13', name: 'Sleeve attach',              smv: 0.75, machineCode: '5OL', skill: 'overlock',  category: 'sewing' },
  { id: 'sh-14', code: 'OP-14', name: 'Side seam',                  smv: 0.85, machineCode: '5OL', skill: 'overlock',  category: 'sewing' },
  { id: 'sh-15', code: 'OP-15', name: 'Bottom hem',                 smv: 0.45, machineCode: 'SNL', skill: 'stitching', category: 'sewing' },
  { id: 'sh-16', code: 'OP-16', name: 'Buttonhole',                 smv: 0.35, machineCode: 'BH',  skill: 'buttonhole', category: 'sewing' },
  { id: 'sh-17', code: 'OP-17', name: 'Button sew',                 smv: 0.40, machineCode: 'BS',  skill: 'button_sew', category: 'sewing' },
  { id: 'sh-18', code: 'OP-18', name: 'Inline inspection',          smv: 0.50, machineCode: 'INSP', skill: 'inspection', category: 'inspection' },
];

// ── Trouser template — placeholder ────────────────────────────────────────
const TROUSER_OPS: Operation[] = [
  { id: 'tr-01', code: 'OP-01', name: 'Front pocket facing fuse',   smv: 0.30, machineCode: 'FUSE', skill: 'fusing',     category: 'fusing' },
  { id: 'tr-02', code: 'OP-02', name: 'Front pocket bag attach',    smv: 0.55, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'tr-03', code: 'OP-03', name: 'Front pocket top-stitch',    smv: 0.45, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'tr-04', code: 'OP-04', name: 'Back pocket make',           smv: 0.55, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'tr-05', code: 'OP-05', name: 'Back pocket attach',         smv: 0.70, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'tr-06', code: 'OP-06', name: 'Fly attach',                 smv: 0.65, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'tr-07', code: 'OP-07', name: 'Fly top-stitch',             smv: 0.55, machineCode: 'DNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'tr-08', code: 'OP-08', name: 'Inseam',                     smv: 0.85, machineCode: '5OL',  skill: 'overlock',   category: 'sewing' },
  { id: 'tr-09', code: 'OP-09', name: 'Outseam',                    smv: 0.85, machineCode: '5OL',  skill: 'overlock',   category: 'sewing' },
  { id: 'tr-10', code: 'OP-10', name: 'Crotch join',                smv: 0.55, machineCode: '5OL',  skill: 'overlock',   category: 'sewing' },
  { id: 'tr-11', code: 'OP-11', name: 'Waistband make',             smv: 0.65, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'tr-12', code: 'OP-12', name: 'Waistband attach',           smv: 0.85, machineCode: 'KS',   skill: 'kansai',     category: 'sewing' },
  { id: 'tr-13', code: 'OP-13', name: 'Belt loop attach',           smv: 0.55, machineCode: 'BT',   skill: 'bartack',    category: 'sewing' },
  { id: 'tr-14', code: 'OP-14', name: 'Bottom hem',                 smv: 0.45, machineCode: 'SNL',  skill: 'stitching',  category: 'sewing' },
  { id: 'tr-15', code: 'OP-15', name: 'Buttonhole + tack',          smv: 0.45, machineCode: 'BH',   skill: 'buttonhole', category: 'sewing' },
];

const sumSmv = (ops: Operation[]) => ops.reduce((s, o) => s + o.smv, 0);

export const GARMENT_TEMPLATES: Record<string, GarmentTemplate> = {
  tshirt: {
    id: 'tshirt', name: 'T-shirt (knit)', class: 'top',
    description: 'Standard short-sleeve crew-neck knit T-shirt with front placket and 2 buttons.',
    operations: TSHIRT_OPS,
    defaultBundleSize: 30,
    totalSmv: sumSmv(TSHIRT_OPS),
    hourlyTarget100: Math.round(60 / 0.336),
    bestFor: 'High-volume basics, polo run preview, line-balancing tutorials.',
  },
  polo: {
    id: 'polo', name: 'Polo S/S Classic', class: 'top',
    description: 'Short-sleeve polo with 3-button placket and rib collar.',
    operations: POLO_OPS,
    defaultBundleSize: 24,
    totalSmv: sumSmv(POLO_OPS),
    hourlyTarget100: Math.round(60 / (sumSmv(POLO_OPS) / 25)),
    bestFor: 'Mid-volume orders, knit factories with collar make capability.',
  },
  shirt: {
    id: 'shirt', name: 'Formal Shirt (woven)', class: 'top',
    description: 'Long-sleeve woven shirt with full placket, yoke, cuffs and 7 buttons.',
    operations: SHIRT_OPS,
    defaultBundleSize: 20,
    totalSmv: sumSmv(SHIRT_OPS),
    hourlyTarget100: Math.round(60 / (sumSmv(SHIRT_OPS) / 30)),
    bestFor: 'Woven shirt factories. More precise SMVs than knit.',
  },
  trouser: {
    id: 'trouser', name: 'Formal Trouser (woven)', class: 'bottom',
    description: 'Front-pleated formal trouser with side pockets, fly, waistband and belt loops.',
    operations: TROUSER_OPS,
    defaultBundleSize: 20,
    totalSmv: sumSmv(TROUSER_OPS),
    hourlyTarget100: Math.round(60 / (sumSmv(TROUSER_OPS) / 30)),
    bestFor: 'Bottoms factories with multi-needle / kansai capability.',
  },
};

export const ALL_GARMENT_TEMPLATES: GarmentTemplate[] = Object.values(GARMENT_TEMPLATES);
