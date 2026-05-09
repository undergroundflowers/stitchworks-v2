/**
 * CAD-import — read a user-supplied SVG or DXF file and emit a `CadUnderlay`
 * payload the Builder can render under the canvas as a tracing reference.
 *
 * Why no DWG: AutoCAD's binary `.dwg` is a closed format with no in-browser
 * parser worth the bytes. The importer rejects it and asks the user to
 * "Save As → DXF" from their CAD tool — a one-click round-trip that gives
 * us a clean text format we can parse without a dependency.
 *
 * What we support out of DXF: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC.
 * That's enough to render almost any factory floor plan as a wireframe —
 * walls, columns, equipment outlines. Hatches, dimensions, blocks and text
 * are deliberately skipped: tracing only needs the geometry.
 *
 * Output: a string of SVG primitives (ready to drop inside a parent <svg>)
 * plus a viewBox and a default placement transform so the drawing fits the
 * current grid. The Builder applies a further iso-projection transform so
 * the underlay aligns with the iso ground plane.
 */

import type {
  CadUnderlay,
  CadUnderlayTransform,
  DetectedRegion,
} from '../domain/twin';

// ============================================================================
// PUBLIC API
// ============================================================================

export interface ImportTarget {
  /** Width of the destination grid in world cells. The default placement
   *  scales the drawing so its longer side covers ~80% of this. */
  gridW: number;
  gridH: number;
}

export type CadImportResult =
  | { ok: true; underlay: CadUnderlay }
  | { ok: false; reason: string };

/** Top-level importer. Sniffs the extension, dispatches to the right parser,
 *  computes a sensible default placement transform. */
export async function importCadFile(
  file: File,
  target: ImportTarget,
): Promise<CadImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'dwg') {
    return {
      ok: false,
      reason:
        'DWG is AutoCAD\'s binary format and can\'t be read in the browser. Open the file in your CAD tool and "Save As → DXF" (or export SVG), then import that file.',
    };
  }
  if (ext !== 'svg' && ext !== 'dxf') {
    return {
      ok: false,
      reason: `Unsupported file type ".${ext}". Stitchworks reads DXF and SVG.`,
    };
  }

  const text = await file.text();
  let parsed: ParsedDrawing;
  try {
    parsed = ext === 'svg' ? parseSvg(text) : parseDxf(text);
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof Error
          ? `Could not parse the ${ext.toUpperCase()} file: ${err.message}`
          : `Could not parse the ${ext.toUpperCase()} file.`,
    };
  }

  if (parsed.svg.trim().length === 0) {
    return {
      ok: false,
      reason:
        ext === 'dxf'
          ? 'No drawable entities found. Stitchworks reads LINE / POLYLINE / CIRCLE / ARC; this DXF may contain only blocks, hatches or text.'
          : 'No drawable content found inside the SVG.',
    };
  }

  const transform = defaultPlacement(parsed.viewBox, target);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'CAD underlay';

  return {
    ok: true,
    underlay: {
      name: baseName,
      format: ext as 'svg' | 'dxf',
      svg: parsed.svg,
      viewBox: parsed.viewBox,
      regions: parsed.regions,
      importedAt: new Date().toISOString(),
      transform,
    },
  };
}

interface ParsedDrawing {
  /** SVG markup ready to be dropped inside a parent <svg>. Strokes use
   *  `stroke="currentColor"` so the renderer can theme the underlay. */
  svg: string;
  viewBox: [number, number, number, number];
  /** Closed shapes detected at parse time — fed into the Auto-Extract flow
   *  as Department candidates. */
  regions: DetectedRegion[];
}

// ============================================================================
// SVG PARSING — pull viewBox + inner markup out of an existing <svg>.
// ============================================================================

