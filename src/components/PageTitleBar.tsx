import type { ReactNode } from 'react';
import { SW_COLORS, SW_RADIUS } from '../design/tokens';
import { Icon } from './Icon';
import { ViewTitle } from './ViewTitle';

export interface PageTitleBarProps {
  title: string;
  onBack: () => void;
  /** Tooltip and accessible name for the back button. */
  backLabel?: string;
  /** Shown beside the title — a count, a warning chip. */
  aside?: ReactNode;
  /** Held at the true centre of the bar — the control that says what the
   *  page is pointed at (a line scope, a factory). */
  center?: ReactNode;
  /** Right-aligned actions. */
  right?: ReactNode;
}

/**
 * The bar across the top of a surface: back button, the surface's name, and
 * optionally a centred scope control and right-hand actions.
 *
 * RESOURCES, BUILD and RUN each drew this by hand and matched; INSIGHTS and
 * LAB had no bar at all and opened straight onto their content, so moving
 * between tabs the page identity jumped in and out. This is that same bar as
 * a component, so the two late-comers match the others by construction.
 *
 * Three cells. The outer two take equal flex shares, which is what puts
 * `center` in the middle of the bar rather than merely between two clusters of
 * different widths; neither shrinks below its content, so on a narrow window
 * the centre slides aside instead of anything overlapping.
 */
export function PageTitleBar({
  title,
  onBack,
  backLabel = 'Back to menu',
  aside,
  center,
  right,
}: PageTitleBarProps) {
  const side = { flex: '1 1 0', minWidth: 'max-content', display: 'flex', alignItems: 'center' };
  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 16px',
        background: SW_COLORS.paper,
        borderBottom: `1px solid ${SW_COLORS.line}`,
      }}
    >
      <div style={{ ...side, gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          title={backLabel}
          aria-label={backLabel}
          style={{
            flex: 'none',
            width: 30,
            height: 30,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: SW_COLORS.paper,
            border: `1px solid ${SW_COLORS.line}`,
            borderRadius: SW_RADIUS.sm,
            color: SW_COLORS.muted,
            cursor: 'pointer',
          }}
        >
          <Icon name="back" />
        </button>
        <ViewTitle title={title} />
        {aside}
      </div>
      {center}
      <div style={{ ...side, justifyContent: 'flex-end', gap: 8 }}>{right}</div>
    </div>
  );
}
