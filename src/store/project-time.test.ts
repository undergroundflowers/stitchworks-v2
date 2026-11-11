import { describe, expect, it } from 'vitest';
import { useProject } from './project';

describe('time settings on load', () => {
  it('drops the removed virtual-playback setting from an older project file', () => {
    // A file saved while the old VIRT speed was selected.
    const saved = useProject.getState().exportProject();
    const legacy = {
      ...saved,
      time: { ...saved.time, executionMode: 'virtual', realTimeScale: 60 },
    };

    expect(useProject.getState().loadProject(legacy).ok).toBe(true);

    const time = useProject.getState().time;
    expect('executionMode' in time).toBe(false);
    // The settings that still exist survive the load untouched.
    expect(time.realTimeScale).toBe(60);
    expect(time.shiftDurationMin).toBe(saved.time.shiftDurationMin);
    expect('executionMode' in useProject.getState().exportProject().time).toBe(false);
  });
});
