import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Línea de tendencia, dibujada a mano con un `<path>`.
 *
 * Deliberadamente sin ejes ni números: una sparkline sirve para ver la forma,
 * y las cifras exactas ya están al lado en grande. Con menos de dos puntos no
 * dibuja nada en vez de inventar una línea plana que sugeriría estabilidad.
 */
export function Sparkline({
  values,
  className,
  tone = 'var(--success)',
  width = 160,
  height = 44,
}: {
  values: number[];
  className?: string;
  tone?: string;
  width?: number;
  height?: number;
}) {
  const gradientId = useId();

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // Margen a los cuatro lados: sin él, el punto del final queda cortado por
  // el borde derecho y la línea se pega al techo de la caja.
  const PAD = 4;
  const usable = height - PAD * 2;
  const step = (width - PAD * 2) / (values.length - 1);

  const points = values.map((value, index) => ({
    x: PAD + index * step,
    // El SVG crece hacia abajo, así que el valor más alto va arriba del todo.
    y: PAD + usable - ((value - min) / span) * usable,
  }));

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('h-11 w-full', className)}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.28" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={tone}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last.x} cy={last.y} r="2.5" fill={tone} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
