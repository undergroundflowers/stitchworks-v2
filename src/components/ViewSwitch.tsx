import type { ReactNode } from 'react';
import { SW_COLORS, SW_MOTION, SW_RADIUS, SW_TYPE } from '../design/tokens';
import { alpha } from '../design/color-utils';

/**
 * The canvas view switcher, in one place.
 *
 * Build's 2D · ISO · PROCESS pill and Run's ISO · TOP · HEAT · LOGIC · PML
 * pill were the same control drawn twice — different padding, radius,
 * typography and backdrop, one of them in raw hex, and only one of them a
 * real tablist or reacting to hover. They sit in the same spot on screen and
 * do the same job, so they should be the same component.
 *
 * By default it floats over the top-centre of a canvas. `inline` drops the
 * floating so the same pill can sit in a toolbar (STATISTICS puts it at the
 * right end of its title bar). A label may be an icon; give such an option a
 * `title`, which then doubles as its accessible name.
 */
export function ViewSwitch<T extends string>({
  value,
  options,
  onChange,
  title,
  inline = false,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  /** Tooltip for the group as a whole. */
  title?: string;
  /** Lay out in the normal flow instead of floating over a canvas. */
  inline?: boolean;
}) {
  return (
    <div
      role="tablist"
      title={title}
      style={{
        ...(inline
          ? { flex: 'none' }
          : {
              position: 'absolute' as const,
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 6,
            }),
        display: 'flex',
        gap: 2,
        background: alpha(SW_COLORS.void, 0.92),
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: 2,
        borderRadius: SW_RADIUS.sm + 2,
        border: `1px solid ${SW_COLORS.line}`,
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          aria-label={typeof o.label === 'string' ? undefined : o.title}
          onClick={() => onChange(o.value)}
          onMouseEnter={(e) => {
            if (value !== o.value) e.currentTarget.style.color = SW_COLORS.ink;
          }}
          onMouseLeave={(e) => {
            if (value !== o.value) e.currentTarget.style.color = SW_COLORS.muted;
          }}
          style={{
            ...SW_TYPE.kicker,
            letterSpacing: '0.08em',
            background: value === o.value ? SW_COLORS.brand : 'transparent',
            color: value === o.value ? SW_COLORS.void : SW_COLORS.muted,
            border: 'none',
            padding: '7px 13px',
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'pointer',
            borderRadius: SW_RADIUS.sm,
            transition: `background ${SW_MOTION.instant}ms ${SW_MOTION.standard}, color ${SW_MOTION.instant}ms ${SW_MOTION.standard}`,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
