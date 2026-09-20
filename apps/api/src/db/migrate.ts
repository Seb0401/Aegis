import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './client.js';
import { loadEnv } from '../env.js';

/**
 * Aplica las migraciones de `drizzle/`.
 *
 * Se genera con `pnpm db:generate` y se aplica con `pnpm db:migrate`. Las
 * migraciones se revisan en el PR como cualquier otro código: son la parte del
 * sistema más difícil de deshacer.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const database = createDatabase(env.DATABASE_URL);

  await migrate(database.db, { migrationsFolder: 'drizzle' });
  await database.close();

  console.warn('Migraciones aplicadas.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