function parseSvg(text: string): ParsedDrawing {
  // Use the browser's parser so we get a robust attribute reader; bail on
  // anything that surfaces a <parsererror>.
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('Invalid SVG markup');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new Error('Root element is not <svg>');
  }

  // viewBox preference: explicit > width/height attributes > content bbox.
  let viewBox: [number, number, number, number];
  const vbAttr = root.getAttribute('viewBox');
  if (vbAttr) {
    const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      viewBox = [parts[0], parts[1], parts[2], parts[3]];
    } else {
      throw new Error('Malformed viewBox attribute');
    }
  } else {
    const w = parseFloat(root.getAttribute('width') ?? '0');
    const h = parseFloat(root.getAttribute('height') ?? '0');
    if (w > 0 && h > 0) {
      viewBox = [0, 0, w, h];
    } else {
      // Fall back to a unit square; the user can rescale on canvas.
      viewBox = [0, 0, 1000, 1000];
    }
  }

  // Inner content = serialised children of the root <svg>. Strip xmlns to
  // avoid duplicate-namespace warnings when re-injected.
  const serializer = new XMLSerializer();
  const inner = Array.from(root.childNodes)
    .map((n) => serializer.serializeToString(n))
    .join('');

  const regions = detectRegionsInSvgDoc(root);
  return { svg: inner, viewBox, regions };
}

/** Walk an SVG tree and pull out every closed shape (rect, polygon, closed
 *  polyline, circle) as a candidate Department region. We deliberately don't
 *  flatten ancestor transforms here — most CAD-exported SVGs are flat and
 *  the worst case (transformed shapes) just produces slightly off bboxes the
 *  user can correct in the modal. */
function detectRegionsInSvgDoc(root: Element): DetectedRegion[] {
  const out: DetectedRegion[] = [];
  let nextId = 0;

  function attr(el: Element, name: string): number {
    const v = parseFloat(el.getAttribute(name) ?? '');
    return Number.isFinite(v) ? v : NaN;
  }
  function readPoints(el: Element): Array<{ x: number; y: number }> {
    const raw = el.getAttribute('points') ?? '';
    const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push({ x: nums[i], y: nums[i + 1] });
    }
    return pts;
  }
  function bboxOfPoints(pts: Array<{ x: number; y: number }>): [number, number, number, number] | null {
    if (pts.length < 3) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return [minX, minY, maxX, maxY];
  }

  function visit(el: Element) {
    const tag = el.localName;
    if (tag === 'rect') {
      const x = attr(el, 'x') || 0;
      const y = attr(el, 'y') || 0;
      const w = attr(el, 'width');
      const h = attr(el, 'height');
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        out.push({
          id: `r-${nextId++}`,
          bbox: [x, y, x + w, y + h],
          area: w * h,
          source: 'rect',
        });
      }
    } else if (tag === 'polygon') {
      const pts = readPoints(el);
      const bb = bboxOfPoints(pts);
      if (bb) {
        out.push({
          id: `r-${nextId++}`,
          bbox: bb,
          area: (bb[2] - bb[0]) * (bb[3] - bb[1]),
          source: 'polygon',
        });
      }
    } else if (tag === 'polyline') {
      // Treat as closed when first and last points coincide within a small
      // tolerance — common in DXF-style exports that draw rooms as polylines
      // rather than polygons.
      const pts = readPoints(el);
      if (pts.length >= 4) {
        const first = pts[0];
        const last = pts[pts.length - 1];
        const tol = 1e-3;
        if (Math.abs(first.x - last.x) < tol && Math.abs(first.y - last.y) < tol) {
          const bb = bboxOfPoints(pts);
          if (bb) {
            out.push({
              id: `r-${nextId++}`,
              bbox: bb,
              area: (bb[2] - bb[0]) * (bb[3] - bb[1]),
              source: 'polyline',
            });
          }
        }
      }
    } else if (tag === 'circle') {
      const cx = attr(el, 'cx') || 0;
      const cy = attr(el, 'cy') || 0;
      const r = attr(el, 'r');
      if (Number.isFinite(r) && r > 0) {
        out.push({
          id: `r-${nextId++}`,
          bbox: [cx - r, cy - r, cx + r, cy + r],
          area: Math.PI * r * r,
          source: 'circle',
        });
      }
    }
    for (const child of Array.from(el.children)) visit(child);
  }
  visit(root);

  // Sort biggest-first so the modal's most useful candidates surface at the top.
  out.sort((a, b) => b.area - a.area);
  return out;
}

// ============================================================================
// DXF PARSING — minimal text-DXF reader for the entity types most layouts
// use. Group-code based: each line is a code, the next line is the value.
// ============================================================================

