import { describe, expect, it } from 'vitest';
import { ENGINE_TIME_UNIT, fmtElapsed, shiftProgressPct, simDayNumber } from './timeUnit';

// The engine's clock is in minutes; a standard shift is 480 of them.
const SHIFT = 480;

describe('run clock, read in the engine unit', () => {
  it('reads a full shift as eight hours, not eight minutes', () => {
    expect(fmtElapsed(480, ENGINE_TIME_UNIT)).toBe('8 h');
    expect(fmtElapsed(2, ENGINE_TIME_UNIT)).toBe('2 min');
    expect(fmtElapsed(80, ENGINE_TIME_UNIT)).toBe('1h 20m');
  });

  it('tracks progress through the shift', () => {
    expect(shiftProgressPct(0, ENGINE_TIME_UNIT, SHIFT)).toBe(0);
    expect(shiftProgressPct(240, ENGINE_TIME_UNIT, SHIFT)).toBe(50);
  });

  it('shows the end of a shift as 100 % of day 1, not 0 % of day 2', () => {
    expect(shiftProgressPct(480, ENGINE_TIME_UNIT, SHIFT)).toBe(100);
    expect(simDayNumber(480, ENGINE_TIME_UNIT, SHIFT)).toBe(1);
  });

  it('rolls into day 2 once the next shift has begun', () => {
    expect(simDayNumber(0, ENGINE_TIME_UNIT, SHIFT)).toBe(1);
    expect(simDayNumber(481, ENGINE_TIME_UNIT, SHIFT)).toBe(2);
    expect(shiftProgressPct(600, ENGINE_TIME_UNIT, SHIFT)).toBe(25);
  });
});
