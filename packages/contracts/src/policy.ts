import { z } from 'zod';
import { AmountSchema, AssetCodeSchema } from './common.js';

/**
 * Policy Engine (§8.1 del PLAN).
 *
 * Es código 100 % determinista: ninguna decisión depende de la salida de un LLM.
 * Los valores por defecto son provisionales (BE2-Q3) y configurables por usuario.
 */

/** IDs estables de las reglas. Se usan en `PolicyDecision.reasons[].ruleId`. */
export const PolicyRuleIdSchema = z.enum([
  'P-01', // Monto máximo por operación
  'P-02', // Límite diario acumulado
  'P-03', // Destino nuevo o no registrado
  'P-04', // Activos permitidos
  'P-05', // Máximo de operaciones por hora
  'P-06', // Reserva mínima intocable
  'P-07', // Modo de operación
  'P-08', // Kill switch
  'P-09', // Expiración de propuestas
]);
export type PolicyRuleId = z.infer<typeof PolicyRuleIdSchema>;

export const OperationModeSchema = z.enum(['MANUAL', 'AUTONOMOUS']);
export type OperationMode = z.infer<typeof OperationModeSchema>;

export const PolicyConfigSchema = z.object({
  /** P-01 · monto máximo por operación individual. */
  maxAmountPerOperation: AmountSchema.default('5'),
  /** P-02 · suma máxima ejecutada en una ventana de 24 h. */
  maxDailyAmount: AmountSchema.default('20'),
  /** P-03 · un destino no registrado o sin historial siempre exige confirmación. */
  requireConfirmationForNewDestination: z.boolean().default(true),
  /** P-04 · lista blanca de activos. */
  allowedAssets: z.array(AssetCodeSchema).min(1).default(['XLM', 'USDC_TEST']),
  /** P-05 · máximo de operaciones ejecutadas por hora. */
  maxOperationsPerHour: z.number().int().positive().default(10),
  /** P-06 · saldo que el agente no puede tocar nunca. */
  minimumReserve: AmountSchema.default('10'),
  /** P-07 · MANUAL = siempre confirma; AUTONOMOUS = ejecuta dentro de límites. */
  mode: OperationModeSchema.default('MANUAL'),
  /** P-08 · kill switch: si está activo, todo se deniega. */
  paused: z.boolean().default(false),
  /** P-09 · minutos de validez de una propuesta. */
  proposalTtlMinutes: z.number().int().positive().default(10),
});
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

/** Valores por defecto de §8.1, ya parseados. */
export const DEFAULT_POLICY_CONFIG: PolicyConfig = PolicyConfigSchema.parse({});

export const UpdatePolicyInputSchema = PolicyConfigSchema.partial();
export type UpdatePolicyInput = z.infer<typeof UpdatePolicyInputSchema>;

export const PolicyDecisionKindSchema = z.enum(['AUTO_APPROVE', 'REQUIRE_USER', 'DENY']);
export type PolicyDecisionKind = z.infer<typeof PolicyDecisionKindSchema>;

export const PolicyReasonSchema = z.object({
  ruleId: PolicyRuleIdSchema,
  /** Efecto que esta regla tuvo sobre la decisión final. */
  effect: PolicyDecisionKindSchema,
  /** Mensaje en lenguaje natural, apto para mostrar al usuario. */
  message: z.string(),
  /** Índice de la acción afectada dentro de la propuesta, si aplica. */
  actionIndex: z.number().int().nonnegative().optional(),
});
export type PolicyReason = z.infer<typeof PolicyReasonSchema>;

export const PolicyDecisionSchema = z.object({
  decision: PolicyDecisionKindSchema,
  reasons: z.array(PolicyReasonSchema),
  evaluatedAt: z.string().datetime(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

/** Resumen compacto que el agente puede leer vía tools (no expone nada sensible). */
export const PolicySummarySchema = z.object({
  mode: OperationModeSchema,
  paused: z.boolean(),
  maxAmountPerOperation: AmountSchema,
  maxDailyAmount: AmountSchema,
  minimumReserve: AmountSchema,
  allowedAssets: z.array(AssetCodeSchema),
  /** Cuánto queda del límite diario en esta ventana. */
  remainingDailyAmount: AmountSchema,
});
export type PolicySummary = z.infer<typeof PolicySummarySchema>;
