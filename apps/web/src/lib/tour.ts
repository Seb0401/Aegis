'use client';

/**
 * El tour guiado.
 *
 * Un solo motor y dos guiones, porque hay dos personas distintas mirando la
 * misma pantalla:
 *
 *  - **El jurado** la abre sin nadie al lado y necesita entender en treinta
 *    segundos por qué cada pieza está ahí. No tiene que hacer nada: solo leer.
 *  - **Quien va a usarlo** necesita lo contrario: que le digan qué configurar
 *    primero y por qué importa el orden.
 *
 * Separar los dos guiones evita el tour de compromiso que no sirve a ninguno.
 *
 * Los pasos apuntan a `data-tour="..."` y no a clases de CSS: una clase se
 * renombra al refactorizar y el tour se rompe en silencio, que es la peor
 * forma de romperse. Un paso cuyo objetivo no está en la pantalla se salta
 * solo —la propuesta pendiente no siempre existe—, así que el guion nunca se
 * queda señalando al vacío.
 */

export interface TourStep {
  /** Valor de `data-tour` del elemento a resaltar. Sin él, el paso se centra. */
  target?: string;
  title: string;
  body: string;
}

export type TourId = 'jurado' | 'onboarding';

/** Para quien abre Aegis sin nadie que se lo explique. */
const JURADO: TourStep[] = [
  {
    title: 'Esto es Aegis',
    body: 'Un agente que mueve tu dinero en Stellar, pero solo dentro de los límites que tú le pones. Treinta segundos y ves por qué eso no es lo mismo que darle tu cuenta.',
  },
  {
    target: 'agente',
    title: 'Le hablas normal',
    body: '«Reparte 50 entre mis objetivos y guarda 10 para emergencias». El agente entiende y propone. Propone: todavía no ha movido nada.',
  },
  {
    target: 'limite-diario',
    title: 'Los límites atan',
    body: 'No son un ajuste de la interfaz. Los aplica el backend antes de construir la transacción, así que ni el agente ni un error de la pantalla pueden saltárselos.',
  },
  {
    target: 'propuestas',
    title: 'Nada se ejecuta a ciegas',
    body: 'Cada propuesta pasa por dos motores deterministas: uno comprueba tus reglas y otro calcula el riesgo y lo explica. Ninguno de los dos llama a un modelo de lenguaje, así que una alucinación no puede autorizar un pago.',
  },
  {
    target: 'kill-switch',
    title: 'Y si desconfías, se para',
    body: 'Un botón. A partir de ahí la política deniega cualquier operación, venga de donde venga. Es lo más fácil de toda la aplicación a propósito.',
  },
  {
    target: 'historial',
    title: 'Todo queda escrito',
    body: 'Cada decisión entra en una bitácora encadenada por hashes. Si alguien editara un registro del pasado, los siguientes dejarían de cuadrar y la propia aplicación lo diría.',
  },
];

/** Para quien va a usarlo de verdad y acaba de entrar. */
const ONBOARDING: TourStep[] = [
  {
    title: 'Bienvenido a Aegis',
    body: 'Antes de pedirle nada al agente hay dos cosas que configurar. Te las enseño en un minuto; después puedes olvidarte.',
  },
  {
    target: 'limite-diario',
    title: 'Primero, tus límites',
    body: 'Cuánto puede mover de una vez, cuánto al día y qué saldo no se toca nunca. Empieza bajo: subirlos luego cuesta dos clics, y así pruebas sin riesgo.',
  },
  {
    target: 'destinos',
    title: 'Después, tus destinos',
    body: 'El agente no escribe direcciones: solo puede pagar a sitios que hayas registrado tú. Si alguien lo manipulara para inventarse una cuenta, no tendría dónde mandar el dinero.',
  },
  {
    target: 'agente',
    title: 'Ahora pídele algo',
    body: 'Escríbele como a una persona. Te va a responder con una propuesta que puedes leer entera —y rechazar— antes de que se mueva nada.',
  },
  {
    target: 'kill-switch',
    title: 'Y esto, por si acaso',
    body: 'Para al agente en seco. No hace falta motivo ni confirmación: si dudas, púlsalo y ya lo piensas después.',
  },
];

export const TOURS: Record<TourId, TourStep[]> = {
  jurado: JURADO,
  onboarding: ONBOARDING,
};

const CLAVE = 'aegis.tour.visto';

/**
 * ¿Ya vio esta persona el tour de bienvenida?
 *
 * Envuelto en `try`: en navegación privada o con el almacenamiento bloqueado,
 * `localStorage` lanza. Si no se puede saber, se asume que sí lo vio —es menos
 * molesto no enseñarlo que enseñarlo en cada carga—.
 */
export function yaVioElTour(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === 'si';
  } catch {
    return true;
  }
}

export function marcarTourVisto(): void {
  try {
    window.localStorage.setItem(CLAVE, 'si');
  } catch {
    // Que no se pueda recordar no es motivo para romper nada.
  }
}
