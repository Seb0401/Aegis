import { z } from 'zod';
import { AmountSchema, AssetCodeSchema, IsoDateSchema, type AssetCode } from './common.js';
import { multiplyAmounts } from './money.js';

/**
 * Precios de los activos en dólares.
 *
 * Existen para cerrar el agujero del ADR 0003: las reglas del PLAN están
 * escritas en dólares ("máx. $5 por operación") pero el sistema mueve XLM y
 * USDC, que no valen lo mismo. Sin una unidad común, el mismo número protege de
 * forma muy distinta según el activo.
 *
 * Dos decisiones que conviene entender:
 *
 * 1. **El precio viaja como dato, no se consulta al evaluar.** El Policy Engine
 *    y el Guardian siguen siendo funciones puras: reciben una foto de precios ya
 *    tomada. Si pidieran el precio por su cuenta, dejarían de ser deterministas
 *    y los mismos datos podrían dar decisiones distintas.
 *
 * 2. **La foto se guarda con la propuesta.** Meses después hay que poder
 *    explicar por qué una operación se aprobó, y para eso hace falta saber qué
 *    precio se usó en ese momento, no el de hoy.
 */

export const PriceSourceSchema = z.enum([
  /** Precio obtenido de una API pública de mercado. */
  'market',
  /** Tasa fija de configuración. Se usa con los activos de prueba. */
  'fixed',
  /** Valor servido desde la caché, todavía dentro de su ventana de validez. */
  'cache',
]);
export type PriceSource = z.infer<typeof PriceSourceSchema>;

export const AssetPriceSchema = z.object({
  asset: AssetCodeSchema,
  /** Cuántos dólares vale una unidad del activo. */
  usd: AmountSchema,
  source: PriceSourceSchema,
  /** Momento al que corresponde el precio, no el de la consulta. */
  asOf: IsoDateSchema,
});
export type AssetPrice = z.infer<typeof AssetPriceSchema>;

/**
 * Foto de precios tomada en un instante.
 *
 * Un activo que no aparece en `quotes` es un activo **sin precio**, y eso tiene
 * consecuencias: ver la regla P-10 y la señal G-10.
 */
export const PriceSnapshotSchema = z.object({
  capturedAt: IsoDateSchema,
  quotes: z.array(AssetPriceSchema),
});
export type PriceSnapshot = z.infer<typeof PriceSnapshotSchema>;

/** Busca el precio de un activo dentro de la foto. `undefined` si no lo hay. */
export function findQuote(
  snapshot: PriceSnapshot | null | undefined,
  asset: AssetCode,
): AssetPrice | undefined {
  return snapshot?.quotes.find((quote) => quote.asset === asset);
}

/**
 * Convierte un monto de un activo a dólares.
 *
 * Devuelve `null` cuando no hay precio, en vez de asumir una paridad. Ese `null`
 * es justo la señal que hace que el sistema escale al usuario: convertir a ciegas
 * sería peor que no convertir, porque nadie se enteraría.
 */
export function toUsd(
  amount: string,
  asset: AssetCode,
  snapshot: PriceSnapshot | null | undefined,
): string | null {
  const quote = findQuote(snapshot, asset);
  if (!quote) return null;

  return multiplyAmounts(amount, quote.usd);
}

/** Activos de una lista para los que la foto no trae precio. */
export function assetsWithoutPrice(
  assets: readonly AssetCode[],
  snapshot: PriceSnapshot | null | undefined,
): AssetCode[] {
  return [...new Set(assets)].filter((asset) => !findQuote(snapshot, asset));
}

/** Formatea un valor en dólares para mostrarlo, con dos decimales. */
export function formatUsd(amount: string): string {
  const value = Number(amount);
  return `$${value.toFixed(2)}`;
}

/** Puerto de obtención de precios. Lo implementa `@aegis/prices`. */
export interface PriceProvider {
  /**
   * Devuelve una foto con los precios que haya podido obtener.
   *
   * No lanza si falta alguno: un activo sin precio simplemente no aparece en
   * `quotes`. Quien llama decide qué hacer con esa ausencia, y siempre es algo
   * visible para el usuario.
   */
  getPrices(assets: readonly AssetCode[]): Promise<PriceSnapshot>;
}
