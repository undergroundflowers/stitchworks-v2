/**
 * Tweaks panel — reusable form controls (sections, rows, sliders, toggles,
 * radios, selects, text/number/colour inputs and buttons).
 *
 * Ported from tweaks-panel.jsx in STITCHWORKS.html. The CSS is injected once
 * by `TweaksPanel`; these components only emit class names.
 */

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { HudSelect } from '../components';

// ── Option types ─────────────────────────────────────────────────────────────

export type TweakOption<V = string | number | boolean> =
  | V
  | { value: V; label: string };

// ── Layout helpers ───────────────────────────────────────────────────────────

interface TweakSectionProps {
  label: string;
  children?: ReactNode;
}

export function TweakSection({ label, children }: TweakSectionProps) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

interface TweakRowProps {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
  inline?: boolean;
}

export function TweakRow({ label, value, children, inline = false }: TweakRowProps) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Slider ───────────────────────────────────────────────────────────────────

interface TweakSliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange,
}: TweakSliderProps) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input
        type="range"
        className="twk-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </TweakRow>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────

interface TweakToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function TweakToggle({ label, value, onChange }: TweakToggleProps) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button
        type="button"
        className="twk-toggle"
        data-on={value ? '1' : '0'}
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}

// ── Radio (segmented) ────────────────────────────────────────────────────────

interface TweakRadioProps<V extends string | number | boolean> {
  label: string;
  value: V;
  options: ReadonlyArray<TweakOption<V>>;
  onChange: (value: V) => void;
}

export function TweakRadio<V extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: TweakRadioProps<V>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o: TweakOption<V>) =>
    String(typeof o === 'object' && o !== null ? (o as { label: string }).label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const segLimits: Record<number, number> = { 2: 16, 3: 10 };
  const fitsAsSegments = maxLen <= (segLimits[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s: string): V => {
      const m = options.find(
        (o) =>
          String(typeof o === 'object' && o !== null ? (o as { value: V }).value : o) === s,
      );
      if (m === undefined) return s as unknown as V;
      return typeof m === 'object' && m !== null ? (m as { value: V }).value : (m as V);
    };
    return (
      <TweakSelect
        label={label}
        value={value}
        options={options}
        onChange={(s) => onChange(resolve(String(s)))}
      />
    );
  }
  const opts = options.map((o) =>
    typeof o === 'object' && o !== null
      ? (o as { value: V; label: string })
      : { value: o as V, label: String(o) },
  );
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  const segAt = (clientX: number): V => {
    if (!trackRef.current) return valueRef.current;
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev: PointerEvent) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div
        ref={trackRef}
        role="radiogroup"
        onPointerDown={onPointerDown}
        className={dragging ? 'twk-seg dragging' : 'twk-seg'}
      >
        <div
          className="twk-seg-thumb"
          style={{
            left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
            width: `calc((100% - 4px) / ${n})`,
          }}
        />
        {opts.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
          >
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────

interface TweakSelectProps<V extends string | number | boolean> {
  label: string;
  value: V;
  options: ReadonlyArray<TweakOption<V>>;
  onChange: (value: V) => void;
}

export function TweakSelect<V extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: TweakSelectProps<V>) {
  // Normalise the option list and remember each original value so we can
  // map the string the HudSelect emits back to its native type (number,
  // bool, etc.) before handing it to the caller.
  const norm = options.map((o) => {
    const v = typeof o === 'object' && o !== null ? (o as { value: V }).value : (o as V);
    const l = typeof o === 'object' && o !== null ? (o as { label: string }).label : String(o);
    return { value: v, key: String(v), label: l };
  });
  return (
    <TweakRow label={label}>
      <HudSelect
        value={String(value)}
        onChange={(v) => {
          const hit = norm.find((o) => o.key === v);
          if (hit) onChange(hit.value);
        }}
        variant="light"
        size="sm"
        width="100%"
        options={norm.map((o) => ({ value: o.key, label: o.label }))}
      />
    </TweakRow>
  );
}

// ── Text ─────────────────────────────────────────────────────────────────────

interface TweakTextProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function TweakText({ label, value, placeholder, onChange }: TweakTextProps) {
  return (
    <TweakRow label={label}>
      <input
        className="twk-field"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </TweakRow>
  );
}

// ── Number (with scrub-handle) ───────────────────────────────────────────────

interface TweakNumberProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: TweakNumberProps) {
  const clamp = (n: number) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = useRef<{ x: number; val: number }>({ x: 0, val: 0 });
  const onScrubStart = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

// ── Colour ───────────────────────────────────────────────────────────────────

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function isLight(hex: string): boolean {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const TwkCheck = ({ light }: { light: boolean }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M3 7.2 5.8 10 11 4.2"
      fill="none"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      stroke={light ? 'rgba(0,0,0,.78)' : '#fff'}
    />
  </svg>
);

export type TweakColorValue = string | string[];

interface TweakColorProps {
  label: string;
  value: TweakColorValue;
  options?: ReadonlyArray<TweakColorValue>;
  onChange: (value: TweakColorValue) => void;
}

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
export function TweakColor({ label, value, options, onChange }: TweakColorProps) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input
          type="color"
          className="twk-swatch"
          value={typeof value === 'string' ? value : value[0] ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o: TweakColorValue) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          const chipStyle: CSSProperties = { background: hero };
          return (
            <button
              key={i}
              type="button"
              className="twk-chip"
              role="radio"
              aria-checked={on}
              data-on={on ? '1' : '0'}
              aria-label={colors.join(', ')}
              title={colors.join(' · ')}
              style={chipStyle}
              onClick={() => onChange(o)}
            >
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => (
                    <i key={j} style={{ background: c }} />
                  ))}
                </span>
              )}
              {on && <TwkCheck light={isLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────

interface TweakButtonProps {
  label: string;
  onClick?: () => void;
  secondary?: boolean;
}

export function TweakButton({ label, onClick, secondary = false }: TweakButtonProps) {
  return (
    <button
      type="button"
      className={secondary ? 'twk-btn secondary' : 'twk-btn'}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
