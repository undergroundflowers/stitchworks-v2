/**
 * PML block icons — one solid-filled SVG glyph per PML block kind.
 *
 * Replaces the per-spec single-Unicode-character `glyph` field that was
 * used for the in-canvas / palette / inspector / dropdown badges. Every
 * icon is a 24x24 viewBox solid form that tints by the `color` prop, so
 * a Source can read green in the palette and brand-blue in the live-sim
 * card without any duplicate art.
 *
 * Surfaces using these icons:
 *   - Builder PML palette tile          (16-18px)
 *   - Builder process-diagram node      (12-14px, nested in outer <svg>)
 *   - Builder Inspector chip + dropdown (14-16px)
 *   - LiveSim PML mini-card             (16px)
 *   - Iso 3D canvas top-face decal      (22px, nested in outer <svg>)
 *
 * Each icon is a stand-alone `<svg>` element. Because modern browsers
 * support nested SVG, the same component drops cleanly into either an
 * HTML host (e.g. a `<div>`) or an SVG host (e.g. inside a `<g>` of the
 * iso canvas) — when used inside another <svg>, pass `x` / `y` to
 * position it.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { PmlBlockKind } from '../domain/pml';

export interface PmlIconProps {
  /** Square pixel size. Default 16. */
  size?: number;
  /** Fill colour. Default 'currentColor' so the icon inherits text colour. */
  color?: string;
  /** Accessibility title — set when the icon is the sole label for its target. */
  title?: string;
  /** SVG-host placement when used as a nested <svg>. Ignored in HTML hosts. */
  x?: number;
  y?: number;
  /** Forwarded style attribute (e.g. display:block to avoid baseline gap). */
  style?: CSSProperties;
}

export type PmlIconComponent = React.FC<PmlIconProps>;

// ── icon factory ────────────────────────────────────────────────────────────

