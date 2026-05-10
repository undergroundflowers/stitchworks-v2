import { useEffect, useReducer, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { TopBar } from './shell/TopBar';
import { INITIAL_GAME } from './lib/game';
import { SW_COLORS } from './design/tokens';
import { SW_TWEAK_DEFAULTS, applyVibe } from './lib/vibe';
import { TweaksPanel, TweakSection, TweakSlider, TweakRadio, useTweaks } from './tweaks';

import { useTwin } from './store/twin';
import { buildDemoTwin } from './domain/twin';

import { MenuPage } from './pages/Menu';
import { OrdersPage } from './pages/Orders';
import { LiveSimPage } from './pages/LiveSim';
import { LineBalancePage } from './pages/LineBalance';
import { ScenariosPage } from './pages/Scenarios';
import { ResourcesPage } from './pages/Resources';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { DeptInteriorPage } from './pages/DeptInterior';
import { WorkstationDetailPage } from './pages/WorkstationDetail';
import { BuilderPage } from './pages/Builder';
import { LiveFloorPage } from './pages/LiveFloor';
import { AssetsGalleryPage } from './pages/AssetsGallery';

/**
 * App shell: top bar + route outlet, vibe-driven theming, the floating
 * Tweaks panel (industrial/workshop/arcade · intensity · avatar style),
 * and the first-run Onboarding modal. Game state is currently a static
 * demo object (see lib/game.ts); it will become reactive once we add a
 * store and wire simulation outputs to it.
 */
export default function App() {
  const location = useLocation();
  const [t, setTweak] = useTweaks(SW_TWEAK_DEFAULTS);
  // Vibe mutates SW_COLORS/SW_FONTS/SW_RADIUS in place. Force a re-render so
  // every component re-reads them on next paint.
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    applyVibe(t.vibe as 'industrial' | 'workshop' | 'arcade');
    force();
  }, [t.vibe]);

  // Seed the canonical twin with the demo factory the first time the app
  // boots into an empty workspace. Existing edits are preserved — we only
  // replace when departments + workstations + scenarios are all empty.
  useEffect(() => {
    const s = useTwin.getState();
    if (
      s.canonical.departments.length === 0 &&
      s.canonical.workstations.length === 0 &&
      s.scenarios.length === 0
    ) {
      s.loadCanonical(buildDemoTwin());
    }
  }, []);

  useEffect(() => {
    const speed = 0.4 + ((t.intensity as number) / 100) * 1.8;
    (window as unknown as { SW_INTENSITY: number }).SW_INTENSITY =
      (t.intensity as number) / 100;
    (window as unknown as { SW_TEMPO: number }).SW_TEMPO = speed;
    document.documentElement.style.setProperty('--sw-tempo', String(speed));
    (window as unknown as { SW_AVATARS: string }).SW_AVATARS = t.avatars as string;
    window.dispatchEvent(new Event('sw_tweaks'));
  }, [t.intensity, t.avatars]);

  // Onboarding shows once per browser; a tiny localStorage flag remembers
  // the dismissal so refreshes don't re-prompt.
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sw_onboarded') !== '1';
    } catch {
      return true;
    }
  });
  const finishOnboarding = (skipped: boolean) => {
    try {
      localStorage.setItem('sw_onboarded', '1');
    } catch {
      /* ignore */
    }
    setShowOnboarding(false);
    if (!skipped) {
      // mirror the original behaviour: completing onboarding lands you on
      // the live floor; skipping leaves you wherever you were
      window.history.pushState({}, '', '/builder');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const showTopBar = location.pathname !== '/';
  const intensityFilter = `saturate(${0.7 + ((t.intensity as number) / 100) * 0.9}) contrast(${0.95 + ((t.intensity as number) / 100) * 0.15})`;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: SW_COLORS.paperDeep,
        filter: intensityFilter,
        transition: 'filter 240ms',
      }}
    >
      {showOnboarding && <Onboarding onFinish={finishOnboarding} />}
      {showTopBar && <TopBar game={INITIAL_GAME} />}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/sim" element={<LiveSimPage />} />
          <Route path="/balance" element={<LineBalancePage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/kpi" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Live Floor — iso 3D / top 2D / heat-map views over the active twin */}
          <Route path="/floor" element={<LiveFloorPage />} />
          {/* Factory Builder — single authoring surface for the digital twin.
              Both /iso (legacy nav id) and /builder route here. */}
          <Route path="/builder" element={<BuilderPage />} />
          <Route path="/iso" element={<BuilderPage />} />
          <Route path="/dept/:deptId" element={<DeptInteriorPage />} />
          <Route path="/workstation/:deptId/:wsId" element={<WorkstationDetailPage />} />
          <Route path="/assets" element={<AssetsGalleryPage />} />
        </Routes>
      </div>

      {/* Arcade scanline overlay — only at high intensity */}
      {t.vibe === 'arcade' && (t.intensity as number) > 70 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 9998,
            background:
              'repeating-linear-gradient(0deg, rgba(255,45,135,0.04) 0 2px, transparent 2px 4px)',
            mixBlendMode: 'multiply',
          }}
        />
      )}

      <TweaksPanel title="STITCHWORKS Tweaks">
        <TweakSection label="Vibe">
          <TweakRadio
            label="Aesthetic"
            value={t.vibe as string}
            options={[
              { value: 'industrial', label: 'Industrial' },
              { value: 'workshop', label: 'Workshop' },
              { value: 'arcade', label: 'Arcade' },
            ]}
            onChange={(v) => setTweak('vibe', v)}
          />
        </TweakSection>
        <TweakSection label="Energy">
          <TweakSlider
            label="Floor intensity"
            value={t.intensity as number}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => setTweak('intensity', v)}
          />
        </TweakSection>
        <TweakSection label="Operators">
          <TweakRadio
            label="Avatar style"
            value={t.avatars as string}
            options={[
              { value: 'dots', label: 'Dots' },
              { value: 'silhouette', label: 'Silhouette' },
              { value: 'chibi', label: 'Chibi' },
            ]}
            onChange={(v) => setTweak('avatars', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
