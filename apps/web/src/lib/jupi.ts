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
