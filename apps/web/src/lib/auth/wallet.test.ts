import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regresión de un fallo real: sin la extensión instalada, las llamadas a
 * `@stellar/freighter-api` no rechazan ni resuelven — se quedan esperando una
 * respuesta que no va a llegar. La tarjeta de propuesta se quedaba colgada en
 * «Firma en la wallet…», con los botones bloqueados y sin ningún error.
 *
 * Aquí la extensión se simula como "nunca contesta", que es exactamente el
 * caso que rompía.
 */

const neverResolves = () => new Promise<never>(() => {});

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(neverResolves),
  requestAccess: vi.fn(neverResolves),
  getAddress: vi.fn(neverResolves),
  getNetwork: vi.fn(neverResolves),
  signMessage: vi.fn(neverResolves),
  signTransaction: vi.fn(neverResolves),
}));

const { freighterAdapter, WalletError } = await import('./wallet');

const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

describe('freighterAdapter con la extensión ausente', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /** Lanza la promesa, adelanta los temporizadores y devuelve el resultado. */
  async function settle<T>(promise: Promise<T>) {
    const result = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    return result;
  }

  it('isAvailable() se rinde en vez de esperar indefinidamente', async () => {
    const result = await settle(freighterAdapter.isAvailable());
    expect(result).toEqual({ ok: true, value: false });
  });

  it('connect() falla con NOT_INSTALLED en vez de colgarse', async () => {
    const result = await settle(freighterAdapter.connect());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(WalletError);
    expect((result as { error: InstanceType<typeof WalletError> }).error.code).toBe(
      'NOT_INSTALLED',
    );
  });

  it('signXdr() falla con NOT_INSTALLED: es el caso que dejaba la tarjeta bloqueada', async () => {
    const result = await settle(freighterAdapter.signXdr('AAAA', ADDRESS));
    expect(result.ok).toBe(false);
    expect((result as { error: InstanceType<typeof WalletError> }).error.code).toBe(
      'NOT_INSTALLED',
    );
  });

  it('signChallenge() tampoco se queda esperando', async () => {
    const result = await settle(freighterAdapter.signChallenge('reto', ADDRESS));
    expect(result.ok).toBe(false);
    expect((result as { error: InstanceType<typeof WalletError> }).error.code).toBe(
      'NOT_INSTALLED',
    );
  });
});
