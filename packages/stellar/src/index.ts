/**
 * @aegis/stellar — punto de entrada del cliente Stellar (BE1).
 *
 * M1 expone el cliente Horizon de cuenta y el ejecutor testnet real. La API
 * conserva los fakes de `@aegis/stellar/testing` hasta el cableado M2.
 *
 * Regla del proyecto: este es el ÚNICO paquete que importa `@stellar/stellar-sdk`.
 */

export { NotImplementedStellarReader, NotImplementedStellarExecutor } from './not-implemented.js';
export { isValidStellarAddress, verifyChallengeSignature } from './signature.js';
export { StellarClientError, type StellarClientErrorCode } from './errors.js';
export {
  HorizonAccountClient,
  type HorizonAccountClientOptions,
} from './horizon-account-client.js';
export { HorizonStellarExecutor, type HorizonStellarExecutorOptions } from './horizon-executor.js';
