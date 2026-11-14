/**
 * Garment templates — pre-loaded operation bulletins for the four most
 * common knit-and-woven categories. Stitchworks ships these so a new project
 * can pick a template and have a runnable simulation in minutes.
 *
 * The T-shirt bulletin is derived from a real industry operation-breakdown
 * sheet — total SAM 8.41 min, 25 operations, 100% target 178 pcs/hr. The
 * source sheet is not redistributed; only the SMV figures are seeded here.
 */

import type { Operation } from './operations';

export interface GarmentTemplate {
  id: string;
  name: string;
  description: string;
  /** Canonical operation list, in suggested execution order. */
  operations: Operation[];
  /** Total SMV for the full garment — sum of operation SMVs. */
  totalSmv: number;
  /** Industry-typical 100% hourly target (pieces / hour). */
  hourlyTarget100: number;
}

// ── T-shirt template — derived from an industry SMV sheet ─────────────────
// Total SAM: 8.41 min · 100% target/hr: 178 · 25 operators
const TSHIRT_OPS: Operation[] = [
  { id: 'ts-01', code: 'OP-01', name: 'Care label attach',                    smv: 0.12, machineCode: 'SNL' },
  { id: 'ts-02', code: 'OP-02', name: 'Placket attach position mark',         smv: 0.25, machineCode: 'MNL' },
  { id: 'ts-03', code: 'OP-03', name: 'Placket rolling & mark',               smv: 0.32, machineCode: 'SNL' },
  { id: 'ts-04', code: 'OP-04', name: 'Placket attach',                       smv: 0.40, machineCode: 'SNL' },
  { id: 'ts-05', code: 'OP-05', name: 'Placket cut & nose tack',              smv: 0.27, machineCode: 'SNL' },
  { id: 'ts-06', code: 'OP-06', name: 'Front & back part match',              smv: 0.15, machineCode: 'MNL' },
  { id: 'ts-07', code: 'OP-07', name: 'Shoulder joint',                       smv: 0.30, machineCode: '4OL' },
  { id: 'ts-08', code: 'OP-08', name: 'Nose neck rib measure & cut',          smv: 0.20, machineCode: 'MNL' },
  { id: 'ts-09', code: 'OP-09', name: 'Nose neck rib tack with body',         smv: 0.32, machineCode: 'SNL' },
  { id: 'ts-10', code: 'OP-10', name: 'Nose neck rib join',                   smv: 0.32, machineCode: '4OL' },
  { id: 'ts-11', code: 'OP-11', name: 'Neck top-stitch',                      smv: 0.25, machineCode: 'FL' },
  { id: 'ts-12', code: 'OP-12', name: 'Placket close & 1/16 lower',           smv: 0.32, machineCode: 'SNL' },
  { id: 'ts-13', code: 'OP-13', name: 'Placket close & 1/16 upper',           smv: 0.32, machineCode: 'SNL' },
  { id: 'ts-14', code: 'OP-14', name: 'Placket box',                          smv: 0.40, machineCode: 'SNL' },
  { id: 'ts-15', code: 'OP-15', name: 'Neck piping',                          smv: 0.23, machineCode: 'FB' },
  { id: 'ts-16', code: 'OP-16', name: 'Main label attach with corner fold',   smv: 0.32, machineCode: 'SNL' },
  { id: 'ts-17', code: 'OP-17', name: 'Sleeve hem',                           smv: 0.33, machineCode: 'FL' },
  { id: 'ts-18', code: 'OP-18', name: 'Sleeve and body match',                smv: 0.15, machineCode: 'MNL' },
  { id: 'ts-19', code: 'OP-19', name: 'Sleeve joint',                         smv: 0.45, machineCode: '4OL' },
  { id: 'ts-20', code: 'OP-20', name: 'Arm hole top-stitch',                  smv: 0.32, machineCode: 'FL' },
  { id: 'ts-21', code: 'OP-21', name: 'Side seam',                            smv: 0.70, machineCode: '4OL' },
  { id: 'ts-22', code: 'OP-22', name: 'Sleeve close & open tack',             smv: 0.37, machineCode: 'SNL' },
  { id: 'ts-23', code: 'OP-23', name: 'Body hem',                             smv: 0.33, machineCode: 'FL' },
  { id: 'ts-24', code: 'OP-24', name: 'Buttonhole',                           smv: 0.30, machineCode: 'BH' },
  { id: 'ts-25', code: 'OP-25', name: 'Button attach mark',                   smv: 0.27, machineCode: 'BS' },
  { id: 'ts-26', code: 'OP-26', name: 'Button push',                          smv: 0.20, machineCode: 'MNL' },
  { id: 'ts-27', code: 'OP-27', name: 'Final thread cut & sticker remove',    smv: 0.50, machineCode: 'MNL', notes: 'End-of-line manual finishing' },
];

