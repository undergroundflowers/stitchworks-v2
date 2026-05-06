import { useState, type CSSProperties, type ReactNode } from 'react';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'dark'
  | 'success'
  | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  full?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

const VARIANTS: Record<
  ButtonVariant,
  { bg: string; fg: string; bgHov: string; border: string }
> = {
  primary:   { bg: SW_COLORS.brand, fg: '#fff',          bgHov: SW_COLORS.brandDeep, border: 'transparent' },
  secondary: { bg: SW_COLORS.paper, fg: SW_COLORS.ink,   bgHov: SW_COLORS.paperDeep, border: SW_COLORS.line },
  ghost:     { bg: 'transparent',   fg: SW_COLORS.ink,   bgHov: SW_COLORS.paperDeep, border: 'transparent' },
  dark:      { bg: SW_COLORS.ink,   fg: SW_COLORS.paper, bgHov: SW_COLORS.steel,     border: 'transparent' },
  success:   { bg: SW_COLORS.ok,    fg: '#fff',          bgHov: '#199A5C',           border: 'transparent' },
  danger:    { bg: SW_COLORS.alarm, fg: '#fff',          bgHov: '#C0392B',           border: 'transparent' },
};

const SIZES: Record<ButtonSize, { p: string; f: number }> = {
  sm: { p: '6px 10px', f: 12 },
  md: { p: '9px 14px', f: 13 },
  lg: { p: '13px 22px', f: 15 },
};

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  icon,
  full,
  disabled,
  style,
}: ButtonProps) {
  const [hov, setHov] = useState(false);
  const v = VARIANTS[variant];
  const sz = SIZES[size];
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      disabled={disabled}
      style={{
        background: hov && !disabled ? v.bgHov : v.bg,
        color: v.fg,
        border: v.border === 'transparent' ? 'none' : `1px solid ${v.border}`,
        borderRadius: SW_RADIUS.sm,
        padding: sz.p,
        fontSize: sz.f,
        fontWeight: 600,
        fontFamily: SW_FONTS.body,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        width: full ? '100%' : 'auto',
        justifyContent: 'center',
        transition: 'background 100ms',
        ...style,
      }}
    >
      {icon && <span style={{ fontSize: sz.f + 2 }}>{icon}</span>}
      {children}
    </button>
  );
}
