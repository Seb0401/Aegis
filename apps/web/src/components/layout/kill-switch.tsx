'use client';

import { Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePolicy, useSetPaused } from '@/lib/api/hooks';

/**
 * Kill switch (FE-12, regla P-08).
 *
 * Tiene ruta propia en la API justamente para poder vivir aquí arriba, siempre
 * visible: parar al agente tiene que ser lo más fácil de toda la aplicación.
 * Mientras la petición está en vuelo el botón no cambia de texto para no
 * mentir sobre el estado real.
 */
export function KillSwitch() {
  const policy = usePolicy();
  const setPaused = useSetPaused();

  const paused = policy.data?.config.paused ?? false;
  const pending = setPaused.isPending;

  if (policy.isLoading) {
    return <div className="h-8 w-28 animate-pulse rounded-md bg-muted" aria-hidden />;
  }

  return (
    <Button
      size="sm"
      variant={paused ? 'secondary' : 'destructive'}
      disabled={pending}
      aria-pressed={paused}
      onClick={() => setPaused.mutate(!paused)}
      /*
        El `title` solo o el texto solo se quedan cortos: uno no dice qué hace
        el botón y el otro no dice qué implica. El nombre accesible dice las
        dos cosas, en ese orden.
      */
      aria-label={
        paused
          ? 'Reactivar agente. Ahora está pausado y la política deniega todo.'
          : 'Pausar agente. La política pasará a denegar cualquier operación.'
      }
      title={
        paused
          ? 'El agente está pausado: la política deniega todo.'
          : 'Detiene al agente: la política pasa a denegar cualquier operación.'
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : paused ? <Play /> : <Pause />}
      {paused ? 'Reactivar agente' : 'Pausar agente'}
    </Button>
  );
}
