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

/** Código con el que cada activo viaja por la red, por defecto. */
export const ON_CHAIN_ASSET_CODE: Record<AssetCode, string> = {
  XLM: 'XLM',
  USDC_TEST: 'USDCTEST',
};

/**
 * USDC canónico de testnet.
 *
 * Existe y cualquiera puede usarlo: es el mismo que usa el protocolo x402. Sale
 * más barato que emitir uno propio —no hay emisor que mantener ni trustline que
 * explicar— y un jurado reconoce el nombre. Para usarlo:
 *
 *   USDC_TEST_ASSET_CODE=USDC
 *   USDC_TEST_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
 *
 * El inconveniente: hay que conseguir saldo de algún sitio, mientras que del
 * propio se emite lo que haga falta.
 */
export const TESTNET_USDC = {
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
} as const;

/**
 * Traduce un código de la red al nuestro.
 *
 * `usdcTestAssetCode` permite apuntar a otro activo sin tocar el contrato:
 * dentro de Aegis sigue llamándose `USDC_TEST` valga lo que valga el código de
 * la cadena.
 *
 * Devuelve `null` para lo que no soportamos, en vez de forzarlo: un activo
 * desconocido tratado como conocido ensuciaría el historial y las estadísticas
 * sobre las que el Guardian decide.
 */
export function toInternalAssetCode(
  onChainCode: string,
  usdcTestAssetCode: string = ON_CHAIN_ASSET_CODE.USDC_TEST,
): AssetCode | null {
  if (onChainCode === ON_CHAIN_ASSET_CODE.XLM) return 'XLM';
  return onChainCode === usdcTestAssetCode ? 'USDC_TEST' : null;
}
