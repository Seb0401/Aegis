import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDatabase } from './db/client.js';
import { loadEnv } from './env.js';
import { buildServer } from './server.js';

/**
 * Exporta el OpenAPI a `docs/api/openapi.json`.
 *
 * Es lo que necesita FE-02 para levantar el mock server (Prism/MSW) sin que la
 * API real esté corriendo. La CI lo regenera y falla si el archivo del repo no
 * coincide, así que el contrato publicado nunca se queda atrás.
 *
 * No abre ninguna conexión: `postgres.js` conecta de forma perezosa y aquí no
 * se ejecuta ninguna consulta.
 */
async function main(): Promise<void> {
  const env = loadEnv({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://aegis:aegis@localhost:5432/aegis',
    JWT_SECRET: process.env.JWT_SECRET ?? 'solo-para-generar-el-openapi-no-es-un-secreto-real',
    NODE_ENV: 'development',
  });

  const database = createDatabase(env.DATABASE_URL);
  const app = await buildServer({ env, db: database.db });

  await app.ready();
  const spec = app.swagger();

  const target = resolve(process.cwd(), '../../docs/api/openapi.json');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

  await app.close();
  await database.close();

  console.warn(`OpenAPI escrito en ${target}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
