'use client';

import { RequireSession } from '@/components/auth/require-session';
import { AuditCard } from '@/components/history/audit-card';
import { TransactionsCard } from '@/components/history/transactions-card';
import { AppShell } from '@/components/layout/app-shell';

export default function HistorialPage() {
  return (
    <RequireSession>
      <AppShell
        title="Historial"
        subtitle="Lo que de verdad se ejecutó en la red y la bitácora encadenada de todo lo que pasó."
      >
        <TransactionsCard />
        <AuditCard />
      </AppShell>
    </RequireSession>
  );
}
