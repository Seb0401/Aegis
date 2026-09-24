import { AssetCodeSchema, formatAmount, formatUsd, type Proposal } from '@aegis/contracts';
import { z } from 'zod';
import { AegisApiError, type AegisClient } from './client.js';

/**
 * Herramientas que Aegis expone por MCP.
 *
 * La decisión que define este servidor: **no hay ninguna herramienta que envíe
 * dinero**. La única que escribe es `aegis_propose_payment`, y lo que hace es
 * crear una propuesta que pasa por el Policy Engine y el Guardian y se queda
 * esperando a que una persona la apruebe.
 *
 * Eso convierte a Aegis en algo distinto de un puente a Stellar: cualquier
 * agente externo que lo use hereda los límites, el análisis de riesgo y la
 * auditoría. El agente de fuera propone; quien decide sigue siendo el usuario.
 */

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

/** Respuesta de una herramienta: texto pensado para que lo lea otro modelo. */
function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join('\n');
}

export function createTools(client: AegisClient): ToolDefinition[] {
  return [
    {
      name: 'aegis_get_balances',
      title: 'Consultar saldos',
      description: 'Devuelve los saldos de la cuenta Stellar del usuario en Aegis. Solo lectura.',
      inputSchema: {},
      handler: async () => {
        const balances = await client.getBalances();
        if (balances.length === 0) return 'La cuenta no tiene saldo.';

        return lines(
          'Saldos:',
          ...balances.map(
            (b) =>
              `- ${b.asset}: ${formatAmount(b.available)} disponibles de ${formatAmount(b.total)}`,
          ),
        );
      },
    },

    {
      name: 'aegis_list_destinations',
      title: 'Listar destinos registrados',
      description:
        'Objetivos y contactos que el usuario tiene registrados. Un pago solo puede ir a uno ' +
        'de estos identificadores: no existe forma de enviar a una dirección arbitraria.',
      inputSchema: {},
      handler: async () => {
        const destinations = await client.listDestinations();
        if (destinations.length === 0) {
          return 'El usuario no tiene destinos registrados. Debe crearlos desde la interfaz de Aegis.';
        }

        return lines(
          'Destinos disponibles (usa el id en aegis_propose_payment):',
          ...destinations.map((d) =>
            [
              `- ${d.id} · "${d.label}" (${d.kind})`,
              d.trusted ? ' · de confianza' : '',
              d.blocked ? ' · BLOQUEADO' : '',
            ].join(''),
          ),
        );
      },
    },

    {
      name: 'aegis_get_policy_summary',
      title: 'Consultar los límites del usuario',
      description:
        'Límites que el usuario configuró: máximo por operación, límite diario, reserva mínima ' +
        'y si el agente está en pausa. Conviene consultarlos antes de proponer nada.',
      inputSchema: {},
      handler: async () => {
        const policy = await client.getPolicySummary();

        return lines(
          `Modo: ${policy.mode === 'MANUAL' ? 'manual (todo se confirma)' : 'autónomo dentro de límites'}`,
          policy.paused ? 'EL AGENTE ESTÁ EN PAUSA: no se aceptará ninguna propuesta.' : null,
          `Máximo por operación: ${formatAmount(policy.maxAmountPerOperation)}` +
            (policy.maxAmountPerOperationUsd
              ? ` (o ${formatUsd(policy.maxAmountPerOperationUsd)})`
              : ''),
          `Queda hoy: ${formatAmount(policy.remainingDailyAmount)}` +
            (policy.remainingDailyAmountUsd
              ? ` (o ${formatUsd(policy.remainingDailyAmountUsd)})`
              : ''),
          `Reserva mínima intocable: ${formatAmount(policy.minimumReserve)}`,
          `Activos permitidos: ${policy.allowedAssets.join(', ')}`,
        );
      },
    },

    {
      name: 'aegis_get_prices',
      title: 'Consultar precios',
      description: 'Precio en dólares de los activos soportados, con su antigüedad.',
      inputSchema: {},
      handler: async () => {
        const snapshot = await client.getPrices();
        if (snapshot.quotes.length === 0) return 'No hay precios disponibles ahora mismo.';

        return lines(
          'Precios:',
          ...snapshot.quotes.map(
            (q) => `- 1 ${q.asset} = ${formatUsd(q.usd)} (${q.source}, ${q.asOf})`,
          ),
        );
      },
    },

    {
      name: 'aegis_propose_payment',
      title: 'Proponer un pago',
      description:
        'Crea una PROPUESTA de pago. No envía dinero: la propuesta pasa por los límites del ' +
        'usuario y por el análisis de riesgo del Guardian, y queda pendiente de que la persona ' +
        'la apruebe desde Aegis. Los destinos se referencian por su id, nunca por dirección.',
      inputSchema: {
        summary: z.string().min(1).max(280).describe('Resumen corto de qué hace la propuesta'),
        actions: z
          .array(
            z.object({
              destinationId: z.string().min(1).describe('Id devuelto por aegis_list_destinations'),
              asset: AssetCodeSchema,
              amount: z.string().describe('Monto decimal como string, por ejemplo "12.50"'),
              label: z.string().min(1).max(64).describe('Etiqueta legible del pago'),
            }),
          )
          .min(1)
          .max(10),
        requestedTotal: z
          .string()
          .optional()
          .describe('Tope que pidió el usuario. Aegis rechaza la propuesta si se excede'),
      },
      handler: async (args) => {
        const input = {
          summary: String(args.summary),
          actions: (args.actions as Array<Record<string, unknown>>).map((action) => ({
            type: 'PAYMENT' as const,
            destinationId: String(action.destinationId),
            asset: AssetCodeSchema.parse(action.asset),
            amount: String(action.amount),
            memo: null,
            label: String(action.label),
          })),
          ...(args.requestedTotal ? { requestedTotal: String(args.requestedTotal) } : {}),
        };

        return describeProposal(await client.proposePayment(input));
      },
    },

    {
      name: 'aegis_get_proposal',
      title: 'Consultar una propuesta',
      description:
        'Estado actual de una propuesta: decisión de los límites, riesgo, explicación y, si ya ' +
        'se ejecutó, el hash de la transacción en Stellar.',
      inputSchema: {
        proposalId: z.string().min(1).describe('Id de la propuesta'),
      },
      handler: async (args) => describeProposal(await client.getProposal(String(args.proposalId))),
    },
  ];
}

