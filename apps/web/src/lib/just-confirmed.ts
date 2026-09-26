'use client';

import type { Proposal, ProposalStatus } from '@aegis/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Detecta la propuesta que **acaba de** confirmarse.
 *
 * La diferencia entre «está confirmada» y «acaba de confirmarse» es todo el
 * asunto: lo primero es un estado que puede llevar días ahí, y lo segundo es
 * un acontecimiento. Solo lo segundo merece que la interfaz pare y lo celebre.
 *
 * Por eso la primera vuelta no celebra nada, solo toma nota de en qué estado
 * estaba cada propuesta. Sin eso, cada recarga de la página sería una fiesta
 * por un pago de la semana pasada, y la celebración dejaría de significar
 * nada —que es exactamente lo que le pasa a las notificaciones que avisan de
 * todo—.
 *
 * Funciona igual para los dos caminos: el pago que el usuario firma y el que
 * el agente ejecuta solo en modo autónomo. A los dos se llega por el mismo
 * sitio, que es la propuesta cambiando de estado.
 */
export function useJustConfirmed(proposals: Proposal[]): {
  confirmed: Proposal | null;
  dismiss: () => void;
} {
  const estadoPrevio = useRef(new Map<string, ProposalStatus>());
  const yaObservado = useRef(false);
  const [confirmed, setConfirmed] = useState<Proposal | null>(null);

  useEffect(() => {
    let recien: Proposal | null = null;

    for (const propuesta of proposals) {
      const antes = estadoPrevio.current.get(propuesta.id);

      // Que estuviera en otro estado es la prueba de que el cambio ocurrió
      // con la página abierta. Una propuesta que aparece ya confirmada pudo
      // confirmarse en cualquier momento.
      if (
        yaObservado.current &&
        antes &&
        antes !== 'CONFIRMED' &&
        propuesta.status === 'CONFIRMED'
      ) {
        recien = propuesta;
      }

      estadoPrevio.current.set(propuesta.id, propuesta.status);
    }

    yaObservado.current = true;
    if (recien) setConfirmed(recien);
  }, [proposals]);

  const dismiss = useCallback(() => setConfirmed(null), []);

  return { confirmed, dismiss };
}
