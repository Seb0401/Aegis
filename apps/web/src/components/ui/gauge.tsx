import { cn } from '@/lib/utils';

/**
 * Anillo de progreso, dibujado a mano.
 *
 * Es un arco de 270° y no un círculo completo a propósito: el hueco de abajo
 * marca dónde empieza y dónde acaba la escala, así que un anillo casi lleno no
 * se confunde con uno vacío. Sin librerías de gráficos: un `<circle>` con
 * `stroke-dasharray` hace exactamente esto y pesa cero.
 */
export function Gauge({
  value,
  label,
  caption,
  tone = 'primary',
  size = 128,
  className,
}: {
  /** Fracción entre 0 y 1. */
  value: number;
  /** Texto grande del centro. */
  label: string;
  /** Texto pequeño bajo el anterior. */
  caption?: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  size?: number;
  className?: string;
}) {
  const RADIUS = 52;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const SWEEP = 0.75; // 270° de los 360°
  const track = CIRCUMFERENCE * SWEEP;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  const stroke = {
    primary: 'var(--primary)',
    success: 'var(--success)',
    warning: 'var(--risk-medium)',
    danger: 'var(--destructive)',
  }[tone];

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 128 128" className="size-full -rotate-[225deg]" aria-hidden="true">
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${track} ${CIRCUMFERENCE}`}
        />
        {/*
          Con `strokeLinecap="round"`, un arco de longitud cero sigue pintando
          el redondeo: un punto de color flotando en el anillo vacío. A 0% no
          se dibuja nada.
        */}
        {clamped > 0 ? (
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${track * clamped} ${CIRCUMFERENCE}`}
            className="transition-[stroke-dasharray] duration-500"
          />
        ) : null}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-display text-xl leading-none font-semibold tabular-nums">
          {label}
        </span>
        {caption ? (
          <span className="max-w-[80%] text-center text-[10px] leading-tight text-muted-foreground">
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}
