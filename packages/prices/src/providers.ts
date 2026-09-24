import {
  STELLAR_DECIMALS,
  type AssetCode,
  type AssetPrice,
  type PriceProvider,
  type PriceSnapshot,
} from '@aegis/contracts';

/**
 * Implementaciones del puerto `PriceProvider`.
 *
 * Regla común a todas: **nunca lanzan por un activo sin precio**. Devuelven una
 * foto con lo que tengan y omiten el resto. Que falte un precio es información,
 * no un error, y quien llama la convierte en algo que el usuario ve (la regla
 * P-10 y la señal G-10). Un proveedor que lanzara dejaría al usuario con un
 * "algo falló" en vez de "no sé cuánto vale esto".
 */

/** Convierte un número de la API a monto decimal, sin notación científica. */
export function numberToAmount(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toFixed(STELLAR_DECIMALS);
}

// ── Tasas fijas ─────────────────────────────────────────────────────

/**
 * Precios fijos de configuración.
 *
 * Es el proveedor de los activos de prueba: `USDC_TEST` lo emitimos nosotros en
 * testnet, así que no cotiza en ningún sitio y su "precio" es una convención.
 */
export class FixedPriceProvider implements PriceProvider {
  constructor(private readonly prices: Partial<Record<AssetCode, string>>) {}

  async getPrices(assets: readonly AssetCode[]): Promise<PriceSnapshot> {
    const capturedAt = new Date().toISOString();

    const quotes = [...new Set(assets)].flatMap((asset): AssetPrice[] => {
      const usd = this.prices[asset];
      if (!usd) return [];
      return [{ asset, usd, source: 'fixed', asOf: capturedAt }];
    });

    return { capturedAt, quotes };
  }
}

// ── Mercado ─────────────────────────────────────────────────────────

export interface MarketPriceProviderOptions {
  /** Base de la API. Se inyecta para poder apuntar a un servidor de test. */
  baseUrl?: string;
  /** Identificador del activo en la API, por activo nuestro. */
  ids: Partial<Record<AssetCode, string>>;
  timeoutMs?: number;
  /** Se inyecta en los tests para no salir a la red. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.coingecko.com/api/v3';
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Precios de mercado desde la API pública de CoinGecko.
 *
 * Lleva su propio tiempo máximo de espera: esta llamada está en el camino
 * crítico de crear una propuesta, y un oráculo lento no puede convertirse en
 * una aplicación lenta. Si expira, la foto sale vacía y el sistema escala al
 * usuario, que es el comportamiento acordado.
 */
export class MarketPriceProvider implements PriceProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: MarketPriceProviderOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getPrices(assets: readonly AssetCode[]): Promise<PriceSnapshot> {
    const capturedAt = new Date().toISOString();
    const wanted = [...new Set(assets)].filter((asset) => this.options.ids[asset]);

    if (wanted.length === 0) return { capturedAt, quotes: [] };

    const ids = wanted.map((asset) => this.options.ids[asset]!);
    const url =
      `${this.baseUrl}/simple/price` +
      `?ids=${encodeURIComponent(ids.join(','))}` +
      `&vs_currencies=usd&include_last_updated_at=true`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });

      if (!response.ok) return { capturedAt, quotes: [] };

      const body = (await response.json()) as Record<
        string,
        { usd?: number; last_updated_at?: number } | undefined
      >;

      const quotes = wanted.flatMap((asset): AssetPrice[] => {
        const entry = body[this.options.ids[asset]!];
        const usd = entry?.usd === undefined ? null : numberToAmount(entry.usd);
        if (!usd) return [];

        const asOf = entry?.last_updated_at
          ? new Date(entry.last_updated_at * 1000).toISOString()
          : capturedAt;

        return [{ asset, usd, source: 'market', asOf }];
      });

      return { capturedAt, quotes };
    } catch {
      // Red caída, tiempo agotado o respuesta ilegible: se devuelve una foto
      // vacía en vez de propagar. La ausencia ya es la señal.
      return { capturedAt, quotes: [] };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── Composición ─────────────────────────────────────────────────────

/**
 * Encadena proveedores: el primero manda y el siguiente solo rellena huecos.
 *
 * Así se combinan mercado y tasas fijas sin condicionales repartidos: el precio
 * real de XLM viene del mercado y el de USDC_TEST, que no cotiza, de la
 * configuración.
 */
export class FallbackPriceProvider implements PriceProvider {
  constructor(private readonly providers: readonly PriceProvider[]) {}

  async getPrices(assets: readonly AssetCode[]): Promise<PriceSnapshot> {
    const capturedAt = new Date().toISOString();
    const found = new Map<AssetCode, AssetPrice>();

    for (const provider of this.providers) {
      const pending = [...new Set(assets)].filter((asset) => !found.has(asset));
      if (pending.length === 0) break;

      const snapshot = await provider.getPrices(pending);
      for (const quote of snapshot.quotes) {
        if (!found.has(quote.asset)) found.set(quote.asset, quote);
      }
    }

    return { capturedAt, quotes: [...found.values()] };
  }
}

export interface CachedPriceProviderOptions {
  ttlMs?: number;
  /**
   * Ventana de gracia durante la cual, si el proveedor falla, se sigue sirviendo
   * el último precio conocido. Es preferible a no tener precio, pero el `asOf`
   * del propio precio delata su edad: nadie está fingiendo que es fresco.
   */
  staleWhileErrorMs?: number;
  /** Reloj inyectable, para que los tests no dependan del tiempo real. */
  now?: () => number;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_STALE_MS = 10 * 60_000;

/** Caché en memoria por activo. */
export class CachedPriceProvider implements PriceProvider {
  private readonly cache = new Map<AssetCode, { quote: AssetPrice; storedAt: number }>();
  private readonly ttlMs: number;
  private readonly staleMs: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: PriceProvider,
    options: CachedPriceProviderOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.staleMs = options.staleWhileErrorMs ?? DEFAULT_STALE_MS;
    this.now = options.now ?? Date.now;
  }

  async getPrices(assets: readonly AssetCode[]): Promise<PriceSnapshot> {
    const capturedAt = new Date(this.now()).toISOString();
    const unique = [...new Set(assets)];

    const fresh: AssetPrice[] = [];
    const missing: AssetCode[] = [];

    for (const asset of unique) {
      const entry = this.cache.get(asset);
      if (entry && this.now() - entry.storedAt < this.ttlMs) {
        fresh.push({ ...entry.quote, source: 'cache' });
      } else {
        missing.push(asset);
      }
    }

    if (missing.length === 0) return { capturedAt, quotes: fresh };

    const snapshot = await this.inner.getPrices(missing);

    for (const quote of snapshot.quotes) {
      this.cache.set(quote.asset, { quote, storedAt: this.now() });
    }

    const obtained = new Set(snapshot.quotes.map((q) => q.asset));

    // Lo que el proveedor no ha podido dar se rescata de la caché caducada,
    // siempre que siga dentro de la ventana de gracia.
    const stale = missing
      .filter((asset) => !obtained.has(asset))
      .flatMap((asset): AssetPrice[] => {
        const entry = this.cache.get(asset);
        if (!entry || this.now() - entry.storedAt > this.staleMs) return [];
        return [{ ...entry.quote, source: 'cache' }];
      });

    return { capturedAt, quotes: [...fresh, ...snapshot.quotes, ...stale] };
  }
}
