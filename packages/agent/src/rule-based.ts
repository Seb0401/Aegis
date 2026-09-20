import {
  addAmounts,
  formatAmount,
  fromStroops,
  subtractAmounts,
  toStroops,
  type Destination,
  type ProposedAction,
} from '@aegis/contracts';
import type { Agent, AgentTurnInput, AgentTurnResult } from './types.js';

/**
 * Agente de reglas, sin LLM.
 *
 * Es un **andamio deliberadamente tonto** para que la API y el frontend puedan
 * ejercitar el flujo completo desde el primer día (§6.2). Entiende dos cosas:
 *
 *   - "¿cuánto tengo?" → responde con los saldos.
 *   - "reparte N entre mis objetivos [y guarda M para emergencias]" → crea una
 *     propuesta con un pago por objetivo.
 *
 * Todo lo demás devuelve una respuesta honesta de "no lo entiendo". Prefiero
 * eso a adivinar: un agente que adivina con dinero es exactamente el problema
 * que este proyecto intenta resolver.
 */
export function createRuleBasedAgent(): Agent {
  return {
    async handleMessage(input: AgentTurnInput): Promise<AgentTurnResult> {
      const text = normalize(input.message);

      if (isBalanceQuestion(text)) {
        return handleBalanceQuestion(input);
      }

      const split = parseSplitIntent(text);
      if (split) {
        return handleSplit(input, split);
      }

      return {
        reply:
          'Por ahora solo entiendo dos cosas: preguntarme por tu saldo, o pedirme que ' +
          'reparta una cantidad entre tus objetivos (por ejemplo: "reparte 50 entre mis ' +
          'objetivos y guarda 10 para emergencias").',
        proposals: [],
      };
    },
  };
}

function normalize(message: string): string {
  return message.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function isBalanceQuestion(text: string): boolean {
  return /\b(saldo|cuanto tengo|balance|cuanto me queda)\b/.test(text);
}

async function handleBalanceQuestion(input: AgentTurnInput): Promise<AgentTurnResult> {
  const balances = await input.tools.getBalances();

  if (balances.length === 0) {
    return { reply: 'Tu cuenta no tiene saldo todavía.', proposals: [] };
  }

  const detail = balances
    .map((b) => `${formatAmount(b.available)} ${b.asset} disponibles`)
    .join(' y ');

  return { reply: `Tienes ${detail}.`, proposals: [] };
}

interface SplitIntent {
  total: string;
  emergency: string | null;
}

/**
 * Extrae "reparte 50 ... y guarda 10 para emergencias".
 *
 * Es intencionadamente rígido. El parseo flexible de intenciones es trabajo del
 * LLM (AI-04); aquí solo hace falta lo justo para tener una demo end-to-end.
 */
function parseSplitIntent(text: string): SplitIntent | null {
  if (!/\b(reparte|divide|distribuye)\b/.test(text)) return null;

  const amounts = [...text.matchAll(/(\d+(?:[.,]\d{1,7})?)/g)].map((m) => m[1]!.replace(',', '.'));
  if (amounts.length === 0) return null;

  const total = amounts[0]!;
  const mentionsEmergency = /\b(emergencia|emergencias|imprevistos)\b/.test(text);
  const emergency = mentionsEmergency && amounts.length > 1 ? amounts[1]! : null;

  return { total, emergency };
}

async function handleSplit(input: AgentTurnInput, intent: SplitIntent): Promise<AgentTurnResult> {
  const destinations = await input.tools.listDestinations();
  const goals = destinations.filter((d) => d.kind === 'GOAL' && !d.blocked);
  const emergencyFund = destinations.find((d) => d.kind === 'EMERGENCY_FUND' && !d.blocked);

  if (goals.length === 0) {
    return {
      reply: 'No tienes objetivos registrados todavía. Créalos primero y vuelve a pedírmelo.',
      proposals: [],
    };
  }

  const balances = await input.tools.getBalances();
  const asset = balances.find((b) => b.asset === 'USDC_TEST') ? 'USDC_TEST' : 'XLM';

  const wantsEmergency = intent.emergency !== null && emergencyFund !== undefined;
  const emergencyAmount = wantsEmergency ? intent.emergency! : '0';
  const toDistribute = subtractAmounts(intent.total, emergencyAmount);

  if (toStroops(toDistribute) <= 0n) {
    return {
      reply: `Si guardas ${formatAmount(emergencyAmount)} para emergencias no queda nada que repartir entre tus objetivos.`,
      proposals: [],
    };
  }

  const shares = splitEvenly(toDistribute, goals.length);
  const actions: ProposedAction[] = goals.map((goal, index) => ({
    type: 'PAYMENT',
    destinationId: goal.id,
    asset,
    amount: shares[index]!,
    memo: null,
    label: `Objetivo: ${goal.label}`,
  }));

  if (wantsEmergency && emergencyFund) {
    actions.push(emergencyAction(emergencyFund, asset, emergencyAmount));
  }

  // Invariante AI-05: lo propuesto nunca supera lo que pidió el usuario.
  const proposedTotal = actions.reduce((acc, a) => addAmounts(acc, a.amount), '0');

  const proposal = await input.tools.createProposal({
    summary: `Repartir ${formatAmount(proposedTotal)} ${asset} entre ${goals.length} objetivos${
      wantsEmergency ? ' y el fondo de emergencias' : ''
    }`,
    actions,
    requestedTotal: intent.total,
  });

  return {
    reply:
      `Preparé un reparto de ${formatAmount(proposedTotal)} ${asset} en ${actions.length} pagos. ` +
      'Revisa el análisis de riesgo antes de aprobarlo.',
    proposals: [proposal],
  };
}

function emergencyAction(
  fund: Destination,
  asset: ProposedAction['asset'],
  amount: string,
): ProposedAction {
  return {
    type: 'PAYMENT',
    destinationId: fund.id,
    asset,
    amount,
    memo: null,
    label: `Emergencias: ${fund.label}`,
  };
}

/**
 * Reparte un monto en `parts` trozos sin perder ni ganar un solo stroop.
 * El resto de la división entera se reparte de uno en uno entre los primeros.
 */
export function splitEvenly(total: string, parts: number): string[] {
  if (parts <= 0) return [];

  const totalStroops = toStroops(total);
  const base = totalStroops / BigInt(parts);
  const remainder = totalStroops % BigInt(parts);

  return Array.from({ length: parts }, (_, index) =>
    fromStroops(base + (BigInt(index) < remainder ? 1n : 0n)),
  );
}
