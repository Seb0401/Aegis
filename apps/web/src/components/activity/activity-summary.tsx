'use client';

import { addAmounts, type AssetCode } from '@aegis/contracts';
import { PageSummary } from '@/components/layout/page-summary';
import { useTransactions } from '@/lib/api/hooks';
import { formatAmount } from '@/lib/utils';

/**
 * El resumen de Actividad: qué ha pasado en la red, en tres cifras.
 *
 * Las fallidas van aparte y con su propio color. Esconderlas dejaría una
 * pantalla más limpia y menos cierta: una transacción que la red rechazó es
 * exactamente lo que alguien vendría a buscar aquí.
 *
 * Las sumas se hacen por activo y solo se enseñan si todos los movimientos
 * comparten uno: sumar XLM con USDC daría una cifra sin significado.
 */
export function ActivitySummary() {
  const { data } = useTransactions(50);
  const movimientos = data?.transactions ?? [];

  if (movimientos.length === 0) return null;

  const correctos = movimientos.filter((tx) => tx.successful);
  const fallidos = movimientos.length - correctos.length;

  const activos = new Set(correctos.map((tx) => tx.asset));
  const unico: AssetCode | null = activos.size === 1 ? [...activos][0]! : null;

  const suma = (direccion: 'IN' | 'OUT') =>
    correctos
      .filter((tx) => tx.direction === direccion)
      .reduce((total, tx) => addAmounts(total, tx.amount), '0');

  return (
    <PageSummary
      items={[
        { label: 'Movimientos', value: movimientos.length },
        ...(unico
          ? [
              {
                label: 'Ha entrado',
                value: formatAmount(suma('IN')),
                hint: unico,
                tone: 'good' as const,
              },
              { label: 'Ha salido', value: formatAmount(suma('OUT')), hint: unico },
            ]
          : [{ label: 'Activos distintos', value: activos.size, hint: 'no se suman entre sí' }]),
        ...(fallidos > 0
          ? [
              {
                label: 'Rechazados por la red',
                value: fallidos,
                tone: 'bad' as const,
                hint: 'no movieron nada',
              },
            ]
          : []),
      ]}
    />
  );
}
