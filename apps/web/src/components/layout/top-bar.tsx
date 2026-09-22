'use client';

import { LogOut } from 'lucide-react';
import { KillSwitch } from '@/components/layout/kill-switch';
import { Button } from '@/components/ui/button';
import { WaveMark } from '@/components/ui/marks';
import { useBalances, usePolicy } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth/auth-context';
import { formatAmount, shortAddress } from '@/lib/utils';

/**
 * Cabecera: saludo, estado del sistema y saldo a mano.
 *
 * En móvil se queda **solo el título**. Todo lo demás —subtítulo, estado,
 * saldo, kill switch y salir— ocupaba media pantalla antes de llegar al
 * contenido. El kill switch y el botón de salir no desaparecen: bajan a la
 * tarjeta de Jupi (`SessionControls`), que es lo primero del panel.
 *
 * El saludo no lleva nombre porque la API no tiene ninguno: se entra con una
 * wallet, y lo único que Aegis sabe de ti es tu dirección. Inventar un nombre
 * en una pantalla que autoriza pagos sería el tipo de detalle bonito que
 * después confunde.
 */
export function TopBar({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { session, logout } = useAuth();
  const policy = usePolicy();
  const balances = useBalances();

  const paused = policy.data?.config.paused ?? false;
  const xlm = balances.data?.balances.find((balance) => balance.asset === 'XLM');

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {title ?? 'Hola'}
              {title ? null : <WaveMark className="size-5 text-primary sm:size-6" />}
            </h1>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
              {subtitle ??
                'Tu agente de IA ya está listo para mover dinero en Stellar. Siempre dentro de tus límites y con la aprobación del Guardian.'}
            </p>
          </div>

          <div className="hidden flex-wrap items-center gap-2 sm:flex sm:justify-end">
            <span
              className={
                paused
                  ? 'flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive'
                  : 'flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success'
              }
            >
              <span
                aria-hidden
                className={
                  paused
                    ? 'size-1.5 rounded-full bg-destructive'
                    : 'size-1.5 rounded-full bg-success'
                }
              />
              {paused ? 'Agente en pausa' : 'Sistema activo'}
            </span>

            {xlm ? (
              <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">XLM</span>
                <span className="font-medium tabular-nums">{formatAmount(xlm.available)}</span>
              </span>
            ) : null}

            <KillSwitch />

            {session ? (
              <code
                className="hidden rounded-full bg-muted px-3 py-1.5 text-xs lg:inline"
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
      </div>
    </header>
  );
}
