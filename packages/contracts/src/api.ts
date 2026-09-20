import { z } from 'zod';
import { BalanceSchema, IdSchema, StellarAddressSchema, TxSummarySchema } from './common.js';
import { DestinationSchema } from './destination.js';
import { PolicyConfigSchema, PolicySummarySchema } from './policy.js';
import { ProposalSchema } from './proposal.js';

/**
 * Contrato HTTP (§5.2). El frontend y el agente generan su cliente desde aquí;
 * la API valida entrada y salida con estos mismos esquemas.
 */

// ── Auth (Q-07, BE2-02) ─────────────────────────────────────────────

export const AuthChallengeRequestSchema = z.object({
  address: StellarAddressSchema,
});
export type AuthChallengeRequest = z.infer<typeof AuthChallengeRequestSchema>;

export const AuthChallengeResponseSchema = z.object({
  /** Texto que el usuario debe firmar con su wallet. */
  challenge: z.string(),
  /** Identificador del reto, se devuelve en /auth/verify. */
  challengeId: IdSchema,
  expiresAt: z.string().datetime(),
});
export type AuthChallengeResponse = z.infer<typeof AuthChallengeResponseSchema>;

export const AuthVerifyRequestSchema = z.object({
  challengeId: IdSchema,
  /** Firma del reto en base64, producida por la wallet. */
  signature: z.string().min(1),
});
export type AuthVerifyRequest = z.infer<typeof AuthVerifyRequestSchema>;

export const AuthVerifyResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: IdSchema,
    address: StellarAddressSchema,
  }),
});
export type AuthVerifyResponse = z.infer<typeof AuthVerifyResponseSchema>;

// ── Cuenta ──────────────────────────────────────────────────────────

export const BalancesResponseSchema = z.object({
  address: StellarAddressSchema,
  balances: z.array(BalanceSchema),
});
export type BalancesResponse = z.infer<typeof BalancesResponseSchema>;

export const DelegationPrepareResponseSchema = z.object({
  /** XDR sin firmar que añade el signer del agente. Lo firma el usuario. */
  xdr: z.string(),
  agentPublicKey: StellarAddressSchema,
});
export type DelegationPrepareResponse = z.infer<typeof DelegationPrepareResponseSchema>;

// ── Destinos ────────────────────────────────────────────────────────

export const DestinationsResponseSchema = z.object({
  destinations: z.array(DestinationSchema),
});
export type DestinationsResponse = z.infer<typeof DestinationsResponseSchema>;

// ── Agente ──────────────────────────────────────────────────────────

export const AgentMessageRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  /** Hilo de conversación; se crea uno nuevo si se omite. */
  conversationId: IdSchema.nullish(),
});
export type AgentMessageRequest = z.infer<typeof AgentMessageRequestSchema>;

export const AgentMessageResponseSchema = z.object({
  conversationId: IdSchema,
  reply: z.string(),
  /** Propuestas creadas a raíz de este mensaje, ya evaluadas. */
  proposals: z.array(ProposalSchema),
});
export type AgentMessageResponse = z.infer<typeof AgentMessageResponseSchema>;

// ── Propuestas ──────────────────────────────────────────────────────

export const ProposalResponseSchema = z.object({
  proposal: ProposalSchema,
});
export type ProposalResponse = z.infer<typeof ProposalResponseSchema>;

export const ApproveProposalRequestSchema = z.object({
  /**
   * XDR ya firmado por el usuario con su wallet. Obligatorio cuando la política
   * devolvió REQUIRE_USER; se omite si la propuesta era AUTO_APPROVED.
   */
  signedXdr: z.string().nullish(),
  /**
   * Confirmación reforzada para riesgo HIGH/CRITICAL: el usuario reescribe el
   * monto total. El backend comprueba que coincide.
   */
  confirmedTotal: z.string().nullish(),
});
export type ApproveProposalRequest = z.infer<typeof ApproveProposalRequestSchema>;

export const RejectProposalRequestSchema = z.object({
  reason: z.string().max(280).nullish(),
});
export type RejectProposalRequest = z.infer<typeof RejectProposalRequestSchema>;

// ── Política ────────────────────────────────────────────────────────

export const PolicyResponseSchema = z.object({
  config: PolicyConfigSchema,
  summary: PolicySummarySchema,
});
export type PolicyResponse = z.infer<typeof PolicyResponseSchema>;

export const PausePolicyRequestSchema = z.object({
  paused: z.boolean(),
});
export type PausePolicyRequest = z.infer<typeof PausePolicyRequestSchema>;

// ── Historial ───────────────────────────────────────────────────────

export const TransactionsResponseSchema = z.object({
  transactions: z.array(TxSummarySchema),
});
export type TransactionsResponse = z.infer<typeof TransactionsResponseSchema>;
