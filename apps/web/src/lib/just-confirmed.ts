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
 * Cubre los dos caminos, que no son el mismo: el pago que el usuario firma
 * pasa por varios estados delante de él, y el que el agente ejecuta solo nace
 * ya confirmado —la API firma y envía en la misma petición—. Si solo se
 * mirasen los cambios de estado, el pago más vistoso del producto sería justo
 * el que no se celebra.
 */
/** Cuánto puede llevar confirmada una propuesta y seguir siendo «recién». */
const MARGEN = 30_000;

/** Fecha tolerante: una cadena rara no debe disparar una celebración. */
function fecha(iso: string): number {
  const valor = new Date(iso).getTime();
  return Number.isNaN(valor) ? 0 : valor;
}

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

      // Caso 1: la vimos en otro estado y ahora está confirmada. Es el camino
      // del pago que el usuario firma.
      const cambioDelante = Boolean(antes) && antes !== 'CONFIRMED';

      /*
        Caso 2: aparece nueva y ya confirmada. Es el camino autónomo, donde la
        API firma y ejecuta en la misma petición: la propuesta nace confirmada
        y nunca se la ve en otro estado. Sin esto, el pago más vistoso del
        producto —el que Aegis hace solo— era justo el que no se celebraba.

        Para no volver a celebrar lo viejo, se exige que se haya confirmado
        hace nada. Y sigue valiendo la primera vuelta en blanco: al recargar,
        todo lo que ya estaba se apunta sin celebrar, por reciente que sea.
      */
      const recienNacida =
        !antes &&
        propuesta.status === 'CONFIRMED' &&
        Date.now() - fecha(propuesta.updatedAt) < MARGEN;

      if (
        yaObservado.current &&
        propuesta.status === 'CONFIRMED' &&
        (cambioDelante || recienNacida)
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
