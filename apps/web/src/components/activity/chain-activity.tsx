'use client';

import type { TxSummary } from '@aegis/contracts';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, TriangleAlert } from 'lucide-react';
import { QueryState } from '@/components/dashboard/query-state';
import { Amount } from '@/components/ui/amount';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDestinations, useTransactions } from '@/lib/api/hooks';
import { riseDelay } from '@/lib/motion';
import { explorerTxUrl } from '@/lib/stellar-links';
import { cn, formatDateTime, shortAddress } from '@/lib/utils';

/**
 * Lo que de verdad ocurrió en Stellar.
 *
 * Es la otra mitad del Historial, y son cosas distintas a propósito: allí se
 * ve **lo que Aegis decidió** —propuestas, reglas, riesgo, la bitácora— y aquí
 * **lo que la red hizo**. Una propuesta aprobada cuya transacción rebotara
 * aparecería aprobada allí y fallida aquí, y esa discrepancia es justo lo que
 * conviene poder ver.
 *
 * Cada fila enlaza a su transacción en el explorador. Eso no es un adorno:
 * convierte «la aplicación dice que pagó» en algo que cualquiera comprueba por
 * su cuenta, sin pedirnos permiso ni creernos nada.
 */
export function ChainActivity() {
  const { data, isLoading, error } = useTransactions(50);
  const destinations = useDestinations();

  // Para poner nombre a las direcciones conocidas: «Objetivo: Viaje» se lee,
  // «GB7G7E…RVVZJ4» hay que descifrarlo.
  const nombres = new Map(
    (destinations.data?.destinations ?? []).map((destino) => [destino.address, destino.label]),
  );

  const transactions = data?.transactions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos en la cadena</CardTitle>
        <CardDescription>
          Directo de Horizon. Cada uno enlaza a su transacción para que puedas comprobarla tú.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={transactions.length === 0}
          emptyLabel="Todavía no ha entrado ni salido nada de esta cuenta. Cuando Aegis pague algo, aparecerá aquí con su enlace al explorador."
          rows={6}
        >
          <ul className="flex flex-col divide-y divide-border">
            {transactions.map((tx, indice) => (
              <Movimiento
                key={`${tx.hash}-${indice}`}
                tx={tx}
                nombre={nombres.get(tx.counterparty)}
                orden={indice}
              />
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}

function Movimiento({
  tx,
  nombre,
  orden,
}: {
  tx: TxSummary;
  nombre: string | undefined;
  orden: number;
}) {
  const saliente = tx.direction === 'OUT';

  return (
    <li className="rise-in flex items-center gap-3 py-3 first:pt-0" style={riseDelay(orden, 40)}>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          !tx.successful
            ? 'bg-destructive/15 text-destructive'
            : saliente
              ? 'bg-primary/15 text-primary'
              : 'bg-risk-low/15 text-risk-low',
        )}
      >
        {!tx.successful ? (
          <TriangleAlert className="size-4" />
        ) : saliente ? (
          <ArrowUpRight className="size-4" />
        ) : (
          <ArrowDownLeft className="size-4" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {nombre ?? shortAddress(tx.counterparty)}
          {tx.memo ? <span className="text-muted-foreground"> · {tx.memo}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(tx.createdAt)}
          {!tx.successful ? ' · la red la rechazó' : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Amount
          value={tx.amount}
          asset={tx.asset}
          className={cn(
            'text-sm font-medium',
            !tx.successful && 'text-muted-foreground line-through',
          )}
          assetClassName="text-xs font-normal text-muted-foreground"
        />

        <a
          href={explorerTxUrl(tx.hash)}
          target="_blank"
          rel="noreferrer"
          title={`Ver ${shortAddress(tx.hash)} en Stellar Expert`}
          aria-label={`Ver la transacción ${shortAddress(tx.hash)} en el explorador`}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>
    </li>
  );
}
