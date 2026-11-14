import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SideBar } from './shell/SideBar';
import { useKeepAliveSurfaces, type Surface } from './shell/KeepAlive';
import { SW_COLORS, SW_FONTS } from './design/tokens';
import { ErrorBoundary, useToast } from './components';
import { QUOTA_EVENT, type QuotaEventDetail } from './store/persist-storage';
import { useStoresHydrated } from './store/storage/useHydrated';
import { useBackspaceGuard } from './lib/use-backspace-guard';

import { SimSessionDriver } from './simulation/SimSessionDriver';

import { MenuPage } from './pages/Menu';
import { LiveSimPage } from './pages/LiveSim';
import { ResourcesPage } from './pages/Resources';
import { SettingsPage } from './pages/Settings';
import { BuilderPage } from './pages/Builder';
import { WorkstationDetailPage } from './pages/WorkstationDetail';
import { ReportsTabPage } from './pages/ReportsTab';
import { InsightsPage } from './pages/Insights';
import { QueueLabPage } from './pages/QueueLab';
import { HelpPage } from './pages/Help';

/**
 * The rail's surfaces. These are kept mounted across tab switches (see
 * `shell/KeepAlive.tsx`), so each one is exactly as it was left when the user
 * comes back to it. Resources holds the garment operation bulletins —
 * everything the others draw from.
 *
 * Declared once at module level so the elements are the same objects on every
 * render of the shell.
 */
const SURFACES: readonly Surface[] = [
  { path: '/resources', element: <ResourcesPage /> },
  { path: '/line', element: <BuilderPage /> },
  { path: '/sim', element: <LiveSimPage /> },
  { path: '/insights', element: <InsightsPage /> },
  { path: '/reports', element: <ReportsTabPage /> },
  { path: '/lab', element: <QueueLabPage /> },
  { path: '/help', element: <HelpPage /> },
  { path: '/settings', element: <SettingsPage /> },
];

/**
 * App shell: sidebar + route outlet. On launch the app opens straight to the
 * home menu (route "/").
 */
export default function App() {
  const location = useLocation();
  const toast = useToast();
  const hydrated = useStoresHydrated();

  // A bare Backspace outside a text field still means "go back" in Safari and
  // in most embedded webviews, which threw the user out of whatever surface
  // they were on and back to the home menu. Cancel that default app-wide.
  useBackspaceGuard();

  // NOTE: there is deliberately no auto-seed here.
  //
  // This used to re-seed a 27-station T-shirt line whenever the workspace was
  // empty, which made "empty" an unreachable state: creating a new factory,
  // or deleting the last station of an existing one, handed control back to
  // this effect and the starter line reappeared on the next render. A new
  // factory must open on a blank floor — `buildStarterLine` is still exported
  // for tests and can be offered as an explicit template, but it must never
  // fire on its own.

  // Surface localStorage quota failures (dispatched by the persist wrapper)
  // as a visible toast instead of a console-only error.
  useEffect(() => {
    const onQuota = (e: Event) => {
      const detail = (e as CustomEvent<QuotaEventDetail>).detail;
      void detail;
      toast({
        kind: 'error',
        message:
          'Storage is full — your most recent changes could not be saved. '
          + 'Export and remove an old factory to free up space.',
        duration: 8000,
      });
    };
    window.addEventListener(QUOTA_EVENT, onQuota);
    return () => window.removeEventListener(QUOTA_EVENT, onQuota);
  }, [toast]);

  const showSideBar = location.pathname !== '/';
  const surfaces = useKeepAliveSurfaces(SURFACES);

  // Gate the first render until the IndexedDB-backed stores have rehydrated,
  // so the UI never flashes an empty factory while persistence loads.
  if (!hydrated) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: SW_COLORS.paperDeep,
          fontFamily: SW_FONTS.body,
        }}
      >
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 22, color: SW_COLORS.brand, letterSpacing: 1 }}>
          STITCHWORKS
        </div>
        <div style={{ fontSize: 12, color: SW_COLORS.muted }}>Loading your factory…</div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'row',
        background: SW_COLORS.paperDeep,
      }}
    >
      {/*
        The simulation clock. Headless, and deliberately mounted here — above
        the router — so playback survives navigation: start a run on the Sim
        screen, walk to Insights, and the same engine is still ticking at the
        same frame. While each page owned its own loop, leaving the page killed
        the run.
      */}
      <SimSessionDriver />
      {showSideBar && <SideBar />}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* Every surface visited so far — the current one showing, the rest
            hidden but intact. */}
        {surfaces.node}
        {/* Everything that is not a rail surface: the home menu, a drill-down,
            the redirects. Rendered only while one of those is the live path,
            so none of these routes ever competes with a surface above. */}
        {!surfaces.active && (
        <ErrorBoundary key={location.pathname} scope="page">
        <Routes>
          <Route path="/" element={<MenuPage />} />

          {/* One station's queueing detail, drilled into from INSIGHTS. */}
          <Route path="/workstation/:deptId/:wsId" element={<WorkstationDetailPage />} />

          {/* Everything that used to be its own tab now lives inside one of the
              four. Redirects are declared here and nowhere else, so the route
              registry stays a list of real surfaces. */}
          <Route path="/builder" element={<Navigate to="/line" replace />} />
          <Route path="/iso" element={<Navigate to="/line" replace />} />
          <Route path="/dept/:deptId" element={<Navigate to="/line" replace />} />
          <Route path="/assets" element={<Navigate to="/resources" replace />} />
          <Route path="/balance" element={<Navigate to="/insights" replace />} />
          <Route path="/kpi" element={<Navigate to="/insights" replace />} />
          <Route path="/queues" element={<Navigate to="/insights" replace />} />
          <Route path="/queues/analytics" element={<Navigate to="/insights" replace />} />
          <Route path="/scenarios" element={<Navigate to="/insights" replace />} />
          <Route path="/orders" element={<Navigate to="/resources?tab=operations" replace />} />
          <Route path="/floor" element={<Navigate to="/" replace />} />
          <Route path="/reference" element={<Navigate to="/" replace />} />
          <Route path="/pilot" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
