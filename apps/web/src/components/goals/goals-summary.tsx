'use client';

import { addAmounts, toStroops } from '@aegis/contracts';
import { PageSummary } from '@/components/layout/page-summary';
import { useDestinations, useTransactions } from '@/lib/api/hooks';
import { goalProgress, sentTo } from '@/lib/stats';
import { formatAmount } from '@/lib/utils';

/**
 * El resumen de Objetivos: cuántas metas tienes, cuánto llevas y cuántas has
 * cumplido.
 *
 * Las metas se suman solo si comparten activo. Sumar 500 USDC con 1.200 XLM
 * daría un número que no significa nada, y el total en dólares es otra
 * columna que aquí no toca. Cuando hay activos mezclados se dice cuántas son
 * en vez de inventar una cifra conjunta.
 */
export function GoalsSummary() {
  const destinations = useDestinations();
  const transactions = useTransactions(200);

  const conMeta = (destinations.data?.destinations ?? []).filter(
    (destino) => destino.targetAmount && destino.targetAsset,
  );

  if (conMeta.length === 0) return null;

  const movimientos = transactions.data?.transactions ?? [];
  const activos = new Set(conMeta.map((destino) => destino.targetAsset!));
  const mismoActivo = activos.size === 1 ? [...activos][0]! : null;

  const cumplidas = conMeta.filter((destino) => {
    const enviado = sentTo(movimientos, destino.address, destino.targetAsset!);
    return (goalProgress(enviado, destino.targetAmount) ?? 0) >= 1;
  }).length;

  const totales = mismoActivo
    ? conMeta.reduce(
        (acumulado, destino) => ({
          meta: addAmounts(acumulado.meta, destino.targetAmount!),
          llevas: addAmounts(
            acumulado.llevas,
            sentTo(movimientos, destino.address, destino.targetAsset!),
          ),
        }),
        { meta: '0', llevas: '0' },
      )
    : null;

  const avance =
    totales && toStroops(totales.meta) > 0n
      ? Math.round((Number(toStroops(totales.llevas)) / Number(toStroops(totales.meta))) * 100)
      : null;

  return (
    <PageSummary
      items={[
        {
          label: 'Metas abiertas',
          value: conMeta.length - cumplidas,
          hint: conMeta.length === 1 ? '1 en total' : `${conMeta.length} en total`,
        },
        ...(totales && mismoActivo
          ? [
              {
                label: 'Llevas guardado',
                value: `${formatAmount(totales.llevas)}`,
                hint: `de ${formatAmount(totales.meta)} ${mismoActivo}`,
              },
              ...(avance !== null
                ? [{ label: 'Del total', value: `${avance}%`, tone: 'neutral' as const }]
                : []),
            ]
          : [{ label: 'Activos distintos', value: activos.size, hint: 'no se suman entre sí' }]),
        ...(cumplidas > 0 ? [{ label: 'Cumplidas', value: cumplidas, tone: 'good' as const }] : []),
      ]}
    />
  );
}
