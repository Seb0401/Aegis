'use client';

import { HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TourOverlay } from '@/components/tour/tour-overlay';
import { Button } from '@/components/ui/button';
import { yaVioElTour, type TourId } from '@/lib/tour';

/**
 * Decide qué tour toca, si es que toca alguno.
 *
 * Tres caminos, y el orden importa:
 *
 *  1. `?tour=jurado` en la dirección. Es el que se manda por enlace, y por eso
 *     gana a todo: quien lo abre así lo ha pedido expresamente.
 *  2. Primera visita, sin haberlo visto nunca: el de bienvenida, y con un
 *     respiro para que la pantalla termine de cargar. Un tour que salta sobre
 *     esqueletos de carga señala cajas vacías.
 *  3. El botón, siempre disponible. Nadie debería tener que borrar datos del
 *     navegador para volver a verlo.
 */
export function TourLauncher() {
  const [activo, setActivo] = useState<TourId | null>(null);

  useEffect(() => {
    /*
      Se lee de `window` y no con `useSearchParams` a propósito: ese hook
      obliga a envolver el árbol en un `Suspense` para que Next pueda
      prerenderizar la página, y aquí el dato solo hace falta en el navegador,
      dentro de este efecto. No merece cambiar la forma del árbol por eso.
    */
    const pedido = new URLSearchParams(window.location.search).get('tour');
    if (pedido === 'jurado' || pedido === 'onboarding') {
      setActivo(pedido);
      return;
    }

    if (yaVioElTour()) return;

    const temporizador = window.setTimeout(() => setActivo('onboarding'), 900);
    return () => window.clearTimeout(temporizador);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setActivo('jurado')}
        title="Ver cómo funciona Aegis en 30 segundos"
      >
        <HelpCircle />
        <span className="hidden sm:inline">Cómo funciona</span>
      </Button>

      {activo ? <TourOverlay id={activo} onClose={() => setActivo(null)} /> : null}
    </>
  );
}
