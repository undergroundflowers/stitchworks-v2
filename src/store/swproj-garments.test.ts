import { describe, expect, it } from 'vitest';
import { applySwproj, buildSwproj, parseSwproj } from './swproj';
import { useProject } from './project';
import { useTwin } from './twin';
import { effectiveGarments } from './garments';
import type { GarmentTemplate } from '../domain';

/**
 * A garment authored on the Resources page must come back when its `.swproj`
 * is reopened — whatever it is called. The regression: a boot-time sweep
 * deleted every custom garment whose name began with "test" (or a few
 * keyboard mashes), so a garment named "Test shirt" vanished on the next
 * start and every save after that wrote a file without it.
 */

function garmentNamed(name: string): GarmentTemplate {
  const base = effectiveGarments({}).all[0];
  return {
    ...base,
    id: `custom-${name.toLowerCase().replace(/\W+/g, '-')}`,
    name,
    operations: base.operations.slice(0, 3),
  };
}

function saveAndReopen(): void {
  const text = JSON.stringify(
    buildSwproj(useProject.getState().exportProject(), useTwin.getState().exportTwin(), new Date().toISOString()),
  );
  useProject.getState().resetProject();
  const result = applySwproj(parseSwproj(JSON.parse(text)));
  expect(result.ok).toBe(true);
}

describe('custom garments in a .swproj', () => {
  it.each(['Test shirt', 'test', 'asdf blouse', 'Polo 2'])('keeps a garment named "%s" across save and reopen', (name) => {
    useProject.getState().resetProject();
    const g = garmentNamed(name);
    useProject.getState().setGarmentEdit(g.id, g);

    saveAndReopen();

    const reopened = useProject.getState().garmentEdits[g.id];
    expect(reopened?.name).toBe(name);
    expect(reopened?.operations).toHaveLength(3);
    expect(effectiveGarments(useProject.getState().garmentEdits).all.map((x) => x.id)).toContain(g.id);
  });

  it('has no action left that deletes garments by name', () => {
    expect('purgeTestGarments' in useProject.getState()).toBe(false);
  });
});
