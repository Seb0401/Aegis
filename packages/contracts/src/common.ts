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

/**
 * Caracteres que se eliminan de todo texto libre antes de guardarlo.
 *
 * No es paranoia decorativa. Este texto (memos, etiquetas de objetivos) llega
 * desde el usuario y desde la cadena, se guarda, se muestra en el frontend y
 * acaba dentro del prompt del agente. Los tres destinos tienen problemas
 * distintos con estos caracteres:
 *
 *  - Los de control rompen logs y terminales.
 *  - Los invisibles (espacios de ancho cero) permiten colar dos etiquetas que
 *    se ven idénticas pero son distintas: el usuario cree aprobar un pago a
 *    "Viaje" y aprueba otro.
 *  - Los de anulación bidireccional (RLO/LRO) invierten el orden visual del
 *    texto, así que lo que se lee no es lo que dice.
 *
 * Ver §12 del PLAN: todo lo que viene del usuario o de la cadena es no confiable.
 */
const CONTROL_AND_INVISIBLE_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

/** Quita caracteres de control e invisibles y recorta los espacios sobrantes. */
export function sanitizeText(value: string): string {
  return value.replace(CONTROL_AND_INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
}

/**
 * Texto libre saneado y con longitud acotada.
 *
 * Se usa solo en los esquemas de **entrada**: los de salida devuelven lo que ya
 * está guardado, que pasó por aquí al entrar. Mantenerlos sin `transform`
 * también evita sorpresas al generar el OpenAPI.
 */
export function safeText(maxLength: number) {
  return z
    .string()
    .max(maxLength * 2, 'El texto es demasiado largo')
    .transform(sanitizeText)
    .pipe(z.string().min(1, 'El texto no puede quedar vacío').max(maxLength));
}

/** Como `safeText`, pero admite vacío y lo convierte en `null`. */
export function optionalSafeText(maxLength: number) {
  return z
    .string()
    .max(maxLength * 2)
    .transform((value) => sanitizeText(value) || null)
    .pipe(z.string().max(maxLength).nullable());
}
