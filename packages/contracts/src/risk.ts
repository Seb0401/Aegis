import { z } from 'zod';
import { AmountSchema } from './common.js';

/**
 * Guardian — señales y score de riesgo (§8.2 del PLAN).
 *
 * Todas las señales se calculan con datos reales y código determinista.
 * El LLM solo redacta la explicación a partir de este informe; no lo produce.
 */

export const RiskSignalIdSchema = z.enum([
  'G-01', // Dirección nunca vista
  'G-02', // Porcentaje del saldo
  'G-03', // Monto atípico frente al historial
  'G-04', // Saldo restante bajo la reserva
  'G-05', // Destino sin cuenta o sin trustline
  'G-06', // Cuenta destino muy nueva o sin actividad
  'G-07', // Activo que nunca se usó
  'G-08', // Velocidad inusual de operaciones
  'G-09', // Destino en lista de bloqueo local
  'G-10', // Sin precio: no se puede valorar la operación en dólares
]);
export type RiskSignalId = z.infer<typeof RiskSignalIdSchema>;

export const SignalSeveritySchema = z.enum(['INFO', 'WARN', 'HIGH']);
export type SignalSeverity = z.infer<typeof SignalSeveritySchema>;

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const RiskSignalSchema = z.object({
  id: RiskSignalIdSchema,
  severity: SignalSeveritySchema,
  /** Índice de la acción que disparó la señal; ausente si es de la propuesta entera. */
  actionIndex: z.number().int().nonnegative().optional(),
  /**
   * Datos crudos que sustentan la señal. El explicador SOLO puede usar estas
   * cifras: si un número no está aquí, el LLM no puede mencionarlo.
   */
  data: z.record(z.unknown()),
});
export type RiskSignal = z.infer<typeof RiskSignalSchema>;

export const RiskReportSchema = z.object({
  score: z.number().min(0).max(100),
  level: RiskLevelSchema,
  signals: z.array(RiskSignalSchema),
  /** Saldo estimado tras ejecutar la propuesta completa (incluye fees). */
  balanceAfter: AmountSchema,
  /**
   * Valor total de la propuesta en dólares. `null` si falta el precio de algún
   * activo: un total parcial sería peor que no darlo, porque parecería completo.
   */
  totalUsd: AmountSchema.nullish(),
  /** Saldo en dólares tras ejecutar, cuando se puede calcular. */
  balanceAfterUsd: AmountSchema.nullish(),
  evaluatedAt: z.string().datetime(),
});
export type RiskReport = z.infer<typeof RiskReportSchema>;

/** Umbrales de §8.2. Por afinar con datos reales (BE2-Q3). */
export const RISK_THRESHOLDS = {
  LOW: 0,
  MEDIUM: 30,
  HIGH: 60,
  CRITICAL: 85,
} as const;

export const ExplanationSchema = z.object({
  /** Una o dos frases con las cifras clave. */
  summary: z.string(),
  warnings: z.array(
    z.object({
      signalId: RiskSignalIdSchema,
      text: z.string(),
    }),
  ),
  /** `template` es el camino de respaldo cuando el LLM falla o no valida (AI-Q5). */
  generatedBy: z.enum(['llm', 'template']),
});
export type Explanation = z.infer<typeof ExplanationSchema>;
