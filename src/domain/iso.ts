/**
 * Iso Builder domain — catalogue, palette, and seed layouts for the
 * isometric 3D-feel layout builder. Ported from the design prototype's
 * sw/sw-iso-builder-data.jsx (~540 lines): all SVG draw functions,
 * projection math, default-prop generators, persistence helpers, and
 * the seeded factory + dept layouts. Pure data / pure SVG (returns
 * ReactNode); no DOM, no React hooks, safe to consume from any page.
 */

import { createElement, type ReactNode } from 'react';

// ============================================================================
// ISO PROJECTION
// world (cell) (x,y) at altitude z → screen (sx, sy) in iso pixels
// ============================================================================

export const ISO_TILE = 32; // half-width of an iso diamond (cell)
export const ISO_THIN = ISO_TILE / 2; // half-height of iso diamond
export const ISO_Z = ISO_TILE / 2; // 1 unit altitude in screen pixels (vertical)

export interface IsoPoint {
  sx: number;
  sy: number;
}

export function isoProj(x: number, y: number, z: number = 0): IsoPoint {
  return {
    sx: (x - y) * ISO_TILE,
    sy: (x + y) * ISO_THIN - z * ISO_Z,
  };
}

export function unproject(sx: number, sy: number): { x: number; y: number } {
  // inverse of isoProj at z=0; returns world (x,y)
  return {
    x: (sx / ISO_TILE + sy / ISO_THIN) / 2,
    y: (sy / ISO_THIN - sx / ISO_TILE) / 2,
  };
}

// ============================================================================
// PALETTE — hybrid cream / brand red / blue / yellow accents
// ============================================================================

export const SW_PAL = {
  cream: '#F6F1E5',
  creamHi: '#FFFAEB',
  creamLo: '#E2DBC8',
  ink: '#0F1419',
  steel: '#3F4A55',
  edge: '#1E2530',
  red: '#E63946',
  redLo: '#A92638',
  blue: '#3D6EE5',
  blueLo: '#2750B0',
  yellow: '#F2C12E',
  yellowLo: '#C99A1F',
  paper: '#FFFEF8',
  paperShade: '#EDE6D2',
  metal: '#9AA6B2',
  metalLo: '#6F7A86',
  wood: '#C8915E',
  woodLo: '#8E5F36',
  green: '#1FB36B',
} as const;

export type IsoPaletteKey = keyof typeof SW_PAL;

// ============================================================================
// CUBOID DRAWER — body + 3 visible faces, with optional decal palette
// ============================================================================

interface CuboidPoints {
  top: IsoPoint[];
  left: IsoPoint[];
  leftFx: IsoPoint[];
  right: IsoPoint[];
  rightFx: IsoPoint[];
  base: IsoPoint[];
  pts: {
    A: IsoPoint;
    B: IsoPoint;
    C: IsoPoint;
    D: IsoPoint;
    A0: IsoPoint;
    B0: IsoPoint;
    C0: IsoPoint;
    D0: IsoPoint;
  };
}

export function isoCuboid(w: number, d: number, h: number): CuboidPoints {
  // w,d in cells (x, y world); h in altitude units
  const A = isoProj(0, 0, h),
    B = isoProj(w, 0, h);
  const C = isoProj(w, d, h),
    D = isoProj(0, d, h);
  const A0 = isoProj(0, 0, 0),
    B0 = isoProj(w, 0, 0);
  const C0 = isoProj(w, d, 0),
    D0 = isoProj(0, d, 0);
  return {
    top: [A, B, C, D],
    left: [A, A0, D0, D], // wait — left face is x=0 plane: A,D,D0,A0
    leftFx: [A, D, D0, A0],
    right: [B, B0, C0, C], // right face is y=d plane? actually x=w plane: B,C,C0,B0
    rightFx: [B, C, C0, B0],
    base: [A0, B0, C0, D0],
    pts: { A, B, C, D, A0, B0, C0, D0 },
  };
}

export function ptsToStr(pts: IsoPoint[]): string {
  return pts.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ');
}

interface CuboidFacesProps {
  w: number;
  d: number;
  h: number;
  top: string;
  left: string;
  right: string;
  stroke?: string;
}

export function CuboidFaces({ w, d, h, top, left, right, stroke }: CuboidFacesProps): ReactNode {
  const c = isoCuboid(w, d, h);
  return createElement(
    'g',
    null,
    // base (rarely visible) — skip
    createElement('polygon', {
      points: ptsToStr(c.leftFx),
      fill: left,
      stroke: stroke || SW_PAL.edge,
      strokeWidth: 0.6,
      strokeLinejoin: 'round',
    }),
    createElement('polygon', {
      points: ptsToStr(c.rightFx),
      fill: right,
      stroke: stroke || SW_PAL.edge,
      strokeWidth: 0.6,
      strokeLinejoin: 'round',
    }),
    createElement('polygon', {
      points: ptsToStr(c.top),
      fill: top,
      stroke: stroke || SW_PAL.edge,
      strokeWidth: 0.8,
      strokeLinejoin: 'round',
    }),
  );
}

