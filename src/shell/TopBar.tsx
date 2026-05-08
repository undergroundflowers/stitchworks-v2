import { useLocation, useNavigate } from 'react-router-dom';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { ROUTES } from '../lib/routes';
import type { GameState } from '../lib/game';

interface TopBarProps {
  game: GameState;
}

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

  return (
    <div
      style={{
        background: SW_COLORS.ink,
        color: SW_COLORS.paper,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
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
          gap: 9,
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
      </div>

      <div style={{ width: 1, height: 24, background: '#ffffff20' }} />

      {/* Factory + settings icon */}
      <div style={{ fontFamily: SW_FONTS.body, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{game.factoryName}</div>
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
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 2 }}>
        {ROUTES.filter((r) => r.kind === 'main' && r.id !== 'settings').map((r) => {
          const active = currentRoute === r.id;
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
                padding: '8px 12px',
                color: active ? SW_COLORS.brand : '#ffffffcc',
                fontFamily: SW_FONTS.body,
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: SW_RADIUS.sm,
                transition: 'background 100ms',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 14 }}>{r.icon}</span>
              <span>{r.label}</span>
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
