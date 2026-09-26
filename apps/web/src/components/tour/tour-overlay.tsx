'use client';

import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { TOURS, marcarTourVisto, type TourId, type TourStep } from '@/lib/tour';

/** Hueco alrededor del elemento resaltado. */
const AIRE = 8;

interface Recuadro {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * El tour, dibujado.
 *
 * El foco se hace con una sombra enorme (`box-shadow` de 9999 px) en lugar de
 * recortar una máscara: es una sola caja, no necesita SVG y el agujero recorta
 * exactamente el elemento aunque esté a mitad de la pantalla.
 *
 * El elemento resaltado **se sigue viendo y se puede leer**: esto explica la
 * interfaz, no la sustituye. Por eso tampoco bloquea el desplazamiento; si el
 * objetivo queda fuera de la vista, se lleva hasta él.
 *
 * Todo sale por un portal a `body`, y no es un capricho: un antepasado con
 * `filter` o `backdrop-filter` —la cabecera lleva `backdrop-blur`— se convierte
 * en el bloque contenedor de sus descendientes `fixed`, y el cartel acababa
 * pegado a la cabecera en vez de a la ventana. El portal lo saca de ahí.
 */
export function TourOverlay({ id, onClose }: { id: TourId; onClose: () => void }) {
  const pasos = TOURS[id];
  const [indice, setIndice] = useState(0);
  const [recuadro, setRecuadro] = useState<Recuadro | null>(null);

  const cerrar = useCallback(() => {
    marcarTourVisto();
    onClose();
  }, [onClose]);

  // Los pasos cuyo objetivo no está en esta pantalla se saltan: la propuesta
  // pendiente no siempre existe, y señalar al vacío es peor que no señalar.
  const visibles = pasos.filter(
    (paso) => !paso.target || document.querySelector(`[data-tour="${paso.target}"]`),
  );
  const paso: TourStep | undefined = visibles[indice];

  useLayoutEffect(() => {
    if (!paso?.target) {
      setRecuadro(null);
      return;
    }

    const elemento = document.querySelector(`[data-tour="${paso.target}"]`);
    if (!elemento) {
      setRecuadro(null);
      return;
    }

    elemento.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const medir = () => {
      const caja = elemento.getBoundingClientRect();
      setRecuadro({
        top: caja.top - AIRE,
        left: caja.left - AIRE,
        width: caja.width + AIRE * 2,
        height: caja.height + AIRE * 2,
      });
    };

    medir();
    // El desplazamiento suave tarda: sin volver a medir, el foco se queda
    // donde estaba el elemento antes de moverse.
    const repetir = window.setInterval(medir, 100);
    const parar = window.setTimeout(() => window.clearInterval(repetir), 700);

    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);

    return () => {
      window.clearInterval(repetir);
      window.clearTimeout(parar);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [paso]);

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') cerrar();
      if (evento.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, visibles.length - 1));
      if (evento.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, 0));
    };

    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [cerrar, visibles.length]);

  if (!paso) return null;

  const ultimo = indice === visibles.length - 1;

  return createPortal(
    <>
      {recuadro ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-xl transition-all duration-[var(--motion-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{
            ...recuadro,
            boxShadow: '0 0 0 9999px rgb(5 10 25 / 0.78)',
            outline: '2px solid var(--primary)',
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 z-40 bg-[rgb(5_10_25/0.78)]" />
      )}

      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-titulo"
        className="fixed inset-x-0 bottom-0 z-50 p-4 sm:right-auto sm:bottom-6 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:p-0"
      >
        <div className="rise-in flex flex-col gap-3 rounded-[var(--radius)] border border-primary/40 bg-card p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="tour-titulo" className="font-display text-base font-semibold">
                {paso.title}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{paso.body}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={cerrar} aria-label="Salir del tour">
              <X />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {indice + 1} de {visibles.length}
            </span>

            <div className="flex gap-2">
              {indice > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setIndice(indice - 1)}>
                  <ArrowLeft />
                  Atrás
                </Button>
              ) : null}
              <Button size="sm" onClick={() => (ultimo ? cerrar() : setIndice(indice + 1))}>
                {ultimo ? 'Entendido' : 'Siguiente'}
                {ultimo ? null : <ArrowRight />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
