'use client';

import { RequireSession } from '@/components/auth/require-session';
import { AppShell } from '@/components/layout/app-shell';
import { PolicyForm } from '@/components/policy/policy-form';

export default function LimitesPage() {
  return (
    <RequireSession>
      <AppShell>
        <h1 className="text-xl font-semibold tracking-tight">Límites y modo</h1>
        <PolicyForm />
      </AppShell>
    </RequireSession>
  );
}
