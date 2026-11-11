import { describe, expect, it } from 'vitest';
import { resolveSimScope, type SimScope } from './simScope';

const lines = [{ id: 'line-a' }, { id: 'line-b' }];

describe('resolveSimScope', () => {
  it('keeps a line that exists in the open factory', () => {
    const scope: SimScope = { kind: 'line', id: 'line-b' };
    expect(resolveSimScope(scope, lines)).toBe(scope);
  });

  it('falls back to the whole factory when the saved line is not in this factory', () => {
    // Saved while another factory was open, so its id matches nothing here.
    expect(resolveSimScope({ kind: 'line', id: 'line-from-elsewhere' }, lines)).toEqual({
      kind: 'factory',
    });
  });

  it('falls back to the whole factory when the factory has no lines', () => {
    expect(resolveSimScope({ kind: 'line', id: 'line-a' }, [])).toEqual({ kind: 'factory' });
  });

  it('leaves the whole-factory scope alone', () => {
    const scope: SimScope = { kind: 'factory' };
    expect(resolveSimScope(scope, lines)).toBe(scope);
  });
});
