import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  linkActiveFile,
  markSaved,
  parkActiveLink,
  startFileLinkTracking,
  unlinkActiveFile,
  useFileLink,
  withoutDirtyTracking,
} from './fileLink';
import { useProject } from './project';
import { useTwin } from './twin';

// A real FileSystemFileHandle only exists in a Chromium page; the tracking
// logic only ever reads `.name` from it.
const handle = { name: 'Line A.swproj' } as FileSystemFileHandle;

describe('linked-file dirty tracking', () => {
  beforeAll(async () => {
    await useProject.persist.rehydrate();
    await useTwin.persist.rehydrate();
    startFileLinkTracking();
  });

  beforeEach(() => {
    unlinkActiveFile();
  });

  it('marks the file dirty when the factory layout changes, clean again on save', () => {
    linkActiveFile(handle);
    expect(useFileLink.getState()).toMatchObject({ fileName: 'Line A.swproj', dirty: false });

    useTwin.getState().renameActive('Renamed line');
    expect(useFileLink.getState().dirty).toBe(true);

    markSaved();
    expect(useFileLink.getState().dirty).toBe(false);
  });

  it('marks the file dirty when project settings change', () => {
    linkActiveFile(handle);
    useProject.getState().rename('Renamed project');
    expect(useFileLink.getState().dirty).toBe(true);
  });

  it('does not count a programmatic load as an edit', () => {
    linkActiveFile(handle);
    withoutDirtyTracking(() => useTwin.getState().renameActive('Loaded from library'));
    expect(useFileLink.getState().dirty).toBe(false);
  });

  it('never reports unsaved changes for a factory with no file', () => {
    useTwin.getState().renameActive('Unlinked edit');
    expect(useFileLink.getState()).toMatchObject({ fileName: null, dirty: false });
  });

  it('takes the link away from the active factory when it is parked in the library', () => {
    linkActiveFile(handle);
    parkActiveLink('slot-1');
    expect(useFileLink.getState().fileName).toBeNull();
  });
});
