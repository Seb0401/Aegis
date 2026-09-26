'use client';

import { RequireSession } from '@/components/auth/require-session';
import { AppShell } from '@/components/layout/app-shell';
import { ChainIntegrity } from '@/components/security/chain-integrity';
import { DelegationCard } from '@/components/setup/delegation-card';

/**
 * Las tres preguntas que alguien se hace antes de fiarse de esto: qué puede
 * firmar el agente, cómo se le para, y si lo que dice que hizo se puede
 * comprobar.
 *
 * Estaban repartidas —la delegación escondida en Configuración, que ni salía
 * en la navegación; el kill switch solo en la cabecera; la integridad de la
 * bitácora al final del Historial—. Juntas responden a una sola pregunta, y
 * por eso ahora viven juntas.
 */
export function SeguridadView() {
  return (
    <RequireSession>
      <AppShell
        title="Seguridad"
        subtitle="Qué puede firmar el agente, cómo se le para y si lo que dice que hizo se puede comprobar."
      >
        <DelegationCard />
        <ChainIntegrity />
      </AppShell>
    </RequireSession>
  );
}
