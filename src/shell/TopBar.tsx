import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { ROUTES, type RouteDef } from '../lib/routes';
import type { GameState } from '../lib/game';
import { useTabPrefs, type TabPref } from '../lib/tabPrefs';
import { useProject } from '../store';

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
 *
 * Each main-nav tab carries two tiny controls below its label:
 *   👁  visibility — collapses the tab into the "⋯" overflow menu
 *   🔒  lock       — blocks click-to-navigate (URL still works)
 * Preferences are stored per-user in localStorage (see useTabPrefs).
 */
export function TopBar({ game }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const factoryName = useProject((s) => s.meta.name) || game.factoryName;
  const { get, toggleHidden, toggleLocked } = useTabPrefs();

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

  // Split the main-nav routes into visible / hidden based on prefs. Settings
  // is rendered separately in the factory chip, so it stays out of both lists.
  const mainRoutes = ROUTES.filter((r) => r.kind === 'main' && r.id !== 'settings');
  const visibleRoutes = mainRoutes.filter((r) => !get(r.id).hidden);
  const hiddenRoutes = mainRoutes.filter((r) => get(r.id).hidden);

  // Overflow menu (the "⋯" button) state — controlled, closes on outside click.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!overflowOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!overflowRef.current?.contains(e.target as Node)) setOverflowOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [overflowOpen]);

  return (
    <div
      style={{
        background: SW_COLORS.ink,
        color: SW_COLORS.paper,
        padding: narrow ? '0 10px' : '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: narrow ? 8 : 14,
        height: 66,
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
        {!narrow && <div style={{ fontWeight: 700, fontSize: 12 }}>{factoryName}</div>}
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
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: narrow ? 0 : 2, minWidth: 0 }}>
        {visibleRoutes.map((r) => (
          <NavTab
            key={r.id}
            route={r}
            active={currentRoute === r.id}
            narrow={narrow}
            pref={get(r.id)}
            onNavigate={() => navigate(r.path)}
            onToggleHidden={() => toggleHidden(r.id)}
            onToggleLocked={() => toggleLocked(r.id)}
          />
        ))}

        {/* Overflow menu — only renders when at least one tab is hidden. */}
        {hiddenRoutes.length > 0 && (
          <div ref={overflowRef} style={{ position: 'relative', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setOverflowOpen((v) => !v)}
              aria-label={`Hidden tabs (${hiddenRoutes.length})`}
              title={`Hidden tabs (${hiddenRoutes.length})`}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff0a'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = overflowOpen ? '#ffffff15' : 'transparent'; }}
              style={{
                background: overflowOpen ? '#ffffff15' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: narrow ? '7px 10px' : '8px 12px',
                color: '#ffffffcc',
                fontFamily: SW_FONTS.body,
                fontSize: 14,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                borderRadius: SW_RADIUS.sm,
                transition: 'background 100ms',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ letterSpacing: 1 }}>⋯</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: SW_COLORS.brand,
                  color: '#fff',
                  borderRadius: 999,
                  minWidth: 16,
                  height: 16,
                  padding: '0 5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {hiddenRoutes.length}
              </span>
            </button>
            {overflowOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  background: SW_COLORS.ink,
                  border: '1px solid #ffffff25',
                  borderRadius: SW_RADIUS.md,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                  padding: 6,
                  minWidth: 220,
                  zIndex: 100,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#ffffff66',
                    padding: '6px 10px 4px',
                    fontFamily: SW_FONTS.body,
                  }}
                >
                  Hidden tabs
                </div>
                {hiddenRoutes.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: SW_RADIUS.sm,
                      fontFamily: SW_FONTS.body,
                      fontSize: 12,
                      color: '#ffffffcc',
                    }}
                  >
                    <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{r.icon}</span>
                    <span style={{ flex: 1 }}>{r.label}</span>
                    <button
                      onClick={() => toggleHidden(r.id)}
                      aria-label={`Show ${r.label}`}
                      title={`Show ${r.label}`}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff15'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ffffffcc',
                        padding: 4,
                        borderRadius: SW_RADIUS.sm,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <EyeIcon open={false} size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

interface NavTabProps {
  route: RouteDef;
  active: boolean;
  narrow: boolean;
  pref: TabPref;
  onNavigate: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
}

/**
 * One nav button. Wraps the label/icon plus a row of two micro-buttons (eye,
 * lock) underneath. The eye and lock buttons stopPropagation so clicking them
 * never fires navigation — they only mutate prefs.
 */
function NavTab({ route, active, narrow, pref, onNavigate, onToggleHidden, onToggleLocked }: NavTabProps) {
  const [hovered, setHovered] = useState(false);
  const label = narrow && route.shortLabel ? route.shortLabel : route.label;
  const locked = pref.locked;

  // The wrapping <div> handles navigation (click). The two inner buttons each
  // stopPropagation. We render as a div instead of a button so we can nest the
  // micro-buttons without violating HTML's no-button-in-button rule.
  return (
    <div
      onClick={() => { if (!locked) onNavigate(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-disabled={locked || undefined}
      aria-current={active ? 'page' : undefined}
      onKeyDown={(e) => {
        if (locked) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onNavigate();
        }
      }}
      style={{
        background: active ? '#ffffff15' : hovered && !locked ? '#ffffff0a' : 'transparent',
        cursor: locked ? 'not-allowed' : 'pointer',
        padding: narrow ? '4px 8px 3px' : '5px 12px 4px',
        color: locked
          ? '#ffffff55'
          : active
            ? SW_COLORS.brand
            : '#ffffffcc',
        fontFamily: SW_FONTS.body,
        fontSize: narrow ? 11.5 : 12,
        fontWeight: 600,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        borderRadius: SW_RADIUS.sm,
        transition: 'background 100ms, color 100ms',
        position: 'relative',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: narrow ? 4 : 6 }}>
        <span style={{ fontSize: narrow ? 13 : 14 }}>{route.icon}</span>
        <span>{label}</span>
        {active && (
          <div
            style={{
              position: 'absolute',
              top: narrow ? 22 : 24,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 18,
              height: 2,
              background: SW_COLORS.brand,
            }}
          />
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 2,
          opacity: hovered || active || locked ? 1 : 0.55,
          transition: 'opacity 120ms',
        }}
      >
        <MicroToggle
          onClick={(e) => { e.stopPropagation(); onToggleHidden(); }}
          label={`Hide ${route.label}`}
          tone="default"
        >
          <EyeIcon open size={12} />
        </MicroToggle>
        <MicroToggle
          onClick={(e) => { e.stopPropagation(); onToggleLocked(); }}
          label={locked ? `Unlock ${route.label}` : `Lock ${route.label}`}
          tone={locked ? 'active' : 'default'}
        >
          <LockIcon locked={locked} size={12} />
        </MicroToggle>
      </div>
    </div>
  );
}

interface MicroToggleProps {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  tone: 'default' | 'active';
  children: React.ReactNode;
}

function MicroToggle({ onClick, label, tone, children }: MicroToggleProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={label}
      title={label}
      style={{
        background: tone === 'active'
          ? '#ffffff20'
          : hovered
            ? '#ffffff15'
            : 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 2,
        width: 18,
        height: 16,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: tone === 'active' ? SW_COLORS.brand : '#ffffffaa',
        borderRadius: 4,
        transition: 'background 100ms, color 100ms',
      }}
    >
      {children}
    </button>
  );
}

interface IconProps {
  size?: number;
}

function EyeIcon({ open, size = 12 }: IconProps & { open: boolean }) {
  // 16-grid eye, stroked with currentColor. When `open` is false we draw a
  // slash across, matching the convention used in design tools.
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 8 C 3.5 4.5, 6 3, 8 3 C 10 3, 12.5 4.5, 14.5 8 C 12.5 11.5, 10 13, 8 13 C 6 13, 3.5 11.5, 1.5 8 Z" />
      <circle cx="8" cy="8" r="2" />
      {!open && <path d="M2.5 13.5 L 13.5 2.5" />}
    </svg>
  );
}

function LockIcon({ locked, size = 12 }: IconProps & { locked: boolean }) {
  // Padlock. When unlocked, the shackle is drawn with its right leg lifted.
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7.5" width="10" height="6.5" rx="1.2" />
      {locked ? (
        <path d="M5.5 7.5 V 5 a 2.5 2.5 0 0 1 5 0 V 7.5" />
      ) : (
        <path d="M5.5 7.5 V 5 a 2.5 2.5 0 0 1 5 0" />
      )}
    </svg>
  );
}