interface DxfPair {
  code: number;
  value: string;
}

function tokenize(text: string): DxfPair[] {
  // DXF text files normalise to LF on read; CR / leading-trailing whitespace
  // are tolerated.
  const lines = text.replace(/\r/g, '').split('\n');
  const out: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeStr = lines[i].trim();
    if (codeStr === '') continue;
    const code = parseInt(codeStr, 10);
    if (!Number.isFinite(code)) continue;
    out.push({ code, value: lines[i + 1] });
  }
  return out;
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function expandBBox(b: BBox, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

function parseDxf(text: string): ParsedDrawing {
  const pairs = tokenize(text);

  // Walk pairs; we only care about the ENTITIES section. Inside it, every
  // group-code-0 line marks the start of a new entity; its trailing pairs
  // (until the next code 0) describe it.
  let inEntities = false;
  type Entity = {
    type: string;
    pairs: DxfPair[];
    /** For LWPOLYLINE / POLYLINE — collected vertices. */
    vertices?: Array<{ x: number; y: number }>;
    /** Flag bits — only bit 1 (closed) matters for us. */
    flags?: number;
  };
  const entities: Entity[] = [];
  let current: Entity | null = null;

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i];
    if (code === 0) {
      // Section / entity boundaries.
      if (value === 'SECTION') {
        // Look for code 2 → section name.
        const next = pairs[i + 1];
        if (next && next.code === 2) {
          inEntities = next.value === 'ENTITIES';
        }
        current = null;
        continue;
      }
      if (value === 'ENDSEC') {
        inEntities = false;
        current = null;
        continue;
      }
      if (!inEntities) {
        current = null;
        continue;
      }
      // New entity inside ENTITIES.
      current = { type: value, pairs: [] };
      entities.push(current);
      continue;
    }
    if (inEntities && current) {
      current.pairs.push({ code, value });
      // Track polyline vertices inline so we don't need a second pass.
      if (current.type === 'LWPOLYLINE') {
        if (code === 10) {
          current.vertices ??= [];
          current.vertices.push({ x: parseFloat(value), y: NaN });
        } else if (code === 20 && current.vertices && current.vertices.length > 0) {
          current.vertices[current.vertices.length - 1].y = parseFloat(value);
        } else if (code === 70) {
          current.flags = parseInt(value, 10) || 0;
        }
      } else if (current.type === 'POLYLINE') {
        if (code === 70) current.flags = parseInt(value, 10) || 0;
      }
    }
  }

  // POLYLINE encodes vertices as separate VERTEX entities until a SEQEND;
  // re-scan and stitch those into the parent POLYLINE.
  const stitched: Entity[] = [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.type === 'POLYLINE') {
      const verts: Array<{ x: number; y: number }> = [];
      let j = i + 1;
      while (j < entities.length && entities[j].type === 'VERTEX') {
        const vp = entities[j].pairs;
        let vx = NaN, vy = NaN;
        for (const p of vp) {
          if (p.code === 10) vx = parseFloat(p.value);
          else if (p.code === 20) vy = parseFloat(p.value);
        }
        if (Number.isFinite(vx) && Number.isFinite(vy)) verts.push({ x: vx, y: vy });
        j++;
      }
      e.vertices = verts;
      stitched.push(e);
      i = j; // skip past the VERTEX/SEQEND entries we just consumed.
      // Skip SEQEND if present.
      if (i < entities.length && entities[i].type === 'SEQEND') i++;
      i--; // for-loop will i++; counter the extra step.
    } else if (e.type !== 'VERTEX' && e.type !== 'SEQEND') {
      stitched.push(e);
    }
  }

  // Convert each entity to an SVG primitive while tracking the bounding box.
  // DXF Y axis points up; SVG Y points down. We keep DXF coordinates in the
  // emitted SVG and flip the whole drawing with a `transform="scale(1,-1)"`
  // wrapper at the call site (the Builder render path does this).
  const bb = emptyBBox();
  const out: string[] = [];
  // Collect closed regions in their FINAL source-coordinate space — i.e.
  // after the Y-flip and translate-to-origin wrapper that the renderer
  // applies. That way the extract modal can compute world rects from these
  // bboxes without having to re-invert anything.
  const dxfRegions: DetectedRegion[] = [];
  let regionId = 0;

  function readXY(e: Entity, codeX: number, codeY: number): { x: number; y: number } {
    let x = NaN, y = NaN;
    for (const p of e.pairs) {
      if (p.code === codeX) x = parseFloat(p.value);
      else if (p.code === codeY) y = parseFloat(p.value);
    }
    return { x, y };
  }
  function readNumber(e: Entity, code: number): number {
    for (const p of e.pairs) if (p.code === code) return parseFloat(p.value);
    return NaN;
  }

  for (const e of stitched) {
    if (e.type === 'LINE') {
      const a = readXY(e, 10, 20);
      const b = readXY(e, 11, 21);
      if ([a.x, a.y, b.x, b.y].every(Number.isFinite)) {
        expandBBox(bb, a.x, a.y);
        expandBBox(bb, b.x, b.y);
        out.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
      }
    } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      const verts = (e.vertices ?? []).filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
      if (verts.length >= 2) {
        for (const v of verts) expandBBox(bb, v.x, v.y);
        const closed = ((e.flags ?? 0) & 1) === 1;
        const tag = closed ? 'polygon' : 'polyline';
        const pts = verts.map((v) => `${v.x},${v.y}`).join(' ');
        out.push(`<${tag} points="${pts}" fill="none" />`);
        if (closed && verts.length >= 3) {
          let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
          for (const v of verts) {
            if (v.x < rx0) rx0 = v.x;
            if (v.y < ry0) ry0 = v.y;
            if (v.x > rx1) rx1 = v.x;
            if (v.y > ry1) ry1 = v.y;
          }
          dxfRegions.push({
            id: `r-${regionId++}`,
            bbox: [rx0, ry0, rx1, ry1],
            area: Math.max(0, (rx1 - rx0) * (ry1 - ry0)),
            source: e.type === 'LWPOLYLINE' ? 'lwpolyline' : 'polyline',
          });
        }
      }
    } else if (e.type === 'CIRCLE') {
      const c = readXY(e, 10, 20);
      const r = readNumber(e, 40);
      if ([c.x, c.y, r].every(Number.isFinite) && r > 0) {
        expandBBox(bb, c.x - r, c.y - r);
        expandBBox(bb, c.x + r, c.y + r);
        out.push(`<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="none" />`);
        // Circles are mostly columns / fixtures, but treat them as candidate
        // regions too (the user can uncheck them in the modal). Storing the
        // axis-aligned bbox of the circle is fine — the underlay is the
        // visual, the rect just defines the Department footprint.
        dxfRegions.push({
          id: `r-${regionId++}`,
          bbox: [c.x - r, c.y - r, c.x + r, c.y + r],
          area: Math.PI * r * r,
          source: 'circle',
        });
      }
    } else if (e.type === 'ARC') {
      const c = readXY(e, 10, 20);
      const r = readNumber(e, 40);
      const a0 = (readNumber(e, 50) * Math.PI) / 180;
      const a1 = (readNumber(e, 51) * Math.PI) / 180;
      if ([c.x, c.y, r, a0, a1].every(Number.isFinite) && r > 0) {
        // Approximate the arc with a polyline. 24 segments = visually clean
        // for typical layout drawings without exploding the DOM.
        const span = a1 < a0 ? a1 + Math.PI * 2 - a0 : a1 - a0;
        const steps = Math.max(8, Math.round((span / (Math.PI * 2)) * 48));
        const pts: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const t = a0 + (span * i) / steps;
          const x = c.x + Math.cos(t) * r;
          const y = c.y + Math.sin(t) * r;
          expandBBox(bb, x, y);
          pts.push(`${x},${y}`);
        }
        out.push(`<polyline points="${pts.join(' ')}" fill="none" />`);
      }
    }
  }

  if (!Number.isFinite(bb.minX) || !Number.isFinite(bb.maxX)) {
    // Nothing extracted — fall back to a unit viewBox; outer code will then
    // surface the empty-payload error to the user.
    return { svg: out.join('\n'), viewBox: [0, 0, 1, 1], regions: [] };
  }

  const w = Math.max(1e-6, bb.maxX - bb.minX);
  const h = Math.max(1e-6, bb.maxY - bb.minY);
  // Flip Y at emit time: wrap everything in a group that scales (1,-1) and
  // translates so the viewBox starts at the origin. This way the renderer
  // can treat the underlay's viewBox as ordinary SVG coordinates.
  const wrapped =
    `<g transform="translate(${-bb.minX} ${bb.maxY}) scale(1 -1)">` +
    out.join('\n') +
    `</g>`;
  // Re-express each detected region in the FINAL source-coord space (which
  // matches the emitted viewBox starting at the origin and Y running down).
  // Transform: x_final = x_dxf - bb.minX,  y_final = bb.maxY - y_dxf.
  const remapped: DetectedRegion[] = dxfRegions.map((r) => {
    const [rx0, ry0, rx1, ry1] = r.bbox;
    const fx0 = rx0 - bb.minX;
    const fx1 = rx1 - bb.minX;
    const fy0 = bb.maxY - ry1; // Y flip swaps min/max.
    const fy1 = bb.maxY - ry0;
    return { ...r, bbox: [fx0, fy0, fx1, fy1] };
  });
  remapped.sort((a, b) => b.area - a.area);
  return { svg: wrapped, viewBox: [0, 0, w, h], regions: remapped };
}

