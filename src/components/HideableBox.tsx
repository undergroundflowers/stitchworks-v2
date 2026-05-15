import { useState, type ReactNode, type CSSProperties } from 'react';
import { SW_COLORS } from '../design/tokens';

interface HideableBoxProps {
  children: ReactNode;
  defaultHidden?: boolean;
  style?: CSSProperties;
  toggleOffset?: number;
  toggleSize?: number;
}

/** Wraps any report tile/card with an eye toggle in the top-right corner.
 *  Clicking the toggle blurs the wrapped content and disables pointer
 *  events on it, while the toggle itself stays sharp and clickable. */
export function HideableBox({
  children,
  defaultHidden = false,
  style,
  toggleOffset = 10,
  toggleSize = 26,
}: HideableBoxProps) {
  const [hidden, setHidden] = useState(defaultHidden);
  const iconSize = Math.max(12, toggleSize - 12);
  return (
    <div style={{ position: 'relative', ...style }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setHidden((h) => !h);
        }}
        title={hidden ? 'Show section' : 'Hide section'}
        aria-label={hidden ? 'Show section' : 'Hide section'}
        aria-pressed={hidden}
        style={{
          position: 'absolute',
          top: toggleOffset,
          right: toggleOffset,
          zIndex: 6,
          width: toggleSize,
          height: toggleSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: hidden ? SW_COLORS.brand : 'rgba(255,255,255,0.92)',
          color: hidden ? '#fff' : SW_COLORS.muted,
          border: `1px solid ${hidden ? SW_COLORS.brand : SW_COLORS.line}`,
          borderRadius: 6,
          padding: 0,
          cursor: 'pointer',
          boxShadow: hidden ? '0 2px 6px rgba(255,91,38,0.35)' : '0 1px 2px rgba(0,0,0,0.06)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          transition: 'background 140ms, color 140ms, border-color 140ms, box-shadow 140ms',
        }}
        onMouseEnter={(e) => {
          if (!hidden) {
            e.currentTarget.style.color = SW_COLORS.ink;
            e.currentTarget.style.borderColor = SW_COLORS.ink;
          }
        }}
        onMouseLeave={(e) => {
          if (!hidden) {
            e.currentTarget.style.color = SW_COLORS.muted;
            e.currentTarget.style.borderColor = SW_COLORS.line;
          }
        }}
      >
        {hidden ? <EyeOffIcon size={iconSize} /> : <EyeIcon size={iconSize} />}
      </button>
      <div
        aria-hidden={hidden}
        style={{
          filter: hidden ? 'blur(10px)' : 'none',
          pointerEvents: hidden ? 'none' : 'auto',
          userSelect: hidden ? 'none' : 'auto',
          transition: 'filter 220ms',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
