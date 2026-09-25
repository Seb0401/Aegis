import type { PriceProvider, StellarExecutor, StellarReader } from '@aegis/contracts';
import { createPriceProvider } from '@aegis/prices';
import {
  createGatewayAgent,
  createGatewayExplainer,
  createRuleBasedAgent,
  type Agent,
} from '@aegis/agent';
import { HorizonStellarExecutor, HorizonStellarReader } from '@aegis/stellar';
import { FakeStellarExecutor, FakeStellarReader } from '@aegis/stellar/testing';
import type { Database } from './db/client.js';
import type { Env } from './env.js';
import { AuditLog } from './services/audit.js';
import { AuthService } from './services/auth-service.js';
import { DestinationStore } from './services/destination-store.js';
import { PolicyStore } from './services/policy-store.js';
import { ProposalService } from './services/proposal-service.js';
import { ProposalSweeper } from './services/sweeper.js';

/**
 * Cableado de dependencias.
 *
 * Todo se construye en un único sitio y se inyecta hacia abajo. Nada hace `new`
 * de su propia base de datos ni de su propio cliente Stellar, así que los tests
 * pueden sustituir cualquier pieza sin tocar el código de producción.
 */
export interface Services {
  db: Database;
  audit: AuditLog;
  auth: AuthService;
  destinations: DestinationStore;
  policies: PolicyStore;
  proposals: ProposalService;
  reader: StellarReader;
  executor: StellarExecutor;
  agent: Agent;
  sweeper: ProposalSweeper;
  prices: PriceProvider;
}

export interface BuildServicesOptions {
  db: Database;
  env: Env;
  metricsLogger?: (event: string, metrics: object) => void;
  /** Sustituciones para los tests. */
  overrides?: Partial<Pick<Services, 'reader' | 'executor' | 'agent' | 'prices'>>;
}

export function buildServices({
  db,
  env,
  overrides,
  metricsLogger,
}: BuildServicesOptions): Services {
  const reader = overrides?.reader ?? defaultReader(env);
  const executor = overrides?.executor ?? defaultExecutor(env);

  const audit = new AuditLog(db);
  const policies = new PolicyStore(db);
  const destinations = new DestinationStore(db);

  const aiExplainer = env.AI_GATEWAY_API_KEY
    ? createGatewayExplainer({
        apiKey: env.AI_GATEWAY_API_KEY,
        model: env.AGENT_MODEL,
        providerOrder: providerOrder(env.AGENT_PROVIDER_ORDER),
        timeoutMs: env.AGENT_TIMEOUT_MS,
        onMetrics: (metrics) => metricsLogger?.('aegis_explainer_metrics', metrics),
      })
    : undefined;
  const prices = overrides?.prices ?? defaultPriceProvider(env);

  const proposals = new ProposalService({
    db,
    audit,
    policies,
    destinations,
    reader,
    executor,
    prices,
    ...(aiExplainer ? { explain: aiExplainer.explain } : {}),
  });
  const sweeper = new ProposalSweeper({ db, audit, reader });

  return {
    db,
    audit,
    auth: new AuthService(db, env.AUTH_CHALLENGE_TTL_SECONDS),
    destinations,
    policies,
    proposals,
    reader,
    executor,
    sweeper,
    prices,
    agent:
      overrides?.agent ??
      (env.AI_GATEWAY_API_KEY
        ? createGatewayAgent({
            apiKey: env.AI_GATEWAY_API_KEY,
            model: env.AGENT_MODEL,
            fallbackModel: env.AGENT_FALLBACK_MODEL,
            modelProviderOrder: providerOrder(env.AGENT_PROVIDER_ORDER),
            fallbackProviderOrder: providerOrder(env.AGENT_FALLBACK_PROVIDER_ORDER),
            timeoutMs: env.AGENT_TIMEOUT_MS,
            onMetrics: (metrics) => metricsLogger?.('aegis_agent_metrics', metrics),
          })
        : createRuleBasedAgent()),
  };
}

function providerOrder(value: string): string[] {
  return value
    .split(',')
    .map((provider) => provider.trim())
    .filter(Boolean);
}

/**
 * Lectura de la red (M2).
 *
 * Con `USE_FAKE_STELLAR=false` se lee Horizon de verdad: saldos, historial,
 * antigüedad de las cuentas destino y simulación previa. Eso es lo que hace que
 * las señales G-01, G-03, G-06 y G-08 hablen de la realidad y no de un fixture.
 */
function defaultReader(env: Env): StellarReader {
  if (env.USE_FAKE_STELLAR) return new FakeStellarReader();

  return new HorizonStellarReader({ horizonUrl: env.STELLAR_HORIZON_URL });
}

/**
 * Escritura en la red (M2).
 *
 * `loadEnv` ya garantiza que estas dos variables existen cuando el cliente
 * falso está desactivado, así que aquí no hay que volver a comprobarlo.
 */
function defaultExecutor(env: Env): StellarExecutor {
  if (env.USE_FAKE_STELLAR) return new FakeStellarExecutor();

  return new HorizonStellarExecutor({
    horizonUrl: env.STELLAR_HORIZON_URL,
    agentSignerSecret: env.STELLAR_AGENT_SIGNER_SECRET!,
    allowedSourceAccount: env.STELLAR_DEMO_ACCOUNT_ADDRESS!,
    transactionTimeoutSeconds: env.STELLAR_TRANSACTION_TIMEOUT_SECONDS,
  });
}

/**
 * Proveedor de precios de la aplicación.
 *
 * En `market` consulta la API pública con caché y cae a las tasas fijas para lo
 * que no cotiza. En `fixed` no sale a la red, que es lo que quieren los tests y
 * una demo que no dependa de que un tercero esté en pie.
 */
function defaultPriceProvider(env: Env): PriceProvider {
  return createPriceProvider({
    source: env.PRICE_SOURCE,
    fixedPrices: {
      USDC_TEST: env.PRICE_USDC_TEST_USD,
      ...(env.PRICE_XLM_USD ? { XLM: env.PRICE_XLM_USD } : {}),
    },
    cacheTtlMs: env.PRICE_CACHE_TTL_SECONDS * 1000,
    timeoutMs: env.PRICE_TIMEOUT_MS,
    ...(env.MARKET_PRICE_BASE_URL ? { marketBaseUrl: env.MARKET_PRICE_BASE_URL } : {}),
  });
}