function makeIcon(content: ReactNode): PmlIconComponent {
  const Icon: PmlIconComponent = ({
    size = 16,
    color = 'currentColor',
    title,
    x,
    y,
    style,
  }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      x={x}
      y={y}
      fill={color}
      style={{ display: 'block', overflow: 'visible', ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {content}
    </svg>
  );
  return Icon;
}

// ── lifecycle ────────────────────────────────────────────────────────────────

/** Source — filled disc emitting a right-pointing arrow ("agents flow OUT"). */
export const SourceIcon = makeIcon(
  <>
    <circle cx="5" cy="12" r="3.5" />
    <path d="M9 10 H 16 V 7 L 22 12 L 16 17 V 14 H 9 Z" />
  </>,
);

/** Sink — right-pointing arrow terminating in a filled disc ("agents flow IN, destroyed"). */
export const SinkIcon = makeIcon(
  <>
    <path d="M2 10 H 9 V 7 L 15 12 L 9 17 V 14 H 2 Z" />
    <circle cx="19" cy="12" r="3.5" />
  </>,
);

// ── buffer + pacing ─────────────────────────────────────────────────────────

/** Queue — 4 stacked horizontal pills (FIFO column). */
export const QueueIcon = makeIcon(
  <>
    <rect x="3" y="3" width="18" height="3.2" rx="1.6" />
    <rect x="3" y="8" width="18" height="3.2" rx="1.6" />
    <rect x="3" y="13" width="18" height="3.2" rx="1.6" />
    <rect x="3" y="18" width="18" height="3.2" rx="1.6" />
  </>,
);

/** Delay — clock face with hour + minute hand cut-outs. */
export const DelayIcon = makeIcon(
  <path
    fillRule="evenodd"
    d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1 2v6.6l4.3 2.5 1-1.7-3.3-1.9V6z"
  />,
);

/** Hold — filled square with a horizontal slot cut-out (barrier gate). */
export const HoldIcon = makeIcon(
  <path
    fillRule="evenodd"
    d="M3 4 H 21 V 20 H 3 Z M 6 11 H 18 V 13 H 6 Z"
  />,
);

/** Wait — filled rounded square with two vertical pause-bar cut-outs. */
export const WaitIcon = makeIcon(
  <path
    fillRule="evenodd"
    d="M4 2 a 2 2 0 0 0 -2 2 v 16 a 2 2 0 0 0 2 2 h 16 a 2 2 0 0 0 2 -2 V 4 a 2 2 0 0 0 -2 -2 Z M 8 7 h 3 v 10 H 8 Z M 13 7 h 3 v 10 h -3 Z"
  />,
);

// ── service / resources ─────────────────────────────────────────────────────

/** Service — 8-spoke gear with central circular hole. */
export const ServiceIcon = makeIcon(
  <path
    fillRule="evenodd"
    d="M13.4 2 h -2.8 l -0.5 2.6 a 8 8 0 0 0 -1.8 0.75 L 6.1 3.85 L 4.1 5.85 L 5.55 8 a 8 8 0 0 0 -0.75 1.8 L 2.2 10.3 v 2.8 l 2.6 0.5 a 8 8 0 0 0 0.75 1.8 L 4.1 17.55 L 6.1 19.55 L 8.25 18.1 a 8 8 0 0 0 1.8 0.75 l 0.5 2.6 h 2.8 l 0.5 -2.6 a 8 8 0 0 0 1.8 -0.75 l 2.15 1.45 l 2 -2 l -1.45 -2.15 a 8 8 0 0 0 0.75 -1.8 l 2.6 -0.5 v -2.8 l -2.6 -0.5 a 8 8 0 0 0 -0.75 -1.8 l 1.45 -2.15 l -2 -2 l -2.15 1.45 a 8 8 0 0 0 -1.8 -0.75 Z M 12 8.4 a 3.6 3.6 0 1 0 0 7.2 a 3.6 3.6 0 0 0 0 -7.2 Z"
  />,
);

/** Seize — arrow pointing DOWN into a claiming horizontal bar (resource claim). */
export const SeizeIcon = makeIcon(
  <>
    <path d="M10.5 2 H 13.5 V 11 H 17 L 12 17 L 7 11 H 10.5 Z" />
    <rect x="3" y="19" width="18" height="3" rx="1" />
  </>,
);

/** Release — claimed bar emitting an upward arrow (resource release). */
export const ReleaseIcon = makeIcon(
  <>
    <rect x="3" y="2" width="18" height="3" rx="1" />
    <path d="M10.5 22 H 13.5 V 13 H 17 L 12 7 L 7 13 H 10.5 Z" />
  </>,
);

/** ResourcePool — three stylised operator silhouettes overlapping. */
export const ResourcePoolIcon = makeIcon(
  <>
    {/* back-left */}
    <circle cx="6" cy="9" r="2.6" />
    <path d="M1.2 22 V 19 a 4.8 4.8 0 0 1 9.6 0 V 22 Z" />
    {/* back-right */}
    <circle cx="18" cy="9" r="2.6" />
    <path d="M13.2 22 V 19 a 4.8 4.8 0 0 1 9.6 0 V 22 Z" />
    {/* front-center (overlaps both, drawn last) */}
    <circle cx="12" cy="6" r="3" />
    <path d="M6 22 V 16 a 6 6 0 0 1 12 0 V 22 Z" />
  </>,
);

// ── routing ─────────────────────────────────────────────────────────────────

/** SelectOutput — input dot forks to 2 output dots (Y shape). */
export const SelectOutputIcon = makeIcon(
  <>
    {/* input dot */}
    <circle cx="4" cy="12" r="2.6" />
    {/* upper diagonal connector */}
    <polygon points="5,10.6 19,4 20.2,6.2 6.2,12.8" />
    {/* lower diagonal connector */}
    <polygon points="5,13.4 19,20 20.2,17.8 6.2,11.2" />
    {/* output dots */}
    <circle cx="20" cy="5" r="2.4" />
    <circle cx="20" cy="19" r="2.4" />
  </>,
);

/** SelectOutput5 — input dot fans to 5 output dots (radial). */
export const SelectOutput5Icon = makeIcon(
  <>
    <circle cx="3" cy="12" r="2.4" />
    {/* fan connectors */}
    <polygon points="4.5,11 21,2 21,4 4.5,13" />
    <polygon points="4.5,11.4 21,7 21,9 4.5,12.6" />
    <rect x="4" y="11.4" width="17" height="1.2" />
    <polygon points="4.5,12.6 21,17 21,15 4.5,11.4" />
    <polygon points="4.5,13 21,22 21,20 4.5,11" />
    {/* output dots */}
    <circle cx="21.2" cy="3" r="1.6" />
    <circle cx="21.2" cy="8" r="1.6" />
    <circle cx="21.2" cy="12" r="1.6" />
    <circle cx="21.2" cy="16" r="1.6" />
    <circle cx="21.2" cy="21" r="1.6" />
  </>,
);

// ── batch + assembly ────────────────────────────────────────────────────────

/** Batch — 4 small squares funneled into 1 large square. */
export const BatchIcon = makeIcon(
  <>
    <rect x="1" y="1.5" width="3.6" height="3.6" rx="0.6" />
    <rect x="1" y="6.6" width="3.6" height="3.6" rx="0.6" />
    <rect x="1" y="13.8" width="3.6" height="3.6" rx="0.6" />
    <rect x="1" y="18.9" width="3.6" height="3.6" rx="0.6" />
    <path d="M5 11 H 10 V 8 L 14 12 L 10 16 V 13 H 5 Z" />
    <rect x="15" y="7" width="8" height="10" rx="1" />
  </>,
);

/** Unbatch — 1 large square explodes into 4 small squares. */
export const UnbatchIcon = makeIcon(
  <>
    <rect x="1" y="7" width="8" height="10" rx="1" />
    <path d="M10 11 H 14 V 8 L 18 12 L 14 16 V 13 H 10 Z" />
    <rect x="19.4" y="1.5" width="3.6" height="3.6" rx="0.6" />
    <rect x="19.4" y="6.6" width="3.6" height="3.6" rx="0.6" />
    <rect x="19.4" y="13.8" width="3.6" height="3.6" rx="0.6" />
    <rect x="19.4" y="18.9" width="3.6" height="3.6" rx="0.6" />
  </>,
);

/** Combine — two input arrows merging into one outbound arrow. */
export const CombineIcon = makeIcon(
  <>
    {/* upper input bar, diagonal */}
    <polygon points="2,2 4.6,1 12,10.4 9.4,11.6" />
    {/* lower input bar, diagonal */}
    <polygon points="2,22 4.6,23 12,13.6 9.4,12.4" />
    {/* exit arrow */}
    <path d="M9 10 H 16 V 7 L 22 12 L 16 17 V 14 H 9 Z" />
  </>,
);

/** Match — two streams paired up with crossing chevrons (stitch). */
export const MatchIcon = makeIcon(
  <>
    {/* upper input */}
    <circle cx="3" cy="5" r="2" />
    {/* lower input */}
    <circle cx="3" cy="19" r="2" />
    {/* upper output */}
    <circle cx="21" cy="5" r="2" />
    {/* lower output */}
    <circle cx="21" cy="19" r="2" />
    {/* cross-stitch connectors */}
    <polygon points="4,4 21,18 20,20 3,6" />
    <polygon points="4,20 21,6 20,4 3,18" />
  </>,
);

/** Assembler — three input parts assembling into one garment shape. */
export const AssemblerIcon = makeIcon(
  <>
    {/* part dots on the left */}
    <circle cx="3" cy="4" r="1.8" />
    <circle cx="3" cy="12" r="1.8" />
    <circle cx="3" cy="20" r="1.8" />
    {/* converging lines */}
    <polygon points="4.5,3.4 13,10.8 11.6,12.2 3.1,4.8" />
    <rect x="4" y="11.2" width="9" height="1.6" />
    <polygon points="4.5,20.6 13,13.2 11.6,11.8 3.1,19.2" />
    {/* T-shirt silhouette on the right (single combined path) */}
    <path d="M14 9 L 17 7 L 19 9 L 21 7 L 23 9 L 21.5 11 L 21 11 V 18 H 15 V 11 H 14.5 Z" />
  </>,
);

/** Split — one input duplicates into two parallel outputs. */
export const SplitIcon = makeIcon(
  <>
    <circle cx="4" cy="12" r="2.4" />
    {/* upper duplicate arrow */}
    <path d="M6 10.6 H 14 V 8.2 L 18 11 L 14 13.8 V 11.4 H 6 Z" transform="translate(0 -4)" />
    {/* lower duplicate arrow */}
    <path d="M6 10.6 H 14 V 8.2 L 18 11 L 14 13.8 V 11.4 H 6 Z" transform="translate(0 4)" />
    {/* output ghost-dots showing the duplicate */}
    <circle cx="20.5" cy="7" r="1.6" />
    <circle cx="20.5" cy="17" r="1.6" />
  </>,
);

// ── movement ────────────────────────────────────────────────────────────────

/** MoveTo — location pin with a motion-arrow tail. */
export const MoveToIcon = makeIcon(
  <>
    {/* motion arrow on the left */}
    <path d="M1 10 H 9 V 8 L 13 12 L 9 16 V 14 H 1 Z" />
    {/* map pin on the right */}
    <path
      fillRule="evenodd"
      d="M18 2 a 5 5 0 0 0 -5 5 c 0 3.8 5 12 5 12 s 5 -8.2 5 -12 a 5 5 0 0 0 -5 -5 Z M 18 5.4 a 2 2 0 1 0 0 4 a 2 2 0 0 0 0 -4 Z"
    />
  </>,
);

/** Conveyor — belt rectangle with four roller circles underneath. */
export const ConveyorIcon = makeIcon(
  <>
    <rect x="1" y="7" width="22" height="6" rx="1" />
    <circle cx="4.5" cy="17" r="3" />
    <circle cx="10" cy="17" r="3" />
    <circle cx="15.5" cy="17" r="3" />
    <circle cx="21" cy="17" r="3" />
  </>,
);

// ── kind → icon map ─────────────────────────────────────────────────────────

export const PML_ICONS: Record<PmlBlockKind, PmlIconComponent> = {
  Source: SourceIcon,
  Sink: SinkIcon,
  Queue: QueueIcon,
  Delay: DelayIcon,
  Hold: HoldIcon,
  Wait: WaitIcon,
  Service: ServiceIcon,
  Seize: SeizeIcon,
  Release: ReleaseIcon,
  ResourcePool: ResourcePoolIcon,
  SelectOutput: SelectOutputIcon,
  SelectOutput5: SelectOutput5Icon,
  Batch: BatchIcon,
  Unbatch: UnbatchIcon,
  Combine: CombineIcon,
  Match: MatchIcon,
  Assembler: AssemblerIcon,
  Split: SplitIcon,
  MoveTo: MoveToIcon,
  Conveyor: ConveyorIcon,
};

export function getPmlIcon(kind: PmlBlockKind): PmlIconComponent {
  return PML_ICONS[kind];
}
