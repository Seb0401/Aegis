'use client';

import { useCallback, useState } from 'react';

/**
 * Si la columna del agente está abierta, y que se acuerde.
 *
 * Es una preferencia de las que molesta tener que repetir: quien trabaja con
 * el agente al lado lo quiere siempre, y quien lo cierra para leer el
 * historial a pantalla completa no quiere encontrárselo abierto en cada
 * navegación.
 *
 * Se lee en el inicializador del estado, sin efecto, y eso es seguro aquí
 * porque el armazón solo se monta cuando hay sesión: `RequireSession` enseña
 * un cargador mientras tanto, así que esto nunca se renderiza en el servidor
 * y no hay HTML previo con el que desajustarse.
 *
 * Por defecto abierta: es lo que hace visible de qué va Aegis.
 */
const CLAVE = 'aegis.agente.abierto';

export function useAgentPanel(): { abierto: boolean; alternar: () => void } {
  const [abierto, setAbierto] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CLAVE) !== 'no';
    } catch {
      // Sin almacenamiento, abierta. Perder la preferencia es molesto; no
      // poder ver al agente lo es más.
      return true;
    }
  });

  const alternar = useCallback(() => {
    setAbierto((previo) => {
      const siguiente = !previo;
      try {
        window.localStorage.setItem(CLAVE, siguiente ? 'si' : 'no');
      } catch {
        // Que no se pueda recordar no impide abrirla o cerrarla ahora.
      }
      return siguiente;
    });
  }, []);

  return { abierto, alternar };
}