// Convenience: lighten/darken
export function shade(color: string, amt: number): string {
  // tiny shader — return a hex tinted toward black or white by amt (-1..1)
  const c = color.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16),
    g = parseInt(c.slice(2, 4), 16),
    b = parseInt(c.slice(4, 6), 16);
  const t = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  return '#' + [t(r), t(g), t(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// DRAW FACTORIES — each returns a render fn (asset, opts) => SVG <g>
// All centered at world origin; element places at its grid cell anchor.
// ============================================================================

export interface IsoDrawOpts {
  w: number;
  d: number;
  h: number;
}

export type IsoDrawFn = (opts: IsoDrawOpts) => ReactNode;

function walls(top: string, side: string): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top, left: shade(side, -0.1), right: side });
}
function doorBay(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h, top: SW_PAL.cream, left: SW_PAL.creamLo, right: SW_PAL.cream }),
      // bay cut-out (blue glass)
      (() => {
        const ay = 0.5;
        const A = isoProj(0.2, ay, h * 0.85),
          B = isoProj(w - 0.2, ay, h * 0.85);
        const C = isoProj(w - 0.2, ay, 0.2),
          D = isoProj(0.2, ay, 0.2);
        return createElement('polygon', {
          points: ptsToStr([A, B, C, D]),
          fill: SW_PAL.blueLo,
          stroke: SW_PAL.edge,
          strokeWidth: 0.6,
        });
      })(),
    );
}
function windowStrip(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h, top: SW_PAL.cream, left: SW_PAL.creamLo, right: SW_PAL.cream }),
      (() => {
        const stripeY = h * 0.55;
        const A = isoProj(0.2, 0.5, stripeY + 0.4),
          B = isoProj(w - 0.2, 0.5, stripeY + 0.4);
        const C = isoProj(w - 0.2, 0.5, stripeY - 0.4),
          D = isoProj(0.2, 0.5, stripeY - 0.4);
        return createElement('polygon', {
          points: ptsToStr([A, B, C, D]),
          fill: SW_PAL.blue,
          stroke: SW_PAL.edge,
          strokeWidth: 0.5,
        });
      })(),
    );
}
function column(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.metal, left: SW_PAL.metalLo, right: SW_PAL.metal });
}
function stairs(): IsoDrawFn {
  return ({ w, d, h }) => {
    const steps = 4;
    return createElement(
      'g',
      null,
      Array.from({ length: steps }).map((_, i) => {
        const stepH = (h * (i + 1)) / steps;
        return createElement(
          'g',
          { key: i },
          CuboidFaces({
            w,
            d: d / steps,
            h: stepH,
            top: SW_PAL.cream,
            left: SW_PAL.creamLo,
            right: SW_PAL.cream,
          }),
        );
      }),
    );
  };
}
function zonePaint(color: string, label: string): IsoDrawFn {
  return ({ w, d }) => {
    const A = isoProj(0, 0, 0),
      B = isoProj(w, 0, 0),
      C = isoProj(w, d, 0),
      D = isoProj(0, d, 0);
    const cx = (A.sx + B.sx + C.sx + D.sx) / 4;
    const cy = (A.sy + B.sy + C.sy + D.sy) / 4;
    return createElement(
      'g',
      null,
      createElement('polygon', {
        points: ptsToStr([A, B, C, D]),
        fill: color,
        fillOpacity: 0.25,
        stroke: color,
        strokeWidth: 1.5,
        strokeDasharray: '4 3',
      }),
      createElement(
        'text',
        {
          x: cx,
          y: cy + 4,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          fontWeight: 800,
          fill: shade(color, -0.4),
          textAnchor: 'middle',
          letterSpacing: '1.5px',
        },
        label,
      ),
    );
  };
}
function conveyorStr(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h, top: SW_PAL.metal, left: SW_PAL.metalLo, right: SW_PAL.metal }),
      // belt stripes on top
      Array.from({ length: w * 2 }).map((_, i) => {
        const x = i * 0.5;
        const A = isoProj(x, 0.1, h + 0.01),
          B = isoProj(x + 0.05, 0.1, h + 0.01);
        const C = isoProj(x + 0.05, d - 0.1, h + 0.01),
          D = isoProj(x, d - 0.1, h + 0.01);
        return createElement('polygon', {
          key: i,
          points: ptsToStr([A, B, C, D]),
          fill: SW_PAL.edge,
        });
      }),
    );
}
function conveyorCurve(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h, top: SW_PAL.metal, left: SW_PAL.metalLo, right: SW_PAL.metal }),
      (() => {
        const cx = isoProj(w / 2, d / 2, h + 0.01);
        return createElement('circle', {
          cx: cx.sx,
          cy: cx.sy,
          r: 8,
          fill: 'none',
          stroke: SW_PAL.edge,
          strokeWidth: 1.5,
          strokeDasharray: '2 2',
        });
      })(),
    );
}
function conveyorIncline(): IsoDrawFn {
  return ({ w, d, h }) => {
    // Wedge: top face slopes from h0 at x=0 to h at x=w
    const h0 = h * 0.1;
    const A = isoProj(0, 0, h0),
      B = isoProj(w, 0, h);
    const C = isoProj(w, d, h),
      D = isoProj(0, d, h0);
    const A0 = isoProj(0, 0, 0),
      B0 = isoProj(w, 0, 0);
    const C0 = isoProj(w, d, 0),
      D0 = isoProj(0, d, 0);
    return createElement(
      'g',
      null,
      createElement('polygon', {
        points: ptsToStr([A, A0, D0, D]),
        fill: SW_PAL.metalLo,
        stroke: SW_PAL.edge,
        strokeWidth: 0.6,
      }),
      createElement('polygon', {
        points: ptsToStr([B, C, C0, B0]),
        fill: SW_PAL.metal,
        stroke: SW_PAL.edge,
        strokeWidth: 0.6,
      }),
      createElement('polygon', {
        points: ptsToStr([A, B, C, D]),
        fill: SW_PAL.metal,
        stroke: SW_PAL.edge,
        strokeWidth: 0.8,
      }),
    );
  };
}
function sewingMachine(accent: string, glyph: string): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      // table
      CuboidFaces({ w, d, h: h * 0.6, top: SW_PAL.cream, left: SW_PAL.creamLo, right: SW_PAL.cream }),
      // head (cuboid on top)
      createElement(
        'g',
        {
          transform: `translate(${isoProj(0, d * 0.3, h * 0.6).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(0, d * 0.3, h * 0.6).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: w * 0.9,
          d: d * 0.4,
          h: h * 0.4,
          top: accent,
          left: shade(accent, -0.2),
          right: accent,
        }),
      ),
      // glyph
      (() => {
        const c = isoProj(w * 0.5, d * 0.5, h + 0.02);
        return createElement(
          'text',
          {
            x: c.sx,
            y: c.sy + 3,
            fontFamily: '"Archivo Black", sans-serif',
            fontSize: 9,
            fontWeight: 900,
            fill: SW_PAL.cream,
            textAnchor: 'middle',
          },
          glyph,
        );
      })(),
    );
}
function longTable(top: string): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top, left: shade(top, -0.15), right: top });
}
function knifeCutter(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.6, top: SW_PAL.metal, left: SW_PAL.metalLo, right: SW_PAL.metal }),
      createElement(
        'g',
        {
          transform: `translate(${isoProj(0.2, 0.2, h * 0.6).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(0.2, 0.2, h * 0.6).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({ w: 0.6, d: 0.6, h: h * 0.4, top: SW_PAL.red, left: SW_PAL.redLo, right: SW_PAL.red }),
      ),
    );
}
function bandKnife(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.5, top: SW_PAL.cream, left: SW_PAL.creamLo, right: SW_PAL.cream }),
      createElement(
        'g',
        {
          transform: `translate(${isoProj(w * 0.4, d * 0.4, h * 0.5).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(w * 0.4, d * 0.4, h * 0.5).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: w * 0.2,
          d: d * 0.2,
          h: h * 0.5,
          top: SW_PAL.yellow,
          left: SW_PAL.yellowLo,
          right: SW_PAL.yellow,
        }),
      ),
    );
}
function cncCutter(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.5, top: SW_PAL.cream, left: SW_PAL.creamLo, right: SW_PAL.cream }),
      // bridge gantry
      createElement(
        'g',
        {
          transform: `translate(${isoProj(w * 0.4, 0, h * 0.5).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(w * 0.4, 0, h * 0.5).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: w * 0.2,
          d,
          h: h * 0.5,
          top: SW_PAL.blue,
          left: SW_PAL.blueLo,
          right: SW_PAL.blue,
        }),
      ),
    );
}
function forklift(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.6, top: SW_PAL.yellow, left: SW_PAL.yellowLo, right: SW_PAL.yellow }),
      // mast
      createElement(
        'g',
        {
          transform: `translate(${isoProj(0, 0, h * 0.6).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(0, 0, h * 0.6).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: 0.2,
          d: 0.2,
          h: h * 0.4,
          top: SW_PAL.steel,
          left: SW_PAL.edge,
          right: SW_PAL.steel,
        }),
      ),
    );
}
function palletJack(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.steel, left: SW_PAL.edge, right: SW_PAL.steel });
}
function trolley(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.3, top: SW_PAL.metal, left: SW_PAL.metalLo, right: SW_PAL.metal }),
      createElement(
        'g',
        {
          transform: `translate(${isoProj(0.05, 0.05, h * 0.3).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(0.05, 0.05, h * 0.3).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({ w: 0.9, d: 0.9, h: h * 0.7, top: SW_PAL.red, left: SW_PAL.redLo, right: SW_PAL.red }),
      ),
    );
}
function agv(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h, top: SW_PAL.blue, left: SW_PAL.blueLo, right: SW_PAL.blue }),
      (() => {
        const c = isoProj(w * 0.5, d * 0.5, h + 0.01);
        return createElement('circle', {
          cx: c.sx,
          cy: c.sy,
          r: 4,
          fill: SW_PAL.yellow,
          stroke: SW_PAL.edge,
        });
      })(),
    );
}
function palletRack(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h, top: SW_PAL.metal, left: SW_PAL.metalLo, right: SW_PAL.metalLo }),
      // yellow pallets stacked
      Array.from({ length: 3 })
        .map((_, lvl) => {
          const ly = h * 0.25 + lvl * h * 0.25;
          return Array.from({ length: w }).map((__, i) => {
            const ox = i + 0.1,
              oy = 0.1;
            const off = isoProj(ox, oy, ly);
            const base = isoProj(0, 0, 0);
            return createElement(
              'g',
              {
                key: lvl + '-' + i,
                transform: `translate(${off.sx - base.sx}, ${off.sy - base.sy})`,
              },
              CuboidFaces({
                w: 0.8,
                d: 0.8,
                h: 0.18,
                top: SW_PAL.yellow,
                left: SW_PAL.yellowLo,
                right: SW_PAL.yellow,
              }),
            );
          });
        })
        .flat(),
    );
}
function pallet(): IsoDrawFn {
  return ({ w, d, h }) =>
    CuboidFaces({ w, d, h, top: SW_PAL.yellow, left: SW_PAL.yellowLo, right: SW_PAL.yellow });
}
function fabricRoll(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.5, top: SW_PAL.wood, left: SW_PAL.woodLo, right: SW_PAL.wood }),
    );
}
function binShelf(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.metal, left: SW_PAL.metalLo, right: SW_PAL.metal });
}
function operator(shirt: string): IsoDrawFn {
  return ({ w: _w, d: _d, h }) =>
    createElement(
      'g',
      null,
      // body cylinder approx (cuboid)
      createElement(
        'g',
        {
          transform: `translate(${isoProj(0.3, 0.3, 0).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(0.3, 0.3, 0).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: 0.4,
          d: 0.4,
          h: h * 0.6,
          top: shirt,
          left: shade(shirt, -0.2),
          right: shirt,
        }),
      ),
      // head
      createElement(
        'g',
        {
          transform: `translate(${isoProj(0.35, 0.35, h * 0.6).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(0.35, 0.35, h * 0.6).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: 0.3,
          d: 0.3,
          h: h * 0.25,
          top: '#F0C49B',
          left: shade('#F0C49B', -0.15),
          right: '#F0C49B',
        }),
      ),
    );
}
function bufferPad(label: string, color: string): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h, top: shade(color, 0.4), left: shade(color, -0.05), right: color }),
      (() => {
        const c = isoProj(w / 2, d / 2, h + 0.01);
        return createElement(
          'text',
          {
            x: c.sx,
            y: c.sy + 3,
            fontFamily: '"Archivo Black", sans-serif',
            fontSize: 8,
            fontWeight: 900,
            fill: shade(color, -0.4),
            textAnchor: 'middle',
            letterSpacing: '1px',
          },
          label,
        );
      })(),
    );
}
function wipCart(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.3, top: SW_PAL.steel, left: SW_PAL.edge, right: SW_PAL.steel }),
      createElement(
        'g',
        {
          transform: `translate(${isoProj(0.05, 0.05, h * 0.3).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(0.05, 0.05, h * 0.3).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: 0.9,
          d: 1.9,
          h: h * 0.7,
          top: SW_PAL.cream,
          left: SW_PAL.creamLo,
          right: SW_PAL.cream,
        }),
      ),
    );
}
function workTable(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.cream, left: SW_PAL.creamLo, right: SW_PAL.cream });
}
function pressingTable(): IsoDrawFn {
  return ({ w, d, h }) =>
    CuboidFaces({ w, d, h, top: SW_PAL.creamHi, left: SW_PAL.creamLo, right: SW_PAL.cream });
}
function qcTable(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.paper, left: SW_PAL.creamLo, right: SW_PAL.cream });
}
function packBench(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.wood, left: SW_PAL.woodLo, right: SW_PAL.wood });
}
function compressor(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.blue, left: SW_PAL.blueLo, right: SW_PAL.blue });
}
function breakerPanel(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.steel, left: SW_PAL.edge, right: SW_PAL.steel });
}
function hvac(): IsoDrawFn {
  return ({ w, d, h }) => CuboidFaces({ w, d, h, top: SW_PAL.metal, left: SW_PAL.metalLo, right: SW_PAL.metal });
}

// ── Apparel-specific draw fns ───────────────────────────────────────────────

/** Auto spreader — long fabric-spreading table with a low programmable
 *  carriage that rolls along the long axis. Distinct from the CNC cutter
 *  by a flatter, wider gantry and the cream cloth-lay top. */
function autoSpreader(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.45, top: SW_PAL.cream, left: SW_PAL.creamLo, right: SW_PAL.cream }),
      // gantry rail (blue carriage)
      createElement(
        'g',
        {
          transform: `translate(${isoProj(w * 0.25, 0, h * 0.45).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(w * 0.25, 0, h * 0.45).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: w * 0.15,
          d,
          h: h * 0.4,
          top: SW_PAL.blue,
          left: SW_PAL.blueLo,
          right: SW_PAL.blue,
        }),
      ),
    );
}

