'use client';

import type { Proposal } from '@aegis/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Avisos del navegador cuando algo espera tu decisión.
 *
 * Aegis puede proponer un pago mientras tienes la pestaña cerrada —sobre todo
 * desde que reparte los ingresos solo—, y una propuesta caduca en minutos. Sin
 * aviso, la única forma de enterarse es acordarse de mirar, que es justo el
 * trabajo que este producto quita.
 *
 * Dos reglas para que el aviso siga significando algo:
 *
 *  - **Solo lo que acaba de aparecer.** Nunca al cargar la página, por más
 *    propuestas pendientes que haya: eso no es una novedad, es el estado.
 *  - **Solo si no estás mirando.** Avisar de algo que ya tienes delante
 *    entrena a ignorar los avisos.
 */

export type PermisoAviso = 'default' | 'granted' | 'denied' | 'unsupported';

function permisoActual(): PermisoAviso {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** El permiso, y cómo pedirlo. */
export function useNotificationPermission(): {
  permiso: PermisoAviso;
  pedir: () => Promise<void>;
} {
  // Empieza en `default` para que servidor y cliente pinten lo mismo; el valor
  // real llega en el efecto.
  const [permiso, setPermiso] = useState<PermisoAviso>('default');

  useEffect(() => setPermiso(permisoActual()), []);

  const pedir = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    try {
      setPermiso(await Notification.requestPermission());
    } catch {
      // Algunos navegadores rechazan pedirlo fuera de un gesto del usuario.
      setPermiso(permisoActual());
    }
  }, []);

  return { permiso, pedir };
}

/**
 * Avisa cuando aparece una propuesta nueva que espera una decisión.
 *
 * La misma distinción que usa la celebración del pago: «acaba de aparecer» no
 * es lo mismo que «está ahí». La primera vuelta solo toma nota.
 */
export function useProposalNotifications(pendientes: Proposal[]): void {
  const vistas = useRef(new Set<string>());
  const yaObservado = useRef(false);

  useEffect(() => {
    const nuevas = pendientes.filter((propuesta) => !vistas.current.has(propuesta.id));
    for (const propuesta of pendientes) vistas.current.add(propuesta.id);

    if (!yaObservado.current) {
      yaObservado.current = true;
      return;
    }

    if (nuevas.length === 0) return;
    if (permisoActual() !== 'granted') return;
    // Si la pestaña está a la vista, la propuesta ya se ve: el aviso sobra.
    if (typeof document !== 'undefined' && !document.hidden) return;

    const primera = nuevas[0]!;
    const titulo =
      nuevas.length === 1
        ? 'Una propuesta espera tu firma'
        : `${nuevas.length} propuestas esperan tu firma`;

    try {
      const aviso = new Notification(titulo, {
        body: primera.summary,
        icon: '/icon-192.png',
        // Con la misma etiqueta, un aviso sustituye al anterior en vez de
        // apilarse. Volver a la pestaña no debería costar cerrar seis.
        tag: 'aegis-pendiente',
      });

      aviso.onclick = () => {
        window.focus();
        aviso.close();
      };
    } catch {
      // Un aviso que falla no puede tumbar la pantalla que lo lanzó.
    }
  }, [pendientes]);
}
