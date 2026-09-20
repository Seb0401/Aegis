import { createDatabase } from './db/client.js';
import { loadEnv } from './env.js';
import { buildServer } from './server.js';

/**
 * Arranque del proceso.
 *
 * Todo lo interesante vive en `buildServer`, que los tests usan directamente.
 * Aquí solo queda leer la configuración, abrir la base de datos, escuchar y
 * apagar limpiamente.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const database = createDatabase(env.DATABASE_URL);

  const app = await buildServer({ env, db: database.db });

  // El barrido arranca aquí y no en `buildServer` para que los tests controlen
  // cuándo corre, en vez de tener un temporizador de fondo interfiriendo.
  const sweeper = app.services.sweeper;
  sweeper.start();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Apagando');
    sweeper.stop();
    await app.close();
    await database.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.API_PORT, host: env.API_HOST });

  app.log.info(
    { docs: `http://localhost:${env.API_PORT}/docs`, fakeStellar: env.USE_FAKE_STELLAR },
    'Aegis API lista',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
