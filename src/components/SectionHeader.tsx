import type { ReactNode } from 'react';
import { SW_COLORS, SW_TYPE } from '../design/tokens';

interface SectionHeaderProps {
  kicker?: string;
  /** Optional: a page whose own tabs already name it can show just the sub line. */
  title?: string;
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
              ...SW_TYPE.kicker,
              color: SW_COLORS.brand,
              marginBottom: 4,
            }}
          >
            {kicker}
          </div>
        )}
        {title && (
          <div
            style={{
              ...SW_TYPE.title,
              color: SW_COLORS.ink,
            }}
          >
            {title}
          </div>
        )}
        {sub && (
          <div style={{ fontSize: 13, color: SW_COLORS.muted, marginTop: title ? 4 : 0 }}>{sub}</div>
        )}
      </div>
      {right}
    </div>
  );
}
