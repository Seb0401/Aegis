'use client';

import { RequireSession } from '@/components/auth/require-session';
import { AuditCard } from '@/components/history/audit-card';
import { TransactionsCard } from '@/components/history/transactions-card';
import { AppShell } from '@/components/layout/app-shell';

export default function HistorialPage() {
  return (
    <RequireSession>
      <AppShell>
        <h1 className="text-xl font-semibold tracking-tight">Historial</h1>
        <TransactionsCard />
        <AuditCard />
      </AppShell>
    </RequireSession>
  );
}
