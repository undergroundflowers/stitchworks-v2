import { SW_COLORS } from '../design/tokens';

interface ProgressProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  bg?: string;
}

export function Progress({
  value,
  max = 100,
  color = SW_COLORS.brand,
  height = 6,
  bg = SW_COLORS.paperEdge,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      style={{
        width: '100%',
        height,
        background: bg,
        borderRadius: height,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          transition: 'width 300ms',
        }}
      />
    </div>
  );
}
