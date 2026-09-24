import {
  addAmounts,
  ProposalInputSchema,
  toStroops,
  type AgentTools,
  type ProposalInput,
} from '@aegis/contracts';
import type { AgentMessage } from './types.js';

export class UnsafeProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeProposalError';
  }
}

/** Extracts a conservative explicit budget from the user's own turns. */
export function extractRequestedBudget(messages: AgentMessage[]): string | undefined {
  let requestedBudget: string | undefined;

  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = message.content.toLowerCase();
    const actionPattern =
      /\b(reparte|repartir|reparta|divide|dividir|distribuye|distribuir|env[ií]a|enviar|envíe|manda|mandar|transfiere|transferir|paga|pagar|guarda|guardar|ahorra|ahorrar|separa|separar|mueve|mover|haz|hace|hacer)\b/;
    const hasAction = actionPattern.test(text);
    const correctionIndex = Math.max(
      text.lastIndexOf('mejor'),
      text.lastIndexOf('en realidad'),
      text.lastIndexOf('quise decir'),
      text.lastIndexOf('corrijo'),
      text.lastIndexOf('no,'),
    );
    if (!hasAction && correctionIndex < 0) continue;
    const currencyAmounts = [
      ...text.matchAll(/(?:\$|\busd\b|\busdc(?:_test)?\b)\s*(\d+(?:[.,]\d{1,7})?)/gi),
    ];
    const suffixCurrencyAmounts = [
      ...text.matchAll(/\b(\d+(?:[.,]\d{1,7})?)\s*(?:usd|usdc(?:_test)?|xlm)\b/gi),
    ];
    const allCurrencyAmounts = [...currencyAmounts, ...suffixCurrencyAmounts].sort(
      (left, right) => left.index! - right.index!,
    );
    const currencyAmount =
      correctionIndex >= 0
        ? allCurrencyAmounts.filter((match) => match.index! > correctionIndex).at(-1)?.[1]
        : allCurrencyAmounts[0]?.[1];
    if (currencyAmount) {
      requestedBudget = currencyAmount.replace(',', '.');
      continue;
    }

    if (correctionIndex >= 0) {
      const correctedUnmarkedAmount = text
        .slice(correctionIndex)
        .match(/\b(\d+(?:[.,]\d{1,7})?)\b/)?.[1];
      requestedBudget = correctedUnmarkedAmount?.replace(',', '.');
      continue;
    }

    const leadingAmount = text.match(
      /\b(?:reparte|repartir|reparta|divide|dividir|distribuye|distribuir|env[ií]a|enviar|manda|mandar|transfiere|transferir|paga|pagar|guarda|guardar|ahorra|ahorrar|separa|separar|mueve|mover|haz|hace|hacer)\s+(?:(?:un total de|exactamente)\s+)?(\d+(?:[.,]\d{1,7})?)\b/,
    );
    if (leadingAmount?.[1]) requestedBudget = leadingAmount[1].replace(',', '.');
  }

  return requestedBudget;
}

/** Validate model-generated proposal data against the user's request and tools. */
export async function validateProposalInput(
  rawInput: unknown,
  input: { tools: AgentTools; requestedBudget?: string; messages?: AgentMessage[] },
): Promise<ProposalInput> {
  if (input.requestedBudget === undefined) {
    throw new UnsafeProposalError('No se detectó un monto solicitado explícitamente.');
  }

  const parsed = ProposalInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new UnsafeProposalError('La propuesta del agente no cumple el contrato.');
  }

  const destinations = await input.tools.listDestinations();
  const availableDestinations = new Map(
    destinations
      .filter((destination) => !destination.blocked)
      .map((destination) => [destination.id, destination]),
  );
  for (const action of parsed.data.actions) {
    const destination = availableDestinations.get(action.destinationId);
    if (!destination) {
      throw new UnsafeProposalError('La propuesta referencia un destino no registrado.');
    }
    if (!isDestinationRequested(destination, input.messages ?? [])) {
      throw new UnsafeProposalError(
        'El usuario no pidió usar uno de los destinos de la propuesta.',
      );
    }
  }

  const totalsByAsset = new Map<string, string>();
  for (const action of parsed.data.actions) {
    totalsByAsset.set(
      action.asset,
      addAmounts(totalsByAsset.get(action.asset) ?? '0', action.amount),
    );
  }

  const balances = await input.tools.getBalances();
  for (const [asset, amount] of totalsByAsset) {
    const available = balances.find((balance) => balance.asset === asset)?.available ?? '0';
    if (toStroops(amount) > toStroops(available)) {
      throw new UnsafeProposalError('La propuesta supera el saldo disponible para el activo.');
    }
  }

  if (totalsByAsset.size > 1) {
    throw new UnsafeProposalError(
      'No se puede verificar un presupuesto repartido entre activos distintos.',
    );
  }
  const totalStroops = [...totalsByAsset.values()].reduce(
    (total, amount) => total + toStroops(amount),
    0n,
  );
  if (totalStroops > toStroops(input.requestedBudget)) {
    throw new UnsafeProposalError('La suma propuesta supera el monto solicitado.');
  }

  const declaredBudget = parsed.data.requestedTotal;
  if (declaredBudget != null && toStroops(declaredBudget) > toStroops(input.requestedBudget)) {
    throw new UnsafeProposalError('El monto declarado supera el monto solicitado.');
  }

  return buildValidatedInput(parsed.data, availableDestinations, input.requestedBudget);
}

function buildValidatedInput(
  proposal: ProposalInput,
  destinations: ReadonlyMap<string, { id: string; kind: string; label: string }>,
  requestedTotal?: string,
): ProposalInput {
  const actions = proposal.actions.map((action) => {
    const destination = destinations.get(action.destinationId)!;
    return {
      ...action,
      // Agent-authored memo content is not needed for the MVP and can carry an injection downstream.
      memo: null,
      label:
        `${destination.kind === 'EMERGENCY_FUND' ? 'Emergencias' : destination.kind === 'GOAL' ? 'Objetivo' : 'Contacto'}: ${redactStellarAddresses(destination.label)}`.slice(
          0,
          64,
        ),
    };
  });
  const totalsByAsset = new Map<string, string>();
  for (const action of actions) {
    totalsByAsset.set(
      action.asset,
      addAmounts(totalsByAsset.get(action.asset) ?? '0', action.amount),
    );
  }
  const amounts = [...totalsByAsset.entries()]
    .map(([asset, amount]) => `${amount} ${asset}`)
    .join(' y ');
  const labels = [...new Set(actions.map((action) => action.label))].slice(0, 4).join(', ');

  return ProposalInputSchema.parse({
    summary:
      `Propuesta: ${amounts} para ${labels}${actions.length > 4 ? ' y otros destinos' : ''}.`.slice(
        0,
        280,
      ),
    actions,
    requestedTotal: requestedTotal ?? proposal.requestedTotal,
  });
}

export function redactStellarAddresses(text: string): string {
  return text.replace(/\bG[A-Z2-7]{55}\b/g, '[dirección omitida]');
}

function isDestinationRequested(
  destination: { kind: string; label: string },
  messages: AgentMessage[],
): boolean {
  const userText = normalize(
    messages
      .filter(({ role }) => role === 'user')
      .map(({ content }) => content)
      .join(' '),
  );
  const label = normalize(destination.label);
  if (label && userText.includes(label)) return true;
  if (destination.kind === 'GOAL' && /\b(objetivos?|metas?)\b/.test(userText)) return true;
  return (
    destination.kind === 'EMERGENCY_FUND' &&
    /\b(emergencias?|imprevistos|fondo de emergencia)\b/.test(userText)
  );
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
