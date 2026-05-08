import { PageStub } from './PageStub';

/**
 * Iso Builder — isometric 3D-feel layout builder, new in the v2 design
 * import. Source split between sw/sw-iso-builder-data.jsx (catalogue + seed
 * layouts) and sw/sw-iso-builder-screen.jsx (the editor screen). Two modes
 * surfaced in the original `App` switch:
 *
 *   /iso                  — factory-level iso builder
 *   /iso/dept/:deptId     — iso builder scoped to one department
 *
 * Port pending. The data file is ~30 KB / 540 lines and the screen ~31 KB /
 * 487 lines, so this is its own substantial port.
 */
export function IsoBuilderPage() {
  return (
    <PageStub
      kicker="Iso Builder"
      title="Isometric 3D-feel layout builder"
      sub="Drag iso-styled fixtures onto the canvas; pan / zoom / rotate; populate from the iso catalogue."
      sourceLines="sw/sw-iso-builder-data.jsx (542 lines) + sw/sw-iso-builder-screen.jsx (487 lines)"
    />
  );
}
