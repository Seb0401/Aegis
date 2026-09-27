'use client';

import { RequireSession } from '@/components/auth/require-session';
import { AppShell } from '@/components/layout/app-shell';
import { LimitPlayground } from '@/components/policy/limit-playground';
import { PolicyForm } from '@/components/policy/policy-form';

export function LimitesView() {
  return (
    <RequireSession>
      <AppShell
        title="Límites y modo"
        subtitle="Lo que el agente no puede pasar, decidas lo que decidas pedirle."
      >
        <PolicyForm />
        {/*
          Debajo del formulario a propósito: primero se ponen los límites y
          después se ven actuar. Al revés no se entendería qué se está
          probando.
        */}
        <LimitPlayground />
      </AppShell>
    </RequireSession>
  );
}
