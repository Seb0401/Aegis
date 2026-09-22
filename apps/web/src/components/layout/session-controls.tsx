'use client';

import { LogOut } from 'lucide-react';
import { KillSwitch } from '@/components/layout/kill-switch';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { shortAddress } from '@/lib/utils';

/**
 * Kill switch, dirección y salir, para móvil.
 *
 * En pantallas pequeñas la cabecera se queda solo con el título, así que estos
 * dos controles viven aquí, dentro de la tarjeta de Jupi: es lo primero del
 * panel y está a un toque desde cualquier sección por la barra inferior.
 *
 * Parar al agente no puede quedar escondido detrás de un menú (FE-12): es la
 * acción que alguien va a buscar con prisa.
 */
export function SessionControls() {
  const { session, logout } = useAuth();

  return (
    <div className="flex items-center gap-2 border-t border-border pt-3 sm:hidden">
      <KillSwitch />

      {session ? (
        <code
          className="min-w-0 flex-1 truncate rounded-full bg-muted px-3 py-1.5 text-xs"
          title={session.user.address}
        >
          {shortAddress(session.user.address)}
        </code>
      ) : (
        <span className="flex-1" />
      )}

      <Button variant="ghost" size="icon" onClick={logout} aria-label="Cerrar sesión">
        <LogOut />
      </Button>
    </div>
  );
}
