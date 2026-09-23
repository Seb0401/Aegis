'use client';

import { RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Jupi } from '@/components/jupi/jupi';
import { Button } from '@/components/ui/button';

/**
 * Algo se rompió dentro de una pantalla.
 *
 * Dos cosas importan aquí y las dos son de confianza, no de estética:
 *
 *  1. **Decir que no se movió dinero.** Quien ve un error en una aplicación
 *     que firma pagos asume lo peor. Un fallo de interfaz no ejecuta nada: lo
 *     que decide es el backend, y lo que ejecuta necesita tu firma.
 *  2. **Dar el identificador del error** (`digest`), que es lo único con lo
 *     que alguien puede buscarlo en los registros del servidor.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El error real, a la consola del navegador: la pantalla no debe escupir
    // trazas internas, pero tampoco conviene perderlas al desarrollar.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Jupi mood="triste" size={160} decorative={false} />

      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Algo se rompió en esta pantalla</h1>
        <p className="text-sm text-muted-foreground">
          No se ha movido dinero: un fallo aquí no ejecuta nada. Las operaciones las decide el
          backend y necesitan tu firma.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            Identificador del error: <code className="rounded bg-muted px-1">{error.digest}</code>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCw />
          Reintentar
        </Button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-border px-4 py-2.5 text-sm transition-colors hover:bg-accent"
        >
          Volver al panel
        </Link>
      </div>
    </main>
  );
}
