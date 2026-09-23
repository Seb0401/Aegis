'use client';

import { RequireSession } from '@/components/auth/require-session';
import { AppShell } from '@/components/layout/app-shell';
import { DelegationCard } from '@/components/setup/delegation-card';
import { SetupChecklist } from '@/components/setup/setup-checklist';

export function ConfiguracionView() {
  return (
    <RequireSession>
      <AppShell
        title="Configuración"
        subtitle="Tu cuenta y la llave que el agente usa para firmar."
      >
        <SetupChecklist />
        <DelegationCard />
      </AppShell>
    </RequireSession>
  );
}
