import { z } from 'zod';
import {
  AmountSchema,
  AssetCodeSchema,
  IdSchema,
  IsoDateSchema,
  StellarAddressSchema,
  safeText,
} from './common.js';

/**
 * Destinos registrados (Q-05).
 *
 * Principio no negociable nº 2: el agente NUNCA escribe direcciones Stellar.
 * Solo referencia `Destination.id`. Una dirección nueva únicamente entra por la
 * UI, con confirmación explícita del usuario.
 */

export const DestinationKindSchema = z.enum([
  /** Objetivo de ahorro del propio usuario, p. ej. "Viaje". */
  'GOAL',
  /** Contacto externo al que el usuario envía dinero. */
  'CONTACT',
  /** Objetivo especial: fondo de emergencia. Protegido por P-06. */
  'EMERGENCY_FUND',
]);
export type DestinationKind = z.infer<typeof DestinationKindSchema>;

export const DestinationSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  kind: DestinationKindSchema,
  /** Etiqueta legible que ve el usuario y usa el agente. */
  label: z.string().min(1).max(64),
  address: StellarAddressSchema,
  /** Meta opcional de ahorro, solo informativa para GOAL / EMERGENCY_FUND. */
  targetAmount: AmountSchema.nullable().default(null),
  targetAsset: AssetCodeSchema.nullable().default(null),
  /** Marcado por el usuario como de confianza: exime de la señal G-01. */
  trusted: z.boolean().default(false),
  /** Bloqueado por el usuario: dispara G-09 y deniega en política. */
  blocked: z.boolean().default(false),
  createdAt: IsoDateSchema,
});
export type Destination = z.infer<typeof DestinationSchema>;

export const CreateDestinationInputSchema = z.object({
  kind: DestinationKindSchema,
  label: safeText(64),
  address: StellarAddressSchema,
  targetAmount: AmountSchema.nullish(),
  targetAsset: AssetCodeSchema.nullish(),
  trusted: z.boolean().optional().default(false),
});
export type CreateDestinationInput = z.infer<typeof CreateDestinationInputSchema>;

/**
 * Lo que el cliente envía, antes de aplicar los valores por defecto.
 *
 * `CreateDestinationInput` es el resultado de validar, donde `trusted` ya tiene
 * valor. Quien construye la petición no debería verse obligado a rellenarlo.
 */
export type CreateDestinationRequest = z.input<typeof CreateDestinationInputSchema>;

/**
 * Cambios que el usuario puede hacer sobre un destino ya registrado.
 *
 * La dirección NO se puede editar: cambiarla convertiría "marqué este destino
 * como de confianza" en un cheque en blanco hacia otra cuenta. Para enviar a
 * otra dirección se registra un destino nuevo, que vuelve a pasar por P-03.
 */
export const UpdateDestinationInputSchema = z
  .object({
    label: safeText(64).optional(),
    /** Exime de la señal G-01. */
    trusted: z.boolean().optional(),
    /** Lo deniega en política (P-03) y lo marca en el Guardian (G-09). */
    blocked: z.boolean().optional(),
    targetAmount: AmountSchema.nullish(),
    targetAsset: AssetCodeSchema.nullish(),
  })
  .refine(
    (value) => Object.values(value).some((v) => v !== undefined),
    'Hay que enviar al menos un campo que cambiar',
  );
export type UpdateDestinationInput = z.infer<typeof UpdateDestinationInputSchema>;
