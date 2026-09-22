'use client';

import type { Proposal, ProposalStatus, RiskLevel } from '@aegis/contracts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProposals } from '@/lib/api/hooks';
import { formatDateTime } from '@/lib/utils';
import { QueryState } from './query-state';

/**
 * Propuestas recientes.
 *
 * Es la antesala de FE-06 y FE-07: aquí solo se listan. La tarjeta completa
 * con acciones, montos, panel del Guardian y firma con Freighter va en su
 * propio PR, porque aprobar un pago merece más cuidado que un botón.
 */

const STATUS_LABEL: Record<ProposalStatus, string> = {
  DRAFT: 'Borrador',
  POLICY_CHECK: 'Revisando límites',
  GUARDIAN_REVIEW: 'Analizando riesgo',
  PENDING_USER: 'Espera tu firma',
  AUTO_APPROVED: 'Aprobada automáticamente',
  SIGNED: 'Firmada',
  SUBMITTED: 'Enviada a la red',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada por ti',
  DENIED: 'Denegada por la política',
  EXPIRED: 'Caducada',
  FAILED: 'Falló',
};

const RISK_LABEL: Record<RiskLevel, string> = {
  LOW: 'Riesgo bajo',
  MEDIUM: 'Riesgo medio',
  HIGH: 'Riesgo alto',
  CRITICAL: 'Riesgo crítico',
};

const RISK_VARIANT = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

/** Estados en los que todavía puede pasar algo: justifican sondear la API. */
function isLive(proposal: Proposal): boolean {
  return ['PENDING_USER', 'AUTO_APPROVED', 'SIGNED', 'SUBMITTED'].includes(proposal.status);
}

export function ProposalsCard() {
  const { data, isLoading, error } = useProposals(10, { poll: true });
  const proposals = data?.proposals ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Propuestas recientes</CardTitle>
        <CardDescription>
          Cada una pasó por la política y por el Guardian antes de llegar aquí.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={proposals.length === 0}
          emptyLabel="Pídele algo al agente y aparecerá aquí."
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
