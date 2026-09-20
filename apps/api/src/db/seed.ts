import { DEFAULT_POLICY_CONFIG, DEMO_USER_ADDRESS, FIXTURE_DESTINATIONS } from '@aegis/contracts';
import { eq } from 'drizzle-orm';
import { loadEnv } from '../env.js';
import { newDestinationId, newUserId } from '../lib/ids.js';
import { createDatabase } from './client.js';
import { destinations, policies, users } from './schema.js';

/**
 * Datos de demo.
 *
 * Crea el usuario de prueba con sus tres objetivos y su fondo de emergencia, que
 * es exactamente el escenario del ejemplo de referencia (§1.4 del PLAN). Es
 * idempotente: se puede ejecutar tantas veces como haga falta.
 */
const DEMO_ADDRESS = DEMO_USER_ADDRESS;

async function main(): Promise<void> {
  const env = loadEnv();
  const database = createDatabase(env.DATABASE_URL);
  const { db } = database;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.address, DEMO_ADDRESS))
    .limit(1);

  const userId = existing?.id ?? newUserId();

  if (!existing) {
    await db.insert(users).values({ id: userId, address: DEMO_ADDRESS });
  }

  await db
    .insert(policies)
    .values({ userId, config: DEFAULT_POLICY_CONFIG })
    .onConflictDoNothing({ target: policies.userId });

  for (const fixture of FIXTURE_DESTINATIONS) {
    await db
      .insert(destinations)
      .values({
        id: newDestinationId(),
        userId,
        kind: fixture.kind,
        label: fixture.label,
        address: fixture.address,
        targetAmount: fixture.targetAmount,
        targetAsset: fixture.targetAsset,
        trusted: fixture.trusted,
        blocked: fixture.blocked,
      })
      .onConflictDoNothing();
  }

  await database.close();

  console.warn(`Datos de demo listos. Usuario ${userId} · dirección ${DEMO_ADDRESS}`);
  console.warn('Inicia sesión con POST /auth/dev-login { "address": "' + DEMO_ADDRESS + '" }');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
