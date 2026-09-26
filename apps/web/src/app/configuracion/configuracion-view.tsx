'use client';

import Link from 'next/link';
import { RequireSession } from '@/components/auth/require-session';
import { AppShell } from '@/components/layout/app-shell';
import { SetupChecklist } from '@/components/setup/setup-checklist';

/**
 * Tu cuenta y los primeros pasos.
 *
 * La delegación del firmante se fue a Seguridad, donde está con el resto de
 * lo que responde a «¿puedo fiarme de esto?». Aquí queda lo que es tuyo y no
 * del agente. Repetir la misma tarjeta en dos sitios obliga a preguntarse
 * cuál de las dos manda.
 */
export function ConfiguracionView() {
  return (
    <RequireSession>
      <AppShell title="Configuración" subtitle="Tu cuenta y lo que conviene dejar listo.">
        <SetupChecklist />

        <p className="text-sm text-muted-foreground">
          La llave con la que firma el agente y la integridad de la bitácora están en{' '}
          <Link href="/seguridad" className="underline underline-offset-2">
            Seguridad
          </Link>
          .
        </p>
      </AppShell>
    </RequireSession>
  );
}
