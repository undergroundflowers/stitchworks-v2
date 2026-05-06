import type { ReactNode } from 'react';
import { SW_COLORS, SW_FONTS } from '../design/tokens';

interface TagProps {
  children: ReactNode;
  color?: string;
  bg?: string;
  soft?: boolean;
  dot?: boolean;
}

export function Tag({ children, color = SW_COLORS.ink, bg, soft, dot }: TagProps) {
  const _bg = bg || (soft ? `${color}18` : color);
  const _fg = soft ? color : '#fff';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: _bg,
        color: _fg,
        borderRadius: 999,
        padding: '3px 9px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.2px',
        fontFamily: SW_FONTS.body,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: soft ? color : '#fff',
          }}
        />
      )}
      {children}
    </span>
  );
}
