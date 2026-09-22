'use client';

import { RequireSession } from '@/components/auth/require-session';
import { ChatPanel } from '@/components/chat/chat-panel';
import { DestinationsCard } from '@/components/dashboard/destinations-card';
import { JupiCard } from '@/components/dashboard/jupi-card';
import { ProposalsCard } from '@/components/dashboard/proposals-card';
import { StatCards } from '@/components/dashboard/stat-cards';
import { AppShell } from '@/components/layout/app-shell';
import { PendingProposals } from '@/components/proposals/pending-proposals';

export default function DashboardPage() {
  return (
    <RequireSession>
      <AppShell aside={<ChatPanel />}>
        <JupiCard />
        <StatCards />
        <PendingProposals />
        <ProposalsCard />
        <DestinationsCard />
      </AppShell>
    </RequireSession>
  );
}
