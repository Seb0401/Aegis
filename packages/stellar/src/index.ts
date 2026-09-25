/**
 * @aegis/stellar — punto de entrada del cliente Stellar (BE1).
 *
 * Expone el cliente Horizon de cuenta, el lector completo y el ejecutor real de
 * testnet. La API los usa con `USE_FAKE_STELLAR=false`; con `true` se queda con
 * los fakes de `@aegis/stellar/testing`, que no tocan la red.
 *
 * Regla del proyecto: este es el ÚNICO paquete que importa `@stellar/stellar-sdk`.
 */

export { isValidStellarAddress, verifyChallengeSignature } from './signature.js';
export { ON_CHAIN_ASSET_CODE, toInternalAssetCode } from './assets.js';
export { StellarClientError, type StellarClientErrorCode } from './errors.js';
export {
  HorizonAccountClient,
  type HorizonAccountClientOptions,
} from './horizon-account-client.js';
export { HorizonStellarExecutor, type HorizonStellarExecutorOptions } from './horizon-executor.js';
export { HorizonStellarReader, type HorizonStellarReaderOptions } from './horizon-reader.js';
