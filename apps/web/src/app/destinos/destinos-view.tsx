'use client';

import { RequireSession } from '@/components/auth/require-session';
import { DestinationForm } from '@/components/destinations/destination-form';
import { DestinationList } from '@/components/destinations/destination-list';
import { AppShell } from '@/components/layout/app-shell';

export function DestinosView() {
  return (
    <RequireSession>
      <AppShell
        title="Objetivos y contactos"
        subtitle="El agente solo puede enviar dinero a lo que esté en esta lista. Las direcciones entran solo por aquí."
      >
        <DestinationForm />
        <DestinationList />
      </AppShell>
    </RequireSession>
  );
}
