// `import type` se borra al compilar: no arrastra el kit al bundle inicial.
import type { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { REQUIRED_NETWORK, WalletError, type WalletAccount, type WalletAdapter } from './wallet';

/**
 * Adaptador de Stellar Wallets Kit (FE-Q2).
 *
 * El adaptador de Freighter sigue en `wallet.ts` y funciona; este añade xBull,
 * Albedo, Rabet, Lobstr y Hana con el selector que trae el propio kit.
 *
 * Importa para algo muy concreto: quien pruebe Aegis por primera vez no tiene
 * por qué tener Freighter instalado. Obligar a instalar una extensión concreta
 * antes de ver nada pierde a la mitad de la gente en la puerta.
 *
 * Cumple la misma interfaz `WalletAdapter` que ya había, que estaba pensada
 * justo para esto: las pantallas no se enteran de cuál está en uso.
 */

/**
 * El kit se carga con `import()` dinámico, no con un import normal.
 *
 * Dos motivos. Uno: al importarse **registra web components e inyecta estilos**
 * en el documento; con un import estático eso pasa mientras Next hidrata y el
 * servidor de desarrollo avisa de que el HTML servido y el del cliente no
 * coinciden. Dos: son el kit y seis módulos de wallet en el bundle inicial de
 * una pantalla donde la mayoría de la gente aún no ha decidido conectar nada.
 *
 * Cargándolo cuando alguien va a usar la wallet, el primer render es HTML
 * limpio y el kit entra después, con la página ya viva.
 */
type Kit = typeof StellarWalletsKit;

let kit: Kit | null = null;

async function ensureInitialized(): Promise<Kit> {
  if (typeof window === 'undefined') {
    throw new WalletError('FAILED', 'La wallet solo está disponible en el navegador.');
  }

  if (kit) return kit;

  const [{ Networks, StellarWalletsKit }, freighter, xbull, albedo, rabet, lobstr, hana] =
    await Promise.all([
      import('@creit.tech/stellar-wallets-kit'),
      import('@creit.tech/stellar-wallets-kit/modules/freighter'),
      import('@creit.tech/stellar-wallets-kit/modules/xbull'),
      import('@creit.tech/stellar-wallets-kit/modules/albedo'),
      import('@creit.tech/stellar-wallets-kit/modules/rabet'),
      import('@creit.tech/stellar-wallets-kit/modules/lobstr'),
      import('@creit.tech/stellar-wallets-kit/modules/hana'),
    ]);

  StellarWalletsKit.init({
    // Aegis es solo testnet (§15 del PLAN). Fijarlo aquí evita que alguien
    // firme con una cuenta de mainnet por error.
    network: Networks.TESTNET,
    // Solo extensiones de navegador y wallets web: nada de hardware ni de
    // puentes móviles, que añaden pasos y formas de fallar sin aportar nada.
    modules: [
      new freighter.FreighterModule(),
      new xbull.xBullModule(),
      new albedo.AlbedoModule(),
      new rabet.RabetModule(),
      new lobstr.LobstrModule(),
      new hana.HanaModule(),
    ],
  });

  kit = StellarWalletsKit;
  return kit;
}

/** ¿Ya eligió el usuario una wallet en esta sesión? */
let connected = false;

/** Traduce el error del kit a los códigos que la interfaz ya sabe mostrar. */
function fail(error: unknown, fallback: string): never {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const rechazado = /reject|denied|cancel|declin|closed|dismiss/i.test(message);
  throw new WalletError(rechazado ? 'REJECTED' : 'FAILED', message || fallback);
}

export const walletsKitAdapter: WalletAdapter = {
  id: 'stellar-wallets-kit',
  // Genérico a propósito: el botón dice «Conectar wallet» y el usuario elige
  // cuál en el selector. Poner aquí «Stellar Wallets Kit» le pediría conectar
  // algo cuyo nombre no significa nada para él.
  name: 'wallet',
  installUrl: 'https://stellarwalletskit.dev',
  installLabel: 'Ver wallets compatibles',

  /**
   * Hay wallets disponibles si al menos una está instalada.
   *
   * No se abre el selector para averiguarlo: preguntar antes de que el usuario
   * haya pedido nada sería abrir un modal sin motivo.
   */
  async isAvailable() {
    try {
      const k = await ensureInitialized();
      const soportadas = await k.refreshSupportedWallets();
      return soportadas.some((wallet) => wallet.isAvailable);
    } catch {
      return false;
    }
  },

  /**
   * Abre el selector y conecta.
   *
   * `authModal` hace las dos cosas: el usuario elige wallet y el kit le pide la
   * dirección. Separarlo daría dos pop-ups seguidos para una sola decisión.
   */
  async connect(): Promise<WalletAccount> {
    try {
      const k = await ensureInitialized();
      const { address } = await k.authModal();

      if (!address) {
        throw new WalletError('FAILED', 'La wallet no devolvió ninguna dirección.');
      }

      connected = true;
      // El kit está fijado a testnet, así que la red es la que exige Aegis.
      return { address, network: REQUIRED_NETWORK };
    } catch (error) {
      if (error instanceof WalletError) throw error;
      fail(error, 'No se pudo conectar con la wallet.');
    }
  },

  /** Sin conexión previa no hay cuenta: no se abre el selector por las buenas. */
  async getAccount(): Promise<WalletAccount | null> {
    if (!connected || !kit) return null;

    try {
      const { address } = await kit.getAddress();
      return address ? { address, network: REQUIRED_NETWORK } : null;
    } catch {
      return null;
    }
  },

  async signChallenge(challenge: string, address: string): Promise<string> {
    try {
      const k = await ensureInitialized();
      const { signedMessage } = await k.signMessage(challenge, { address });

      if (!signedMessage) {
        throw new WalletError('FAILED', 'La wallet no devolvió ninguna firma.');
      }

      return signedMessage;
    } catch (error) {
      if (error instanceof WalletError) throw error;
      fail(error, 'No se pudo firmar el reto.');
    }
  },

  async signXdr(xdr: string, address: string, networkPassphrase?: string): Promise<string> {
    try {
      const k = await ensureInitialized();
      const { signedTxXdr } = await k.signTransaction(xdr, {
        address,
        ...(networkPassphrase ? { networkPassphrase } : {}),
      });

      if (!signedTxXdr) {
        throw new WalletError('FAILED', 'La wallet no devolvió la transacción firmada.');
      }

      return signedTxXdr;
    } catch (error) {
      if (error instanceof WalletError) throw error;
      fail(error, 'No se pudo firmar la transacción.');
    }
  },
};

/** Olvida la wallet conectada. Lo usa el cierre de sesión. */
export function resetSelectedWallet(): void {
  connected = false;

  if (kit) {
    void kit.disconnect().catch(() => {
      // Desconectar es una cortesía con la wallet: si falla, la sesión de
      // Aegis se cierra igual y eso es lo que le importa al usuario.
    });
  }
}
