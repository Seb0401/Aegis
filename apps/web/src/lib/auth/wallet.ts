import {
  getAddress,
  getNetwork,
  isConnected,
  requestAccess,
  signMessage,
  signTransaction,
} from '@stellar/freighter-api';

/**
 * Wallet del usuario (FE-03).
 *
 * El MVP solo soporta Freighter (`FE-Q2`), pero todo pasa por esta interfaz
 * para que añadir xBull o Albedo sea escribir otro adaptador y no tocar las
 * pantallas. La wallet es la única que ve la clave privada del usuario: aquí
 * solo entran mensajes y XDR, y salen firmas.
 */

export interface WalletAccount {
  address: string;
  network: string;
}

export interface WalletAdapter {
  readonly id: string;
  /** Cómo se nombra en «Conectar …». Puede ser genérico, como «wallet». */
  readonly name: string;
  readonly installUrl: string;
  /**
   * Texto del enlace de instalación.
   *
   * Existe porque «Instalar {name}» no siempre funciona: con un selector de
   * varias wallets no hay una que instalar, sino una lista que mirar.
   */
  readonly installLabel: string;
  /** ¿Está la extensión instalada en este navegador? */
  isAvailable(): Promise<boolean>;
  /** Pide permiso al usuario y devuelve la cuenta activa. */
  connect(): Promise<WalletAccount>;
  /** Devuelve la cuenta ya autorizada, o null si aún no hay permiso. */
  getAccount(): Promise<WalletAccount | null>;
  /** Firma el reto de login. Devuelve la firma en base64. */
  signChallenge(challenge: string, address: string): Promise<string>;
  /** Firma un XDR de transacción. Devuelve el XDR firmado. */
  signXdr(xdr: string, address: string, networkPassphrase?: string): Promise<string>;
}

export class WalletError extends Error {
  readonly code: 'NOT_INSTALLED' | 'REJECTED' | 'WRONG_NETWORK' | 'FAILED';

  constructor(code: WalletError['code'], message: string) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
}

/** La red que exige el MVP: testnet y solo testnet (§15 del PLAN). */
export const REQUIRED_NETWORK = 'TESTNET';

/**
 * Cuánto se espera a la wallet antes de rendirse.
 *
 * `@stellar/freighter-api` habla con la extensión mandando mensajes y
 * esperando respuesta. Si la extensión no está instalada no contesta nunca:
 * la promesa se queda colgada para siempre. Sin esto, pulsar «Aprobar y
 * firmar» dejaba la tarjeta bloqueada en «Firma en la wallet…» sin error y
 * sin forma de salir.
 *
 * La comprobación de presencia es corta; la firma da tiempo a que una persona
 * lea la transacción en el pop-up de la extensión y decida.
 */
const PRESENCE_TIMEOUT_MS = 2_000;
const SIGNATURE_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new WalletError('FAILED', message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new WalletError('FAILED', String(error)));
      },
    );
  });
}

/** Lanza si la wallet no está, en vez de esperar una respuesta que no llegará. */
async function ensureAvailable(): Promise<void> {
  if (await freighterAdapter.isAvailable()) return;
  throw new WalletError(
    'NOT_INSTALLED',
    'No se encontró Freighter en este navegador. Instálalo, recarga la página y vuelve a intentarlo.',
  );
}

/**
 * Freighter devuelve la firma como string base64 o como Buffer según versión y
 * navegador. La API espera siempre base64, así que se normaliza aquí.
 */
function toBase64(signed: unknown): string {
  if (typeof signed === 'string') return signed;

  const bytes = toBytes(signed);
  if (!bytes) {
    throw new WalletError('FAILED', 'La wallet devolvió una firma en un formato inesperado.');
  }

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  // Un Buffer de Node serializado como JSON llega así.
  if (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Array.isArray((value as { data: unknown[] }).data)
  ) {
    return Uint8Array.from((value as { data: number[] }).data);
  }
  return null;
}

/** Traduce el error de Freighter a algo que la UI pueda mostrar. */
function fail(error: { message?: string } | undefined, fallback: string): never {
  const message = error?.message ?? fallback;
  const rejected = /reject|denied|cancel|user declined/i.test(message);
  throw new WalletError(rejected ? 'REJECTED' : 'FAILED', message);
}

export const freighterAdapter: WalletAdapter = {
  id: 'freighter',
  name: 'Freighter',
  installUrl: 'https://www.freighter.app/',
  installLabel: 'Instalar Freighter',

  async isAvailable() {
    try {
      const result = await withTimeout(
        isConnected(),
        PRESENCE_TIMEOUT_MS,
        'La wallet no respondió.',
      );
      return result.isConnected === true;
    } catch {
      return false;
    }
  },

  async connect() {
    await ensureAvailable();

    const access = await withTimeout(
      requestAccess(),
      SIGNATURE_TIMEOUT_MS,
      'La wallet no respondió a la petición de acceso.',
    );
    if (access.error || !access.address) {
      fail(access.error, 'No se pudo acceder a la wallet.');
    }

    const network = await withTimeout(
      getNetwork(),
      PRESENCE_TIMEOUT_MS,
      'La wallet no respondió al preguntarle en qué red está.',
    );
    if (network.error) {
      fail(network.error, 'No se pudo leer la red de la wallet.');
    }

    // Aegis es solo testnet. Avisar aquí evita que el usuario firme algo con
    // una cuenta de mainnet por error.
    if (network.network?.toUpperCase() !== REQUIRED_NETWORK) {
      throw new WalletError(
        'WRONG_NETWORK',
        `Freighter está en ${network.network}. Cambia a Testnet para usar Aegis.`,
      );
    }

    return { address: access.address, network: network.network };
  },

  async getAccount() {
    try {
      const [account, network] = await withTimeout(
        Promise.all([getAddress(), getNetwork()]),
        PRESENCE_TIMEOUT_MS,
        'La wallet no respondió.',
      );
      if (account.error || !account.address) return null;
      return { address: account.address, network: network.network ?? '' };
    } catch {
      return null;
    }
  },

  async signChallenge(challenge, address) {
    await ensureAvailable();

    const result = await withTimeout(
      signMessage(challenge, { address }),
      SIGNATURE_TIMEOUT_MS,
      'La wallet no respondió a la firma del reto.',
    );
    if (result.error || result.signedMessage === null) {
      fail(result.error, 'No se pudo firmar el reto.');
    }
    return toBase64(result.signedMessage);
  },

  async signXdr(xdr, address, networkPassphrase) {
    await ensureAvailable();

    const result = await withTimeout(
      signTransaction(xdr, {
        address,
        ...(networkPassphrase ? { networkPassphrase } : {}),
      }),
      SIGNATURE_TIMEOUT_MS,
      'La wallet no respondió a la firma. Comprueba si quedó abierta una ventana de Freighter.',
    );
    if (result.error || !result.signedTxXdr) {
      fail(result.error, 'No se pudo firmar la transacción.');
    }
    return result.signedTxXdr;
  },
};
