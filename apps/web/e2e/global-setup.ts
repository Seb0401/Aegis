const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Comprueba que la API está viva antes de arrancar.
 *
 * Sin esto, todos los tests fallan a la vez con errores de interfaz que no
 * dicen nada, y se pierde un rato averiguando que lo que faltaba era Postgres.
 */
export default async function globalSetup(): Promise<void> {
  try {
    const response = await fetch(`${API}/health`);
    if (!response.ok) throw new Error(`respondió ${response.status}`);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      [
        `La API no responde en ${API} (${detail}).`,
        '',
        'Los E2E prueban el flujo real, así que necesitan la pila levantada:',
        '  1. $env:POSTGRES_PORT = "5433"; pnpm db:up',
        '  2. exporta las variables del .env y lanza  pnpm dev:api',
        '',
        'Y con ALLOW_DEV_LOGIN=true, que es como entran estos tests.',
      ].join('\n'),
    );
  }
}
