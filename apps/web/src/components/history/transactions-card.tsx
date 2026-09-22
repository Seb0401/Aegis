'use client';

import { ArrowDownLeft, ArrowUpRight, CircleX } from 'lucide-react';
import { QueryState } from '@/components/dashboard/query-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransactions } from '@/lib/api/hooks';
import { cn, formatAmount, formatDateTime, shortAddress } from '@/lib/utils';

/**
 * Historial de la cuenta en la red (FE-11).
 *
 * Son los movimientos reales en Stellar, no las propuestas: aquí aparece lo
 * que llegó a ejecutarse, incluidas las transacciones fallidas. Una que falló
 * se marca en vez de ocultarse, porque «no aparece» y «no ocurrió» tienen que
 * significar lo mismo en esta pantalla.
 */
export function TransactionsCard() {
  const { data, isLoading, error } = useTransactions(50);
  const transactions = data?.transactions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
        <CardDescription>Lo que de verdad se ejecutó en la red.</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={transactions.length === 0}
          emptyLabel="La cuenta todavía no tiene movimientos."
        >
          <ul className="flex flex-col divide-y divide-border">
            {transactions.map((tx) => (
              <li key={tx.hash} className="flex items-center gap-3 py-2.5 first:pt-0">
                {!tx.successful ? (
                  <CircleX className="size-4 shrink-0 text-destructive" />
                ) : tx.direction === 'IN' ? (
                  <ArrowDownLeft className="size-4 shrink-0 text-risk-low" />
                ) : (
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {tx.direction === 'IN' ? 'Recibido de' : 'Enviado a'}{' '}
                    <span className="font-mono text-xs">{shortAddress(tx.counterparty)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(tx.createdAt)}
                    {tx.memo ? ` · ${tx.memo}` : ''}
                    {tx.successful ? '' : ' · falló'}
                  </p>
                </div>

                <span
                  className={cn(
                    'shrink-0 text-sm font-medium tabular-nums',
                    !tx.successful && 'text-muted-foreground line-through',
                  )}
                >
                  {tx.direction === 'IN' ? '+' : '−'}
                  {formatAmount(tx.amount, tx.asset)}
                </span>
              </li>
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
