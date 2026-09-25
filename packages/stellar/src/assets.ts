import type { AssetCode } from '@aegis/contracts';

/**
 * Traducción entre nuestros códigos de activo y los de Stellar.
 *
 * Hacen falta dos nombres porque no son lo mismo. Stellar exige que el código
 * de un activo sea **alfanumérico** de 1 a 12 caracteres: `USDC_TEST` lleva un
 * guion bajo, así que no existe ni puede existir en la red. Dentro de Aegis el
 * identificador legible se queda, y al salir a la cadena se traduce.
 *
 * Si alguna vez se añade un activo, hay que tocar los dos mapas a la vez. El
 * test de ida y vuelta lo vigila.
 */

/** Código con el que cada activo viaja por la red. */
export const ON_CHAIN_ASSET_CODE: Record<AssetCode, string> = {
  XLM: 'XLM',
  USDC_TEST: 'USDCTEST',
};

/** El camino inverso: de lo que devuelve Horizon a lo que entiende Aegis. */
const FROM_ON_CHAIN: Record<string, AssetCode> = Object.fromEntries(
  Object.entries(ON_CHAIN_ASSET_CODE).map(([interno, cadena]) => [cadena, interno as AssetCode]),
);

/**
 * Traduce un código de la red al nuestro.
 *
 * Devuelve `null` para lo que no soportamos, en vez de forzarlo: un activo
 * desconocido tratado como conocido ensuciaría el historial y las estadísticas
 * sobre las que el Guardian decide.
 */
export function toInternalAssetCode(onChainCode: string): AssetCode | null {
  return FROM_ON_CHAIN[onChainCode] ?? null;
}
