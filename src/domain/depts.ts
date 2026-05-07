/**
 * Department-interior domain — machine catalogue, sub-operations, and the
 * floor-plan registry consumed by the level-2 (DeptInterior) and level-3
 * (WorkstationDetail) drill-down screens.
 *
 * Ported verbatim from .design-import/sw/sw-screens-dept.jsx (top of file:
 * SW_MACHINE_CATALOG, SW_SUBOPS, SW_DEPARTMENTS).
 *
 * Renamed to DEPT_* to coexist with the legacy `machines.ts` catalogue —
 * the apparel-IE catalog there uses different codes (SNL, 4OL, …) and a
 * different shape; these depts catalogue items use the cycleS / defectPct /
 * costHr / power shape the dept screen expects.
 */
import { SW_COLORS } from '../design/tokens';

// ============================================================================
// Machine catalogue
// ============================================================================
export type DeptMachineCategory = 'spread' | 'cut' | 'sew' | 'qc' | 'press';

export type DeptMachineId =
  | 'spread_table'
  | 'auto_spreader'
  | 'cut_table'
  | 'straight_knife'
  | 'band_knife'
  | 'cnc_cutter'
  | 'ssm'
  | 'overlock'
  | 'flatlock'
  | 'bartack'
  | 'buttonhole'
  | 'buttonsew'
  | 'feed_off_arm'
  | 'qc_table'
  | 'metal_detect'
  | 'press_table'
  | 'steam_iron';

/** Friendly aliases for the brief's requested names. */
export type MachineId = DeptMachineId;

export interface DeptMachineSpec {
  id: DeptMachineId;
  label: string;
  icon: string;
  cat: DeptMachineCategory;
  /** [min, max] cycle time in seconds. */
  cycleS: [number, number];
  /** Defect % (0-100, typically <1). */
  defectPct: number;
  /** Hourly cost in USD. */
  costHr: number;
  /** Continuous draw in kW. */
  power: number;
}

/** Friendly alias for the brief's requested name. */
export type MachineSpec = DeptMachineSpec;

export const DEPT_MACHINE_CATALOG: Record<DeptMachineId, DeptMachineSpec> = {
  // Spreading
  spread_table:   { id:'spread_table',   label:'Spread Table',        icon:'≡', cat:'spread', cycleS:[35,75],   defectPct:0.4, costHr:7,  power:1.2 },
  auto_spreader:  { id:'auto_spreader',  label:'Auto Spreader',       icon:'⇉', cat:'spread', cycleS:[18,30],   defectPct:0.2, costHr:14, power:3.5 },
  // Cutting
  cut_table:      { id:'cut_table',      label:'Cutting Table',       icon:'─', cat:'cut',    cycleS:[40,90],   defectPct:0.5, costHr:8,  power:0.6 },
  straight_knife: { id:'straight_knife', label:'Straight Knife',      icon:'⫻', cat:'cut',    cycleS:[40,80],   defectPct:0.6, costHr:9,  power:1.4 },
  band_knife:     { id:'band_knife',     label:'Band Knife',          icon:'⋮', cat:'cut',    cycleS:[30,55],   defectPct:0.4, costHr:10, power:2.1 },
  cnc_cutter:     { id:'cnc_cutter',     label:'CNC Auto Cutter',     icon:'◇', cat:'cut',    cycleS:[12,22],   defectPct:0.15,costHr:22, power:5.0 },
  // Sewing
  ssm:            { id:'ssm',            label:'Single-Needle Lock',  icon:'⌃', cat:'sew',    cycleS:[20,50],   defectPct:0.8, costHr:8,  power:0.4 },
  overlock:       { id:'overlock',       label:'4-Thread Overlock',   icon:'⤴', cat:'sew',    cycleS:[18,36],   defectPct:0.7, costHr:9,  power:0.5 },
  flatlock:       { id:'flatlock',       label:'Flatlock',            icon:'≣', cat:'sew',    cycleS:[22,40],   defectPct:0.7, costHr:9,  power:0.55 },
  bartack:        { id:'bartack',        label:'Bartack',             icon:'∥', cat:'sew',    cycleS:[8,16],    defectPct:0.5, costHr:10, power:0.6 },
  buttonhole:     { id:'buttonhole',     label:'Buttonhole',          icon:'◉', cat:'sew',    cycleS:[10,18],   defectPct:0.4, costHr:11, power:0.55 },
  buttonsew:      { id:'buttonsew',      label:'Button Sew',          icon:'•', cat:'sew',    cycleS:[6,12],    defectPct:0.3, costHr:10, power:0.5 },
  feed_off_arm:   { id:'feed_off_arm',   label:'Feed-off-the-Arm',    icon:'⌒', cat:'sew',    cycleS:[24,42],   defectPct:0.6, costHr:11, power:0.6 },
  // QC
  qc_table:       { id:'qc_table',       label:'QC Inspection Table', icon:'◎', cat:'qc',     cycleS:[22,40],   defectPct:0,   costHr:9,  power:0.15 },
  metal_detect:   { id:'metal_detect',   label:'Metal Detector',      icon:'⊜', cat:'qc',     cycleS:[5,10],    defectPct:0,   costHr:7,  power:0.4 },
  // Press / finishing
  press_table:    { id:'press_table',    label:'Pressing Table',      icon:'▤', cat:'press',  cycleS:[28,50],   defectPct:0.2, costHr:7,  power:1.8 },
  steam_iron:     { id:'steam_iron',     label:'Steam Iron',          icon:'◆', cat:'press',  cycleS:[18,32],   defectPct:0.2, costHr:7,  power:2.2 },
};

