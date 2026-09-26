'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Herramientas de movimiento.
 *
 * Todo lo de aquí comparte una regla: **la animación nunca decide lo que se
 * ve, solo cómo llega**. El primer render pinta ya el valor final, y el
 * movimiento ocurre después. Así el HTML del servidor y el del cliente
 * coinciden —no hay error de hidratación— y quien tenga el JavaScript a medio
 * cargar ve la cifra correcta, no un cero.
 */

/** Duraciones en milisegundos. Tienen que coincidir con las de `globals.css`. */
export const MOTION = {
  fast: 140,
  base: 260,
  slow: 460,
  slower: 900,
} as const;

/**
 * ¿La persona ha pedido que no le animemos nada?
 *
 * Se consulta en el navegador y en vivo: alguien puede cambiar el ajuste del
 * sistema con la pestaña abierta. Empieza en `false` para que el servidor y el
 * primer render del cliente pinten lo mismo.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // `matchMedia` es opcional: no existe en jsdom y puede faltar en entornos
    // incrustados. Sin esta guarda, un detalle decorativo tiraría la pantalla
    // entera —y esta pantalla es donde se aprueban pagos—. Si no se puede
    // preguntar, se anima: es el comportamiento que ya tenía la interfaz.
    if (typeof window.matchMedia !== 'function') return;

    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(consulta.matches);

    const alCambiar = (evento: MediaQueryListEvent) => setReduced(evento.matches);

    // Safari antiguo solo tiene `addListener`. Comprobarlo es más barato que
    // descubrir por un informe de error que la interfaz no arranca ahí.
    if (typeof consulta.addEventListener !== 'function') return;

    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);

  return reduced;
}

/**
 * Lleva un número hasta su valor, contando.
 *
 * Una cifra que sube de cero se mira; una que ya está puesta, no. En un panel
 * donde lo primero que quieres saber es cuánto tienes, eso es justo lo que hay
 * que dirigir.
 *
 * Solo cuenta **la primera vez** que aparece un valor y cuando el cambio es
 * grande. Animar cada actualización haría que un saldo que se refresca solo
 * estuviera siempre en movimiento, que es lo contrario de lo que quieres de
 * una cifra de dinero: ahí el movimiento significaría «esto está cambiando»
 * cuando no está cambiando nada.
 *
 * @param valor      destino
 * @param duracion   milisegundos
 * @param minimoSalto cambio por debajo del cual se salta la animación
 */
export function useCountUp(valor: number, duracion = MOTION.slower, minimoSalto = 0.02): number {
  const reducido = useReducedMotion();
  const [mostrado, setMostrado] = useState(valor);
  const anterior = useRef(valor);
  // En el primer render el valor suele ser 0 —los datos aún no han llegado—,
  // así que la cuenta de verdad empieza cuando aparece el primero real.
  const yaContado = useRef(false);

  useEffect(() => {
    const desde = anterior.current;
    anterior.current = valor;

    const saltoRelativo = Math.abs(valor - desde) / Math.max(Math.abs(valor), 1);
    const merecePena = !yaContado.current || saltoRelativo > minimoSalto;

    if (reducido || !merecePena || !Number.isFinite(valor)) {
      setMostrado(valor);
      yaContado.current = true;
      return;
    }

    yaContado.current = true;
    let cancelado = false;
    const inicio = performance.now();

    const paso = (ahora: number) => {
      if (cancelado) return;

      const t = Math.min(1, (ahora - inicio) / duracion);
      // La misma curva de salida que usa el CSS: rápido al principio, frena
      // al final. Un contador lineal parece un temporizador, no una cifra
      // que se asienta.
      const suavizado = 1 - Math.pow(1 - t, 3);
      setMostrado(desde + (valor - desde) * suavizado);

      if (t < 1) requestAnimationFrame(paso);
    };

    requestAnimationFrame(paso);
    return () => {
      cancelado = true;
    };
  }, [valor, duracion, minimoSalto, reducido]);

  return mostrado;
}

/**
 * Retardo de entrada para una lista de tarjetas.
 *
 * Se corta a los seis elementos: escalonar una lista larga obliga a esperar a
 * quien solo quiere leer la última fila, y el efecto deja de leerse como
 * fluidez para leerse como lentitud.
 */
export function riseDelay(indice: number, paso = 60, maximo = 6): CSSProperties {
  // El tipo de `style` de React no admite propiedades personalizadas, aunque
  // el navegador sí las aplique. La conversión es el precio de pasar el
  // retardo por CSS en vez de por JavaScript, que es lo que permite que la
  // animación funcione sin esperar a que hidrate nada.
  return { '--rise-delay': `${Math.min(indice, maximo) * paso}ms` } as CSSProperties;
}
