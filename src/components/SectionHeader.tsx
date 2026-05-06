import type { ReactNode } from 'react';
import { SW_COLORS, SW_FONTS } from '../design/tokens';

interface SectionHeaderProps {
  kicker?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}

export function SectionHeader({ kicker, title, sub, right }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 16 }}>
      <div style={{ flex: 1 }}>
        {kicker && (
          <div
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 10,
              fontWeight: 700,
              color: SW_COLORS.brand,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            {kicker}
          </div>
        )}
        <div
          style={{
            fontFamily: SW_FONTS.display,
            fontSize: 22,
            fontWeight: 900,
            color: SW_COLORS.ink,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 13, color: SW_COLORS.muted, marginTop: 4 }}>{sub}</div>
        )}
      </div>
      {right}
    </div>
  );
}
