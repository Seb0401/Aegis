'use client';

import type { ReactNode } from 'react';
import { riseDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * La fila con la que abre cada sección.
 *
 * Misma anatomía en todas —cifra grande, etiqueta pequeña, una nota si hace
 * falta— y contenido distinto en cada una. Eso es lo que hace que las
 * pantallas tengan carácter propio sin parecer aplicaciones distintas: lo que
 * cambia es la respuesta, no la forma de la pregunta.
 *
 * Responde a «¿qué me dice esta pantalla de un vistazo?», que es lo que se
 * mira antes de ponerse a leer nada. Una sección que empieza directamente con
 * una lista obliga a recorrerla entera para sacar esa conclusión.
 */
export function PageSummary({
  items,
  className,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    hint?: string;
    /** Colorea la cifra cuando significa algo: bien, ojo, mal. */
    tone?: 'neutral' | 'good' | 'warn' | 'bad';
  }>;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-border bg-card/60 p-5 md:flex md:flex-wrap md:gap-x-10',
        className,
      )}
    >
      {items.map((item, indice) => (
        <div
          key={item.label}
          className="rise-in flex min-w-0 flex-col gap-0.5"
          style={riseDelay(indice, 60)}
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              'font-display text-2xl leading-none font-semibold',
              item.tone === 'good' && 'text-risk-low',
              item.tone === 'warn' && 'text-risk-medium',
              item.tone === 'bad' && 'text-destructive',
            )}
          >
            {item.value}
          </dd>
          {item.hint ? <p className="text-[11px] text-muted-foreground">{item.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}