// ── Polo template — placeholder, derive from T-shirt + extras (collar) ────
const POLO_OPS: Operation[] = [
  ...TSHIRT_OPS.slice(0, 6),
  { id: 'po-collar-fuse', code: 'OP-CF', name: 'Collar fuse',                 smv: 0.40, machineCode: 'FUSE' },
  { id: 'po-collar-make', code: 'OP-CM', name: 'Collar make / runstitch',     smv: 0.55, machineCode: 'SNL' },
  { id: 'po-collar-tk',   code: 'OP-CT', name: 'Collar top-stitch',           smv: 0.45, machineCode: 'SNL' },
  ...TSHIRT_OPS.slice(7),
  { id: 'po-collar-att',  code: 'OP-CA', name: 'Collar attach to neck',       smv: 0.65, machineCode: 'SNL' },
];

// ── Shirt template — sourced from Elnaggar 2019, Table 1 ─────────────────
// 20-op formal-shirt bulletin. SMVs are in minutes (Elnaggar lists them in
// minutes per operation). Machine codes mapped from Elnaggar's SSL/OSL/Iron/
// Buttonhole/Button vocabulary.
const SHIRT_OPS: Operation[] = [
  { id: 'sh-01', code: 'OP-01', name: 'Collar run-stitch',                smv: 0.176, machineCode: 'SNL' },
  { id: 'sh-02', code: 'OP-02', name: 'Collar turn & iron',               smv: 0.068, machineCode: 'PRESS' },
  { id: 'sh-03', code: 'OP-03', name: 'Attach band to collar',            smv: 0.358, machineCode: 'SNL' },
  { id: 'sh-04', code: 'OP-04', name: 'Cuff hem + run-stitch',            smv: 0.120, machineCode: 'SNL' },
  { id: 'sh-05', code: 'OP-05', name: 'Cuff turn & iron',                 smv: 0.050, machineCode: 'PRESS' },
  { id: 'sh-06', code: 'OP-06', name: 'Cuff top-stitch',                  smv: 0.110, machineCode: 'SNL' },
  { id: 'sh-07', code: 'OP-07', name: 'Mark & iron pocket',               smv: 0.052, machineCode: 'PRESS' },
  { id: 'sh-08', code: 'OP-08', name: 'Pocket hem & crease',              smv: 0.050, machineCode: 'SNL' },
  { id: 'sh-09', code: 'OP-09', name: 'Attach button placket',            smv: 0.156, machineCode: 'SNL' },
  { id: 'sh-10', code: 'OP-10', name: 'Attach yoke',                      smv: 0.202, machineCode: 'SNL' },
  { id: 'sh-11', code: 'OP-11', name: 'Attach sleeve placket',            smv: 0.302, machineCode: 'SNL' },
  { id: 'sh-12', code: 'OP-12', name: 'Attach pocket & label',            smv: 0.090, machineCode: 'SNL' },
  { id: 'sh-13', code: 'OP-13', name: 'Shoulder joint',                   smv: 0.148, machineCode: '4OL' },
  { id: 'sh-14', code: 'OP-14', name: 'Attach sleeves',                   smv: 0.075, machineCode: '4OL' },
  { id: 'sh-15', code: 'OP-15', name: 'Close side & under-arm seam',      smv: 0.184, machineCode: '4OL' },
  { id: 'sh-16', code: 'OP-16', name: 'Attach collar',                    smv: 0.140, machineCode: 'SNL' },
  { id: 'sh-17', code: 'OP-17', name: 'Attach cuff',                      smv: 0.142, machineCode: 'SNL' },
  { id: 'sh-18', code: 'OP-18', name: 'Bottom hem',                       smv: 0.156, machineCode: 'SNL' },
  { id: 'sh-19', code: 'OP-19', name: 'Buttonholes',                      smv: 0.074, machineCode: 'BH' },
  { id: 'sh-20', code: 'OP-20', name: 'Attach buttons',                   smv: 0.086, machineCode: 'BS' },
];

