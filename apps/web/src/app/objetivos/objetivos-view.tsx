'use client';

import { RequireSession } from '@/components/auth/require-session';
import { GoalList, GoalsEmptyHint } from '@/components/goals/goal-list';
import { GoalsSummary } from '@/components/goals/goals-summary';
import { SplitRuleCard } from '@/components/goals/split-rule-card';
import { AppShell } from '@/components/layout/app-shell';

export function ObjetivosView() {
  return (
    <RequireSession>
      <AppShell title="Objetivos" subtitle="Lo que te propusiste guardar, y cuánto llevas.">
        <GoalsSummary />
        <GoalList />
        {/*
          Debajo de las metas a propósito: primero ves cuánto llevas y después
          decides cómo alimentarlas. Al revés, el reparto sería un formulario
          sin contexto.
        */}
        <SplitRuleCard />
        <GoalsEmptyHint />
      </AppShell>
    </RequireSession>
  );
}