/**
 * Traduce una propuesta a texto.
 *
 * Se le dice explícitamente al agente que llama qué se espera de él a
 * continuación. Sin eso, un modelo que ve "PENDING_USER" tiende a inventarse
 * una forma de aprobarla, y no existe ninguna.
 */
function describeProposal(proposal: Proposal): string {
  const razones = proposal.policy?.reasons.map((r) => `  - [${r.ruleId}] ${r.message}`) ?? [];
  const avisos = proposal.explanation?.warnings.map((w) => `  - ${w.text}`) ?? [];

  const siguiente =
    proposal.status === 'PENDING_USER'
      ? 'Esperando a que la persona la apruebe en Aegis. Tú no puedes aprobarla.'
      : proposal.status === 'CONFIRMED'
        ? 'Ejecutada y confirmada en Stellar.'
        : proposal.status === 'DENIED'
          ? 'Rechazada por los límites del usuario. No insistas: cambia la propuesta.'
          : `Estado: ${proposal.status}.`;

  return lines(
    `Propuesta ${proposal.id} · ${proposal.status}`,
    proposal.summary,
    '',
    proposal.explanation ? `Explicación: ${proposal.explanation.summary}` : null,
    avisos.length > 0 ? 'Advertencias del Guardian:' : null,
    ...avisos,
    proposal.policy ? `Decisión de los límites: ${proposal.policy.decision}` : null,
    ...razones,
    proposal.risk ? `Riesgo: ${proposal.risk.level} (${proposal.risk.score}/100)` : null,
    proposal.txHash ? `Transacción: ${proposal.txHash}` : null,
    '',
    siguiente,
  );
}

/** Convierte un error de la API en algo que el agente que llama pueda entender. */
export function toToolError(error: unknown): string {
  if (error instanceof AegisApiError) {
    return `Aegis rechazó la operación [${error.code}]: ${error.message}`;
  }

  return `Error inesperado hablando con Aegis: ${error instanceof Error ? error.message : String(error)}`;
}
