import { z } from 'zod';
import {
  AmountSchema,
  AssetCodeSchema,
  IdSchema,
  IsoDateSchema,
  PositiveAmountSchema,
  StellarAddressSchema,
  optionalSafeText,
  safeText,
} from './common.js';
import { PolicyDecisionSchema } from './policy.js';
import { PriceSnapshotSchema } from './prices.js';
import { ExplanationSchema, RiskReportSchema } from './risk.js';

/** Ciclo de vida de una propuesta (§4.3). */
export const ProposalStatusSchema = z.enum([
  'DRAFT',
  'POLICY_CHECK',
  'GUARDIAN_REVIEW',
  'PENDING_USER',
  'AUTO_APPROVED',
  'SIGNED',
  'SUBMITTED',
  'CONFIRMED',
  'REJECTED',
  'DENIED',
  'EXPIRED',
  'FAILED',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

/** Estados desde los que ya no se puede avanzar. */
export const TERMINAL_STATUSES: readonly ProposalStatus[] = [
  'CONFIRMED',
  'REJECTED',
  'DENIED',
  'EXPIRED',
  'FAILED',
];

/**
 * Transiciones permitidas de la máquina de estados.
 * Cualquier transición fuera de esta tabla es un error de programación.
 */
export const ALLOWED_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  DRAFT: ['POLICY_CHECK', 'EXPIRED', 'FAILED'],
  POLICY_CHECK: ['GUARDIAN_REVIEW', 'DENIED', 'EXPIRED', 'FAILED'],
  GUARDIAN_REVIEW: ['AUTO_APPROVED', 'PENDING_USER', 'DENIED', 'EXPIRED', 'FAILED'],
  PENDING_USER: ['SIGNED', 'REJECTED', 'EXPIRED', 'FAILED'],
  AUTO_APPROVED: ['SIGNED', 'EXPIRED', 'FAILED'],
  SIGNED: ['SUBMITTED', 'FAILED'],
  SUBMITTED: ['CONFIRMED', 'FAILED'],
  CONFIRMED: [],
  REJECTED: [],
  DENIED: [],
  EXPIRED: [],
  FAILED: [],
};

/**
 * Acción propuesta por el agente.
 *
 * `destinationId` es obligatorio y referencia un `Destination` ya registrado.
 * El agente nunca produce una dirección Stellar libre (principio nº 2).
 */
export const ProposedActionSchema = z.object({
  type: z.literal('PAYMENT'),
  destinationId: IdSchema,
  asset: AssetCodeSchema,
  amount: PositiveAmountSchema,
  memo: z.string().max(28).nullish(),
  /** Etiqueta legible, p. ej. "Objetivo: Viaje". */
  label: z.string().min(1).max(64),
});
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

/**
 * Acción ya resuelta por el backend: el `destinationId` se ha traducido a una
 * dirección real. Solo existe del lado servidor, nunca la produce el LLM.
 */
export const ResolvedActionSchema = ProposedActionSchema.extend({
  destinationAddress: StellarAddressSchema,
  destinationLabel: z.string(),
});
export type ResolvedAction = z.infer<typeof ResolvedActionSchema>;

export const ProposalSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  status: ProposalStatusSchema,
  /** Resumen corto escrito por el agente. */
  summary: z.string().max(280),
  actions: z.array(ProposedActionSchema).min(1).max(10),
  policy: PolicyDecisionSchema.nullish(),
  risk: RiskReportSchema.nullish(),
  explanation: ExplanationSchema.nullish(),
  /**
   * Foto de precios usada para evaluar esta propuesta (ADR 0011).
   *
   * Se guarda con la propuesta y no se recalcula: para explicar dentro de un
   * mes por qué algo se aprobó hace falta el precio de entonces, no el de hoy.
   */
  prices: PriceSnapshotSchema.nullish(),
  /**
   * XDR sin firmar, presente cuando la propuesta espera la firma del usuario.
   * El frontend se lo pasa a Freighter y devuelve el resultado en /approve.
   */
  unsignedXdr: z.string().nullish(),
  /** Hash de la transacción una vez enviada a la red. */
  txHash: z.string().nullish(),
  /** Motivo del fallo cuando `status` es FAILED. */
  failureReason: z.string().nullish(),
  createdAt: IsoDateSchema,
  expiresAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Proposal = z.infer<typeof ProposalSchema>;

/** Entrada con la que el agente crea una propuesta. */
/**
 * Igual que `ProposedActionSchema`, pero saneando el texto libre.
 *
 * Es la puerta de entrada: todo lo que el agente propone pasa por aquí. Los
 * esquemas de salida se quedan sin `transform` porque lo que devuelven ya
 * entró limpio.
 */
export const ProposedActionInputSchema = ProposedActionSchema.extend({
  memo: optionalSafeText(28).nullish(),
  label: safeText(64),
});
export type ProposedActionInput = z.infer<typeof ProposedActionInputSchema>;

export const ProposalInputSchema = z.object({
  summary: safeText(280),
  actions: z.array(ProposedActionInputSchema).min(1).max(10),
  /**
   * Tope que pidió el usuario en lenguaje natural, si lo hubo.
   * El backend valida que la suma de las acciones no lo exceda (AI-05).
   */
  requestedTotal: AmountSchema.nullish(),
});
export type ProposalInput = z.infer<typeof ProposalInputSchema>;

/** Evento de auditoría append-only (BE2-06 / BE2-Q4). */
export const AuditEventTypeSchema = z.enum([
  'PROPOSAL_CREATED',
  'POLICY_EVALUATED',
  'GUARDIAN_EVALUATED',
  'STATUS_CHANGED',
  'USER_APPROVED',
  'USER_REJECTED',
  'AGENT_SIGNED',
  'TX_SUBMITTED',
  'TX_CONFIRMED',
  'TX_FAILED',
  'POLICY_UPDATED',
  'KILL_SWITCH_TOGGLED',
  'DESTINATION_CREATED',
  'DESTINATION_UPDATED',
  'PROPOSAL_EXPIRED',
  'PROPOSAL_ABANDONED',
  'AUTH_LOGIN',
]);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AuditEventSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  proposalId: IdSchema.nullish(),
  type: AuditEventTypeSchema,
  payload: z.record(z.unknown()),
  /** Hash encadenado con el evento anterior: hace la bitácora a prueba de manipulación. */
  previousHash: z.string().nullable(),
  hash: z.string(),
  createdAt: IsoDateSchema,
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
