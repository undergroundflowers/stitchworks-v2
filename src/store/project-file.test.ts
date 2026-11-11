import { describe, it, expect } from 'vitest';
import { parseProjectFileText } from './project';

/**
 * The import flow reads a `.swproj` as text before it ever becomes JSON. A
 * Save that opened the dialog and then failed to write leaves a 0-byte file
 * behind; opening it used to throw a bare SyntaxError that the Menu swallowed,
 * so the IMPORT click looked dead. These pin the messages the user sees.
 */
describe('parseProjectFileText', () => {
  it('returns the parsed JSON for a real file', () => {
    expect(parseProjectFileText('{"a":1}', 'x.swproj')).toEqual({ a: 1 });
  });

  it('names an empty file as empty, not as bad JSON', () => {
    expect(() => parseProjectFileText('', 'Line 3.swproj')).toThrow(/"Line 3.swproj" is empty/);
    expect(() => parseProjectFileText('  \n', 'Line 3.swproj')).toThrow(/is empty/);
  });

  it('names a non-JSON file', () => {
    expect(() => parseProjectFileText('PK\u0003\u0004', 'ob.xlsx')).toThrow(/"ob.xlsx" is not a .swproj file/);
  });
});
