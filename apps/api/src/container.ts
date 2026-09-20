import type { StellarExecutor, StellarReader } from '@aegis/contracts';
import { createRuleBasedAgent, type Agent } from '@aegis/agent';
import { NotImplementedStellarExecutor, NotImplementedStellarReader } from '@aegis/stellar';
import { FakeStellarExecutor, FakeStellarReader } from '@aegis/stellar/testing';
import type { Database } from './db/client.js';
import type { Env } from './env.js';
import { AuditLog } from './services/audit.js';
import { AuthService } from './services/auth-service.js';
import { DestinationStore } from './services/destination-store.js';
import { PolicyStore } from './services/policy-store.js';
import { ProposalService } from './services/proposal-service.js';

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
}

export interface BuildServicesOptions {
  db: Database;
  env: Env;
  /** Sustituciones para los tests. */
  overrides?: Partial<Pick<Services, 'reader' | 'executor' | 'agent'>>;
}

export function buildServices({ db, env, overrides }: BuildServicesOptions): Services {
  const reader = overrides?.reader ?? defaultReader(env);
  const executor = overrides?.executor ?? defaultExecutor(env);

  const audit = new AuditLog(db);
  const policies = new PolicyStore(db);
  const destinations = new DestinationStore(db);

  const proposals = new ProposalService({ db, audit, policies, destinations, reader, executor });

  return {
    db,
    audit,
    auth: new AuthService(db, env.AUTH_CHALLENGE_TTL_SECONDS),
    destinations,
    policies,
    proposals,
    reader,
    executor,
    // Sustituto temporal hasta que AI entregue el agente con tool calling (AI-01).
    agent: overrides?.agent ?? createRuleBasedAgent(),
  };
}

function defaultReader(env: Env): StellarReader {
  return env.USE_FAKE_STELLAR ? new FakeStellarReader() : new NotImplementedStellarReader();
}

function defaultExecutor(env: Env): StellarExecutor {
  return env.USE_FAKE_STELLAR ? new FakeStellarExecutor() : new NotImplementedStellarExecutor();
}
