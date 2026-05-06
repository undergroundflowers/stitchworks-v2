import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ToggleGroupProps<T extends string> {
  value: T;
  options: ToggleOption<T>[];
  onChange: (value: T) => void;
}

export function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: ToggleGroupProps<T>) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: SW_COLORS.paperDeep,
        borderRadius: SW_RADIUS.sm,
        padding: 3,
        border: `1px solid ${SW_COLORS.line}`,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              background: active ? SW_COLORS.paper : 'transparent',
              border: 'none',
              padding: '6px 12px',
              borderRadius: SW_RADIUS.sm - 2,
              fontFamily: SW_FONTS.body,
              fontSize: 12,
              fontWeight: 600,
              color: active ? SW_COLORS.ink : SW_COLORS.muted,
              cursor: 'pointer',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
