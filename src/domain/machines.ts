/**
 * Machine catalog — the apparel-industry-standard machine types Stitchworks
 * ships with. Codes match the industry shorthand used on operation bulletins
 * (SNL, 4OL, FL, BH, etc.) so SMV sheets paste cleanly into the system.
 *
 * Each machine has a category (drives layout colouring), a footprint (cells
 * on the layout grid), procurement cost, power draw, and a default speed
 * class. Costs/powers are typical mid-range values, not specific quotes.
 */

import { SW_COLORS } from '../design/tokens';

export type MachineCategory =
  | 'sewing'
  | 'cutting'
  | 'spreading'
  | 'pressing'
  | 'embroidery'
  | 'fusing'
  | 'inspection'
  | 'manual';

/**
 * Industry-standard codes from the operation-bulletin tradition. New machine
 * types can be added by extending this union and the catalog below.
 */
export type MachineCode =
  | 'SNL'    // Single Needle Lockstitch
  | 'DNL'    // Double Needle Lockstitch
  | '4OL'    // 4-thread Overlock
  | '5OL'    // 5-thread Overlock (safety stitch)
  | 'FL'     // Flatlock / coverstitch
  | 'FB'     // Feed-of-the-arm flat bed
  | 'KS'     // Kansai Special (multi-needle chain stitch)
  | 'BH'     // Buttonhole
  | 'BS'     // Button Sew / button stitcher
  | 'BT'     // Bartack
  | 'EMB'    // Embroidery
  | 'CUT'    // Cutting (straight knife / band knife)
  | 'CAD'    // CAD-driven auto cutter
  | 'SPR'    // Fabric spreader
  | 'FUSE'   // Fusing press
  | 'PRESS'  // Pressing / iron station
  | 'STEAM'  // Steam tunnel
  | 'INSP'   // Inspection table (light / lens)
  | 'MNL';   // Manual / no machine (helpers, trim, button push)

export interface MachineSpec {
  code: MachineCode;
  category: MachineCategory;
  label: string;
  /** Compact label for chips and palette tiles. */
  shortName: string;
  description: string;
  /** Single glyph used by the layout builder palette. */
  icon: string;
  /** Token-friendly accent colour. */
  color: string;
  /** Typical procurement cost in USD. Mid-range new condition. */
  costUsd: number;
  /** Typical power draw in kW. */
  powerKw: number;
  /** Layout-grid footprint, in cells. */
  footprintCells: { w: number; h: number };
  /** Relative speed for the same family of operations. */
  speedClass?: 'low' | 'mid' | 'high';
  /** Common OEMs Stitchworks recognises in the catalog. */
  brands?: string[];
  /** True when the "machine" is a person-only manual operation. */
  isManual?: boolean;
}

