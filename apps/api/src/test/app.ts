import type { CreateDestinationRequest, Destination, Proposal } from '@aegis/contracts';
import type { FastifyInstance } from 'fastify';
import { type buildServices } from '../container.js';
import type { Database } from '../db/client.js';
import { loadEnv } from '../env.js';
import { buildServer } from '../server.js';
import { createTestDatabase, type TestDatabase } from './database.js';

/**
 * Aplicación de test lista para usar: base de datos propia, cliente Stellar
 * falso y sesión abierta.
 *
 * Se usa `app.inject()` en vez de levantar un puerto: es más rápido, no hay
 * carreras de puertos entre suites y ejercita exactamente los mismos plugins,
 * validadores y manejador de errores que en producción.
 */

export interface TestApp {
  app: FastifyInstance;
  db: Database;
  close(): Promise<void>;
}

export interface CreateTestAppOptions {
  overrides?: Parameters<typeof buildServices>[0]['overrides'];
}

export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  const database: TestDatabase = await createTestDatabase();

  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: database.url,
    JWT_SECRET: 'secreto-de-test-suficientemente-largo-para-pasar-la-validacion',
    ALLOW_DEV_LOGIN: 'true',
    USE_FAKE_STELLAR: 'true',
    // Ventana corta para que los tests de caducidad no tengan que esperar.
    AUTH_CHALLENGE_TTL_SECONDS: '300',
  });

  const app = await buildServer({
    env,
    db: database.db,
    ...(options.overrides ? { overrides: options.overrides } : {}),
  });

  await app.ready();

  return {
    app,
    db: database.db,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

/** Cabecera de autorización para una dirección, entrando por el login de desarrollo. */
export async function login(
  app: FastifyInstance,
  address: string,
): Promise<{ headers: { authorization: string }; userId: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/dev-login',
    payload: { address },
  });

  if (response.statusCode !== 200) {
    throw new Error(`El login de test falló (${response.statusCode}): ${response.body}`);
  }

  const body = JSON.parse(response.body) as { token: string; user: { id: string } };

  return {
    headers: { authorization: `Bearer ${body.token}` },
    userId: body.user.id,
  };
}

export async function createDestination(
  app: FastifyInstance,
  headers: { authorization: string },
  input: CreateDestinationRequest,
): Promise<Destination> {
  const response = await app.inject({
    method: 'POST',
    url: '/destinations',
    headers,
    payload: input,
  });

  if (response.statusCode !== 201) {
    throw new Error(`No se pudo crear el destino (${response.statusCode}): ${response.body}`);
  }

  return (JSON.parse(response.body) as { destination: Destination }).destination;
}

export async function getProposal(
  app: FastifyInstance,
  headers: { authorization: string },
  id: string,
): Promise<Proposal> {
  const response = await app.inject({ method: 'GET', url: `/proposals/${id}`, headers });
  return (JSON.parse(response.body) as { proposal: Proposal }).proposal;
}

/** Atajo para cambiar la política sin repetir el `inject` en cada test. */
export async function setPolicy(
  app: FastifyInstance,
  headers: { authorization: string },
  patch: Record<string, unknown>,
): Promise<void> {
  const response = await app.inject({ method: 'PUT', url: '/policy', headers, payload: patch });

  if (response.statusCode !== 200) {
    throw new Error(`No se pudo actualizar la política (${response.statusCode}): ${response.body}`);
  }
}
