'use client';

import { RequireSession } from '@/components/auth/require-session';
import { GoalList, GoalsEmptyHint } from '@/components/goals/goal-list';
import { GoalsSummary } from '@/components/goals/goals-summary';
import { AppShell } from '@/components/layout/app-shell';

export function ObjetivosView() {
  return (
    <RequireSession>
      <AppShell title="Objetivos" subtitle="Lo que te propusiste guardar, y cuánto llevas.">
        <GoalsSummary />
        <GoalList />
        <GoalsEmptyHint />
      </AppShell>
    </RequireSession>
  );
}
