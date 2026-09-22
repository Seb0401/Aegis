'use client';

import { RequireSession } from '@/components/auth/require-session';
import { ChatPanel } from '@/components/chat/chat-panel';
import { BalancesCard } from '@/components/dashboard/balances-card';
import { DestinationsCard } from '@/components/dashboard/destinations-card';
import { PolicyCard } from '@/components/dashboard/policy-card';
import { ProposalsCard } from '@/components/dashboard/proposals-card';
import { AppShell } from '@/components/layout/app-shell';
import { PendingProposals } from '@/components/proposals/pending-proposals';

export default function DashboardPage() {
  return (
    <RequireSession>
      <AppShell aside={<ChatPanel />}>
        <PendingProposals />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BalancesCard />
          <PolicyCard />
        </div>

        <ProposalsCard />
        <DestinationsCard />
      </AppShell>
    </RequireSession>
  );
}
