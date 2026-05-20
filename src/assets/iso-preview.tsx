/**
 * IsoMiniPreview — renders an `IsoFixture` block (the same shape the Builder
 * canvas drops onto the floor) into a small, framed SVG box. Use it anywhere
 * the user needs to see "the actual Builder block" without switching pages —
 * primarily the Asset Library cards.
 *
 * The preview is auto-fit: it measures the fixture's iso footprint, scales
 * to fit a fixed pixel box, and centers the block on a solid paper tile.
 * No transparent backgrounds, no hollow strokes — the preview reads as a
 * tangible object.
 */

import type { CSSProperties } from 'react';
import {
  isoProj,
  ISO_FIXTURE_CATALOG,
  isoFixtureForMachineCode,
  isoFixtureForWorkerRole,
  type IsoFixture,
} from '../domain/iso';
import { SW_COLORS } from '../design/tokens';

interface IsoMiniPreviewProps {
  /** Direct catalog id (e.g. 'a_snls', 'op_sewer'). Takes precedence. */
  fixtureId?: string;
  /** MachineCode shortcut — maps to the matching iso fixture. */
  machineCode?: string;
  /** WorkerRole shortcut — maps to op_sewer / op_cutter / etc. */
  workerRole?: string;
  /** Outer pixel size of the preview tile. Defaults to 96. */
  size?: number;
  /** Show the framed tile background (default true). */
  framed?: boolean;
  /** Override the tile background colour. */
  background?: string;
  style?: CSSProperties;
}

function resolveFixture(props: IsoMiniPreviewProps): IsoFixture | null {
  if (props.fixtureId) {
    return ISO_FIXTURE_CATALOG.find((f) => f.id === props.fixtureId) ?? null;
  }
  if (props.machineCode) return isoFixtureForMachineCode(props.machineCode);
  if (props.workerRole) return isoFixtureForWorkerRole(props.workerRole);
  return null;
}

export function IsoMiniPreview({
  size = 96,
  framed = true,
  background,
  style,
  ...rest
}: IsoMiniPreviewProps) {
  const fix = resolveFixture(rest);
  if (!fix) {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: background ?? SW_COLORS.paperEdge,
          border: `1px solid ${SW_COLORS.line}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: SW_COLORS.muted,
          ...style,
        }}
      >
        no preview
      </div>
    );
  }

  // Measure the iso projection bounds for the fixture footprint.
  const corners = [
    isoProj(0, 0, 0),
    isoProj(fix.w, 0, 0),
    isoProj(fix.w, fix.d, 0),
    isoProj(0, fix.d, 0),
    isoProj(0, 0, fix.h),
    isoProj(fix.w, 0, fix.h),
    isoProj(fix.w, fix.d, fix.h),
    isoProj(0, fix.d, fix.h),
  ];
  const xs = corners.map((c) => c.sx);
  const ys = corners.map((c) => c.sy);
  const pad = 8;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  const vbW = maxX - minX;
  const vbH = maxY - minY;

  return (
    <div
      style={{
        width: size,
        height: size,
        background: background ?? (framed ? SW_COLORS.paperEdge : 'transparent'),
        border: framed ? `1px solid ${SW_COLORS.line}` : 'none',
        borderRadius: framed ? 6 : 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...style,
      }}
    >
      <svg
        viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
        width={size - (framed ? 8 : 0)}
        height={size - (framed ? 8 : 0)}
        style={{ display: 'block' }}
        aria-label={fix.label}
      >
        {/* Solid ground shadow under the fixture */}
        <ellipse
          cx={(minX + maxX) / 2}
          cy={maxY - pad - 1}
          rx={vbW * 0.32}
          ry={4}
          fill={SW_COLORS.ink}
          opacity={0.18}
        />
        {fix.draw({ w: fix.w, d: fix.d, h: fix.h })}
      </svg>
    </div>
  );
}
