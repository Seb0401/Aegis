'use client';

import type { Destination } from '@aegis/contracts';
import { Target } from 'lucide-react';
import Link from 'next/link';
import { QueryState } from '@/components/dashboard/query-state';
import { Amount } from '@/components/ui/amount';
import { Card } from '@/components/ui/card';
import { useDestinations, useTransactions } from '@/lib/api/hooks';
import { riseDelay } from '@/lib/motion';
import { goalProgress, sentTo } from '@/lib/stats';
import { formatAmount } from '@/lib/utils';

/**
 * Tus metas, y cuánto llevas de cada una.
 *
 * El dato existía desde el principio —cada destino puede tener `targetAmount`
 * y `targetAsset`— y no se enseñaba en ninguna parte. Es lo que convierte
 * «cuatro pagos de 13,33» en «vas por el 60% del viaje», que es la frase por
 * la que alguien usaría esto.
 *
 * Lo avanzado se calcula sumando lo que **salió** hacia esa dirección y se
 * confirmó, no lo que el agente propuso: una propuesta aprobada que la red
 * rechazara no acerca a nadie a su meta.
 */
export function GoalList() {
  const destinations = useDestinations();
  const transactions = useTransactions(200);

  const conMeta = (destinations.data?.destinations ?? []).filter(
    (destino) => destino.targetAmount && destino.targetAsset,
  );

  return (
    <QueryState
      isLoading={destinations.isLoading}
      error={destinations.error}
      isEmpty={conMeta.length === 0}
      emptyLabel="Ninguno de tus destinos tiene una meta puesta todavía."
      rows={3}
    >
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {conMeta.map((destino, indice) => (
          <GoalCard
            key={destino.id}
            destino={destino}
            enviado={sentTo(
              transactions.data?.transactions ?? [],
              destino.address,
              destino.targetAsset!,
            )}
            orden={indice}
          />
        ))}
      </ul>
    </QueryState>
  );
}

function GoalCard({
  destino,
  enviado,
  orden,
}: {
  destino: Destination;
  enviado: string;
  orden: number;
}) {
  const meta = destino.targetAmount!;
  const activo = destino.targetAsset!;
  const avance = goalProgress(enviado, meta) ?? 0;
  const porcentaje = Math.round(avance * 100);
  const cumplida = avance >= 1;

  return (
    <li>
      <Card className="rise-in flex flex-col gap-4 p-5" style={riseDelay(orden, 70)}>
        <div className="flex items-start gap-3">
          <span
            className={
              cumplida
                ? 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-risk-low/15 text-risk-low'
                : 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary'
            }
          >
            <Target className="size-4.5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{destino.label}</p>
            <p className="text-xs text-muted-foreground">
              Meta: {formatAmount(meta)} {activo}
            </p>
          </div>

          <span
            className={
              cumplida
                ? 'font-display shrink-0 text-2xl leading-none font-semibold text-risk-low tabular-nums'
                : 'font-display shrink-0 text-2xl leading-none font-semibold tabular-nums'
            }
          >
            {porcentaje}%
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={
              cumplida
                ? 'reveal-x h-full rounded-r-[4px] bg-risk-low'
                : 'reveal-x h-full rounded-r-[4px] bg-primary'
            }
            style={{ width: `${(avance * 100).toFixed(2)}%`, ...riseDelay(orden, 70) }}
          />
        </div>

        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Llevas</span>
          <Amount value={enviado} asset={activo} className="font-medium" />
        </p>

        {cumplida ? (
          <p className="text-xs text-risk-low">Meta cumplida. Puedes subirla o ponerle otra.</p>
        ) : null}
      </Card>
    </li>
  );
}

/** Enlace a Destinos, para quien todavía no tiene metas puestas. */
export function GoalsEmptyHint() {
  return (
    <p className="text-sm text-muted-foreground">
      Las metas se ponen en{' '}
      <Link href="/destinos" className="underline underline-offset-2">
        Destinos
      </Link>
      , al crear o editar uno.
    </p>
  );
}
