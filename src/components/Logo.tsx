import { SW_COLORS, SW_FONTS } from '../design/tokens';

interface LogoProps {
  size?: number;
  mono?: boolean;
}

export function Logo({ size = 24, mono }: LogoProps) {
  const fg = mono ? SW_COLORS.ink : SW_COLORS.brand;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
        <rect x="2" y="2" width="28" height="28" rx="5" fill={fg} />
        <path
          d="M9 9 L23 9 M9 16 L23 16 M9 23 L23 23"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="square"
          strokeDasharray="2 2"
        />
        <path
          d="M9 9 Q9 16 23 16 Q23 23 9 23"
          stroke="#fff"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="square"
        />
      </svg>
      <span
        style={{
          fontFamily: SW_FONTS.display,
          fontSize: size * 0.7,
          fontWeight: 900,
          letterSpacing: '-0.01em',
          color: SW_COLORS.ink,
        }}
      >
        STITCHWORKS
      </span>
    </div>
  );
}
