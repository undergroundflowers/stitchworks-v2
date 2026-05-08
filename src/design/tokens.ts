/**
 * Design tokens — single source of truth for colours, fonts, radii, shadows.
 * Ported from STITCHWORKS.html. Keep these as plain objects so they're easy
 * to read in inline styles; they're typed via `as const` so TypeScript catches
 * typos at the call site.
 */

export const SW_COLORS = {
  // Surface
  ink: '#0F1419',
  paper: '#FBFAF6',
  paperDeep: '#F2EEE3',
  paperEdge: '#E8E2D0',
  steel: '#2A3340',
  steelLite: '#3D4856',

  // Brand
  brand: '#FF5B26',
  brandDeep: '#D43E0F',
  brandLite: '#FFE4D6',

  // Data palette — named after garment-factory artefacts so they're memorable
  thread: '#FFB800',
  fabric: '#2BA88B',
  bobbin: '#4F7CFF',
  press: '#C73E5F',
  trim: '#8B5CF6',
  ship: '#0EA5A4',

  // Status
  ok: '#1FB36B',
  warn: '#F5A623',
  alarm: '#E74C3C',

  // UI grays (alpha on ink)
  line: '#0F141930',
  muted: '#0F141999',
  faint: '#0F141950',
} as const;

export const SW_FONTS = {
  display: '"Archivo Black", "Inter", system-ui, sans-serif',
  body: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
} as const;

export const SW_RADIUS = { sm: 6, md: 10, lg: 14, xl: 22 } as const;

export const SW_SHADOWS = {
  card: '0 1px 0 rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
  pop: '0 4px 14px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
  hi: '0 12px 40px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
} as const;

export type SwColor = (typeof SW_COLORS)[keyof typeof SW_COLORS];