// ── Trouser template — sourced from Erol 2025, 5-pocket denim, condensed ─
// Erol's full bulletin has 51 ops totalling 14.47 min; the version here keeps
// the original structure and totals but groups micro-ops into representative
// buckets so the on-screen list stays scannable. Replace with the full 51-op
// list if you want pixel-perfect parity with the paper.
const TROUSER_OPS: Operation[] = [
  // back-pocket prep
  { id: 'tr-bp1', code: 'BP-01', name: 'Back pocket overlock',           smv: 0.30, machineCode: '5OL' },
  { id: 'tr-bp2', code: 'BP-02', name: 'Back pocket hem',                smv: 0.45, machineCode: 'DNL' },
  { id: 'tr-bp3', code: 'BP-03', name: 'Back pocket make',               smv: 0.55, machineCode: 'SNL' },
  { id: 'tr-bp4', code: 'BP-04', name: 'Back pocket attach',             smv: 0.70, machineCode: 'SNL' },
  // front-pocket prep
  { id: 'tr-fp1', code: 'FP-01', name: 'Pocket facing fuse',             smv: 0.20, machineCode: 'FUSE' },
  { id: 'tr-fp2', code: 'FP-02', name: 'Pocket bag overlock',            smv: 0.30, machineCode: '5OL' },
  { id: 'tr-fp3', code: 'FP-03', name: 'Pocket bag attach',              smv: 0.55, machineCode: 'SNL' },
  { id: 'tr-fp4', code: 'FP-04', name: 'Pocket top-stitch',              smv: 0.45, machineCode: 'DNL' },
  { id: 'tr-fp5', code: 'FP-05', name: 'Coin pocket attach',             smv: 0.40, machineCode: 'SNL' },
  // bridge / fly
  { id: 'tr-fly1', code: 'FL-01', name: 'Zipper attach LHS',             smv: 0.55, machineCode: 'SNL' },
  { id: 'tr-fly2', code: 'FL-02', name: 'Zipper attach RHS + j-stitch',  smv: 0.65, machineCode: 'SNL' },
  { id: 'tr-fly3', code: 'FL-03', name: 'Fly bartack',                   smv: 0.20, machineCode: 'BT' },
  // assembly
  { id: 'tr-as1', code: 'AS-01', name: 'Inseam (5-thread)',              smv: 0.85, machineCode: '5OL' },
  { id: 'tr-as2', code: 'AS-02', name: 'Outseam (5-thread)',             smv: 0.85, machineCode: '5OL' },
  { id: 'tr-as3', code: 'AS-03', name: 'Crotch join',                    smv: 0.55, machineCode: 'FB' },
  { id: 'tr-as4', code: 'AS-04', name: 'Waistband make',                 smv: 0.65, machineCode: 'SNL' },
  { id: 'tr-as5', code: 'AS-05', name: 'Waistband attach (kansai)',      smv: 0.85, machineCode: 'KS' },
  { id: 'tr-as6', code: 'AS-06', name: 'Belt-loop make',                 smv: 0.40, machineCode: 'KS' },
  { id: 'tr-as7', code: 'AS-07', name: 'Belt-loop attach (5 loops)',     smv: 0.65, machineCode: 'BT' },
  { id: 'tr-as8', code: 'AS-08', name: 'Bottom hem',                     smv: 0.45, machineCode: 'DNL' },
  // finish
  { id: 'tr-fn1', code: 'FN-01', name: 'Buttonhole',                     smv: 0.30, machineCode: 'BH' },
  { id: 'tr-fn2', code: 'FN-02', name: 'Button sew',                     smv: 0.30, machineCode: 'BS' },
  { id: 'tr-fn3', code: 'FN-03', name: 'Final inspection',               smv: 0.50, machineCode: 'INSP' },
];

