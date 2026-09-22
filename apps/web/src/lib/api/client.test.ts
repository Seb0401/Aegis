import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';
import { API_ERROR_CODES, ApiError } from './errors';

/**
 * El cliente es la frontera con el backend: aquí se comprueba que un contrato
 * roto, un error de la API o una caída de red se convierten en algo que la UI
 * pueda distinguir, en vez de en un `undefined` tres pantallas más adentro.
 */

const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function clientWith(fetchImpl: typeof fetch, options: { token?: string | null } = {}) {
  return new ApiClient({
    baseUrl: 'http://api.test',
    getToken: () => options.token ?? 'token-de-prueba',
    fetchImpl,
  });
}

describe('ApiClient', () => {
  it('valida la respuesta contra el contrato y la devuelve tipada', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        address: ADDRESS,
        balances: [{ asset: 'XLM', total: '100.0000000', available: '89.5000000' }],
      }),
    );

    const result = await clientWith(fetchImpl as unknown as typeof fetch).getBalances();

    expect(result.balances[0]?.available).toBe('89.5000000');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/account/balances');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-de-prueba');
  });

  it('convierte el sobre de error de la API en un ApiError con su código', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: 'CONFIRMATION_REQUIRED', message: 'Reescribe el monto total.' } },
        400,
      ),
    );

    const error = await clientWith(fetchImpl as unknown as typeof fetch)
      .approveProposal('prop_1')
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(API_ERROR_CODES.confirmationRequired);
    expect((error as ApiError).status).toBe(400);
  });

  it('avisa de que la sesión caducó cuando la API responde 401', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'No has iniciado sesión.' } }, 401),
    );

    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 'token-caducado',
      onUnauthorized,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getPolicy()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('no llega a llamar a la API si no hay sesión', async () => {
    const fetchImpl = vi.fn();
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getToken: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getDestinations()).rejects.toMatchObject({
      code: API_ERROR_CODES.unauthorized,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('distingue un fallo de red de una respuesta con error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).getBalances(),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.network, status: 0 });
  });

  it('rechaza una respuesta 200 que no cumple el contrato', async () => {
    // El backend cambió `available` por un número: el contrato exige string
    // decimal porque los float de JS pierden los 7 decimales de Stellar.
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ address: ADDRESS, balances: [{ asset: 'XLM', total: '1', available: 1 }] }),
    );

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).getBalances(),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.invalidResponse });
  });

  it('reconoce el 429 del rate limit aunque no traiga el sobre de la aplicación', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ statusCode: 429, error: 'Too Many Requests' }, 429),
    );

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).sendMessage({ message: 'hola' }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.rateLimited });
  });

  it('pasa los parámetros de consulta y el cuerpo como JSON', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        events: [],
        chain: { valid: true, verifiedEvents: 0, complete: true },
      }),
    );

    await clientWith(fetchImpl as unknown as typeof fetch).getAudit(25);

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://api.test/audit?limit=25');
  });
});
