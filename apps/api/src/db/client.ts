import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  close(): Promise<void>;
}

/**
 * Abre la conexión a Postgres.
 *
 * `max: 10` es suficiente para la demo; si se añade una cola de trabajos
 * (BE2-Q2) habrá que revisarlo.
 */
export function createDatabase(databaseUrl: string): DatabaseHandle {
  const client = postgres(databaseUrl, {
    max: 10,
    // Los errores de conexión deben verse, no quedarse colgados para siempre.
    connect_timeout: 10,
    onnotice: () => {},
  });

  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}
