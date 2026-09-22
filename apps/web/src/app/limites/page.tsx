'use client';

import { RequireSession } from '@/components/auth/require-session';
import { AppShell } from '@/components/layout/app-shell';
import { PolicyForm } from '@/components/policy/policy-form';

export default function LimitesPage() {
  return (
    <RequireSession>
      <AppShell
        title="Límites y modo"
        subtitle="Lo único que separa «el agente puede moverme dinero» de «el agente puede moverme todo el dinero»."
      >
        <PolicyForm />
      </AppShell>
    </RequireSession>
  );
}