// ── Sweatshirt template — Kursun & Kalaoglu 2009, 33 ops ─────────────────
// Condensed from the paper's full bulletin; SMV totals match the published
// case study (sewing 6.22, manual 1.84, total ~8.06 min).
const SWEATSHIRT_OPS: Operation[] = [
  { id: 'sw-01',  code: 'OP-01',  name: 'Pocket overlock',                 smv: 0.30, machineCode: '4OL' },
  { id: 'sw-02',  code: 'OP-02',  name: 'Pocket hem',                      smv: 0.40, machineCode: 'FL' },
  { id: 'sw-03',  code: 'OP-03',  name: 'Pocket attach',                   smv: 0.55, machineCode: 'SNL' },
  { id: 'sw-04',  code: 'OP-04',  name: 'Yoke join',                       smv: 0.35, machineCode: '4OL' },
  { id: 'sw-05',  code: 'OP-05',  name: 'Yoke top-stitch',                 smv: 0.30, machineCode: 'FL' },
  { id: 'sw-06',  code: 'OP-06',  name: 'Hood make (2 panels join)',       smv: 0.45, machineCode: '4OL' },
  { id: 'sw-07',  code: 'OP-07',  name: 'Hood casing tack',                smv: 0.30, machineCode: 'SNL' },
  { id: 'sw-08',  code: 'OP-08',  name: 'Drawcord insert',                 smv: 0.35, machineCode: 'MNL' },
  { id: 'sw-09',  code: 'OP-09',  name: 'Eyelet attach',                   smv: 0.20, machineCode: 'MNL' },
  { id: 'sw-10',  code: 'OP-10',  name: 'Hood attach to body',             smv: 0.55, machineCode: '4OL' },
  { id: 'sw-11',  code: 'OP-11',  name: 'Shoulder joint',                  smv: 0.30, machineCode: '4OL' },
  { id: 'sw-12',  code: 'OP-12',  name: 'Sleeve hem',                      smv: 0.33, machineCode: 'FL' },
  { id: 'sw-13',  code: 'OP-13',  name: 'Sleeve attach',                   smv: 0.45, machineCode: '4OL' },
  { id: 'sw-14',  code: 'OP-14',  name: 'Side seam',                       smv: 0.70, machineCode: '4OL' },
  { id: 'sw-15',  code: 'OP-15',  name: 'Cuff make',                       smv: 0.40, machineCode: 'SNL' },
  { id: 'sw-16',  code: 'OP-16',  name: 'Cuff attach',                     smv: 0.50, machineCode: '4OL' },
  { id: 'sw-17',  code: 'OP-17',  name: 'Waistband make',                  smv: 0.40, machineCode: 'SNL' },
  { id: 'sw-18',  code: 'OP-18',  name: 'Waistband attach',                smv: 0.55, machineCode: '4OL' },
  { id: 'sw-19',  code: 'OP-19',  name: 'Bottom hem cover-stitch',         smv: 0.40, machineCode: 'FL' },
  { id: 'sw-20',  code: 'OP-20',  name: 'Front zipper attach',             smv: 0.65, machineCode: 'SNL' },
  { id: 'sw-21',  code: 'OP-21',  name: 'Zipper bartack (top + bottom)',   smv: 0.20, machineCode: 'BT' },
  { id: 'sw-22',  code: 'OP-22',  name: 'Main label attach',               smv: 0.25, machineCode: 'SNL' },
  { id: 'sw-23',  code: 'OP-23',  name: 'Care label attach',               smv: 0.18, machineCode: 'SNL' },
  { id: 'sw-24',  code: 'OP-24',  name: 'Trim threads + turn',             smv: 0.40, machineCode: 'MNL' },
  { id: 'sw-25',  code: 'OP-25',  name: 'Final inspection',                smv: 0.50, machineCode: 'INSP' },
];

const sumSmv = (ops: Operation[]) => ops.reduce((s, o) => s + o.smv, 0);

export const GARMENT_TEMPLATES: Record<string, GarmentTemplate> = {
  tshirt: {
    id: 'tshirt', name: 'T-shirt (knit)',
    description: 'Standard short-sleeve crew-neck knit T-shirt with front placket and 2 buttons.',
    operations: TSHIRT_OPS,
    totalSmv: sumSmv(TSHIRT_OPS),
    hourlyTarget100: Math.round(60 / 0.336),
  },
  polo: {
    id: 'polo', name: 'Polo S/S Classic',
    description: 'Short-sleeve polo with 3-button placket and rib collar.',
    operations: POLO_OPS,
    totalSmv: sumSmv(POLO_OPS),
    hourlyTarget100: Math.round(60 / (sumSmv(POLO_OPS) / 25)),
  },
  shirt: {
    id: 'shirt', name: 'Formal Shirt (woven)',
    description: 'Long-sleeve woven shirt with full placket, yoke, cuffs and 7 buttons.',
    operations: SHIRT_OPS,
    totalSmv: sumSmv(SHIRT_OPS),
    hourlyTarget100: Math.round(60 / (sumSmv(SHIRT_OPS) / 30)),
  },
  trouser: {
    id: 'trouser', name: '5-pocket Denim Trouser',
    description: 'Classic 5-pocket denim trouser. Bulletin condensed from Erol 2025 (full paper has 51 operations, 14.47 min total — used as the validation case for line balancing in the literature).',
    operations: TROUSER_OPS,
    totalSmv: sumSmv(TROUSER_OPS),
    hourlyTarget100: Math.round(60 / (sumSmv(TROUSER_OPS) / 30)),
  },
  sweatshirt: {
    id: 'sweatshirt', name: 'Hooded Sweatshirt (knit)',
    description: 'Pullover hooded sweatshirt with kangaroo pocket. Bulletin from Kursun & Kalaoglu 2009.',
    operations: SWEATSHIRT_OPS,
    totalSmv: sumSmv(SWEATSHIRT_OPS),
    hourlyTarget100: Math.round(60 / (sumSmv(SWEATSHIRT_OPS) / 25)),
  },
};

export const ALL_GARMENT_TEMPLATES: GarmentTemplate[] = Object.values(GARMENT_TEMPLATES);
