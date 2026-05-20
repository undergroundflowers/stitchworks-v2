/**
 * Domain layer — apparel-specific data, types, and pure logic. No React,
 * no UI. Everything in this folder is consumable by the simulation engine,
 * the page components, and (later) by the project file format.
 *
 * Read order for new contributors:
 *   1. machines.ts   — what physical equipment exists
 *   2. workers.ts    — who works on it
 *   3. operations.ts — what they do, with SMVs
 *   4. garments.ts   — pre-baked operation bulletins for T-shirt / polo / shirt / trouser
 *   5. routings.ts   — production-system options (PBS / modular / UPS / …)
 *   6. kpi.ts        — the formulas that turn run output into IE-friendly KPIs
 *   7. palette.ts    — the AnyLogic-style apparel palette catalog (UI-facing)
 *   8. depts.ts      — drill-down department catalogue (level-2/3 screens)
 *   9. iso.ts        — isometric fixture catalogue + seeded layouts (Iso Builder)
 */

export * from './machines';
export * from './workers';
export * from './operations';
export * from './garments';
export * from './routings';
export * from './kpi';
export * from './balance-advisor';
export * from './palette';
export * from './iso';

// Department drill-down catalogue. Some type names overlap with the
// IE-flavoured machines.ts (MachineSpec / MachineCategory), so we re-export
// values + the unique types explicitly and keep the dept-prefixed variants
// available too.
export {
  DEPT_MACHINE_CATALOG,
  DEPT_SUBOPS,
  DEPT_LAYOUT,
} from './depts';
export type {
  DeptId,
  DeptMachineId,
  DeptMachineSpec,
  DeptMachineCategory,
  Dept,
  Subop,
  SubopId,
} from './depts';
