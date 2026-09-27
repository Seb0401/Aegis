import type { Proposal, RiskLevel } from '@aegis/contracts';

/**
 * Jupi, la mascota (`images/jupi.jpeg`).
 *
 * Las doce caras del sprite sheet están recortadas en `public/jupi/`. Aquí se
 * decide cuál toca, y esa decisión es deliberadamente conservadora:
 *
 *  - Jupi **no opina** sobre el riesgo. Quien lo mide es el Guardian, y su
 *    veredicto ya sale con nombre y número en su panel. La mascota solo
 *    acompaña ese estado con una expresión coherente; si pusiera cara
 *    tranquila junto a un riesgo crítico, estaría contradiciendo al Guardian.
 *  - Nada de celebrar lo que no ha pasado: hasta que la red no confirma, la
 *    cara es de trabajo, no de fiesta.
 */

export const JUPI_MOODS = [
  'feliz',
  'tranquilo',
  'sorprendido',
  'confiado',
  'enojado',
  'triste',
  'alegre',
  'dormido',
  'determinado',
  'protegiendo',
  'emocionado',
  'pensativo',
] as const;

export type JupiMood = (typeof JUPI_MOODS)[number];

/** Qué dice cada cara, para el texto alternativo. */
export const JUPI_ALT: Record<JupiMood, string> = {
  feliz: 'Jupi sonriendo',
  tranquilo: 'Jupi tranquilo',
  sorprendido: 'Jupi sorprendido',
  confiado: 'Jupi guiñando un ojo',
  enojado: 'Jupi enfadado',
  triste: 'Jupi triste',
  alegre: 'Jupi celebrando',
  dormido: 'Jupi dormido',
  determinado: 'Jupi concentrado',
  protegiendo: 'Jupi protegiendo tu dinero',
  emocionado: 'Jupi emocionado',
  pensativo: 'Jupi pensando',
};

/** La expresión que acompaña a cada nivel de riesgo del Guardian. */
export function moodForRisk(level: RiskLevel): JupiMood {
  switch (level) {
    case 'LOW':
      return 'confiado';
    case 'MEDIUM':
      return 'pensativo';
    case 'HIGH':
      return 'sorprendido';
    case 'CRITICAL':
      return 'enojado';
  }
}

/**
 * La expresión que acompaña al estado de una propuesta.
 *
 * El riesgo manda sobre el estado mientras la propuesta espera una decisión:
 * es el momento en el que el usuario tiene que mirar, y la cara tiene que
 * empujar en la misma dirección que el análisis.
 */
export function moodForProposal(proposal: Proposal): JupiMood {
  switch (proposal.status) {
    case 'DRAFT':
    case 'POLICY_CHECK':
    case 'GUARDIAN_REVIEW':
      return 'pensativo';
    case 'PENDING_USER':
      return proposal.risk ? moodForRisk(proposal.risk.level) : 'determinado';
    case 'AUTO_APPROVED':
    case 'SIGNED':
    case 'SUBMITTED':
      return 'determinado';
    case 'CONFIRMED':
      return 'alegre';
    case 'REJECTED':
      return 'tranquilo';
    case 'DENIED':
      return 'protegiendo';
    case 'EXPIRED':
      return 'dormido';
    case 'FAILED':
      return 'triste';
  }
}

export interface AgentState {
  /** Kill switch activo (regla P-08). */
  paused: boolean;
  /** Hay una petición al agente en vuelo. */
  thinking: boolean;
  /** La propuesta que espera una decisión, si la hay. */
  pending?: Proposal | undefined;
}

/**
 * La cara de Jupi en la cabecera del panel.
 *
 * El orden importa: pausado gana a todo, porque si el kill switch está activo
 * nada más va a ocurrir y la mascota no debe aparentar actividad.
 */
export function moodForAgent({ paused, thinking, pending }: AgentState): JupiMood {
  if (paused) return 'dormido';
  if (thinking) return 'pensativo';
  if (pending) return moodForProposal(pending);
  return 'tranquilo';
}

/** Frase corta que Jupi muestra junto a su cara. Nunca habla de cifras. */
export function jupiStatusLine({ paused, thinking, pending }: AgentState): string {
  if (paused) return 'Estoy en pausa. No voy a mover nada hasta que me reactives.';
  if (thinking) return 'Analizando riesgos y preparando la explicación…';
  if (pending) return 'Tienes una propuesta esperando tu autorización.';
  return 'Todo en orden. Pídeme algo cuando quieras.';
}

/**
 * Contexto que Jupi puede comentar cuando no está pasando nada.
 *
 * El estado de reposo era siempre la misma frase, y una mascota que repite
 * una línea fija deja de leerse a los dos días: se convierte en parte del
 * fondo. Con algo que decir sobre tu situación, mirarla tiene sentido.
 */
export interface JupiContext {
  /** Hora local, 0–23. */
  hora: number;
  /** Días desde el último pago que salió. `null` si nunca hubo ninguno. */
  diasSinApartar: number | null;
  /** Metas cumplidas que todavía no se han celebrado. */
  metasCumplidas: number;
  /** El reparto automático está encendido. */
  repartoActivo: boolean;
}

/**
 * Qué dice Jupi cuando no hay nada urgente.
 *
 * El orden es el de la importancia, no el de la simpatía: una meta cumplida
 * gana al saludo, y llevar semanas sin apartar gana a todo lo demás porque es
 * lo único que pide hacer algo.
 *
 * Nunca regaña. «Llevas tres semanas sin apartar» es un dato; «deberías
 * ahorrar más» es un sermón, y de una aplicación que administra tu dinero eso
 * se tolera una vez.
 */
export function jupiIdleLine(contexto: JupiContext): string {
  if (contexto.metasCumplidas > 0) {
    return contexto.metasCumplidas === 1
      ? '¡Has cumplido una meta! Puedes subirla o ponerte otra.'
      : `¡Has cumplido ${contexto.metasCumplidas} metas! Puedes subirlas o ponerte otras.`;
  }

  if (contexto.diasSinApartar !== null && contexto.diasSinApartar >= 14) {
    const semanas = Math.floor(contexto.diasSinApartar / 7);
    return contexto.repartoActivo
      ? `Llevo ${semanas} semanas sin mover nada: no ha entrado dinero que repartir.`
      : `Llevas ${semanas} semanas sin apartar nada. ¿Te preparo un reparto?`;
  }

  if (contexto.diasSinApartar === null) {
    return contexto.repartoActivo
      ? 'Reparto activado. En cuanto entre dinero, me pongo.'
      : 'Todavía no hemos movido nada. Pídeme un reparto cuando quieras.';
  }

  if (contexto.hora < 6) return 'Aquí sigo. Puedes pedirme algo a cualquier hora.';
  if (contexto.hora < 12) return 'Buenos días. Todo en orden por aquí.';
  if (contexto.hora < 20) return 'Buenas tardes. Todo en orden, pídeme algo cuando quieras.';
  return 'Buenas noches. Todo tranquilo por aquí.';
}
