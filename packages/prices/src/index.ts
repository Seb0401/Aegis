import type { AssetCode, PriceProvider } from '@aegis/contracts';
import {
  CachedPriceProvider,
  FallbackPriceProvider,
  FixedPriceProvider,
  MarketPriceProvider,
} from './providers.js';

export {
  CachedPriceProvider,
  FallbackPriceProvider,
  FixedPriceProvider,
  MarketPriceProvider,
  numberToAmount,
  type CachedPriceProviderOptions,
  type MarketPriceProviderOptions,
} from './providers.js';

/**
 * Identificadores de nuestros activos en la API de mercado.
 *
 * `USDC_TEST` no está aquí a propósito: lo emitimos nosotros en testnet, no
 * cotiza en ningún sitio, y su precio es una convención que sale de la
 * configuración.
 */
export const MARKET_IDS: Partial<Record<AssetCode, string>> = {
  XLM: 'stellar',
};

/** Paridades por defecto de los activos que no cotizan. */
export const DEFAULT_FIXED_PRICES: Partial<Record<AssetCode, string>> = {
  USDC_TEST: '1',
};

export interface PriceProviderConfig {
  /**
   * `market` consulta la API y usa las tasas fijas solo para lo que no cotiza.
   * `fixed` no sale a la red: es el modo determinista para tests y demos.
   */
  source: 'market' | 'fixed';
  fixedPrices?: Partial<Record<AssetCode, string>>;
  marketBaseUrl?: string;
  cacheTtlMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Construye el proveedor de precios de la aplicación.
 *
 * El orden importa: primero el mercado, después las tasas fijas. Al revés, una
 * tasa fija de XLM taparía para siempre su precio real.
 */
export function createPriceProvider(config: PriceProviderConfig): PriceProvider {
  const fixed = new FixedPriceProvider({
    ...DEFAULT_FIXED_PRICES,
    ...config.fixedPrices,
  });

  if (config.source === 'fixed') return fixed;

  const market = new MarketPriceProvider({
    ids: MARKET_IDS,
    ...(config.marketBaseUrl ? { baseUrl: config.marketBaseUrl } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
  });

  return new CachedPriceProvider(new FallbackPriceProvider([market, fixed]), {
    ...(config.cacheTtlMs ? { ttlMs: config.cacheTtlMs } : {}),
  });
}
