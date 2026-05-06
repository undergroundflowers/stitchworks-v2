import type { ReactNode } from 'react';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';

interface StatProps {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number;
  icon?: ReactNode;
  color?: string;
  big?: boolean;
}

export function Stat({
  label,
  value,
  unit,
  delta,
  icon,
  color = SW_COLORS.ink,
  big,
}: StatProps) {
  return (
    <div
      style={{
        background: SW_COLORS.paper,
        border: `1px solid ${SW_COLORS.line}`,
        borderRadius: SW_RADIUS.md,
        padding: big ? 18 : 14,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 10,
            fontWeight: 700,
            color: SW_COLORS.muted,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        {icon && <span style={{ fontSize: 14, color }}>{icon}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontFamily: SW_FONTS.display,
            fontSize: big ? 32 : 24,
            fontWeight: 900,
            color,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 12, color: SW_COLORS.muted, fontWeight: 600 }}>
            {unit}
          </span>
        )}
      </div>
      {delta != null && (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            fontWeight: 700,
            color: delta > 0 ? SW_COLORS.ok : SW_COLORS.alarm,
          }}
        >
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
        </div>
      )}
    </div>
  );
}
