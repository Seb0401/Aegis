'use client';

import Link from 'next/link';
import { RequireSession } from '@/components/auth/require-session';
import { AuditCard } from '@/components/history/audit-card';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Lo que Aegis decidió.
 *
 * Los movimientos de la red se fueron a Actividad. Son preguntas distintas
 * —«qué decidió» y «qué ocurrió»— y tenerlas en la misma pantalla obligaba a
 * leer dos listas parecidas para entender que no dicen lo mismo.
 */
export function HistorialView() {
  return (
    <RequireSession>
      <AppShell
        title="Historial"
        subtitle="Cada decisión del agente, encadenada por hashes: quién propuso qué, qué regla lo permitió y con qué riesgo."
      >
        <AuditCard />

        <p className="text-sm text-muted-foreground">
          Los pagos que llegaron a la red están en{' '}
          <Link href="/actividad" className="underline underline-offset-2">
            Actividad
          </Link>
          , con su enlace al explorador.
        </p>
      </AppShell>
    </RequireSession>
  );
}
