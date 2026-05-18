/**
 * Apparel-named block presets — the non-engineer-facing vocabulary for the
 * BLOCKS palette and the Inspector. Each preset wraps one underlying
 * `PmlBlockKind` with an apparel-domain label, blurb, and grouping, and
 * optionally a set of default parameters that get stamped onto the
 * workstation at drop time.
 *
 * Architecture: this module is the v1 alternative to exposing raw PML
 * vocabulary in the UI. The palette renders these presets; the inspector
 * looks up the apparel label via `apparelLabelForKind()`; the code-view
 * uses the same label as the friendly comment on each emitted block.
 *
 * The schema underneath is unchanged — every preset still maps to a
 * standard `PmlBlockKind`, so the simulation engine + persistence layer
 * don't have to know presets exist. Add a new preset = one entry here +
 * (optionally) a default-param record. No engine, store, or schema work.
 *
 * Pure data + pure logic. No React, no DOM, no zustand.
 */

import type { PmlBlockKind, PmlBlockParams } from './pml';

// ============================================================================
// APPAREL BLOCK GROUPS — palette-grouping in apparel terms
// ============================================================================
//
// These are the LEFT-RAIL palette groups the user sees in the BLOCKS tab.
// Distinct from `APPAREL_CATEGORIES` in iso.ts which groups physical
// fixtures (sewing machines, cutting tables) — these group abstract
// block concepts (sources of flow, stations, buffers, etc.).

export type ApparelBlockGroupId =
  | 'flow'      // BundleSource, ShippedGoods
  | 'station'   // OperationStation, OperatorSeize, OperatorRelease
  | 'buffer'    // BundleBuffer, CureTime, ShiftHold, WaitGate
  | 'routing'   // InspectionGate, SizeRouter
  | 'resource'  // OperatorPool, MachinePool
  | 'batching'  // BundleBatcher, BundleSplitter, PartJoiner, PartMatcher, GarmentAssembler, LayoutSplit
  | 'movement'; // BundleTransport, BundleConveyor

export interface ApparelBlockGroup {
  id: ApparelBlockGroupId;
  label: string;
  blurb: string;
}

/** Display order matches the typical apparel-line reading order. */
export const APPAREL_BLOCK_GROUPS: ApparelBlockGroup[] = [
  { id: 'flow',     label: 'Flow',     blurb: 'Where bundles enter and leave the factory.' },
  { id: 'station',  label: 'Stations', blurb: 'Sewing / iron / pack ops that consume operator + machine time.' },
  { id: 'buffer',   label: 'Buffers',  blurb: 'WIP racks, cure times, shift holds — no operator needed.' },
  { id: 'routing',  label: 'Routing',  blurb: 'Inspection gates, size routers — split the flow on a rule.' },
  { id: 'resource', label: 'Resources',blurb: 'Operator and machine pools that stations draw from.' },
  { id: 'batching', label: 'Bundling', blurb: 'Make bundles, split them, assemble parts into garments.' },
  { id: 'movement', label: 'Movement', blurb: 'Conveyors, trolleys, runners between stations.' },
];

// ============================================================================
// APPAREL BLOCK PRESETS
// ============================================================================

/** Stable id for one preset, persistable to workstation metadata. */
export type ApparelPresetId =
  | 'bundleSource'
  | 'shippedGoods'
  | 'operationStation'
  | 'operatorSeize'
  | 'operatorRelease'
  | 'bundleBuffer'
  | 'cureTime'
  | 'shiftHold'
  | 'waitGate'
  | 'inspectionGate'
  | 'sizeRouter'
  | 'operatorPool'
  | 'machinePool'
  | 'bundleBatcher'
  | 'bundleSplitter'
  | 'partJoiner'
  | 'partMatcher'
  | 'garmentAssembler'
  | 'layoutSplit'
  | 'bundleTransport'
  | 'bundleConveyor';

