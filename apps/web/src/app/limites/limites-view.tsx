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
        subtitle="Lo único que separa «el agente puede moverme dinero» de «el agente puede moverme todo el dinero»."
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
