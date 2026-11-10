import { theme } from '@/constants';

/**
 * Circular meter, used for the 13-wash tracker. Value text uses ink tokens;
 * the arc carries the status colour. Exposes the value to assistive tech.
 */
export function RadialGauge({
  value,
  max,
  label,
  size = 132,
  unit = 'washes',
  tone = 'success',
}: {
  value: number;
  max: number;
  label: string;
  size?: number;
  unit?: string;
  tone?: 'success' | 'brand' | 'warning';
}) {
  const stroke = Math.max(8, Math.round(size / 13));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const color = theme.colors[tone].DEFAULT;
  return (
    <div className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value} of ${max}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.colors.navy[200]} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="text-3xl font-semibold tabular-nums text-navy-900">{value}</span>
        <span className="text-xs text-navy-500">
          of {max} {unit}
        </span>
      </div>
    </div>
  );
}
