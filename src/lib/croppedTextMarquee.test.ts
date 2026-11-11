import { describe, expect, it } from 'vitest';
import { isCropped, marqueeDurationMs, type CropBox } from './croppedTextMarquee';

const box = (over: Partial<CropBox> = {}): CropBox => ({
  whiteSpace: 'nowrap',
  overflowX: 'hidden',
  scrollWidth: 200,
  clientWidth: 100,
  hasOwnText: true,
  ...over,
});

describe('isCropped', () => {
  it('is true for a clipped single line of text', () => {
    expect(isCropped(box())).toBe(true);
  });
  it('is false when the text fits', () => {
    expect(isCropped(box({ scrollWidth: 100 }))).toBe(false);
    expect(isCropped(box({ scrollWidth: 101 }))).toBe(false);
  });
  it('is false for wrapping text, visible overflow, or a layout box', () => {
    expect(isCropped(box({ whiteSpace: 'normal' }))).toBe(false);
    expect(isCropped(box({ overflowX: 'visible' }))).toBe(false);
    expect(isCropped(box({ overflowX: 'auto' }))).toBe(false);
    expect(isCropped(box({ hasOwnText: false }))).toBe(false);
  });
});

describe('marqueeDurationMs', () => {
  it('grows with distance and always includes both pauses', () => {
    expect(marqueeDurationMs(0)).toBe(1400);
    expect(marqueeDurationMs(90)).toBe(3650);
  });
});