/** Marker plotter — narrow paper-marker printing table with a thin print
 *  head crossing the short axis. Lower profile than the CNC. */
function markerPlotter(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.5, top: SW_PAL.paper, left: SW_PAL.creamLo, right: SW_PAL.cream }),
      createElement(
        'g',
        {
          transform: `translate(${isoProj(w * 0.45, 0, h * 0.5).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(w * 0.45, 0, h * 0.5).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: w * 0.08,
          d,
          h: h * 0.3,
          top: SW_PAL.yellow,
          left: SW_PAL.yellowLo,
          right: SW_PAL.yellow,
        }),
      ),
    );
}

/** Single-head embroidery machine — flat work table + perpendicular needle
 *  bridge + a yellow hoop ring on top representing the embroidery frame. */
function embroideryMachine(): IsoDrawFn {
  return ({ w, d, h }) =>
    createElement(
      'g',
      null,
      CuboidFaces({ w, d, h: h * 0.5, top: SW_PAL.cream, left: SW_PAL.creamLo, right: SW_PAL.cream }),
      createElement(
        'g',
        {
          transform: `translate(${isoProj(w * 0.2, 0, h * 0.5).sx - isoProj(0, 0, 0).sx}, ${
            isoProj(w * 0.2, 0, h * 0.5).sy - isoProj(0, 0, 0).sy
          })`,
        },
        CuboidFaces({
          w: w * 0.6,
          d: d * 0.2,
          h: h * 0.45,
          top: SW_PAL.steel,
          left: SW_PAL.edge,
          right: SW_PAL.steel,
        }),
      ),
      (() => {
        const c = isoProj(w / 2, d / 2, h + 0.05);
        return createElement('circle', {
          cx: c.sx,
          cy: c.sy,
          r: 6,
          fill: 'none',
          stroke: SW_PAL.yellow,
          strokeWidth: 1.6,
        });
      })(),
    );
}

// ============================================================================
// CATEGORIES (left rail tabs)
// ============================================================================

export type IsoCategoryId =
  | 'arch'
  | 'zone'
  | 'conv'
  | 'sew'
  | 'cut'
  | 'mh'
  | 'store'
  | 'op'
  | 'buf'
  | 'fix'
  | 'util';

export interface IsoCategory {
  id: IsoCategoryId;
  label: string;
  icon: string;
}

export const ISO_CATEGORIES: IsoCategory[] = [
  { id: 'arch', label: 'Architecture', icon: '▤' },
  { id: 'zone', label: 'Floor zones', icon: '▦' },
  { id: 'conv', label: 'Conveyors', icon: '⫶' },
  { id: 'sew', label: 'Sewing', icon: '⌃' },
  { id: 'cut', label: 'Cutting', icon: '⫻' },
  { id: 'mh', label: 'Handling', icon: '⛟' },
  { id: 'store', label: 'Storage', icon: '▥' },
  { id: 'op', label: 'Operators', icon: '☻' },
  { id: 'buf', label: 'Buffers', icon: '◫' },
  { id: 'fix', label: 'Fixtures', icon: '▭' },
  { id: 'util', label: 'Utilities', icon: '⚡' },
];

// ============================================================================
// APPAREL PALETTE — curated, dept-aware view of the catalog
//
// The Builder's workstation palette renders this instead of filtering the
// raw fixture catalog by category. Items are grouped by what an apparel
// IE actually thinks about: sewing machines vs. sewing fixtures, cutting
// machines vs. cutting fixtures, materials handling, and operators.
// Adding a new asset = add the catalog entry above, then add its id here.
// ============================================================================

export type ApparelCategoryId =
  | 'sew_mach'
  | 'sew_fix'
  | 'cut_mach'
  | 'cut_fix'
  | 'material'
  | 'operator';

export interface ApparelCategory {
  id: ApparelCategoryId;
  label: string;
  icon: string;
}

export const APPAREL_CATEGORIES: ApparelCategory[] = [
  { id: 'sew_mach', label: 'Sewing machines',  icon: '⌃' },
  { id: 'sew_fix',  label: 'Sewing fixtures',  icon: '▭' },
  { id: 'cut_mach', label: 'Cutting machines', icon: '⫻' },
  { id: 'cut_fix',  label: 'Cutting fixtures', icon: '◎' },
  { id: 'material', label: 'Materials handling', icon: '⛟' },
  { id: 'operator', label: 'Operators',         icon: '☻' },
];

/** Curated apparel asset list. Maps each apparel category to the catalogue
 *  ids the user should see in that group, in the order they should appear.
 *  Renamed from APPAREL_PALETTE to disambiguate from palette.ts's flat
 *  PaletteElement[] of the same name (caused a star-export conflict). */
export const APPAREL_FIXTURE_PALETTE: Record<ApparelCategoryId, string[]> = {
  sew_mach: [
    'a_snls', 'a_dnls',
    'a_3ol', 'a_4ol', 'a_5ol',
    'a_flatlock',
    'a_bartack',
    'a_buttonhole', 'a_buttonsew',
    'a_foa',
    'a_kansai',
    'a_embroidery',
  ],
  sew_fix: ['a_iron_inline', 'a_wip_rack', 'a_op_desk'],
  cut_mach: [
    'a_spread_manual', 'a_spread_auto',
    'a_knife_straight', 'a_knife_band', 'a_cnc_cutter',
    'a_marker_plotter',
  ],
  cut_fix: ['a_cut_table', 'a_inspect_table'],
  material: ['a_fabric_rack', 'a_bundle_trolley'],
  operator: ['op_sewer', 'op_cutter', 'op_helper', 'op_super', 'op_qc'],
};

// ============================================================================
// FIXTURE CATALOG (~30+ hero items across 12 categories)
// Each entry: id, label, cat, footprint (w,h cells), height (z), draw fn
// ============================================================================

export interface IsoFixture {
  id: string;
  cat: IsoCategoryId;
  label: string;
  /** width in cells (x world axis) */
  w: number;
  /** depth in cells (y world axis) */
  d: number;
  /** height in altitude units */
  h: number;
  draw: IsoDrawFn;
}

export const ISO_FIXTURE_CATALOG: IsoFixture[] = [
  // --- ARCHITECTURE ---
  { id: 'wall_str', cat: 'arch', label: 'Wall — straight', w: 4, d: 1, h: 5, draw: walls(SW_PAL.cream, SW_PAL.creamLo) },
  { id: 'wall_corner', cat: 'arch', label: 'Wall — corner', w: 1, d: 1, h: 5, draw: walls(SW_PAL.cream, SW_PAL.creamLo) },
  { id: 'door_bay', cat: 'arch', label: 'Loading door', w: 2, d: 1, h: 4, draw: doorBay() },
  { id: 'window', cat: 'arch', label: 'Window strip', w: 3, d: 1, h: 3, draw: windowStrip() },
  { id: 'column', cat: 'arch', label: 'Steel column', w: 1, d: 1, h: 6, draw: column() },
  { id: 'stairs', cat: 'arch', label: 'Stairs', w: 2, d: 3, h: 3, draw: stairs() },

  // --- FLOOR ZONES (paint regions) ---
  { id: 'zone_cut', cat: 'zone', label: 'Cutting zone', w: 6, d: 6, h: 0.05, draw: zonePaint(SW_PAL.green, 'CUTTING') },
  { id: 'zone_sew', cat: 'zone', label: 'Sewing zone', w: 8, d: 8, h: 0.05, draw: zonePaint(SW_PAL.blue, 'SEWING') },
  { id: 'zone_qc', cat: 'zone', label: 'QC zone', w: 4, d: 4, h: 0.05, draw: zonePaint(SW_PAL.red, 'QC') },
  { id: 'zone_store', cat: 'zone', label: 'Storage zone', w: 6, d: 5, h: 0.05, draw: zonePaint(SW_PAL.yellow, 'STORE') },

  // --- CONVEYORS ---
  { id: 'conv_str', cat: 'conv', label: 'Conveyor — straight', w: 3, d: 1, h: 0.8, draw: conveyorStr() },
  { id: 'conv_curve', cat: 'conv', label: 'Conveyor — curve', w: 2, d: 2, h: 0.8, draw: conveyorCurve() },
  { id: 'conv_inc', cat: 'conv', label: 'Conveyor — incline', w: 3, d: 1, h: 1.6, draw: conveyorIncline() },

  // --- SEWING MACHINES ---
  { id: 'mach_ssm', cat: 'sew', label: 'Single-needle Lock', w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.red, '⌃') },
  { id: 'mach_over', cat: 'sew', label: 'Overlock 4-thread', w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.blue, '⤴') },
  { id: 'mach_flat', cat: 'sew', label: 'Flatlock', w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.steel, '≣') },
  { id: 'mach_bart', cat: 'sew', label: 'Bartack', w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.yellow, '∥') },
  { id: 'mach_btnh', cat: 'sew', label: 'Buttonhole', w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.green, '◉') },

  // --- CUTTING MACHINES ---
  { id: 'cut_spread', cat: 'cut', label: 'Spread Table', w: 6, d: 2, h: 1.0, draw: longTable(SW_PAL.cream) },
  { id: 'cut_knife', cat: 'cut', label: 'Straight Knife', w: 1, d: 1, h: 1.5, draw: knifeCutter() },
  { id: 'cut_band', cat: 'cut', label: 'Band Knife', w: 2, d: 2, h: 2.0, draw: bandKnife() },
  { id: 'cut_cnc', cat: 'cut', label: 'CNC Auto Cutter', w: 5, d: 3, h: 1.8, draw: cncCutter() },

  // --- MATERIAL HANDLING ---
  { id: 'mh_forklift', cat: 'mh', label: 'Forklift', w: 1, d: 2, h: 2.0, draw: forklift() },
  { id: 'mh_pallet', cat: 'mh', label: 'Pallet jack', w: 1, d: 2, h: 0.6, draw: palletJack() },
  { id: 'mh_trolley', cat: 'mh', label: 'WIP trolley', w: 1, d: 1, h: 1.2, draw: trolley() },
  { id: 'mh_agv', cat: 'mh', label: 'AGV', w: 1, d: 2, h: 0.8, draw: agv() },

  // --- STORAGE ---
  { id: 'st_rack', cat: 'store', label: 'Pallet rack', w: 4, d: 1, h: 5, draw: palletRack() },
  { id: 'st_pallet', cat: 'store', label: 'Pallet (loaded)', w: 1, d: 1, h: 1.2, draw: pallet() },
  { id: 'st_roll', cat: 'store', label: 'Fabric roll', w: 1, d: 3, h: 0.8, draw: fabricRoll() },
  { id: 'st_bin', cat: 'store', label: 'Bin shelf', w: 2, d: 1, h: 3.5, draw: binShelf() },

  // --- OPERATORS ---
  { id: 'op_sewer', cat: 'op', label: 'Sewer', w: 1, d: 1, h: 1.6, draw: operator(SW_PAL.red) },
  { id: 'op_cutter', cat: 'op', label: 'Cutter', w: 1, d: 1, h: 1.6, draw: operator(SW_PAL.green) },
  { id: 'op_helper', cat: 'op', label: 'Helper', w: 1, d: 1, h: 1.6, draw: operator(SW_PAL.yellow) },
  { id: 'op_super', cat: 'op', label: 'Supervisor', w: 1, d: 1, h: 1.6, draw: operator(SW_PAL.ink) },
  { id: 'op_qc', cat: 'op', label: 'QC inspector', w: 1, d: 1, h: 1.6, draw: operator(SW_PAL.blue) },

  // --- BUFFERS ---
  { id: 'buf_in', cat: 'buf', label: 'Inbound buffer', w: 2, d: 2, h: 0.4, draw: bufferPad('IN', SW_PAL.green) },
  { id: 'buf_out', cat: 'buf', label: 'Outbound buffer', w: 2, d: 2, h: 0.4, draw: bufferPad('OUT', SW_PAL.red) },
  { id: 'buf_wip', cat: 'buf', label: 'WIP cart', w: 1, d: 2, h: 1.0, draw: wipCart() },

  // --- FIXTURES ---
  { id: 'fx_table', cat: 'fix', label: 'Work table', w: 2, d: 1, h: 1.0, draw: workTable() },
  { id: 'fx_press', cat: 'fix', label: 'Pressing table', w: 2, d: 1, h: 1.1, draw: pressingTable() },
  { id: 'fx_qctab', cat: 'fix', label: 'QC table', w: 2, d: 1, h: 1.0, draw: qcTable() },
  { id: 'fx_pack', cat: 'fix', label: 'Packing bench', w: 3, d: 1, h: 1.0, draw: packBench() },

  // --- UTILITIES ---
  { id: 'ut_compr', cat: 'util', label: 'Compressor', w: 2, d: 1, h: 1.5, draw: compressor() },
  { id: 'ut_panel', cat: 'util', label: 'Breaker panel', w: 1, d: 1, h: 2.5, draw: breakerPanel() },
  { id: 'ut_hvac', cat: 'util', label: 'HVAC vent', w: 2, d: 2, h: 0.4, draw: hvac() },

  // ─── APPAREL — SEWING MACHINES ──────────────────────────────────────────
  { id: 'a_snls',       cat: 'sew', label: 'SNLS · Single-needle Lock',  w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.red,    '⌃')  },
  { id: 'a_dnls',       cat: 'sew', label: 'DNLS · Double-needle Lock',  w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.redLo,  '‖')  },
  { id: 'a_3ol',        cat: 'sew', label: 'Overlock · 3-thread',        w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.blue,   '⤴')  },
  { id: 'a_4ol',        cat: 'sew', label: 'Overlock · 4-thread',        w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.blueLo, '⤴')  },
  { id: 'a_5ol',        cat: 'sew', label: 'Overlock · 5-thread safety', w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.steel,  '⫸')  },
  { id: 'a_flatlock',   cat: 'sew', label: 'Flatlock · Coverstitch',     w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.steel,  '≣')  },
  { id: 'a_bartack',    cat: 'sew', label: 'Bartack',                    w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.yellow, '∥')  },
  { id: 'a_buttonhole', cat: 'sew', label: 'Buttonhole',                 w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.green,  '◉')  },
  { id: 'a_buttonsew',  cat: 'sew', label: 'Button Sew',                 w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.green,  '●')  },
  { id: 'a_foa',        cat: 'sew', label: 'Feed-off-the-Arm',           w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.red,    '⌒')  },
  { id: 'a_kansai',     cat: 'sew', label: 'Kansai · Multi-needle',      w: 1, d: 2, h: 1.4, draw: sewingMachine(SW_PAL.redLo,  '⫼')  },
  { id: 'a_embroidery', cat: 'sew', label: 'Embroidery · Single-head',   w: 2, d: 3, h: 1.6, draw: embroideryMachine() },

  // ─── APPAREL — SEWING FIXTURES & SUPPORT ────────────────────────────────
  { id: 'a_iron_inline', cat: 'fix', label: 'Inline iron table', w: 2, d: 1, h: 1.1, draw: pressingTable() },
  { id: 'a_wip_rack',    cat: 'fix', label: 'WIP buffer rack',   w: 2, d: 1, h: 3.5, draw: binShelf()      },
  { id: 'a_op_desk',     cat: 'fix', label: 'Operator desk',     w: 1, d: 1, h: 1.0, draw: workTable()     },

  // ─── APPAREL — CUTTING MACHINES ─────────────────────────────────────────
  { id: 'a_spread_manual', cat: 'cut', label: 'Spread Table · Manual',   w: 6, d: 2, h: 1.0, draw: longTable(SW_PAL.cream) },
  { id: 'a_spread_auto',   cat: 'cut', label: 'Auto Spreader',           w: 6, d: 2, h: 1.4, draw: autoSpreader()          },
  { id: 'a_knife_straight',cat: 'cut', label: 'Straight Knife Cutter',   w: 1, d: 1, h: 1.5, draw: knifeCutter()           },
  { id: 'a_knife_band',    cat: 'cut', label: 'Band Knife Cutter',       w: 2, d: 2, h: 2.0, draw: bandKnife()             },
  { id: 'a_cnc_cutter',    cat: 'cut', label: 'CNC Auto Cutter',         w: 5, d: 3, h: 1.8, draw: cncCutter()             },
  { id: 'a_marker_plotter',cat: 'cut', label: 'Marker Plotter',          w: 5, d: 1, h: 1.0, draw: markerPlotter()         },

  // ─── APPAREL — CUTTING FIXTURES ─────────────────────────────────────────
  { id: 'a_cut_table',     cat: 'cut', label: 'Cutting Table · Plain',   w: 4, d: 2, h: 1.0, draw: longTable(SW_PAL.paper) },
  { id: 'a_inspect_table', cat: 'fix', label: 'Inspection · 4-point',    w: 3, d: 1, h: 1.0, draw: qcTable()               },

  // ─── APPAREL — MATERIALS & HANDLING ─────────────────────────────────────
  { id: 'a_fabric_rack',   cat: 'store', label: 'Fabric Roll Rack', w: 4, d: 1, h: 4.5, draw: palletRack()          },
  { id: 'a_bundle_trolley',cat: 'mh',    label: 'Bundle Trolley',   w: 1, d: 2, h: 1.0, draw: wipCart()             },
];

// ============================================================================
// DEFAULT VARIABLE SETS by category
// ============================================================================

export type IsoFixturePropValue = string | number | boolean | null | undefined;
export type IsoFixtureProps = Record<string, IsoFixturePropValue>;

/** Apparel-IE-tuned defaults per apparel asset id. Values reflect typical
 *  knit-garment factory baselines (cycle time in seconds, defect % in %,
 *  cost USD/hr, power kW, MTBF hr, operators needed). They're starting
 *  points — the user is expected to tune them per machine + line. */
const APPAREL_DEFAULT_PROPS: Record<string, IsoFixtureProps> = {
  a_snls:        { capacity_per_hr: 144, cycle_s: 25, cost_per_hr: 8,  power_kw: 0.40, mtbf_hr:  800, defect_pct: 0.8, skill_required: 3, operators_needed: 1, accepts: 'panels',          produces: 'seamed-pieces' },
  a_dnls:        { capacity_per_hr: 128, cycle_s: 28, cost_per_hr: 9,  power_kw: 0.50, mtbf_hr:  800, defect_pct: 0.7, skill_required: 4, operators_needed: 1, accepts: 'panels',          produces: 'topstitched-pieces' },
  a_3ol:         { capacity_per_hr: 164, cycle_s: 22, cost_per_hr: 9,  power_kw: 0.45, mtbf_hr:  700, defect_pct: 0.6, skill_required: 3, operators_needed: 1, accepts: 'panels',          produces: 'overlocked-edges' },
  a_4ol:         { capacity_per_hr: 144, cycle_s: 25, cost_per_hr: 9,  power_kw: 0.50, mtbf_hr:  700, defect_pct: 0.6, skill_required: 3, operators_needed: 1, accepts: 'panels',          produces: 'overlocked-seams' },
  a_5ol:         { capacity_per_hr: 120, cycle_s: 30, cost_per_hr: 11, power_kw: 0.55, mtbf_hr:  700, defect_pct: 0.7, skill_required: 4, operators_needed: 1, accepts: 'panels-heavy',    produces: 'safety-stitched-seams' },
  a_flatlock:    { capacity_per_hr: 128, cycle_s: 28, cost_per_hr: 9,  power_kw: 0.55, mtbf_hr:  700, defect_pct: 0.7, skill_required: 3, operators_needed: 1, accepts: 'panels',          produces: 'flatlocked-pieces' },
  a_bartack:     { capacity_per_hr: 300, cycle_s: 12, cost_per_hr: 10, power_kw: 0.60, mtbf_hr: 1000, defect_pct: 0.4, skill_required: 2, operators_needed: 1, accepts: 'sewn-pieces',     produces: 'reinforced-pieces' },
  a_buttonhole:  { capacity_per_hr: 257, cycle_s: 14, cost_per_hr: 11, power_kw: 0.55, mtbf_hr:  900, defect_pct: 0.4, skill_required: 3, operators_needed: 1, accepts: 'placket',         produces: 'buttonholed-placket' },
  a_buttonsew:   { capacity_per_hr: 360, cycle_s: 10, cost_per_hr: 10, power_kw: 0.50, mtbf_hr:  900, defect_pct: 0.3, skill_required: 2, operators_needed: 1, accepts: 'placket+button',  produces: 'buttoned-placket' },
  a_foa:         { capacity_per_hr: 120, cycle_s: 30, cost_per_hr: 11, power_kw: 0.60, mtbf_hr:  800, defect_pct: 0.6, skill_required: 4, operators_needed: 1, accepts: 'tube-pieces',     produces: 'finished-cuffs' },
  a_kansai:      { capacity_per_hr: 128, cycle_s: 28, cost_per_hr: 12, power_kw: 0.65, mtbf_hr:  800, defect_pct: 0.5, skill_required: 3, operators_needed: 1, accepts: 'waistband-strip', produces: 'multi-needle-band' },
  a_embroidery:  { capacity_per_hr:  20, cycle_s:180, cost_per_hr: 18, power_kw: 1.50, mtbf_hr: 1500, defect_pct: 0.2, skill_required: 2, operators_needed: 1, accepts: 'panel',           produces: 'embroidered-panel' },

  a_iron_inline: { capacity_per_hr: 180, cycle_s: 20, cost_per_hr: 6,  power_kw: 1.80, mtbf_hr: 1200, defect_pct: 0.2, skill_required: 2, operators_needed: 1, accepts: 'sewn-pieces',     produces: 'pressed-pieces' },
  a_wip_rack:    { capacity_units: 60, occupied_units: 0 },
  a_op_desk:     { occupants: 1, surface_m2: 1.0 },

  a_spread_manual:  { capacity_per_hr:  72, cycle_s: 50, cost_per_hr: 7,  power_kw: 0.0,  defect_pct: 0.4, skill_required: 3, operators_needed: 2, accepts: 'fabric-rolls', produces: 'fabric-lay' },
  a_spread_auto:    { capacity_per_hr: 150, cycle_s: 24, cost_per_hr: 14, power_kw: 3.5,  mtbf_hr: 1200, defect_pct: 0.2, skill_required: 3, operators_needed: 1, accepts: 'fabric-rolls', produces: 'fabric-lay' },
  a_knife_straight: { capacity_per_hr:  60, cycle_s: 60, cost_per_hr: 9,  power_kw: 1.4,  mtbf_hr:  600, defect_pct: 0.6, skill_required: 4, operators_needed: 1, accepts: 'fabric-lay',   produces: 'cut-panels' },
  a_knife_band:     { capacity_per_hr:  90, cycle_s: 40, cost_per_hr: 10, power_kw: 2.1,  mtbf_hr:  800, defect_pct: 0.4, skill_required: 4, operators_needed: 1, accepts: 'block-panels', produces: 'cut-panels-precise' },
  a_cnc_cutter:     { capacity_per_hr: 200, cycle_s: 18, cost_per_hr: 22, power_kw: 5.0,  mtbf_hr: 2000, defect_pct: 0.15, skill_required: 3, operators_needed: 1, accepts: 'fabric-lay',  produces: 'cut-panels' },
  a_marker_plotter: { capacity_per_hr:  60, cycle_s: 60, cost_per_hr: 6,  power_kw: 0.8,  mtbf_hr: 1500, defect_pct: 0.1, skill_required: 2, operators_needed: 1, accepts: 'marker-file',  produces: 'paper-marker' },
  a_cut_table:      { capacity_per_hr:   0, cost_per_hr: 8, power_kw: 0.0, surface_m2: 8 },
  a_inspect_table:  { capacity_per_hr: 120, cycle_s: 30, cost_per_hr: 7,  power_kw: 0.15, defect_pct: 0,   skill_required: 3, operators_needed: 1, accepts: 'fabric-roll', produces: 'inspected-roll · 4pt' },

  a_fabric_rack:    { capacity_units: 24, occupied_units: 0, accepts: 'fabric-rolls' },
  a_bundle_trolley: { capacity_units: 30, occupied_units: 0, accepts: 'cut-bundles,sewn-bundles' },
};

export function defaultPropsFor(catalogId: string): IsoFixtureProps {
  const a = ISO_FIXTURE_CATALOG.find((x) => x.id === catalogId);
  if (!a) return {};
  const base: IsoFixtureProps = {
    name: a.label,
    assetTag: 'TAG-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
    rotation: 0,
  };
  // Apparel-specific overrides take precedence over the generic category
  // defaults below.
  if (catalogId in APPAREL_DEFAULT_PROPS) {
    return { ...base, ...APPAREL_DEFAULT_PROPS[catalogId] };
  }
  if (a.cat === 'sew' || a.cat === 'cut')
    return {
      ...base,
      capacity_per_hr: 60,
      cycle_s: 35,
      cost_per_hr: 9,
      power_kw: 0.5,
      mtbf_hr: 800,
      defect_pct: 0.6,
      downtime_pct: 4,
      skill_required: 3,
      operators_needed: 1,
      accepts: 'fabric,panels',
      produces: 'sewn-pieces',
    };
  if (a.cat === 'mh')
    return {
      ...base,
      capacity_per_hr: 12,
      cost_per_hr: 6,
      power_kw: 1.4,
      mtbf_hr: 1200,
      downtime_pct: 6,
      accepts: 'pallets,trolleys',
    };
  if (a.cat === 'op') return { ...base, skill: 3, hourly_rate: 4, max_machines: 1, shift: '08:00–17:00' };
  if (a.cat === 'buf') return { ...base, capacity: 30, current: 0 };
  if (a.cat === 'conv') return { ...base, speed_m_min: 12, capacity_per_hr: 240, power_kw: 0.8 };
  if (a.cat === 'store') return { ...base, capacity_units: 80, occupied_units: 0 };
  if (a.cat === 'util') return { ...base, power_kw: 5.5, vendor: '' };
  if (a.cat === 'fix') return { ...base, capacity_per_hr: 40, cost_per_hr: 3 };
  if (a.cat === 'zone') return { ...base, area_label: a.label, color: '' };
  return base;
}

// ============================================================================
// LAYOUT TYPES
// ============================================================================

export type IsoLinkKind = 'flow' | 'operator' | 'conv' | 'buffer' | 'power' | 'comm';

export interface IsoElement {
  id: string;
  catalogId: string;
  x: number;
  y: number;
  rot: number;
  props: IsoFixtureProps;
}

export interface IsoLink {
  id: string;
  kind: IsoLinkKind;
  from: string;
  to: string;
  label?: string;
}

export interface IsoLayout {
  name: string;
  gridW: number;
  gridH: number;
  elements: IsoElement[];
  links: IsoLink[];
}

export type IsoLayoutMap = Record<string, IsoLayout>;

// ============================================================================
// PERSISTENCE
// ============================================================================

const STORAGE_KEY = 'sw_iso_layouts';

export function loadIsoLayouts(): IsoLayoutMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as IsoLayoutMap;
  } catch {
    return {};
  }
}

export function saveIsoLayouts(map: IsoLayoutMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

// ============================================================================
// DEFAULT STARTER LAYOUTS so the canvas is never empty
// ============================================================================

export const ISO_LAYOUT_FACTORY: IsoLayout = {
  name: 'Default Factory',
  gridW: 36,
  gridH: 28,
  elements: [
    { id: 'el-1', catalogId: 'wall_str', x: 1, y: 1, rot: 0, props: defaultPropsFor('wall_str') },
    { id: 'el-2', catalogId: 'wall_str', x: 5, y: 1, rot: 0, props: defaultPropsFor('wall_str') },
    { id: 'el-3', catalogId: 'door_bay', x: 9, y: 1, rot: 0, props: defaultPropsFor('door_bay') },
    { id: 'el-4', catalogId: 'zone_cut', x: 2, y: 3, rot: 0, props: defaultPropsFor('zone_cut') },
    { id: 'el-5', catalogId: 'cut_spread', x: 3, y: 5, rot: 0, props: defaultPropsFor('cut_spread') },
    { id: 'el-6', catalogId: 'cut_cnc', x: 3, y: 8, rot: 0, props: defaultPropsFor('cut_cnc') },
    { id: 'el-7', catalogId: 'zone_sew', x: 11, y: 3, rot: 0, props: defaultPropsFor('zone_sew') },
    { id: 'el-8', catalogId: 'mach_ssm', x: 12, y: 5, rot: 0, props: defaultPropsFor('mach_ssm') },
    { id: 'el-9', catalogId: 'mach_ssm', x: 14, y: 5, rot: 0, props: defaultPropsFor('mach_ssm') },
    { id: 'el-10', catalogId: 'mach_over', x: 16, y: 5, rot: 0, props: defaultPropsFor('mach_over') },
    { id: 'el-11', catalogId: 'op_sewer', x: 12, y: 8, rot: 0, props: defaultPropsFor('op_sewer') },
    { id: 'el-12', catalogId: 'op_sewer', x: 14, y: 8, rot: 0, props: defaultPropsFor('op_sewer') },
    { id: 'el-13', catalogId: 'op_sewer', x: 16, y: 8, rot: 0, props: defaultPropsFor('op_sewer') },
    { id: 'el-14', catalogId: 'conv_str', x: 12, y: 10, rot: 0, props: defaultPropsFor('conv_str') },
    { id: 'el-15', catalogId: 'zone_qc', x: 21, y: 3, rot: 0, props: defaultPropsFor('zone_qc') },
    { id: 'el-16', catalogId: 'fx_qctab', x: 22, y: 5, rot: 0, props: defaultPropsFor('fx_qctab') },
    { id: 'el-17', catalogId: 'op_qc', x: 22, y: 7, rot: 0, props: defaultPropsFor('op_qc') },
    { id: 'el-18', catalogId: 'zone_store', x: 27, y: 3, rot: 0, props: defaultPropsFor('zone_store') },
    { id: 'el-19', catalogId: 'st_rack', x: 28, y: 5, rot: 0, props: defaultPropsFor('st_rack') },
    { id: 'el-20', catalogId: 'st_rack', x: 28, y: 7, rot: 0, props: defaultPropsFor('st_rack') },
    { id: 'el-21', catalogId: 'mh_forklift', x: 28, y: 10, rot: 0, props: defaultPropsFor('mh_forklift') },
  ],
  links: [
    { id: 'lk-1', kind: 'flow', from: 'el-5', to: 'el-6', label: 'panels' },
    { id: 'lk-2', kind: 'flow', from: 'el-6', to: 'el-8', label: 'cut pieces' },
    { id: 'lk-3', kind: 'flow', from: 'el-8', to: 'el-10', label: 'shoulder' },
    { id: 'lk-4', kind: 'flow', from: 'el-10', to: 'el-16', label: 'finished' },
    { id: 'lk-5', kind: 'operator', from: 'el-11', to: 'el-8', label: 'mans' },
    { id: 'lk-6', kind: 'operator', from: 'el-12', to: 'el-9', label: 'mans' },
    { id: 'lk-7', kind: 'operator', from: 'el-13', to: 'el-10', label: 'mans' },
    { id: 'lk-8', kind: 'operator', from: 'el-17', to: 'el-16', label: 'mans' },
  ],
};

export const ISO_LAYOUT_DEPT_BY_ID = (deptId: string): IsoLayout => ({
  name: 'Dept — ' + deptId,
  gridW: 22,
  gridH: 14,
  elements: [
    { id: 'el-1', catalogId: 'mach_ssm', x: 3, y: 3, rot: 0, props: defaultPropsFor('mach_ssm') },
    { id: 'el-2', catalogId: 'mach_ssm', x: 5, y: 3, rot: 0, props: defaultPropsFor('mach_ssm') },
    { id: 'el-3', catalogId: 'op_sewer', x: 3, y: 5, rot: 0, props: defaultPropsFor('op_sewer') },
    { id: 'el-4', catalogId: 'op_sewer', x: 5, y: 5, rot: 0, props: defaultPropsFor('op_sewer') },
    { id: 'el-5', catalogId: 'buf_in', x: 1, y: 3, rot: 0, props: defaultPropsFor('buf_in') },
    { id: 'el-6', catalogId: 'buf_out', x: 8, y: 3, rot: 0, props: defaultPropsFor('buf_out') },
  ],
  links: [
    { id: 'lk-1', kind: 'flow', from: 'el-5', to: 'el-1' },
    { id: 'lk-2', kind: 'flow', from: 'el-1', to: 'el-2' },
    { id: 'lk-3', kind: 'flow', from: 'el-2', to: 'el-6' },
  ],
});
