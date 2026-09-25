/**
 * @vitest-environment jsdom
 *
 * El adaptador comprueba `window` antes de tocar el kit, para no romper el
 * renderizado en servidor de Next. Sin jsdom, todas las llamadas fallarían por
 * esa comprobación en vez de por lo que cada test quiere medir.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Adaptador de Stellar Wallets Kit.
 *
 * Lo que de verdad hay que fijar aquí no es que las firmas funcionen —de eso
 * responde el kit— sino dos comportamientos que sí son decisión nuestra:
 *
 *  - **No abrir un modal sin que nadie lo haya pedido.** `getAccount()` se
 *    llama al cargar la página para restaurar la sesión; si abriera el selector
 *    de wallets, el usuario vería un pop-up nada más entrar.
 *  - **Distinguir "el usuario canceló" de "algo falló".** Son dos mensajes
 *    distintos en la interfaz, y confundirlos hace que parezca un error de la
 *    aplicación cuando la persona simplemente cerró la ventana.
 */

const kit = {
  init: vi.fn(),
  refreshSupportedWallets: vi.fn(),
  authModal: vi.fn(),
  getAddress: vi.fn(),
  signMessage: vi.fn(),
  signTransaction: vi.fn(),
  disconnect: vi.fn(async () => undefined),
};

vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: kit,
  Networks: { TESTNET: 'Test SDF Network ; September 2015' },
}));

vi.mock('@creit.tech/stellar-wallets-kit/modules/freighter', () => ({ FreighterModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/xbull', () => ({ xBullModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/albedo', () => ({ AlbedoModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/rabet', () => ({ RabetModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/lobstr', () => ({ LobstrModule: class {} }));
vi.mock('@creit.tech/stellar-wallets-kit/modules/hana', () => ({ HanaModule: class {} }));

const { walletsKitAdapter, resetSelectedWallet } = await import('./wallets-kit');
const { WalletError } = await import('./wallet');

const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

async function capturar(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSelectedWallet();
  kit.getAddress.mockResolvedValue({ address: ADDRESS });
  kit.authModal.mockResolvedValue({ address: ADDRESS });
});

describe('disponibilidad', () => {
  it('hay wallet si al menos una está instalada', async () => {
    kit.refreshSupportedWallets.mockResolvedValue([
      { id: 'freighter', isAvailable: false },
      { id: 'xbull', isAvailable: true },
    ]);

    expect(await walletsKitAdapter.isAvailable()).toBe(true);
  });

  it('no hay wallet si ninguna está instalada', async () => {
    kit.refreshSupportedWallets.mockResolvedValue([{ id: 'freighter', isAvailable: false }]);

    expect(await walletsKitAdapter.isAvailable()).toBe(false);
  });

  it('comprobar la disponibilidad no abre ningún modal', async () => {
    kit.refreshSupportedWallets.mockResolvedValue([]);

    await walletsKitAdapter.isAvailable();

    expect(kit.authModal).not.toHaveBeenCalled();
  });
});

describe('getAccount', () => {
  it('devuelve null antes de conectar, sin abrir el selector', async () => {
    // Se llama al cargar la página para restaurar la sesión. Si abriera el
    // selector, el usuario vería un pop-up nada más entrar.
    expect(await walletsKitAdapter.getAccount()).toBeNull();
    expect(kit.authModal).not.toHaveBeenCalled();
    expect(kit.getAddress).not.toHaveBeenCalled();
  });

  it('devuelve la cuenta después de conectar', async () => {
    await walletsKitAdapter.connect();

    expect(await walletsKitAdapter.getAccount()).toEqual({
      address: ADDRESS,
      network: 'TESTNET',
    });
  });

  it('vuelve a null tras cerrar sesión', async () => {
    await walletsKitAdapter.connect();
    resetSelectedWallet();

    expect(await walletsKitAdapter.getAccount()).toBeNull();
  });
});

describe('connect', () => {
  it('conecta y devuelve la dirección en testnet', async () => {
    await expect(walletsKitAdapter.connect()).resolves.toEqual({
      address: ADDRESS,
      network: 'TESTNET',
    });
  });

  it('distingue que el usuario cerró el selector', async () => {
    kit.authModal.mockRejectedValue(new Error('Modal closed by the user'));

    const error = await capturar(walletsKitAdapter.connect());

    expect(error).toBeInstanceOf(WalletError);
    expect((error as InstanceType<typeof WalletError>).code).toBe('REJECTED');
  });

  it('marca como fallo lo que no es una cancelación', async () => {
    kit.authModal.mockRejectedValue(new Error('network unreachable'));

    const error = await capturar(walletsKitAdapter.connect());

    expect((error as InstanceType<typeof WalletError>).code).toBe('FAILED');
  });

  it('falla si la wallet no devuelve dirección', async () => {
    kit.authModal.mockResolvedValue({ address: '' });

    const error = await capturar(walletsKitAdapter.connect());

    expect(error).toBeInstanceOf(WalletError);
  });
});

describe('firmas', () => {
  it('devuelve la firma del reto tal cual', async () => {
    kit.signMessage.mockResolvedValue({ signedMessage: 'ZmlybWE=' });

    await expect(walletsKitAdapter.signChallenge('reto', ADDRESS)).resolves.toBe('ZmlybWE=');
  });

  it('el rechazo al firmar se distingue de un error', async () => {
    kit.signMessage.mockRejectedValue(new Error('User declined the request'));

    const error = await capturar(walletsKitAdapter.signChallenge('reto', ADDRESS));

    expect((error as InstanceType<typeof WalletError>).code).toBe('REJECTED');
  });

  it('devuelve el XDR firmado', async () => {
    kit.signTransaction.mockResolvedValue({ signedTxXdr: 'AAAAfirmado' });

    await expect(walletsKitAdapter.signXdr('AAAA', ADDRESS)).resolves.toBe('AAAAfirmado');
  });

  it('falla si la wallet no devuelve el XDR firmado', async () => {
    kit.signTransaction.mockResolvedValue({ signedTxXdr: '' });

    const error = await capturar(walletsKitAdapter.signXdr('AAAA', ADDRESS));

    expect(error).toBeInstanceOf(WalletError);
  });
});

describe('inicialización', () => {
  /**
   * El kit se inicializa una sola vez por carga del módulo, así que estos dos
   * tests necesitan un módulo recién importado. `clearAllMocks` reinicia los
   * contadores de las llamadas, pero no el estado interno del módulo.
   */
  async function moduloNuevo() {
    vi.resetModules();
    vi.clearAllMocks();
    return import('./wallets-kit');
  }

  it('fija la red a testnet, no a la de la wallet', async () => {
    // Aegis es solo testnet. Si el kit tomara la red de la wallet, alguien con
    // Freighter en mainnet podría firmar con una cuenta real.
    const { walletsKitAdapter: nuevo } = await moduloNuevo();
    await nuevo.connect();

    expect(kit.init).toHaveBeenCalledWith(
      expect.objectContaining({ network: 'Test SDF Network ; September 2015' }),
    );
  });

  it('solo inicializa el kit una vez', async () => {
    const { walletsKitAdapter: nuevo } = await moduloNuevo();

    await nuevo.connect();
    await nuevo.connect();

    expect(kit.init).toHaveBeenCalledTimes(1);
  });
});
