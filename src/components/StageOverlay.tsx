import type { CSSProperties, ReactNode } from 'react';

interface StageOverlayProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/**
 * Wrapper for floating controls that sit inside a pan/zoom stage (zoom
 * strips, mini-maps, legend chips, etc.).
 *
 * Why: a pan-enabled stage typically listens for pointerdown/mousedown on
 * itself and may call setPointerCapture or start a drag. Without this
 * wrapper, a child button's pointerdown bubbles up, the stage captures the
 * pointer, the matching pointerup never reaches the button, and the click
 * is lost. Stopping propagation here keeps overlay controls clickable no
 * matter what the parent stage does.
 */
export function StageOverlay({ children, style, className }: StageOverlayProps) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div
      data-stage-overlay=""
      className={className}
      style={style}
      onPointerDown={stop}
      onMouseDown={stop}
      onWheel={stop}
      onClick={stop}
    >
      {children}
    </div>
  );
}
