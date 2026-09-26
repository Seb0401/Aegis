'use client';

import { RequireSession } from '@/components/auth/require-session';
import { ChatPanel } from '@/components/chat/chat-panel';
import { DestinationsCard } from '@/components/dashboard/destinations-card';
import { JupiCard } from '@/components/dashboard/jupi-card';
import { ProposalsCard } from '@/components/dashboard/proposals-card';
import { StatCards } from '@/components/dashboard/stat-cards';
import { AppShell } from '@/components/layout/app-shell';
import { ExecutionMoment } from '@/components/proposals/execution-moment';
import { PendingProposals } from '@/components/proposals/pending-proposals';
import { useProposals } from '@/lib/api/hooks';
import { useJustConfirmed } from '@/lib/just-confirmed';

export function DashboardView() {
  /*
    La misma consulta que ya hacen las tarjetas de abajo: React Query la
    comparte por clave, así que vigilar los cambios de estado desde aquí no
    añade ni una petición.
  */
  const { data } = useProposals(20, { poll: true });
  const { confirmed, dismiss } = useJustConfirmed(data?.proposals ?? []);

  return (
    <RequireSession>
      <AppShell aside={<ChatPanel />}>
        <JupiCard />
        <StatCards />
        <PendingProposals />
        <ProposalsCard />
        <DestinationsCard />
      </AppShell>

      {confirmed ? <ExecutionMoment proposal={confirmed} onClose={dismiss} /> : null}
    </RequireSession>
  );
}
