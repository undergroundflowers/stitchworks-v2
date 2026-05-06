import { useState, type CSSProperties, type ReactNode } from 'react';
import { SW_COLORS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';

interface CardProps {
  children: ReactNode;
  padding?: number;
  accent?: string;
  style?: CSSProperties;
  onClick?: () => void;
  hover?: boolean;
  raised?: boolean;
}

export function Card({
  children,
  padding = 18,
  accent,
  style,
  onClick,
  hover,
  raised,
}: CardProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHov(true)}
      onMouseLeave={() => hover && setHov(false)}
      style={{
        background: SW_COLORS.paper,
        border: `1px solid ${SW_COLORS.line}`,
        borderRadius: SW_RADIUS.md,
        padding,
        boxShadow: raised || hov ? SW_SHADOWS.pop : SW_SHADOWS.card,
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 140ms, transform 140ms',
        transform: hov ? 'translateY(-1px)' : 'none',
        ...style,
      }}
    >
      {accent && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: 4,
            background: accent,
            borderRadius: `${SW_RADIUS.md}px 0 0 ${SW_RADIUS.md}px`,
          }}
        />
      )}
      {children}
    </div>
  );
}
