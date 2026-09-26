'use client';

import { Amount } from '@/components/ui/amount';
import { riseDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Reparto: cuánto va a cada sitio.
 *
 * Barras horizontales etiquetadas una a una, **no un donut de colores**. El
 * motivo no es estético: cada pago ya se identifica por su nombre —«Objetivo:
 * Viaje»—, así que el color no tendría que cargar ninguna información. Y en
 * cuanto el color deja de significar algo, el problema de distinguir cuatro
 * tonos entre sí (que con daltonismo no siempre se puede) desaparece de raíz.
 *
 * Todas las barras comparten un único tono. Lo que se compara es la longitud,
 * que es lo que el ojo mide bien.
 *
 * Especificaciones que sigue: barra fina, extremo redondeado de 4 px y cuadrado
 * en la línea de base —para que el origen de todas sea el mismo—, valor al
 * final de cada fila, y el texto siempre en color de texto, nunca del color del
 * dato.
 */
export function BarBreakdown({
  items,
  asset,
  className,
}: {
  items: Array<{ id: string; label: string; amount: string; hint?: string }>;
  asset?: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  const valores = items.map((item) => Number(item.amount)).filter(Number.isFinite);
  // La escala la fija el mayor, no la suma: así la barra más larga siempre
  // llena la fila y las diferencias entre pagos se ven, en vez de quedar todas
  // aplastadas cuando hay muchos destinos.
  const mayor = Math.max(...valores, 0) || 1;

  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {items.map((item, indice) => {
        const valor = Number(item.amount);
        const fraccion = Number.isFinite(valor) ? Math.max(0, valor) / mayor : 0;

        return (
          <li key={item.id} className="rise-in flex flex-col gap-1.5" style={riseDelay(indice, 70)}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm">{item.label}</span>
              <Amount
                value={item.amount}
                asset={asset}
                className="shrink-0 text-sm font-medium"
                assetClassName="text-xs text-muted-foreground"
              />
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="reveal-x h-full rounded-r-[4px] bg-primary"
                style={{ width: `${(fraccion * 100).toFixed(2)}%`, ...riseDelay(indice, 70) }}
              />
            </div>

            {item.hint ? (
              <span className="text-[11px] text-muted-foreground">{item.hint}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