// ============================================================================
// Sub-operations per department
// ============================================================================
export type SubopId = string;

export interface Subop {
  id: SubopId;
  label: string;
  /** Required skill level 1-5. */
  skill: number;
  /** Default machine type for this sub-op. */
  mach: DeptMachineId;
}

/**
 * Sub-ops keyed by department id. The "sew_a"/"sew_b" duplication is
 * intentional and preserved verbatim from the prototype.
 */
export const DEPT_SUBOPS: Record<string, Subop[]> = {
  spread: [
    { id:'lay_fabric',   label:'Lay fabric',         skill:2, mach:'spread_table' },
    { id:'align_edges',  label:'Align edges',        skill:3, mach:'spread_table' },
    { id:'mark_plies',   label:'Mark plies',         skill:3, mach:'spread_table' },
    { id:'auto_spread',  label:'Auto spread run',    skill:2, mach:'auto_spreader' },
  ],
  cut: [
    { id:'place_marker', label:'Place marker',       skill:2, mach:'cut_table' },
    { id:'rough_cut',    label:'Rough cut',          skill:3, mach:'straight_knife' },
    { id:'finish_cut',   label:'Finish cut',         skill:4, mach:'band_knife' },
    { id:'cnc_run',      label:'CNC cut run',        skill:3, mach:'cnc_cutter' },
    { id:'bundle',       label:'Bundle pieces',      skill:1, mach:'cut_table' },
  ],
  sew_a: [
    { id:'serge_panels', label:'Serge front/back',   skill:3, mach:'overlock' },
    { id:'shoulder',     label:'Join shoulder',      skill:3, mach:'ssm' },
    { id:'attach_collar',label:'Attach collar',      skill:4, mach:'ssm' },
    { id:'set_sleeve',   label:'Set sleeve',         skill:5, mach:'ssm' },
    { id:'side_seam',    label:'Side seam',          skill:3, mach:'overlock' },
    { id:'hem_bottom',   label:'Hem bottom',         skill:3, mach:'flatlock' },
    { id:'attach_pocket',label:'Attach pocket',      skill:4, mach:'ssm' },
    { id:'buttonhole_op',label:'Buttonhole',         skill:4, mach:'buttonhole' },
    { id:'attach_button',label:'Attach button',      skill:2, mach:'buttonsew' },
    { id:'bartack_op',   label:'Bartack stress pts', skill:3, mach:'bartack' },
  ],
  sew_b: [
    { id:'serge_panels', label:'Serge front/back',   skill:3, mach:'overlock' },
    { id:'shoulder',     label:'Join shoulder',      skill:3, mach:'ssm' },
    { id:'attach_collar',label:'Attach collar',      skill:4, mach:'ssm' },
    { id:'set_sleeve',   label:'Set sleeve',         skill:5, mach:'ssm' },
    { id:'side_seam',    label:'Side seam',          skill:3, mach:'overlock' },
    { id:'hem_bottom',   label:'Hem bottom',         skill:3, mach:'flatlock' },
    { id:'attach_pocket',label:'Attach pocket',      skill:4, mach:'ssm' },
    { id:'buttonhole_op',label:'Buttonhole',         skill:4, mach:'buttonhole' },
    { id:'attach_button',label:'Attach button',      skill:2, mach:'buttonsew' },
  ],
  qc: [
    { id:'visual_inspect',label:'Visual inspect',    skill:3, mach:'qc_table' },
    { id:'measure_check', label:'Measure check',     skill:4, mach:'qc_table' },
    { id:'metal_scan',    label:'Metal scan',        skill:1, mach:'metal_detect' },
    { id:'tag_pack',      label:'Tag & flag',        skill:2, mach:'qc_table' },
  ],
};

