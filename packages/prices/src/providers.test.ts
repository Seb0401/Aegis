import { findQuote, toUsd, type AssetCode, type PriceProvider } from '@aegis/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createPriceProvider } from './index.js';
import {
  CachedPriceProvider,
  FallbackPriceProvider,
  FixedPriceProvider,
  MarketPriceProvider,
  numberToAmount,
} from './providers.js';

/** Respuesta con la forma de la API de mercado. */
function marketResponse(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch;
}

/** Proveedor que siempre falla, para los caminos de error. */
const brokenProvider: PriceProvider = {
  getPrices: async () => {
    throw new Error('el oráculo está caído');
  },
};

describe('numberToAmount', () => {
  it('evita la notación científica de los números pequeños', () => {
    expect(numberToAmount(0.0000001)).toBe('0.0000001');
    expect(String(0.0000001)).toBe('1e-7'); // lo que haría la conversión ingenua
  });

  it('descarta valores que no son precios', () => {
    expect(numberToAmount(0)).toBeNull();
    expect(numberToAmount(-1)).toBeNull();
    expect(numberToAmount(Number.NaN)).toBeNull();
    expect(numberToAmount(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('FixedPriceProvider', () => {
  it('devuelve las tasas configuradas', async () => {
    const provider = new FixedPriceProvider({ USDC_TEST: '1', XLM: '0.12' });
    const snapshot = await provider.getPrices(['XLM', 'USDC_TEST']);

    expect(snapshot.quotes).toHaveLength(2);
    expect(findQuote(snapshot, 'XLM')).toMatchObject({ usd: '0.12', source: 'fixed' });
  });

  it('omite lo que no tiene tasa, en vez de inventarla', async () => {
    const provider = new FixedPriceProvider({ USDC_TEST: '1' });
    const snapshot = await provider.getPrices(['XLM', 'USDC_TEST']);

    expect(findQuote(snapshot, 'XLM')).toBeUndefined();
    expect(snapshot.quotes).toHaveLength(1);
  });
});

describe('MarketPriceProvider', () => {
  it('traduce la respuesta de la API y conserva el momento del precio', async () => {
    const provider = new MarketPriceProvider({
      ids: { XLM: 'stellar' },
      fetchImpl: marketResponse({ stellar: { usd: 0.1234, last_updated_at: 1789000000 } }),
    });

    const snapshot = await provider.getPrices(['XLM']);
    const quote = findQuote(snapshot, 'XLM');

    expect(quote?.usd).toBe('0.1234000');
    expect(quote?.source).toBe('market');
    // El `asOf` es el de la API, no el de nuestra consulta: es lo que revela si
    // un precio está rancio.
    expect(quote?.asOf).toBe(new Date(1789000000 * 1000).toISOString());
  });

  it('devuelve una foto vacía si la API responde con error', async () => {
    const provider = new MarketPriceProvider({
      ids: { XLM: 'stellar' },
      fetchImpl: marketResponse({}, false),
    });

    expect((await provider.getPrices(['XLM'])).quotes).toEqual([]);
  });

  it('no lanza si la red falla: la ausencia ya es la señal', async () => {
    const provider = new MarketPriceProvider({
      ids: { XLM: 'stellar' },
      fetchImpl: vi.fn(async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    });

    await expect(provider.getPrices(['XLM'])).resolves.toMatchObject({ quotes: [] });
  });

  it('no sale a la red por un activo que no cotiza', async () => {
    const fetchImpl = marketResponse({});
    const provider = new MarketPriceProvider({ ids: { XLM: 'stellar' }, fetchImpl });

    await provider.getPrices(['USDC_TEST']);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('respeta el tiempo máximo de espera', async () => {
    const provider = new MarketPriceProvider({
      ids: { XLM: 'stellar' },
      timeoutMs: 10,
      fetchImpl: ((_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('abortado')));
        })) as unknown as typeof fetch,
    });

    // Un oráculo lento no puede convertirse en una aplicación lenta.
    await expect(provider.getPrices(['XLM'])).resolves.toMatchObject({ quotes: [] });
  });
});

describe('FallbackPriceProvider', () => {
  it('el primero manda y el segundo solo rellena huecos', async () => {
    const provider = new FallbackPriceProvider([
      new FixedPriceProvider({ XLM: '0.12' }),
      new FixedPriceProvider({ XLM: '99', USDC_TEST: '1' }),
    ]);

    const snapshot = await provider.getPrices(['XLM', 'USDC_TEST']);

    expect(findQuote(snapshot, 'XLM')?.usd).toBe('0.12');
    expect(findQuote(snapshot, 'USDC_TEST')?.usd).toBe('1');
  });
});

describe('CachedPriceProvider', () => {
  it('no vuelve a preguntar dentro de la ventana de validez', async () => {
    const inner = {
      getPrices: vi.fn(
        new FixedPriceProvider({ XLM: '0.12' }).getPrices.bind(
          new FixedPriceProvider({ XLM: '0.12' }),
        ),
      ),
    };
    const provider = new CachedPriceProvider(inner as PriceProvider, { ttlMs: 60_000 });

    await provider.getPrices(['XLM']);
    const segunda = await provider.getPrices(['XLM']);

    expect(inner.getPrices).toHaveBeenCalledTimes(1);
    expect(findQuote(segunda, 'XLM')?.source).toBe('cache');
  });

  it('vuelve a preguntar cuando la ventana caduca', async () => {
    let ahora = 1_000_000;
    const inner = {
      getPrices: vi.fn(async () => ({
        capturedAt: new Date(ahora).toISOString(),
        quotes: [
          {
            asset: 'XLM' as AssetCode,
            usd: '0.12',
            source: 'market' as const,
            asOf: new Date(ahora).toISOString(),
          },
        ],
      })),
    };

    const provider = new CachedPriceProvider(inner as PriceProvider, {
      ttlMs: 1000,
      now: () => ahora,
    });

    await provider.getPrices(['XLM']);
    ahora += 2000;
    await provider.getPrices(['XLM']);

    expect(inner.getPrices).toHaveBeenCalledTimes(2);
  });

  it('sirve el último precio conocido si el proveedor falla, dentro de la gracia', async () => {
    let ahora = 1_000_000;
    let falla = false;

    const inner: PriceProvider = {
      getPrices: async (assets) => {
        if (falla) return { capturedAt: new Date(ahora).toISOString(), quotes: [] };
        return {
          capturedAt: new Date(ahora).toISOString(),
          quotes: assets.map((asset) => ({
            asset,
            usd: '0.12',
            source: 'market' as const,
            asOf: new Date(ahora).toISOString(),
          })),
        };
      },
    };

    const provider = new CachedPriceProvider(inner, {
      ttlMs: 1000,
      staleWhileErrorMs: 60_000,
      now: () => ahora,
    });

    const primeraLectura = await provider.getPrices(['XLM']);
    const asOfOriginal = findQuote(primeraLectura, 'XLM')!.asOf;

    falla = true;
    ahora += 5000; // caducó la ventana, pero seguimos dentro de la gracia

    const rescatada = await provider.getPrices(['XLM']);
    const quote = findQuote(rescatada, 'XLM');

    expect(quote?.usd).toBe('0.12');
    // El precio se sirve, pero su `asOf` sigue siendo el viejo: nadie finge
    // que este dato sea fresco.
    expect(quote?.asOf).toBe(asOfOriginal);
  });

  it('deja de servir el precio pasada la ventana de gracia', async () => {
    let ahora = 1_000_000;
    let falla = false;

    const inner: PriceProvider = {
      getPrices: async (assets) => ({
        capturedAt: new Date(ahora).toISOString(),
        quotes: falla
          ? []
          : assets.map((asset) => ({
              asset,
              usd: '0.12',
              source: 'market' as const,
              asOf: new Date(ahora).toISOString(),
            })),
      }),
    };

    const provider = new CachedPriceProvider(inner, {
      ttlMs: 1000,
      staleWhileErrorMs: 10_000,
      now: () => ahora,
    });

    await provider.getPrices(['XLM']);
    falla = true;
    ahora += 60_000;

    expect((await provider.getPrices(['XLM'])).quotes).toEqual([]);
  });

  it('propaga el fallo si el proveedor lanza y no hay nada en caché', async () => {
    const provider = new CachedPriceProvider(brokenProvider);

    await expect(provider.getPrices(['XLM'])).rejects.toThrow();
  });
});

describe('createPriceProvider', () => {
  it('en modo fijo no sale a la red', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const provider = createPriceProvider({
      source: 'fixed',
      fixedPrices: { XLM: '0.5' },
      fetchImpl,
    });

    const snapshot = await provider.getPrices(['XLM', 'USDC_TEST']);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(findQuote(snapshot, 'XLM')?.usd).toBe('0.5');
    // USDC_TEST cae en la paridad por defecto.
    expect(findQuote(snapshot, 'USDC_TEST')?.usd).toBe('1');
  });

  it('en modo mercado combina el precio real con la tasa fija del activo de prueba', async () => {
    const provider = createPriceProvider({
      source: 'market',
      fetchImpl: marketResponse({ stellar: { usd: 0.25 } }),
    });

    const snapshot = await provider.getPrices(['XLM', 'USDC_TEST']);

    expect(findQuote(snapshot, 'XLM')).toMatchObject({ usd: '0.2500000', source: 'market' });
    expect(findQuote(snapshot, 'USDC_TEST')).toMatchObject({ usd: '1', source: 'fixed' });
  });
});

describe('conversión a dólares', () => {
  it('convierte con la precisión de los montos, no con coma flotante', async () => {
    const snapshot = await new FixedPriceProvider({ XLM: '0.12' }).getPrices(['XLM']);

    expect(toUsd('100', 'XLM', snapshot)).toBe('12.0000000');
    expect(toUsd('0.1', 'XLM', snapshot)).toBe('0.0120000');
  });

  it('devuelve null sin precio, en vez de asumir paridad', async () => {
    const snapshot = await new FixedPriceProvider({}).getPrices(['XLM']);

    expect(toUsd('100', 'XLM', snapshot)).toBeNull();
  });
});
