/**
 * Writes the Rahman 2023 replication out as `.swproj` factory files, so the
 * model can be opened in the app like any saved factory.
 *
 * Skipped unless RAHMAN_SWPROJ_DIR names a folder:
 *
 *   RAHMAN_SWPROJ_DIR="../../STICHWORKS FACTORIES" npx vitest run \
 *     src/simulation/replication/rahman2023.export.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useProject } from '../../store/project';
import { TWIN_STORE_SCHEMA_VERSION } from '../../store/twin';
import { buildSwproj, parseSwproj } from '../../store/swproj';
import { validateTwin } from '../../domain/twin';
import { buildRahmanFactory, type RahmanReading } from './rahman2023';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const outDir = env.RAHMAN_SWPROJ_DIR;

describe('Rahman 2023 — factory files', () => {
  for (const reading of ['A', 'B'] as RahmanReading[]) {
    it(`reading ${reading} builds a factory that validates and round-trips`, () => {
      const { twin, garment } = buildRahmanFactory(reading);
      // Dangling line ids, connectors to missing stations and the like.
      expect(validateTwin(twin)).toEqual([]);

      const now = new Date().toISOString();
      const base = useProject.getState().exportProject();
      const project = {
        ...base,
        meta: { ...base.meta, name: twin.name, factory: twin.name, createdAt: now, modifiedAt: now },
        scenarios: [],
        garmentEdits: { [garment.id]: garment },
        time: { ...base.time, shiftDurationMin: 480 },
      };
      const envelope = buildSwproj(
        project,
        { schemaVersion: TWIN_STORE_SCHEMA_VERSION, canonical: twin, scenarios: [], activeScenarioId: null },
        now,
      );
      const parsed = parseSwproj(JSON.parse(JSON.stringify(envelope)));
      expect(parsed.twin?.canonical.workstations.length).toBe(twin.workstations.length);

      if (outDir) {
        mkdirSync(outDir, { recursive: true });
        const file = join(outDir, `Rahman 2023 - reading ${reading}.swproj`);
        writeFileSync(file, JSON.stringify(envelope, null, 1));
      }
    });
  }
});
