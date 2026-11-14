import { Activity, useEffect, useState, type ReactNode } from 'react';
import { Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { ErrorBoundary } from '../components';
import { useFactoryEpoch } from '../store/factoryEpoch';

/**
 * The rail's surfaces, kept alive.
 *
 * Each surface used to be a plain `<Route>`, so leaving a tab unmounted it and
 * coming back built a new one: the camera back at its default framing, the
 * selection gone, drawers closed, the table scrolled to the top. Everything a
 * page held in component state — and across the Builder and the Sim that is a
 * great deal — lasted exactly as long as the tab stayed open.
 *
 * Here a surface mounts the first time it is visited and then stays mounted.
 * Switching away hides it rather than removing it, so returning shows the very
 * same component instance, DOM and all, as it was left.
 *
 * Three things make that safe rather than merely cheap:
 *
 *   `<Activity>`     hides the page AND tears its effects down while hidden,
 *                    then runs them again on return. Without that a hidden
 *                    Builder would still own its window key listeners, and
 *                    Delete pressed on the Sim screen would delete a station.
 *
 *   a frozen URL     each surface reads the last location that was its own,
 *                    not the live one. Several pages keep view state in the
 *                    query string (`?tab=`, `?scope=`); fed the live URL, a
 *                    hidden page would see another tab's params and re-render
 *                    itself back to its defaults behind the scenes.
 *
 *   the epoch        opening a different factory discards every surface that
 *                    is not on screen. State resumed into another factory
 *                    would be pointing at stations that are not there.
 */

export interface Surface {
  /** Exact pathname the surface lives at. */
  path: string;
  element: ReactNode;
}

interface Entry {
  /** The surface's own most recent location — what its router hooks read. */
  location: Location;
  /** Changing this remounts the surface from scratch. */
  gen: number;
}

interface KeepAliveState {
  /** Last live location folded in; a new object means a navigation happened. */
  seen: Location | null;
  epoch: number;
  genSeq: number;
  entries: Record<string, Entry>;
}

function fold(
  state: KeepAliveState,
  location: Location,
  epoch: number,
  paths: ReadonlySet<string>,
): KeepAliveState {
  let { entries, genSeq } = state;
  const seenPath = state.seen?.pathname ?? null;

  if (epoch !== state.epoch) {
    // A different factory is open. Only the surface the user was standing on
    // when it happened is kept — it handled the swap itself, in place (the
    // Builder's own factory picker). From the home menu that is none of them.
    const standing = seenPath !== null ? entries[seenPath] : undefined;
    entries = standing && seenPath !== null ? { [seenPath]: standing } : {};
  }

  const path = location.pathname;
  if (paths.has(path)) {
    const prev = entries[path];
    const arriving = seenPath !== path;
    if (!prev) {
      genSeq += 1;
      entries = { ...entries, [path]: { location, gen: genSeq } };
    } else if (arriving && location.search === '') {
      // A bare link in from somewhere else — the rail, a back button, the home
      // menu — means "take me to that tab", not "reset that tab". Keep the
      // surface's own URL, query string and all; the effect below puts it back
      // in the address bar.
    } else if (arriving && location.search !== prev.location.search) {
      // A deep link (`/line?ws=…`) asks the surface to open ON something.
      // Pages resolve those once, as they mount, so the request is only
      // honoured by mounting afresh — which is what it always did.
      genSeq += 1;
      entries = { ...entries, [path]: { location, gen: genSeq } };
    } else if (prev.location !== location) {
      entries = { ...entries, [path]: { location, gen: prev.gen } };
    }
  }

  return { seen: location, epoch, genSeq, entries };
}

/**
 * Renders every visited surface, the current one visible and the rest hidden.
 * Returns `active: false` when the live path is not a surface at all (the home
 * menu, a drill-down), so the caller can render its ordinary routes instead —
 * with the surfaces still alive underneath, waiting.
 */
export function useKeepAliveSurfaces(surfaces: readonly Surface[]): {
  active: boolean;
  node: ReactNode;
} {
  const location = useLocation();
  const navigate = useNavigate();
  const epoch = useFactoryEpoch();
  const paths = new Set(surfaces.map((s) => s.path));

  const [stored, setStored] = useState<KeepAliveState>(() =>
    fold({ seen: null, epoch, genSeq: 0, entries: {} }, location, epoch, paths),
  );
  // Derived from props during render, the way React documents for state that
  // follows a prop: fold the navigation in now, so this very render already
  // shows the right surface, and store it for the next one.
  let state = stored;
  if (stored.seen !== location || stored.epoch !== epoch) {
    state = fold(stored, location, epoch, paths);
    setStored(state);
  }

  const activePath = paths.has(location.pathname) ? location.pathname : null;
  const resumed = activePath ? state.entries[activePath]?.location : undefined;

  // A resumed surface is showing its own remembered URL while the address bar
  // holds the bare one that was navigated to. Bring the bar back in line, so a
  // reload or a copied link lands on what is actually on screen.
  const resumeTo =
    resumed && resumed !== location && resumed.search !== location.search
      ? `${resumed.pathname}${resumed.search}${resumed.hash}`
      : null;
  useEffect(() => {
    if (resumeTo) navigate(resumeTo, { replace: true });
  }, [resumeTo, navigate]);

  const node = surfaces.map((s) => {
    const entry = state.entries[s.path];
    if (!entry) return null;
    return (
      <Activity key={`${s.path}#${entry.gen}`} mode={s.path === activePath ? 'visible' : 'hidden'}>
        <ErrorBoundary scope="page">
          <Routes location={entry.location}>
            <Route path={s.path} element={s.element} />
          </Routes>
        </ErrorBoundary>
      </Activity>
    );
  });

  return { active: activePath !== null, node };
}
