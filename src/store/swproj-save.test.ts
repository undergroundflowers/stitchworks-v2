import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSwprojToFile, parseSwproj } from './swproj';
import { linkActiveFile, unlinkActiveFile, useFileLink } from './fileLink';

/**
 * Save must never dead-end. The regression: an embedded browser offered the
 * native Save dialog, returned a handle, and then refused `createWritable`
 * with NotAllowedError. Feature-detecting the picker said "this browser can
 * write files", so the refusal surfaced as a hard error and the factory could
 * not be saved at all. A refused write now falls back to a downloaded copy,
 * exactly as a browser without the API does.
 *
 * These run in node, so the picker, the handle and the download anchor are
 * stubbed; the logic under test is which path Save takes.
 */

type Writable = { write: (data: string) => Promise<void>; close: () => Promise<void> };

function handleThat(createWritable: () => Promise<Writable>, name = 'Line A.swproj'): FileSystemFileHandle {
  return { name, createWritable } as unknown as FileSystemFileHandle;
}

const refuse = () => Promise.reject(new DOMException('The request is not allowed by the user agent.', 'NotAllowedError'));

describe('saveSwprojToFile', () => {
  let downloads: string[];
  let written: string[];

  beforeEach(() => {
    downloads = [];
    written = [];
    unlinkActiveFile();
    vi.stubGlobal('document', {
      createElement: () => {
        const a = { href: '', download: '', click: () => downloads.push(a.download), remove: () => {} };
        return a;
      },
      body: { appendChild: () => {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    unlinkActiveFile();
  });

  const stubPicker = (picker: () => Promise<FileSystemFileHandle>) =>
    vi.stubGlobal('window', { showSaveFilePicker: picker });

  const accepting = (name?: string) =>
    handleThat(async () => ({ write: async (data) => { written.push(data); }, close: async () => {} }), name);

  it('writes to the picked file and links it', async () => {
    stubPicker(async () => accepting('Line A.swproj'));
    const result = await saveSwprojToFile();
    expect(result).toEqual({ kind: 'saved', fileName: 'Line A.swproj' });
    expect(useFileLink.getState().fileName).toBe('Line A.swproj');
    expect(downloads).toEqual([]);
    // What landed in the file is a loadable project, not a stub.
    expect(parseSwproj(JSON.parse(written[0])).twin?.canonical).toBeDefined();
  });

  it('downloads a copy when the platform refuses the write after the dialog', async () => {
    stubPicker(async () => handleThat(refuse));
    const result = await saveSwprojToFile();
    expect(result.kind).toBe('downloaded');
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/\.swproj$/);
    // The refused file must not be remembered as this factory's save target.
    expect(useFileLink.getState().handle).toBeNull();
  });

  it('downloads a copy when the dialog itself is blocked', async () => {
    stubPicker(() => Promise.reject(new DOMException('Blocked in this context.', 'SecurityError')));
    expect((await saveSwprojToFile()).kind).toBe('downloaded');
    expect(downloads).toHaveLength(1);
  });

  it('downloads a copy when a linked file can no longer be written', async () => {
    linkActiveFile(handleThat(refuse, 'Linked.swproj'));
    stubPicker(async () => { throw new Error('the dialog should not open'); });
    expect((await saveSwprojToFile()).kind).toBe('downloaded');
    expect(downloads).toHaveLength(1);
  });

  it('does nothing when the user closes the dialog', async () => {
    stubPicker(() => Promise.reject(new DOMException('The user aborted a request.', 'AbortError')));
    expect(await saveSwprojToFile()).toEqual({ kind: 'cancelled' });
    expect(downloads).toEqual([]);
  });

  it('still reports a genuine failure as an error', async () => {
    stubPicker(async () => handleThat(() => Promise.reject(new Error('disk full'))));
    expect(await saveSwprojToFile()).toEqual({ kind: 'error', message: 'disk full' });
    expect(downloads).toEqual([]);
  });
});
