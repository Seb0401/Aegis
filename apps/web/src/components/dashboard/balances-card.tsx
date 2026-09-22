'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useBalances } from '@/lib/api/hooks';
import { formatAmount } from '@/lib/utils';
import { QueryState } from './query-state';

/**
 * Saldos de la cuenta.
 *
 * Se muestran `total` y `available` por separado a propósito: en Stellar parte
 * del saldo está retenido por la reserva de la red, y enseñar solo el total
 * haría que el usuario creyera que puede gastar más de lo que puede.
 */
export function BalancesCard() {
  const { data, isLoading, error } = useBalances();
  const balances = data?.balances ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saldos</CardTitle>
        <CardDescription>Lo disponible descuenta la reserva de la red.</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={balances.length === 0}
          emptyLabel="La cuenta no tiene saldos todavía."
          rows={2}
        >
          <ul className="flex flex-col gap-3">
            {balances.map((balance) => (
              <li key={balance.asset} className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium">{balance.asset}</span>
                <span className="text-right">
                  <span className="block text-lg font-semibold tabular-nums">
                    {formatAmount(balance.available)}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatAmount(balance.total)} en total
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