export const MACHINE_CATALOG: Record<MachineCode, MachineSpec> = {
  SNL: {
    code: 'SNL', category: 'sewing', label: 'Single Needle Lockstitch', shortName: 'SNL',
    description: 'General-purpose sewing machine. Lockstitch, one needle. The workhorse.',
    icon: '⌃', color: SW_COLORS.brand, costUsd: 1200, powerKw: 0.6,
    footprintCells: { w: 1, h: 1 }, speedClass: 'mid',
    brands: ['Juki', 'Brother', 'Singer', 'Pegasus'],
  },
  DNL: {
    code: 'DNL', category: 'sewing', label: 'Double Needle Lockstitch', shortName: 'DNL',
    description: 'Two parallel rows of lockstitch. Used on hems, jeans, and decorative top-stitching.',
    icon: '⌃⌃', color: SW_COLORS.brand, costUsd: 1800, powerKw: 0.7,
    footprintCells: { w: 1, h: 1 }, speedClass: 'mid',
    brands: ['Juki', 'Brother'],
  },
  '4OL': {
    code: '4OL', category: 'sewing', label: '4-thread Overlock', shortName: '4-OL',
    description: 'Edge-finish + seam in one pass. Knit garment seam workhorse.',
    icon: '≋', color: SW_COLORS.bobbin, costUsd: 1600, powerKw: 0.7,
    footprintCells: { w: 1, h: 1 }, speedClass: 'high',
    brands: ['Pegasus', 'Yamato', 'Juki'],
  },
  '5OL': {
    code: '5OL', category: 'sewing', label: '5-thread Safety Stitch Overlock', shortName: '5-OL',
    description: 'Overlock + chain stitch in parallel. Stronger seams for woven side seams.',
    icon: '≋⏐', color: SW_COLORS.bobbin, costUsd: 2100, powerKw: 0.7,
    footprintCells: { w: 1, h: 1 }, speedClass: 'high',
    brands: ['Pegasus', 'Yamato'],
  },
  FL: {
    code: 'FL', category: 'sewing', label: 'Flatlock / Coverstitch', shortName: 'FL',
    description: 'Decorative top-stitch covering raw edges. Necks, hems, sleeve openings.',
    icon: '⤴', color: SW_COLORS.bobbin, costUsd: 2200, powerKw: 0.8,
    footprintCells: { w: 1, h: 1 }, speedClass: 'mid',
    brands: ['Yamato', 'Kansai', 'Pegasus'],
  },
  FB: {
    code: 'FB', category: 'sewing', label: 'Feed-of-the-arm', shortName: 'FB',
    description: 'Cylindrical bed for tubular work — sleeve underseams, side seams on jeans.',
    icon: '◐', color: SW_COLORS.bobbin, costUsd: 2400, powerKw: 0.7,
    footprintCells: { w: 1, h: 1 }, speedClass: 'mid',
    brands: ['Union Special', 'Juki'],
  },
  KS: {
    code: 'KS', category: 'sewing', label: 'Kansai Special (multi-needle)', shortName: 'KS',
    description: 'Multi-needle chain stitch for waistbands, decorative rows.',
    icon: '⩩', color: SW_COLORS.trim, costUsd: 3200, powerKw: 0.9,
    footprintCells: { w: 1, h: 1 }, speedClass: 'mid',
    brands: ['Kansai Special'],
  },
  BH: {
    code: 'BH', category: 'sewing', label: 'Buttonhole Machine', shortName: 'BH',
    description: 'Cuts and stitches buttonholes. Straight or eyelet variants.',
    icon: '◉', color: SW_COLORS.trim, costUsd: 2400, powerKw: 0.5,
    footprintCells: { w: 1, h: 1 }, speedClass: 'low',
    brands: ['Juki', 'Brother', 'Reece'],
  },
  BS: {
    code: 'BS', category: 'sewing', label: 'Button Sewing Machine', shortName: 'BS',
    description: 'Sews buttons. Programmable stitch pattern.',
    icon: '⊙', color: SW_COLORS.trim, costUsd: 1800, powerKw: 0.5,
    footprintCells: { w: 1, h: 1 }, speedClass: 'low',
    brands: ['Juki', 'Brother'],
  },
  BT: {
    code: 'BT', category: 'sewing', label: 'Bartack Machine', shortName: 'BT',
    description: 'Reinforcement tacks at stress points (pockets, fly).',
    icon: '✕', color: SW_COLORS.trim, costUsd: 2200, powerKw: 0.5,
    footprintCells: { w: 1, h: 1 }, speedClass: 'low',
    brands: ['Juki', 'Brother'],
  },
  EMB: {
    code: 'EMB', category: 'embroidery', label: 'Embroidery Machine', shortName: 'EMB',
    description: 'Multi-head embroidery. Logos, decorative stitching.',
    icon: '✿', color: SW_COLORS.trim, costUsd: 18000, powerKw: 1.5,
    footprintCells: { w: 2, h: 2 }, speedClass: 'mid',
    brands: ['Tajima', 'Barudan', 'Brother'],
  },
  CUT: {
    code: 'CUT', category: 'cutting', label: 'Straight Knife Cutter', shortName: 'Cut',
    description: 'Hand-pushed straight knife on a spread of fabric.',
    icon: '✂', color: SW_COLORS.press, costUsd: 1400, powerKw: 0.7,
    footprintCells: { w: 1, h: 1 }, speedClass: 'mid',
    brands: ['Eastman', 'KM'],
  },
  CAD: {
    code: 'CAD', category: 'cutting', label: 'CAD Auto Cutter', shortName: 'CAD',
    description: 'CNC-driven cutting head. Pattern from CAD, cuts accurately at scale.',
    icon: '◈', color: SW_COLORS.press, costUsd: 95000, powerKw: 9,
    footprintCells: { w: 4, h: 2 }, speedClass: 'high',
    brands: ['Lectra', 'Gerber', 'Bullmer'],
  },
  SPR: {
    code: 'SPR', category: 'spreading', label: 'Fabric Spreader', shortName: 'Spr',
    description: 'Lays multiple fabric layers flat for cutting.',
    icon: '≡', color: SW_COLORS.fabric, costUsd: 8000, powerKw: 1.2,
    footprintCells: { w: 4, h: 1 }, speedClass: 'mid',
    brands: ['Lectra', 'Gerber'],
  },
  FUSE: {
    code: 'FUSE', category: 'fusing', label: 'Fusing Press', shortName: 'Fuse',
    description: 'Heat-fuses interlining onto collar / cuff / placket pieces.',
    icon: '▦', color: SW_COLORS.press, costUsd: 9000, powerKw: 4,
    footprintCells: { w: 2, h: 1 }, speedClass: 'mid',
    brands: ['Hashima', 'Veit'],
  },
  PRESS: {
    code: 'PRESS', category: 'pressing', label: 'Pressing Table / Iron', shortName: 'Press',
    description: 'Steam iron station for inter-process and final pressing.',
    icon: '▭', color: SW_COLORS.thread, costUsd: 1600, powerKw: 2.5,
    footprintCells: { w: 1, h: 1 }, speedClass: 'mid',
    brands: ['Veit', 'Naomoto'],
  },
  STEAM: {
    code: 'STEAM', category: 'pressing', label: 'Steam Tunnel', shortName: 'Steam',
    description: 'Continuous-feed steamer for relax-pressing. High throughput.',
    icon: '〜', color: SW_COLORS.thread, costUsd: 14000, powerKw: 12,
    footprintCells: { w: 4, h: 2 }, speedClass: 'high',
    brands: ['Veit', 'Sankosha'],
  },
  INSP: {
    code: 'INSP', category: 'inspection', label: 'Inspection Table', shortName: 'Insp',
    description: 'Light table for in-line / final visual inspection.',
    icon: '◎', color: SW_COLORS.steel, costUsd: 800, powerKw: 0.2,
    footprintCells: { w: 1, h: 1 },
  },
  MNL: {
    code: 'MNL', category: 'manual', label: 'Manual (no machine)', shortName: 'Manual',
    description: 'Person-only operation: trim threads, button push, pair-match, label cut.',
    icon: '✋', color: SW_COLORS.muted, costUsd: 0, powerKw: 0,
    footprintCells: { w: 1, h: 1 }, isManual: true,
  },
};

export const ALL_MACHINES: MachineSpec[] = Object.values(MACHINE_CATALOG);