// ============================================================================
// Department registry
// ============================================================================
export type DeptId =
  | 'spread'
  | 'cut'
  | 'sew_a'
  | 'sew_b'
  | 'qc'
  | 'fabric'
  | 'bundle'
  | 'press'
  | 'pack'
  | 'dispatch';

export interface Dept {
  id: DeptId;
  label: string;
  /** Background tint for plan view (hero depts only). */
  color?: string;
  /** Outline / accent stroke. */
  stroke: string;
  /** Floor-plan grid size for the interior layout. */
  grid?: { w: number; h: number };
  /** Hero depts have a fully built interior; others render a stub. */
  hero: boolean;
}

export const DEPT_LAYOUT: Record<DeptId, Dept> = {
  spread: {
    id:'spread', label:'SPREADING',     color:'#FFF1B8', stroke:'#E5A300',
    grid:{ w:18, h:10 }, hero: true,
  },
  cut: {
    id:'cut', label:'CUTTING',          color:'#D7F5E5', stroke:'#1FB36B',
    grid:{ w:18, h:10 }, hero: true,
  },
  sew_a: {
    id:'sew_a', label:'SEWING LINE A',  color:'#D6E2FF', stroke:'#4F7CFF',
    grid:{ w:24, h:12 }, hero: true,
  },
  sew_b: {
    id:'sew_b', label:'SEWING LINE B',  color:'#D6E2FF', stroke:'#4F7CFF',
    grid:{ w:24, h:12 }, hero: true,
  },
  qc: {
    id:'qc', label:'INLINE QC',         color:'#FFD7DD', stroke:'#C73E5F',
    grid:{ w:14, h:8 }, hero: true,
  },
  // Non-hero — stubs
  fabric:   { id:'fabric',   label:'FABRIC RECEIVING', stroke:'#FF5B26', hero:false },
  bundle:   { id:'bundle',   label:'BUNDLING',         stroke:'#8B5CF6', hero:false },
  press:    { id:'press',    label:'PRESSING',         stroke:'#E74C3C', hero:false },
  pack:     { id:'pack',     label:'PACKING',          stroke:'#0EA5A4', hero:false },
  dispatch: { id:'dispatch', label:'DISPATCH',         stroke:'#2A3340', hero:false },
};

// Mark SW_COLORS as a dependency to keep the import alive when the
// catalogue grows palette-driven members later. (No-op for tree-shaking.)
void SW_COLORS;
