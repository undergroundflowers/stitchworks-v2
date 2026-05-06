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
  const xpPct = (game.xp / game.xpForNext) * 100;

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

      {/* Factory + day/shift */}
      <div style={{ fontFamily: SW_FONTS.body, fontSize: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{game.factoryName}</div>
        <div
          style={{
            fontSize: 10,
            color: '#ffffff80',
            fontFamily: SW_FONTS.mono,
            fontWeight: 600,
          }}
        >
          DAY {game.day} · SHIFT {game.shift}
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 2 }}>
        {ROUTES.filter((r) => r.kind === 'main').map((r) => {
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

      {/* Gamification HUD */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Currency */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: SW_FONTS.mono,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <span style={{ color: SW_COLORS.thread, fontSize: 14 }}>$</span>
          <span style={{ color: SW_COLORS.thread }}>
            {game.currency.toLocaleString()}
          </span>
        </div>

        {/* Level + XP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: SW_COLORS.brand,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: SW_FONTS.display,
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {game.level}
          </div>
          <div style={{ width: 90 }}>
            <div
              style={{
                fontSize: 9,
                color: '#ffffff80',
                fontFamily: SW_FONTS.mono,
                fontWeight: 700,
                letterSpacing: '0.5px',
              }}
            >
              {game.xp}/{game.xpForNext} XP
            </div>
            <div
              style={{
                height: 4,
                background: '#ffffff15',
                borderRadius: 2,
                overflow: 'hidden',
                marginTop: 2,
              }}
            >
              <div
                style={{
                  width: `${xpPct}%`,
                  height: '100%',
                  background: SW_COLORS.brand,
                }}
              />
            </div>
          </div>
        </div>

        {/* Efficiency */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#ffffff10',
            padding: '4px 9px',
            borderRadius: SW_RADIUS.sm,
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: '#ffffff80',
              fontFamily: SW_FONTS.mono,
              fontWeight: 700,
            }}
          >
            EFF
          </span>
          <span
            style={{
              fontFamily: SW_FONTS.display,
              fontSize: 14,
              fontWeight: 900,
              color:
                game.efficiency >= 80
                  ? SW_COLORS.ok
                  : game.efficiency >= 60
                    ? SW_COLORS.thread
                    : SW_COLORS.alarm,
            }}
          >
            {game.efficiency}%
          </span>
        </div>

        {/* Achievements */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            fontFamily: SW_FONTS.mono,
            fontWeight: 700,
            color: '#ffffffcc',
          }}
        >
          <span style={{ fontSize: 13 }}>♦</span>
          <span>
            {game.achievements}/{game.totalAchievements}
          </span>
        </div>

        {/* User chip */}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: SW_COLORS.steelLite,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
            fontFamily: SW_FONTS.body,
            border: '1px solid #ffffff20',
          }}
        >
          RM
        </div>
      </div>
    </div>
  );
}
