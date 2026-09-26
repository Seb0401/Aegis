'use client';

import { ChainActivity } from '@/components/activity/chain-activity';
import { RequireSession } from '@/components/auth/require-session';
import { AppShell } from '@/components/layout/app-shell';

export function ActividadView() {
  return (
    <RequireSession>
      <AppShell
        title="Actividad"
        subtitle="Lo que la red hizo. En Historial está lo que Aegis decidió; aquí, lo que quedó escrito en la cadena."
      >
        <ChainActivity />
      </AppShell>
    </RequireSession>
  );
}
