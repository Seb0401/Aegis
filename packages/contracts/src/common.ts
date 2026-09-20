import { z } from 'zod';

/**
 * Tipos primitivos compartidos.
 *
 * Regla del proyecto: los montos SIEMPRE viajan como string decimal, nunca como
 * number. Stellar usa 7 decimales y los floats de JS pierden precisión.
 */

/** Precisión máxima de Stellar: 7 decimales. */
export const STELLAR_DECIMALS = 7;

/** Monto decimal positivo con hasta 7 decimales, p. ej. "12.5000000". */
export const AmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,7})?$/, 'Monto inválido: usa un decimal con hasta 7 decimales, como string');

/** Igual que AmountSchema pero rechaza el cero. */
export const PositiveAmountSchema = AmountSchema.refine(
  (v) => Number(v) > 0,
  'El monto debe ser mayor que cero',
);

/** Clave pública de Stellar (Ed25519): 56 caracteres base32 que empiezan por G. */
export const StellarAddressSchema = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'Dirección Stellar inválida (se espera una clave pública G...)');

/** Activos soportados en el MVP (P-04). */
export const AssetCodeSchema = z.enum(['XLM', 'USDC_TEST']);
export type AssetCode = z.infer<typeof AssetCodeSchema>;

export const BalanceSchema = z.object({
  asset: AssetCodeSchema,
  /** Saldo total en la cuenta. */
  total: AmountSchema,
  /** Saldo realmente gastable: total menos reservas de la red y selling liabilities. */
  available: AmountSchema,
});
export type Balance = z.infer<typeof BalanceSchema>;

export const TxSummarySchema = z.object({
  hash: z.string(),
  createdAt: z.string().datetime(),
  direction: z.enum(['IN', 'OUT']),
  counterparty: StellarAddressSchema,
  asset: AssetCodeSchema,
  amount: AmountSchema,
  memo: z.string().nullable().default(null),
  successful: z.boolean(),
});
export type TxSummary = z.infer<typeof TxSummarySchema>;

/** Identificadores opacos. Se tipan como string pero se validan como no vacíos. */
export const IdSchema = z.string().min(1);

/** Timestamp ISO-8601 en UTC. */
export const IsoDateSchema = z.string().datetime();

/** Error de API uniforme para todos los endpoints. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
