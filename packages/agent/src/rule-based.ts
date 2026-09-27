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
 * Sin modelo de lenguaje, y a propósito: es gratis, instantáneo, no depende de
 * que un servicio ajeno esté en pie el día de la demo y nunca inventa. Lo que
 * entiende:
 *
 *   - "¿cuánto tengo?" → los saldos.
 *   - "¿cuánto me queda hoy?" → lo que resta del límite diario.
 *   - "reparte N entre mis objetivos [y guarda M para emergencias]".
 *   - "aparta N para el viaje" → un pago al objetivo que se nombre.
 *   - "reparte la mitad de N" / "el 30% de N" → fracciones de una cantidad.
 *
 * Todo lo demás devuelve una respuesta honesta de "no lo entiendo", y cuando
 * un nombre de objetivo es ambiguo **pregunta en vez de elegir**. Un agente
 * que adivina con dinero es exactamente el problema que este proyecto
 * intenta resolver, y eso no cambia porque quien adivine sea un `if` en vez
 * de un modelo.
 */
export function createRuleBasedAgent(): Agent {
  return {
    async handleMessage(input: AgentTurnInput): Promise<AgentTurnResult> {
      const text = normalize(input.message);

      /*
        El límite va antes que el saldo porque las dos preguntas se solapan:
        «¿cuánto me queda hoy?» encaja con las dos, y quien la hace quiere
        saber cuánto puede mover, no cuánto tiene. La regla más específica
        primero.
      */
      if (isLimitQuestion(text)) {
        return handleLimitQuestion(input);
      }

      if (isBalanceQuestion(text)) {
        return handleBalanceQuestion(input);
      }

      const split = parseSplitIntent(text);
      if (split) {
        return handleSplit(input, split);
      }

      // Va después del reparto: "reparte 50 entre mis objetivos" también
      // contiene un importe, y si se mirara primero lo trataría como un pago
      // suelto a un destino que no se ha nombrado.
      const single = parseSingleIntent(text);
      if (single) {
        return handleSingle(input, single);
      }

      return { reply: AYUDA, proposals: [] };
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

  const mentionsEmergency = /\b(emergencia|emergencias|imprevistos)\b/.test(text);

  /*
    «reparte el 30% de 300 y guarda 10» tiene tres números y el primero es el
    porcentaje, no el total. Si se hubiera escrito un porcentaje, se descarta
    de la lista antes de decidir cuál es la cantidad.
  */
  const porcentaje = /(\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/.exec(text);
  const cifras =
    porcentaje && amounts[0] === porcentaje[1]!.replace(',', '.') ? amounts.slice(1) : amounts;

  if (cifras.length === 0) return null;

  const emergency = mentionsEmergency && cifras.length > 1 ? cifras[1]! : null;

  return { total: applyFraction(text, cifras[0]!), emergency };
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

/** Lo que sabe hacer, dicho como se le pediría. */
const AYUDA =
  'Puedo hacer cuatro cosas: decirte tu saldo, decirte cuánto te queda del límite de hoy, ' +
  'repartir una cantidad entre tus objetivos ("reparte 50 entre mis objetivos y guarda 10 ' +
  'para emergencias") y apartar algo para uno concreto ("aparta 20 para el viaje").';

function isLimitQuestion(text: string): boolean {
  return /\b(limite|limites|queda hoy|puedo gastar|me queda del)\b/.test(text);
}

async function handleLimitQuestion(input: AgentTurnInput): Promise<AgentTurnResult> {
  const summary = await input.tools.getPolicySummary();

  if (summary.paused) {
    return {
      reply: 'Estoy en pausa: ahora mismo no puedo mover nada, venga de donde venga la petición.',
      proposals: [],
    };
  }

  return {
    reply:
      `Hoy te quedan ${formatAmount(summary.remainingDailyAmount)} de los ` +
      `${formatAmount(summary.maxDailyAmount)} diarios, y el tope por operación es ` +
      `${formatAmount(summary.maxAmountPerOperation)}.`,
    proposals: [],
  };
}

/**
 * Multiplicadores de las fracciones que se dicen con palabras.
 *
 * Solo las que no dejan lugar a duda. «Un poco» o «bastante» no están, y no
 * es un olvido: traducir eso a una cifra sería el agente decidiendo cuánto
 * dinero mover.
 */
const FRACCIONES: Array<[RegExp, number]> = [
  [/\b(la mitad|el cincuenta por ciento)\b/, 0.5],
  [/\b(un tercio|la tercera parte)\b/, 1 / 3],
  [/\b(un cuarto|la cuarta parte)\b/, 0.25],
  [/\b(tres cuartos)\b/, 0.75],
];

/**
 * Aplica «la mitad de», «el 30% de» o nada.
 *
 * Trunca a los siete decimales de Stellar en vez de redondear: al repartir
 * hacia arriba se propondría un céntimo más de lo que la persona dijo, y la
 * regla AI-05 —nunca proponer más de lo pedido— no admite excepciones por
 * redondeo.
 */
function applyFraction(text: string, amount: string): string {
  const porcentaje = /(\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/.exec(text);
  if (porcentaje) {
    return scale(amount, Number(porcentaje[1]!.replace(',', '.')) / 100);
  }

  for (const [patron, factor] of FRACCIONES) {
    if (patron.test(text)) return scale(amount, factor);
  }

  return amount;
}

function scale(amount: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) return '0';

  // En stroops y truncando, para no inventar decimales por el camino.
  const stroops = BigInt(Math.floor(Number(toStroops(amount)) * factor));
  return fromStroops(stroops);
}

interface SingleIntent {
  amount: string;
  /** El nombre tal y como lo escribió la persona, para poder repetírselo. */
  target: string;
}

/** Extrae «aparta 20 para el viaje» y sus variantes. */
function parseSingleIntent(text: string): SingleIntent | null {
  const patron =
    /\b(aparta|guarda|manda|envia|transfiere|pon)\b[^\d]*(\d+(?:[.,]\d{1,7})?)\s*(?:.*?\b(?:para|a|al|hacia)\b\s+(.+))?$/;
  const encontrado = patron.exec(text);
  if (!encontrado) return null;

  const objetivo = encontrado[3]?.trim();
  if (!objetivo) return null;

  return { amount: encontrado[2]!.replace(',', '.'), target: objetivo };
}

async function handleSingle(input: AgentTurnInput, intent: SingleIntent): Promise<AgentTurnResult> {
  const destinations = await input.tools.listDestinations();
  const disponibles = destinations.filter((d) => !d.blocked);

  const candidatos = matchDestinations(disponibles, intent.target);

  if (candidatos.length === 0) {
    return {
      reply:
        `No tengo ningún destino que se llame «${intent.target}». Regístralo primero y ` +
        'vuelve a pedírmelo.',
      proposals: [],
    };
  }

  if (candidatos.length > 1) {
    // Preguntar, no elegir. Mandar dinero al destino equivocado por resolver
    // una ambigüedad a ojo no tiene vuelta atrás.
    const nombres = candidatos.map((d) => `«${d.label}»`).join(', ');
    return {
      reply: `«${intent.target}» encaja con varios destinos: ${nombres}. ¿A cuál de ellos?`,
      proposals: [],
    };
  }

  const destino = candidatos[0]!;
  const balances = await input.tools.getBalances();
  const asset = balances.find((b) => b.asset === 'USDC_TEST') ? 'USDC_TEST' : 'XLM';

  const proposal = await input.tools.createProposal({
    summary: `Apartar ${formatAmount(intent.amount)} ${asset} para ${destino.label}`,
    actions: [
      {
        type: 'PAYMENT',
        destinationId: destino.id,
        asset,
        amount: intent.amount,
        memo: null,
        label: destino.label,
      },
    ],
    requestedTotal: intent.amount,
  });

  return {
    reply:
      `Preparé un pago de ${formatAmount(intent.amount)} ${asset} para ${destino.label}. ` +
      'Revisa el análisis antes de aprobarlo.',
    proposals: [proposal],
  };
}

/**
 * Destinos cuyo nombre encaja con lo que escribió la persona.
 *
 * Coincidencia por contención en los dos sentidos —«viaje» encuentra «Viaje a
 * Cusco», y escribir el nombre entero también—, sin acentos ni mayúsculas.
 * Devuelve todos los que encajan a propósito: quien llama decide qué hacer con
 * la ambigüedad, y aquí la decisión es preguntar.
 */
export function matchDestinations(destinations: Destination[], query: string): Destination[] {
  const buscado = normalize(query).replace(/^(el|la|los|las|mi|mis)\s+/, '');
  if (buscado.length < 3) return [];

  const exactos = destinations.filter((d) => normalize(d.label) === buscado);
  if (exactos.length > 0) return exactos;

  return destinations.filter((d) => {
    const etiqueta = normalize(d.label);
    return etiqueta.includes(buscado) || buscado.includes(etiqueta);
  });
}
