'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProposals } from '@/lib/api/hooks';
import { RISK_LABEL, RISK_VARIANT, STATUS_LABEL, isActionable, isLive } from '@/lib/proposals';
import { formatDateTime } from '@/lib/utils';
import { QueryState } from './query-state';

/**
 * Propuestas ya resueltas o en vuelo.
 *
 * Las que esperan una decisión del usuario no salen aquí: viven arriba, como
 * tarjeta completa (`PendingProposals`). Repetirlas en la lista invitaría a
 * aprobar desde una fila resumida, sin leer el análisis del Guardian.
 */
export function ProposalsCard() {
  const { data, isLoading, error } = useProposals(20, { poll: true });
  const proposals = (data?.proposals ?? []).filter((proposal) => !isActionable(proposal));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de propuestas</CardTitle>
        <CardDescription>
          Cada una pasó por la política y por el Guardian antes de llegar aquí.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={proposals.length === 0}
          emptyLabel="Todavía no hay propuestas resueltas."
        >
          <ul className="flex flex-col divide-y divide-border">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                <p className="text-sm">{proposal.summary}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={isLive(proposal) ? 'default' : 'outline'}>
                    {STATUS_LABEL[proposal.status]}
                  </Badge>
                  {proposal.risk ? (
                    <Badge variant={RISK_VARIANT[proposal.risk.level]}>
                      {RISK_LABEL[proposal.risk.level]}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {proposal.actions.length} operación
                    {proposal.actions.length === 1 ? '' : 'es'} ·{' '}
                    {formatDateTime(proposal.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
