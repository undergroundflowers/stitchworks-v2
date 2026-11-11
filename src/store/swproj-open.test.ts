import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickSwprojFile } from './swproj';

/**
 * Import must never dead-end. The regression: an embedded browser showed the
 * native Open dialog, returned a handle, and then refused `getFile` with
 * NotAllowedError, so IMPORT FACTORY could not open any file at all. A refused
 * read now falls back to the classic file input, and the refusal is remembered
 * so later imports skip the refused dialog.
 *
 * These run in node, so the picker, the handle, storage and the file input are
 * stubbed; the logic under test is which path Open takes.
 */

const refused = () => Promise.reject(new DOMException('The request is not allowed by the user agent.', 'NotAllowedError'));

function handleThat(getFile: () => Promise<unknown>): FileSystemFileHandle {
  return { name: 'Line A.swproj', getFile } as unknown as FileSystemFileHandle;
}

describe('pickSwprojFile', () => {
  let store: Record<string, string>;
  let inputClicks: number;
  let pickerCalls: number;

  /** A file input that "chooses" a file holding `text` as soon as it is clicked. */
  const stubInput = (text: string) => {
    vi.stubGlobal('document', {
      createElement: () => {
        const input: Record<string, unknown> = {
          files: [{ name: 'Line A.swproj' }],
          click: () => {
            inputClicks++;
            (input.onchange as () => void)();
          },
        };
        return input;
      },
    });
    vi.stubGlobal('FileReader', class {
      result = text;
      onload: (() => void) | null = null;
      readAsText() { this.onload?.(); }
    });
  };

  const stubPicker = (getFile: () => Promise<unknown>) =>
    vi.stubGlobal('window', {
      showOpenFilePicker: async () => {
        pickerCalls++;
        return [handleThat(getFile)];
      },
    });

  beforeEach(() => {
    store = {};
    inputClicks = 0;
    pickerCalls = 0;
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    });
    stubInput('{"from":"input"}');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reads the picked file and keeps its handle', async () => {
    stubPicker(async () => ({ name: 'Line A.swproj', text: async () => '{"from":"handle"}' }));
    const { raw, handle } = await pickSwprojFile();
    expect(raw).toEqual({ from: 'handle' });
    expect(handle?.name).toBe('Line A.swproj');
    expect(inputClicks).toBe(0);
  });

  it('falls back to the file input when the read is refused mid-click', async () => {
    stubPicker(refused);
    vi.stubGlobal('navigator', { userActivation: { isActive: true } });
    const { raw, handle } = await pickSwprojFile();
    expect(raw).toEqual({ from: 'input' });
    expect(handle).toBeNull();
  });

  it('asks for a second click when the refusal outlives the first', async () => {
    stubPicker(refused);
    vi.stubGlobal('navigator', { userActivation: { isActive: false } });
    await expect(pickSwprojFile()).rejects.toThrow(/Click IMPORT FACTORY again/);
    expect(inputClicks).toBe(0);
  });

  it('skips the refused dialog on every later import', async () => {
    stubPicker(refused);
    vi.stubGlobal('navigator', { userActivation: { isActive: false } });
    await expect(pickSwprojFile()).rejects.toThrow();
    const { raw, handle } = await pickSwprojFile();
    expect(raw).toEqual({ from: 'input' });
    expect(handle).toBeNull();
    expect(pickerCalls).toBe(1);
  });

  it('still reports a file that is not a project', async () => {
    stubPicker(async () => ({ name: 'Line A.swproj', text: async () => '' }));
    await expect(pickSwprojFile()).rejects.toThrow(/"Line A.swproj" is empty/);
  });
});
