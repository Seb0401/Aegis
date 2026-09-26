'use client';

import { RequireSession } from '@/components/auth/require-session';
import { GoalList, GoalsEmptyHint } from '@/components/goals/goal-list';
import { AppShell } from '@/components/layout/app-shell';

export function ObjetivosView() {
  return (
    <RequireSession>
      <AppShell
        title="Objetivos"
        subtitle="Lo que te propusiste guardar, y cuánto llevas de verdad en la cadena."
      >
        <GoalList />
        <GoalsEmptyHint />
      </AppShell>
    </RequireSession>
  );
}
