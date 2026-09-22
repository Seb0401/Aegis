'use client';

import { Inbox } from 'lucide-react';
import { ProposalCard } from '@/components/proposals/proposal-card';
import { QueryState } from '@/components/dashboard/query-state';
import { useProposals } from '@/lib/api/hooks';
import { isActionable } from '@/lib/proposals';

/**
 * Lo que espera una decisión tuya, arriba del todo y sin tener que navegar.
 *
 * Es deliberado que ocupe el sitio principal del dashboard: una propuesta en
 * `PENDING_USER` caduca en minutos (regla P-09) y el resto de tarjetas puede
 * esperar.
 */
export function PendingProposals() {
  const { data, isLoading, error } = useProposals(20, { poll: true });
  const pending = (data?.proposals ?? []).filter(isActionable);

  if (!isLoading && !error && pending.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        <Inbox className="size-4 shrink-0" />
        Nada pendiente de aprobar. Pídele algo al agente y aparecerá aquí.
      </p>
    );
  }

  return (
    <QueryState isLoading={isLoading} error={error} rows={5}>
      <div className="flex flex-col gap-4">
        {pending.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} />
        ))}
      </div>
    </QueryState>
  );
}
