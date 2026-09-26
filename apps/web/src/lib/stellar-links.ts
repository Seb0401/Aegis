/**
 * Enlaces al explorador de la cadena.
 *
 * Que cualquiera pueda comprobar por su cuenta lo que Aegis dice haber hecho
 * no es un extra: es la diferencia entre una aplicación que afirma haber
 * pagado y una que lo demuestra. El enlace se abre fuera, en un explorador
 * que no controlamos, y eso es justamente lo que le da valor.
 *
 * Solo testnet, como el resto del MVP (§15 del PLAN). La API se niega a
 * arrancar contra mainnet, así que un enlace a mainnet apuntaría a algo que no
 * puede existir.
 */

const EXPLORADOR = 'https://stellar.expert/explorer/testnet';

/** Enlace a una transacción por su hash. */
export function explorerTxUrl(hash: string): string {
  return `${EXPLORADOR}/tx/${encodeURIComponent(hash)}`;
}

/** Enlace a una cuenta por su dirección. */
export function explorerAccountUrl(address: string): string {
  return `${EXPLORADOR}/account/${encodeURIComponent(address)}`;
}