// ============================================================================
// REGION → WORLD RECT — used by the Auto-Extract modal to (a) preview the
// world-cell footprint each region would produce and (b) create the
// Department itself when the user confirms.
// ============================================================================

/** Project a region's source bbox through the underlay's placement transform
 *  and return an axis-aligned rectangle in *world cells*. When the underlay
 *  is rotated, the source bbox no longer aligns with the world axes — this
 *  function takes the AABB of the four rotated corners, which is the closest
 *  the (rect-only) Department schema can get. The user can fine-tune the
 *  bounds in the inspector after creation. */
export function regionToWorldRect(
  region: DetectedRegion,
  underlay: CadUnderlay,
  bounds: { gridW: number; gridH: number },
): { x: number; y: number; w: number; h: number } {
  const [vbX, vbY, vbW, vbH] = underlay.viewBox;
  const cxSrc = vbX + vbW / 2;
  const cySrc = vbY + vbH / 2;
  const t = underlay.transform;
  const angle = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [x1, y1, x2, y2] = region.bbox;
  const corners: Array<[number, number]> = [
    [x1, y1], [x2, y1], [x2, y2], [x1, y2],
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [sx, sy] of corners) {
    const ox = (sx - cxSrc) * t.scale;
    const oy = (sy - cySrc) * t.scale;
    const wx = ox * cos - oy * sin + t.cx;
    const wy = ox * sin + oy * cos + t.cy;
    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
  }
  // Snap to integer cells; clamp into the grid; ensure at least 1×1.
  const x = Math.max(0, Math.min(bounds.gridW - 1, Math.floor(minX)));
  const y = Math.max(0, Math.min(bounds.gridH - 1, Math.floor(minY)));
  const w = Math.max(1, Math.min(bounds.gridW - x, Math.ceil(maxX) - x));
  const h = Math.max(1, Math.min(bounds.gridH - y, Math.ceil(maxY) - y));
  return { x, y, w, h };
}

// ============================================================================
// DEFAULT PLACEMENT — fit the drawing inside ~80% of the grid, centred.
// ============================================================================

function defaultPlacement(
  viewBox: [number, number, number, number],
  target: ImportTarget,
): CadUnderlayTransform {
  const [, , vw, vh] = viewBox;
  const safeVw = vw > 0 ? vw : 1;
  const safeVh = vh > 0 ? vh : 1;
  const fitFraction = 0.8;
  // Fit the longer side. Result is "source-units → world-cells".
  const scale = Math.min(
    (target.gridW * fitFraction) / safeVw,
    (target.gridH * fitFraction) / safeVh,
  );
  return {
    cx: target.gridW / 2,
    cy: target.gridH / 2,
    scale: scale > 0 && Number.isFinite(scale) ? scale : 1,
    rotation: 0,
    opacity: 0.55,
    visible: true,
    locked: false,
  };
}
