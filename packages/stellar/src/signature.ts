import { Keypair, StrKey } from '@stellar/stellar-sdk';

/**
 * Verificación de firmas de wallet, para el login por reto (BE2-02, Q-07).
 *
 * Vive aquí y no en `apps/api` para mantener la regla del proyecto: el SDK de
 * Stellar solo se importa dentro de `@aegis/stellar`. Es criptografía pura, no
 * toca la red y no necesita ninguna clave privada.
 */

/** ¿Es una clave pública de Stellar bien formada, con checksum válido? */
export function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

/**
 * Comprueba que `signature` (base64) es la firma de `challenge` hecha por el
 * dueño de `address`.
 *
 * Devuelve `false` ante cualquier problema en vez de lanzar: una firma inválida
 * y una firma mal codificada son, para el que llama, el mismo caso.
 */
export function verifyChallengeSignature(
  address: string,
  challenge: string,
  signature: string,
): boolean {
  if (!isValidStellarAddress(address)) return false;

  try {
    const keypair = Keypair.fromPublicKey(address);
    return keypair.verify(Buffer.from(challenge, 'utf8'), Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
