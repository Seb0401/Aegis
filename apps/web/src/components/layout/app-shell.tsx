'use client';

import { LogOut, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { KillSwitch } from '@/components/layout/kill-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePolicy } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth/auth-context';
import { shortAddress } from '@/lib/utils';

/**
 * Armazón de la aplicación: dashboard a la izquierda, chat a la derecha
 * (FE-Q3/FE-Q4: escritorio primero, el chat acompaña al panel en vez de
 * sustituirlo). Por debajo de `lg` el chat baja y se apila.
 */
export function AppShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const { session, logout } = useAuth();
  const policy = usePolicy();
  const mode = policy.data?.config.mode;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <ShieldCheck className="size-5" />
            Aegis
          </span>

          {mode ? (
            <Badge variant="outline" title="Modo de operación (regla P-07)">
              {mode === 'AUTONOMOUS' ? 'Autónomo' : 'Manual'}
            </Badge>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <KillSwitch />

            {session ? (
              <code
                className="hidden rounded-md bg-muted px-2 py-1 text-xs sm:inline"
                title={session.user.address}
              >
                {shortAddress(session.user.address)}
              </code>
            ) : null}

            <Button variant="ghost" size="icon" onClick={logout} aria-label="Cerrar sesión">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-[1fr_380px]">
        <main className="flex flex-col gap-4">{children}</main>
        {aside ? <aside className="flex flex-col gap-4">{aside}</aside> : null}
      </div>
    </div>
  );
}
