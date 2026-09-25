import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Comprueba que la API está viva antes de arrancar.
 *
 * Sin esto, todos los tests fallan a la vez con errores de interfaz que no
 * dicen nada, y se pierde un rato averiguando que lo que faltaba era Postgres.
 */
async function comprobarApi(): Promise<void> {
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
        'Arráncala además con NODE_ENV=test: si no, la suite pasa del límite',
        'de 120 peticiones por minuto y falla con 429 en sitios aleatorios.',
      ].join('\n'),
    );
  }
}

/** Devuelve el contenido del primer fichero que exista, o `undefined`. */
function leerPrimero(rutas: string[]): string | undefined {
  for (const ruta of rutas) {
    try {
      return readFileSync(resolve(process.cwd(), ruta), 'utf8');
    } catch {
      // Se prueba la siguiente.
    }
  }

  return undefined;
}

/**
 * Lee un ajuste del entorno o, si no está, de `.env.local`.
 *
 * Hace falta mirar el fichero porque Next lo carga él solo al arrancar, pero
 * Playwright no: quien tenga bien su `.env.local` vería igualmente el aviso si
 * solo miráramos `process.env`. En CI las variables vienen del entorno del
 * job y el fichero ni existe.
 */
function leerAjuste(nombre: string): string | undefined {
  const delEntorno = process.env[nombre];
  if (delEntorno !== undefined) return delEntorno;

  try {
    // Playwright arranca con el directorio del proyecto como cwd, pero si
    // alguien lo lanza desde la raíz del monorepo también vale.
    const fichero = leerPrimero(['.env.local', 'apps/web/.env.local']);
    if (!fichero) return undefined;

    const linea = fichero
      .split(/\r?\n/)
      .map((texto) => texto.trim())
      .find((texto) => texto.startsWith(`${nombre}=`));

    return linea
      ?.slice(nombre.length + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}

/**
 * Comprueba que el frontend va a dibujar el atajo de "entrar sin wallet".
 *
 * Toda la suite entra por ahí: no hay forma de automatizar la firma de una
 * extensión de navegador. Y `NEXT_PUBLIC_*` se incrusta al compilar, así que
 * si falta, el botón sencillamente no se renderiza y lo que se ve es un
 * `locator.click` agotando 30 segundos contra un botón que no existe. Ese
 * fallo no dice nada; este sí.
 */
function comprobarLoginDeDesarrollo(): void {
  if (leerAjuste('NEXT_PUBLIC_ALLOW_DEV_LOGIN') === 'true') return;

  throw new Error(
    [
      'Falta NEXT_PUBLIC_ALLOW_DEV_LOGIN=true en el frontend.',
      '',
      'Sin ella no se dibuja el botón de "entrar sin wallet", que es por donde',
      'entra toda la suite.',
      '',
      'Copia apps/web/.env.local.example a apps/web/.env.local y reinicia el',
      'servidor de desarrollo: Next lee esas variables al arrancar.',
    ].join('\n'),
  );
}

export default async function globalSetup(): Promise<void> {
  comprobarLoginDeDesarrollo();
  await comprobarApi();
}