export interface ApparelBlockPreset {
  id: ApparelPresetId;
  /** Apparel-friendly label shown in the palette and the inspector header. */
  label: string;
  /** One-sentence plain-language description for tooltip + palette card. */
  blurb: string;
  /** Underlying PML block kind. The simulation engine + schema only see this. */
  baseKind: PmlBlockKind;
  /** Palette grouping. */
  group: ApparelBlockGroupId;
  /** Default authored parameters stamped onto the workstation at drop time.
   *  Only the fields meaningful to `baseKind` matter; others are ignored. */
  defaultParams?: Partial<PmlBlockParams>;
  /** Optional sub-blurb shown when the preset is selected — explains a
   *  typical use, e.g. "Cutting room emits one bundle every 2 minutes." */
  example?: string;
}

/**
 * Preset library. Order within the array drives palette display order
 * within each group. New presets append; do not reorder without checking
 * any persisted user data that may reference these ids by position.
 */
export const APPAREL_BLOCK_PRESETS: ApparelBlockPreset[] = [
  // ── Flow ────────────────────────────────────────────────────────────────
  {
    id: 'bundleSource',
    label: 'Bundle source',
    blurb: 'Where bundles enter the floor — typically the cutting room.',
    baseKind: 'Source',
    group: 'flow',
    defaultParams: { sourceRatePerHr: 30, piecesPerAgent: 20 },
    example: '30 bundles/hr · 20 pieces per bundle. Tune to match takt time.',
  },
  {
    id: 'shippedGoods',
    label: 'Shipped goods',
    blurb: 'End of the line — bundles leave the floor (or scrap pile).',
    baseKind: 'Sink',
    group: 'flow',
  },

  // ── Stations ────────────────────────────────────────────────────────────
  {
    id: 'operationStation',
    label: 'Operation station',
    blurb: 'One sewing / iron / pack op. Uses an operator + a machine for one cycle.',
    baseKind: 'Service',
    group: 'station',
    defaultParams: { cycleS: 30, servers: 1 },
    example: 'Default: 30 sec per piece, 1 server. Pick a real op to auto-fill the cycle.',
  },
  {
    id: 'operatorSeize',
    label: 'Take operator',
    blurb: 'Claim an operator from a pool — useful when an op spans two stations.',
    baseKind: 'Seize',
    group: 'station',
  },
  {
    id: 'operatorRelease',
    label: 'Release operator',
    blurb: 'Return a previously-claimed operator to the pool.',
    baseKind: 'Release',
    group: 'station',
  },

  // ── Buffers ─────────────────────────────────────────────────────────────
  {
    id: 'bundleBuffer',
    label: 'Bundle buffer',
    blurb: 'WIP rack between stations — bundles wait here in arrival order.',
    baseKind: 'Queue',
    group: 'buffer',
    defaultParams: { queueCapacity: 0 },
    example: 'Set capacity = 0 for unlimited; or e.g. 10 to model a small rack.',
  },
  {
    id: 'cureTime',
    label: 'Cure / set time',
    blurb: 'Untimed wait — fusing cure, dye-set — no operator needed.',
    baseKind: 'Delay',
    group: 'buffer',
    defaultParams: { cycleS: 60 },
  },
  {
    id: 'shiftHold',
    label: 'Shift / line hold',
    blurb: 'Stop the line on a rule (shift change, lunch break, line stop).',
    baseKind: 'Hold',
    group: 'buffer',
  },
  {
    id: 'waitGate',
    label: 'Wait gate',
    blurb: 'Park a bundle until released by an external trigger.',
    baseKind: 'Wait',
    group: 'buffer',
  },

  // ── Routing ─────────────────────────────────────────────────────────────
  {
    id: 'inspectionGate',
    label: 'Inspection gate',
    blurb: 'QC point — bundles route to pass or fail based on a rate.',
    baseKind: 'SelectOutput',
    group: 'routing',
    defaultParams: { passProb: 0.95 },
    example: 'Default 95% pass. Tune for your line\'s defect rate.',
  },
  {
    id: 'sizeRouter',
    label: 'Size router',
    blurb: '5-way split by size — S / M / L / XL / XXL packing lanes.',
    baseKind: 'SelectOutput5',
    group: 'routing',
  },

  // ── Resources ───────────────────────────────────────────────────────────
  {
    id: 'operatorPool',
    label: 'Operator pool',
    blurb: 'A team of operators that stations draw from.',
    baseKind: 'ResourcePool',
    group: 'resource',
    defaultParams: { capacity: 8 },
    example: '8 operators by default. Match your real line head-count.',
  },
  {
    id: 'machinePool',
    label: 'Machine pool',
    blurb: 'A bank of identical machines shared across stations.',
    baseKind: 'ResourcePool',
    group: 'resource',
    defaultParams: { capacity: 4 },
    example: '4 machines by default — useful for shared specials (e.g. button-hole).',
  },

  // ── Bundling / Batching ─────────────────────────────────────────────────
  {
    id: 'bundleBatcher',
    label: 'Bundle batcher',
    blurb: 'Collect N cut pieces into one bundle agent.',
    baseKind: 'Batch',
    group: 'batching',
    defaultParams: { batchSize: 20 },
    example: '20 pieces per bundle by default.',
  },
  {
    id: 'bundleSplitter',
    label: 'Bundle splitter',
    blurb: 'Release a bundle\'s pieces one-by-one (bundle → individual garments).',
    baseKind: 'Unbatch',
    group: 'batching',
  },
  {
    id: 'partJoiner',
    label: 'Part joiner',
    blurb: 'Merge two streams (e.g. body + sleeves) into a single garment.',
    baseKind: 'Combine',
    group: 'batching',
  },
  {
    id: 'partMatcher',
    label: 'Part matcher',
    blurb: 'Pair parts from two streams by a key (size, colour).',
    baseKind: 'Match',
    group: 'batching',
  },
  {
    id: 'garmentAssembler',
    label: 'Garment assembler',
    blurb: 'Fixed-recipe assembly (body + sleeves + collar → garment).',
    baseKind: 'Assembler',
    group: 'batching',
  },
  {
    id: 'layoutSplit',
    label: 'Layout split',
    blurb: 'One cut ply produces N panel agents (front, back, sleeves…).',
    baseKind: 'Split',
    group: 'batching',
  },

  // ── Movement ────────────────────────────────────────────────────────────
  {
    id: 'bundleTransport',
    label: 'Bundle transport',
    blurb: 'A runner / trolley moves a bundle to a target station.',
    baseKind: 'MoveTo',
    group: 'movement',
    defaultParams: { cycleS: 15 },
  },
  {
    id: 'bundleConveyor',
    label: 'Bundle conveyor',
    blurb: 'Continuous belt — fixed length and speed, FIFO order.',
    baseKind: 'Conveyor',
    group: 'movement',
    defaultParams: { cycleS: 10 },
  },
];

// ============================================================================
// HELPERS
// ============================================================================

/** Apparel-friendly label for a given PML kind. When multiple presets share
 *  a kind (Source, ResourcePool), returns the *first* one — the canonical
 *  apparel name for that primitive. Inspector and code-view both call this. */
export function apparelLabelForKind(kind: PmlBlockKind): string {
  const preset = APPAREL_BLOCK_PRESETS.find((p) => p.baseKind === kind);
  return preset?.label ?? kind;
}

/** Apparel group id for a given PML kind. */
export function apparelGroupForKind(kind: PmlBlockKind): ApparelBlockGroupId {
  const preset = APPAREL_BLOCK_PRESETS.find((p) => p.baseKind === kind);
  return preset?.group ?? 'station';
}

/** All presets within one apparel group, in declaration order. */
export function apparelPresetsInGroup(group: ApparelBlockGroupId): ApparelBlockPreset[] {
  return APPAREL_BLOCK_PRESETS.filter((p) => p.group === group);
}

/** Resolve a preset by id, or null when the id is unknown / stale. */
export function findApparelPreset(id: ApparelPresetId): ApparelBlockPreset | null {
  return APPAREL_BLOCK_PRESETS.find((p) => p.id === id) ?? null;
}
