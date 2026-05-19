/* eslint-disable no-console */
/**
 * P2 smoke verification — runs the pilot twin three ways:
 *   1. Baseline (no rework, no changeover).
 *   2. With 10% rework on a single op.
 *   3. With one mid-shift changeover injected.
 * Confirms first-pass yield drops, OEE drops, and changeoverMin populates.
 * Delete after running.
 */
import { GARMENT_TEMPLATES } from './domain/garments';
import { buildPilotFactoryTwin, PILOT_SEED_LINES } from './domain/pilot';
import { changeoverDurationMin } from './domain/changeover';
import { runPmlSim } from './simulation/pml-engine';

// Build the pilot factory (2 lines: T-shirt + polo).
const twin = buildPilotFactoryTwin(PILOT_SEED_LINES);

// ── Run 1: baseline ───────────────────────────────────────────────────────
const r1 = runPmlSim({ twin, durationMin: 480, seed: 42, samplePeriodMin: 30 });
console.log('--- Baseline ---');
console.log({
  produced: r1.totalProduced,
  ftr: r1.piecesProducedFTR,
  scrap: r1.piecesScrapped,
  firstPassYield: r1.firstPassYield.toFixed(4),
  changeoverMin: r1.changeoverMin,
  downtimeMin: r1.downtimeMin,
  throughputPerHr: r1.throughputPerHr.toFixed(1),
});

// ── Run 2: 10% rework on op `ts-04` (collar attach) of T-shirt ────────────
const tshirt = GARMENT_TEMPLATES.tshirt;
const targetOp = tshirt.operations[3]; // 4th op
targetOp.reworkRate = 0.1;
targetOp.maxReworkAttempts = 1;
const r2 = runPmlSim({ twin, durationMin: 480, seed: 42, samplePeriodMin: 30 });
console.log('--- 10% rework on', targetOp.name, '---');
console.log({
  produced: r2.totalProduced,
  ftr: r2.piecesProducedFTR,
  scrap: r2.piecesScrapped,
  firstPassYield: r2.firstPassYield.toFixed(4),
  throughputPerHr: r2.throughputPerHr.toFixed(1),
});
// Cleanup so the changeover run doesn't double-up.
delete targetOp.reworkRate;
delete targetOp.maxReworkAttempts;

// ── Run 3: inject one changeover at t=240 on the first line ───────────────
const firstLine = twin.lines[0];
const dur = changeoverDurationMin({ baseChangeoverMin: 30, fromGarmentId: 'tshirt', toGarmentId: 'polo' });
const r3 = runPmlSim({
  twin,
  durationMin: 480,
  seed: 42,
  samplePeriodMin: 30,
  changeovers: [{ atMin: 240, lineId: firstLine.id, durationMin: dur }],
});
console.log('--- Changeover (tshirt→polo, base 30 min) at t=240 on', firstLine.name, '---');
console.log({
  produced: r3.totalProduced,
  changeoverMin: r3.changeoverMin,
  expectedDur: dur.toFixed(1),
  throughputPerHr: r3.throughputPerHr.toFixed(1),
});

// ── Run 4: machine breakdown — SNL fails every ~120 min for 10 min ────────
const r4 = runPmlSim({
  twin,
  durationMin: 480,
  seed: 42,
  samplePeriodMin: 30,
  machineBreakdowns: { SNL: { mtbfMin: 120, mttrMin: 10 } },
});
console.log('--- SNL MTBF=120 MTTR=10 ---');
console.log({
  produced: r4.totalProduced,
  downtimeMin: r4.downtimeMin.toFixed(1),
  throughputPerHr: r4.throughputPerHr.toFixed(1),
});

// ── Run 5: skill efficiency — every op runs at 80% nominal speed ──────────
const opEff = Object.fromEntries(tshirt.operations.map((o) => [o.id, 0.8]));
const r5 = runPmlSim({ twin, durationMin: 480, seed: 42, samplePeriodMin: 30, opEfficiency: opEff });
console.log('--- T-shirt ops at 0.8× efficiency ---');
console.log({
  produced: r5.totalProduced,
  throughputPerHr: r5.throughputPerHr.toFixed(1),
  // Expect throughput ~ 0.8 × r1 baseline-ish (other line unaffected).
});
