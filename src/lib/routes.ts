/**
 * Route registry — every page in Stitchworks is declared here once. The top
 * bar reads from this list to render its nav buttons; the router wires each
 * `path` to its page component. Add a route by extending this array and
 * adding a `<Route>` entry in App.tsx.
 *
 * `kind: 'main'` routes appear in the top-bar nav. `kind: 'special'` routes
 * (currently just the menu/home) are reachable but not rendered as nav buttons.
 */

export type RouteKind = 'main' | 'special';

export interface RouteDef {
  /** URL path */
  path: string;
  /** Stable id used by code; matches the original prototype's route ids. */
  id: string;
  /** Human-readable label for nav UI. */
  label: string;
  /** Glyph used in nav UI. */
  icon: string;
  kind: RouteKind;
}

export const ROUTES: RouteDef[] = [
  { path: '/',          id: 'menu',      label: 'MENU',             icon: '⌂', kind: 'special' },
  { path: '/floor',     id: 'floor',     label: 'Live Floor',       icon: '⬢', kind: 'main' },
  { path: '/iso',       id: 'iso',       label: 'Factory Builder',      icon: '◆', kind: 'main' },
  { path: '/orders',    id: 'orders',    label: 'Orders',           icon: '⎙', kind: 'main' },
  { path: '/sim',       id: 'sim',       label: 'Simulation',       icon: '▷', kind: 'main' },
  { path: '/resources', id: 'resources', label: 'Resources',        icon: '⊟', kind: 'main' },
  { path: '/kpi',       id: 'kpi',       label: 'Reports',          icon: '⌬', kind: 'special' },
  { path: '/scenarios', id: 'scenarios', label: 'Scenarios',        icon: '✦', kind: 'main' },
  { path: '/balance',   id: 'balance',   label: 'Line Balance',     icon: '⚖', kind: 'main' },
  { path: '/settings',  id: 'settings',  label: 'Settings',         icon: '⚙', kind: 'main' },
];

/**
 * Drill-down routes that don't appear in the top-bar nav. Their paths are
 * parameterised; React Router resolves them to the dedicated pages.
 *
 *   /dept/:deptId               department interior (drill-down from Live Floor)
 *   /workstation/:deptId/:wsId  one workstation inside a department
 */
export const DRILL_PATHS = {
  dept:        (deptId: string) => `/dept/${deptId}`,
  workstation: (deptId: string, wsId: string) => `/workstation/${deptId}/${wsId}`,
} as const;

export const ROUTE_BY_ID: Record<string, RouteDef> = Object.fromEntries(
  ROUTES.map((r) => [r.id, r]),
);
