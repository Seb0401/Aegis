/**
 * @aegis/stellar — punto de entrada del cliente Stellar (BE1).
 *
 * La implementación real vive detrás de las interfaces `StellarReader` y
 * `StellarExecutor` de `@aegis/contracts`. Mientras BE1 la construye, el resto
 * del backend usa los fakes de `@aegis/stellar/testing`.
 *
 * Regla del proyecto: este es el ÚNICO paquete que importa `@stellar/stellar-sdk`.
 */

export { NotImplementedStellarReader, NotImplementedStellarExecutor } from './not-implemented.js';
export { isValidStellarAddress, verifyChallengeSignature } from './signature.js';
