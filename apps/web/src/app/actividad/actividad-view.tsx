'use client';

import { ActivitySummary } from '@/components/activity/activity-summary';
import { ChainActivity } from '@/components/activity/chain-activity';
import { RequireSession } from '@/components/auth/require-session';
import { AppShell } from '@/components/layout/app-shell';

export function ActividadView() {
  return (
    <RequireSession>
      <AppShell title="Actividad" subtitle="Lo que ocurrió de verdad en Stellar.">
        <ActivitySummary />
        <ChainActivity />
      </AppShell>
    </RequireSession>
  );
}
