/**
 * Cropped-text marquee — app-wide.
 *
 * Any single-line text that is cut off by its box (the `…` kind, or a plain
 * `overflow: hidden` + `nowrap` crop) slides sideways while the pointer is over
 * it, so the whole string can be read without widening the panel. One
 * delegated listener covers every screen; no component has to opt in.
 *
 * The slide happens on a copy of the text laid over the original, so the
 * original DOM is never restructured and React has nothing to reconcile. Form fields are skipped: their text is the user's to scroll.
 */

/** Pixels per second the text travels. */
const SPEED = 40;
/** Pause at each end, in ms, so the start and the end can be read. */
const HOLD_MS = 700;
/** How far up from the hovered node to look for the box doing the cropping. */
const MAX_DEPTH = 4;

const SKIP_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export interface CropBox {
  whiteSpace: string;
  overflowX: string;
  scrollWidth: number;
  clientWidth: number;
  hasOwnText: boolean;
}

/** True when the box clips a single line of its own text. */
export function isCropped(box: CropBox): boolean {
  if (!box.hasOwnText) return false;
  if (!box.whiteSpace.startsWith('nowrap') && box.whiteSpace !== 'pre') return false;
  if (box.overflowX !== 'hidden' && box.overflowX !== 'clip') return false;
  return box.scrollWidth - box.clientWidth > 1;
}

/** Total loop time for a given overflow distance: hold, slide, hold. */
export function marqueeDurationMs(distancePx: number): number {
  return Math.round((distancePx / SPEED) * 1000) + HOLD_MS * 2;
}

function hasOwnText(el: Element): boolean {
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE && n.textContent && n.textContent.trim() !== '') return true;
  }
  // A lone inline child (<strong>, <span>) still counts as this box's text.
  return el.childElementCount === 1 && el.textContent?.trim() !== '' && el.children[0].childElementCount === 0;
}

function findCropped(start: Element | null): HTMLElement | null {
  let el = start;
  for (let i = 0; el && i < MAX_DEPTH; i += 1, el = el.parentElement) {
    if (!(el instanceof HTMLElement) || SKIP_TAGS.has(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (
      isCropped({
        whiteSpace: cs.whiteSpace,
        overflowX: cs.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        hasOwnText: hasOwnText(el),
      })
    ) {
      return el;
    }
  }
  return null;
}

let started = false;

export function startCroppedTextMarquee(): void {
  if (started || typeof document === 'undefined') return;
  started = true;

  let active: { el: HTMLElement; stop: () => void } | null = null;

  document.addEventListener('mouseover', (e) => {
    if (active && e.target instanceof Node && active.el.contains(e.target)) return;
    active?.stop();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const el = findCropped(e.target instanceof Element ? e.target : null);
    if (!el || typeof el.animate !== 'function') return;

    const distance = el.scrollWidth - el.clientWidth;
    const duration = marqueeDurationMs(distance);
    const hold = HOLD_MS / duration;

    // The moving text is a copy laid exactly over the original and slid with
    // `transform`, which the browser animates on the compositor at sub-pixel
    // precision. Animating the original's `text-indent` re-ran layout every
    // frame and snapped to whole pixels, which read as stutter.
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const px = (v: string) => parseFloat(v) || 0;
    const padL = px(cs.paddingLeft);
    const padR = px(cs.paddingRight);
    const padT = px(cs.paddingTop);
    const padB = px(cs.paddingBottom);
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      left: `${rect.left + el.clientLeft + padL}px`,
      top: `${rect.top + el.clientTop + padT}px`,
      width: `${el.clientWidth - padL - padR}px`,
      height: `${el.clientHeight - padT - padB}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '2147483000',
      font: cs.font,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      color: cs.color,
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center',
    });
    const strip = document.createElement('div');
    strip.style.willChange = 'transform';
    strip.style.flex = 'none';
    for (const n of el.childNodes) strip.appendChild(n.cloneNode(true));
    overlay.appendChild(strip);
    document.body.appendChild(overlay);

    // Hide the original's glyphs (not its box) while the copy is on top.
    const prevFill = el.style.getPropertyValue('-webkit-text-fill-color');
    el.style.setProperty('-webkit-text-fill-color', 'transparent');

    const anim = strip.animate(
      [
        { transform: 'translate3d(0,0,0)', offset: 0 },
        { transform: 'translate3d(0,0,0)', offset: hold, easing: 'ease-in-out' },
        { transform: `translate3d(${-distance}px,0,0)`, offset: 1 - hold },
        { transform: `translate3d(${-distance}px,0,0)`, offset: 1 },
      ],
      // Glides to the end, rests, glides back — no snap to the start.
      { duration, iterations: Infinity, direction: 'alternate' },
    );

    const stop = () => {
      anim.cancel();
      overlay.remove();
      if (prevFill) el.style.setProperty('-webkit-text-fill-color', prevFill);
      else el.style.removeProperty('-webkit-text-fill-color');
      el.removeEventListener('mouseleave', stop);
      window.removeEventListener('scroll', stop, true);
      window.removeEventListener('wheel', stop, true);
      window.removeEventListener('mousedown', stop, true);
      if (active?.el === el) active = null;
    };
    // The copy is pinned to the screen, so anything that could move or change
    // the original ends the ride.
    window.addEventListener('scroll', stop, true);
    window.addEventListener('wheel', stop, true);
    window.addEventListener('mousedown', stop, true);
    el.addEventListener('mouseleave', stop);
    active = { el, stop };
  });
}
