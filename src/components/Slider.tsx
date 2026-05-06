import { SW_COLORS, SW_FONTS } from '../design/tokens';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  format?: (value: number) => string;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  format,
}: SliderProps) {
  return (
    <div>
      {label && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: SW_COLORS.muted }}>
            {label}
          </span>
          <span
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 12,
              fontWeight: 700,
              color: SW_COLORS.ink,
            }}
          >
            {format ? format(value) : value}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: SW_COLORS.brand }}
      />
    </div>
  );
}
