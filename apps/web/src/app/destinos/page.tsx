'use client';

import { RequireSession } from '@/components/auth/require-session';
import { DestinationForm } from '@/components/destinations/destination-form';
import { DestinationList } from '@/components/destinations/destination-list';
import { AppShell } from '@/components/layout/app-shell';

export default function DestinosPage() {
  return (
    <RequireSession>
      <AppShell>
        <h1 className="text-xl font-semibold tracking-tight">Objetivos y contactos</h1>
        <DestinationForm />
        <DestinationList />
      </AppShell>
    </RequireSession>
  );
}
