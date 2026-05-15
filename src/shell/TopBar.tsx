import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { ROUTES } from '../lib/routes';
import type { GameState } from '../lib/game';

interface TopBarProps {
  game: GameState;
}

/** Below this width the bar tightens — wordmark hides, nav switches to
 *  shortLabel where one exists, factory chip drops its name. Set to catch
 *  ~13" laptops (1280px) and anything narrower. */
const NARROW_BREAKPOINT = 1180;
/** Below this the brand wordmark disappears entirely (logo only). */
const COMPACT_BREAKPOINT = 980;

/**
 * Sticky top HUD shown on every page except the splash menu. Renders the
 * brand mark, factory + day/shift, the route nav, and the gamification chips
 * (currency, level/XP, efficiency, achievements, user chip).
 */
export function TopBar({ game }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Find the current route by matching the pathname; default to 'menu'.
  const currentRoute =
    ROUTES.find((r) => r.path === location.pathname)?.id ?? 'menu';

  // Listen for window resize so the bar can tighten without a refresh. Keeps
  // the bar self-contained (no global context). Throttled via rAF.
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const narrow = width < NARROW_BREAKPOINT;
  const compact = width < COMPACT_BREAKPOINT;

  return (
    <div
      style={{
        background: SW_COLORS.ink,
        color: SW_COLORS.paper,
        padding: narrow ? '0 10px' : '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: narrow ? 8 : 14,
        height: 54,
        borderBottom: `1px solid #ffffff15`,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        onClick={() => navigate('/')}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: narrow ? 6 : 9,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32">
          <rect x="2" y="2" width="28" height="28" rx="5" fill={SW_COLORS.brand} />
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
        {!compact && (
          <span
            style={{
              fontFamily: SW_FONTS.display,
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: '-0.01em',
            }}
          >
            STITCHWORKS
          </span>
        )}
      </div>

      {!compact && <div style={{ width: 1, height: 24, background: '#ffffff20' }} />}

      {/* Factory + settings icon */}
      <div style={{ fontFamily: SW_FONTS.body, fontSize: 12, display: 'flex', alignItems: 'center', gap: narrow ? 6 : 8 }}>
        {!narrow && <div style={{ fontWeight: 700, fontSize: 12 }}>{game.factoryName}</div>}
        <button
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          title="Settings"
          onMouseEnter={(e) => {
            if (currentRoute !== 'settings') e.currentTarget.style.background = '#ffffff0a';
          }}
          onMouseLeave={(e) => {
            if (currentRoute !== 'settings') e.currentTarget.style.background = 'transparent';
          }}
          style={{
            background: currentRoute === 'settings' ? '#ffffff15' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            width: 26,
            height: 26,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: currentRoute === 'settings' ? SW_COLORS.brand : '#ffffffcc',
            fontSize: 14,
            borderRadius: SW_RADIUS.sm,
            transition: 'background 100ms',
          }}
        >
          ⚙
        </button>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: narrow ? 0 : 2, minWidth: 0 }}>
        {ROUTES.filter((r) => r.kind === 'main' && r.id !== 'settings').map((r) => {
          const active = currentRoute === r.id;
          const label = narrow && r.shortLabel ? r.shortLabel : r.label;
          return (
            <button
              key={r.id}
              onClick={() => navigate(r.path)}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = '#ffffff0a';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
              style={{
                background: active ? '#ffffff15' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: narrow ? '7px 8px' : '8px 12px',
                color: active ? SW_COLORS.brand : '#ffffffcc',
                fontFamily: SW_FONTS.body,
                fontSize: narrow ? 11.5 : 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: narrow ? 4 : 6,
                borderRadius: SW_RADIUS.sm,
                transition: 'background 100ms',
                position: 'relative',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: narrow ? 13 : 14 }}>{r.icon}</span>
              <span>{label}</span>
              {active && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 18,
                    height: 2,
                    background: SW_COLORS.brand,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
