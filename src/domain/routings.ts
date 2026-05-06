/**
 * Production system definitions — the canonical 9 ways to organise a sewing
 * line in apparel manufacturing. Each system has its own batch size, line
 * length, WIP profile, and use case. Stitchworks lets users pick a system
 * for a given order; the simulation engine routes bundles accordingly.
 */

export type ProductionSystem =
  | 'PBS'           // Progressive Bundle System
  | 'modular'       // Modular / Toyota Sewing System (TSS)
  | 'UPS'           // Unit Production System (overhead conveyor)
  | 'make_through'  // Make-Through (one operator makes one whole garment)
  | 'straight'      // Straight line (operator-per-operation, no batching)
  | 'synchro'       // Synchronised (paced, takt-driven)
  | 'clump'         // Clump system (small groups of helpers around senior op)
  | 'bundle'        // Generic bundle system (less progressive than PBS)
  | 'unit_handle';  // Unit Handle System (large piecework batches)

export interface ProductionSystemDef {
  id: ProductionSystem;
  label: string;
  short: string;
  description: string;
  /** Typical bundle size (pieces per ticket / operator hand-off). */
  typicalBatchSize: number;
  /** Typical operators per line for a 8.5-min SMV garment. */
  typicalLineSize: number;
  /** Typical WIP per line (pieces in flight). */
  typicalWipPieces: number;
  /** Typical setup time when changing styles (minutes). */
  changeoverMin: number;
  /** Strengths the system is famous for. */
  strengths: string[];
  /** Where this system tends to underperform. */
  weaknesses: string[];
  /** When Stitchworks would recommend this system. */
  bestFor: string;
}

