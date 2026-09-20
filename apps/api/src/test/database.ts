import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema.js';

/**
 * Base de datos efímera por fichero de test.
 *
 * Cada suite crea su propia base de datos, le aplica las migraciones reales y
 * la destruye al terminar. Así los tests no se pisan entre sí y, sobre todo,
 * corren contra **Postgres de verdad**: los `jsonb`, el `bigserial` de la
 * bitácora y los índices únicos se comportan como en producción, que es
 * justo donde un emulador nos daría verde y luego fallaría.
 */

const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/**
 * Conexión de administración: se usa solo para crear y borrar bases de datos.
 * `TEST_DATABASE_URL` permite apuntar a otro puerto (en algunas máquinas el
 * 5432 ya está ocupado por otro proyecto).
 */
function adminUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://aegis:aegis@localhost:5432/aegis'
  );
}

function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

export interface TestDatabase {
  db: Database;
  url: string;
  name: string;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `aegis_test_${randomBytes(6).toString('hex')}`;
  const base = adminUrl();
  const admin = postgres(base, { max: 1, onnotice: () => {} });

  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await admin.end({ timeout: 5 });
    throw new Error(
      [
        'No se pudo crear la base de datos de test.',
        '',
        `Intenté conectar a: ${base.replace(/:[^:@/]*@/, ':***@')}`,
        '',
        'Comprueba que Postgres está levantado:',
        '  pnpm db:up',
        '',
        'Si tu Postgres no está en el 5432, exporta TEST_DATABASE_URL o ponlo en el .env:',
        '  TEST_DATABASE_URL=postgresql://aegis:aegis@localhost:5433/aegis',
        '',
        `Causa original: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'),
    );
  } finally {
    await admin.end({ timeout: 5 }).catch(() => {});
  }

  const url = withDatabaseName(base, name);
  const client = postgres(url, { max: 4, onnotice: () => {} });
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return {
    db,
    url,
    name,
    close: async () => {
      await client.end({ timeout: 5 });

      const cleanup = postgres(base, { max: 1, onnotice: () => {} });
      try {
        // WITH (FORCE) corta las conexiones que hayan quedado colgando: sin
        // esto, un test que no cierre su pool deja la base de datos huérfana.
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end({ timeout: 5 }).catch(() => {});
      }
    },
  };
}
