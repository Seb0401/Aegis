import { Keypair } from '@stellar/stellar-sdk';

/**
 * Par de claves de usar y tirar, para los tests de login.
 *
 * Vive aquí, y no en `apps/api`, para mantener la regla del proyecto: el SDK de
 * Stellar solo se importa dentro de `@aegis/stellar`. Sin esto, cada test que
 * quisiera firmar un reto tendría que saltarse esa frontera.
 *
 * Nunca debe usarse fuera de los tests: la clave privada vive en memoria y se
 * genera al azar en cada llamada.
 */
export interface TestKeypair {
  address: string;
  /** Firma un mensaje y devuelve la firma en base64, igual que haría la wallet. */
  sign(message: string): string;
}

export function createTestKeypair(): TestKeypair {
  const keypair = Keypair.random();

  return {
    address: keypair.publicKey(),
    sign: (message: string) => keypair.sign(Buffer.from(message, 'utf8')).toString('base64'),
  };
}