export const PRODUCTION_SYSTEMS: Record<ProductionSystem, ProductionSystemDef> = {
  PBS: {
    id: 'PBS', label: 'Progressive Bundle System', short: 'PBS',
    description: 'Cut pieces are tied into bundles of N (often 30) and progress through a fixed line, one operator per operation. Bundles wait at each station.',
    typicalBatchSize: 30, typicalLineSize: 25, typicalWipPieces: 600, changeoverMin: 90,
    strengths: ['Predictable output', 'Low operator skill range needed', 'Easy to manage', 'Strong for high-volume basics'],
    weaknesses: ['High WIP', 'Long lead time', 'Bottlenecks accumulate WIP visibly', 'Slow to absorb absenteeism'],
    bestFor: 'High-volume single-style orders. Knit basics, T-shirts, simple polos.',
  },
  modular: {
    id: 'modular', label: 'Modular (TSS)', short: 'TSS',
    description: 'Small group (5–8) of multi-skilled operators rotate stations, push one piece through. No bundles. Pieces flow piece-by-piece.',
    typicalBatchSize: 1, typicalLineSize: 7, typicalWipPieces: 30, changeoverMin: 30,
    strengths: ['Tiny WIP', 'Short lead time', 'Self-balancing', 'Quick changeover', 'Operator engagement'],
    weaknesses: ['Higher operator wage (multi-skill)', 'Harder to scale to massive volumes', 'More training overhead'],
    bestFor: 'Mid-volume mixed styles. Dress shirts, fashion-forward knits, premium garments.',
  },
  UPS: {
    id: 'UPS', label: 'Unit Production System', short: 'UPS',
    description: 'Pieces ride overhead-conveyor hangers from station to station; computer routes each piece to the next available operator.',
    typicalBatchSize: 1, typicalLineSize: 30, typicalWipPieces: 80, changeoverMin: 45,
    strengths: ['Software-tracked WIP and bottlenecks', 'Tight pacing', 'Excellent for shirt/trouser variety', 'No bundle handling'],
    weaknesses: ['High capital cost', 'Vendor lock-in', 'Conveyor downtime stops the line', 'Layout is permanent'],
    bestFor: 'Large factories doing repetitive structured garments (shirts, trousers, jeans).',
  },
  make_through: {
    id: 'make_through', label: 'Make-Through', short: 'Make-Thru',
    description: 'One highly-skilled operator builds an entire garment alone, owning all operations.',
    typicalBatchSize: 1, typicalLineSize: 1, typicalWipPieces: 1, changeoverMin: 5,
    strengths: ['Maximum flexibility', 'Lowest WIP', 'Designer / sample / luxury fit', 'No balancing problem'],
    weaknesses: ['Lowest output', 'Requires top operators only', 'Cost-per-piece is highest'],
    bestFor: 'Sampling rooms, luxury / atelier production, tiny batches.',
  },
  straight: {
    id: 'straight', label: 'Straight Line', short: 'Straight',
    description: 'Classic conveyor-less straight line. One operator per operation, but pieces flow piece-by-piece without bundling. Slower than PBS but lower WIP.',
    typicalBatchSize: 1, typicalLineSize: 25, typicalWipPieces: 80, changeoverMin: 60,
    strengths: ['Lower WIP than PBS', 'Easier handover', 'Good visibility'],
    weaknesses: ['Sensitive to bottlenecks', 'Slows when one op is missing'],
    bestFor: 'Mid-volume work where lead time matters more than throughput.',
  },
  synchro: {
    id: 'synchro', label: 'Synchronised Line', short: 'Synchro',
    description: 'Operations paced to a takt time; lights / buzzers signal piece movement. Designed around perfect line balance.',
    typicalBatchSize: 1, typicalLineSize: 25, typicalWipPieces: 50, changeoverMin: 75,
    strengths: ['Predictable hourly output', 'Tight discipline', 'Quality is consistent'],
    weaknesses: ['Brittle to absenteeism', 'Requires balanced bulletin', 'Best operators frustrated by pace'],
    bestFor: 'Repeat orders where SMV variance is well-known and operator pool is stable.',
  },
  clump: {
    id: 'clump', label: 'Clump System', short: 'Clump',
    description: 'Senior operator + helpers cluster around critical operations. Helpers run sub-tasks like trimming and feeding.',
    typicalBatchSize: 10, typicalLineSize: 6, typicalWipPieces: 40, changeoverMin: 20,
    strengths: ['Wage flexibility (helpers paid less)', 'Resilient to absenteeism', 'Adaptive'],
    weaknesses: ['Output ceiling depends on senior op', 'Hard to scale beyond a few clumps'],
    bestFor: 'Skill-scarce environments, embroidery / specialty work, training shops.',
  },
  bundle: {
    id: 'bundle', label: 'Bundle System (generic)', short: 'Bundle',
    description: 'Pieces bundled in batches but not strictly progressive — operators may share operations across multiple ops.',
    typicalBatchSize: 20, typicalLineSize: 18, typicalWipPieces: 360, changeoverMin: 60,
    strengths: ['Flexible', 'Good for variable orders', 'Tolerant to variance'],
    weaknesses: ['WIP can creep', 'Less predictable than PBS'],
    bestFor: 'Smaller factories, mixed orders, fast-fashion-style runs.',
  },
  unit_handle: {
    id: 'unit_handle', label: 'Unit Handle System', short: 'UHS',
    description: 'Operators paid per unit completed; large batches; minimal pacing. Closest to traditional piece-rate.',
    typicalBatchSize: 60, typicalLineSize: 20, typicalWipPieces: 1200, changeoverMin: 120,
    strengths: ['High output potential', 'Operator self-motivation', 'Low management overhead'],
    weaknesses: ['Quality drops with rate', 'Massive WIP', 'Hard to integrate with WIP tracking'],
    bestFor: 'Cost-sensitive bulk programs, jeans factories, basics with stable SMVs.',
  },
};

export const ALL_PRODUCTION_SYSTEMS: ProductionSystemDef[] = Object.values(PRODUCTION_SYSTEMS);
