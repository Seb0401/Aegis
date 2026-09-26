// @ts-check
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

/**
 * Rehace las capturas del README.
 *
 * Existe para que las capturas no envejezcan en silencio: cuando la interfaz
 * cambie, esto se vuelve a ejecutar y ya está, en vez de recortar ventanas a
 * mano y acabar enseñando una versión que ya no existe.
 *
 * Necesita la pila levantada igual que los E2E (Postgres, API y `pnpm dev:web`)
 * y entra por el atajo de desarrollo, así que hace falta
 * `NEXT_PUBLIC_ALLOW_DEV_LOGIN=true` en `apps/web/.env.local`.
 *
 *   node scripts/capturas.mjs
 */

const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const MENSAJE = 'reparte 50 entre mis objetivos y guarda 10 para emergencias';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DESTINO = resolve(RAIZ, 'docs/images');

/**
 * Deja la cuenta sin propuestas pendientes.
 *
 * Las capturas salen de la misma base que usa el equipo, así que sin esto
 * aparecería lo que dejó la última tanda de tests en vez de lo que acabamos de
 * pedir.
 */
async function limpiarPendientes(page) {
  const raw = await page.evaluate(() => window.localStorage.getItem('aegis.session'));
  if (!raw) throw new Error('No hay sesión: ¿falló el login de desarrollo?');

  const { token } = JSON.parse(raw);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const listado = await fetch(`${API}/proposals?limit=100`, { headers });
  const { proposals } = await listado.json();

  for (const propuesta of proposals.filter((p) => p.status === 'PENDING_USER')) {
    await fetch(`${API}/proposals/${propuesta.id}/reject`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Limpieza previa de las capturas' }),
    });
  }
}

async function capturar(page, nombre, opciones = {}) {
  const ruta = resolve(DESTINO, `${nombre}.png`);
  await page.screenshot({ path: ruta, ...opciones });
  console.log(`  ✓ ${nombre}.png`);
}

async function main() {
  await mkdir(DESTINO, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome' });

  // `deviceScaleFactor: 2` para que el texto no salga borroso en el README.
  const escritorio = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'es-ES',
  });

  const page = await escritorio.newPage();

  console.log('Entrando…');
  await page.goto(WEB);
  await page.getByRole('button', { name: /entrar sin wallet/i }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('heading', { name: 'Jupi' }).waitFor();

  await limpiarPendientes(page);
  await page.reload();
  await page.getByRole('heading', { name: 'Jupi' }).waitFor();

  console.log('Capturando…');
  await capturar(page, 'panel');

  console.log('Pidiendo la propuesta al agente…');
  await page.getByRole('textbox', { name: /mensaje para el agente/i }).fill(MENSAJE);
  await page.keyboard.press('Enter');

  const tarjeta = page.locator('#propuesta-pendiente > div').first();
  await tarjeta.getByText('Espera tu firma').waitFor({ timeout: 30_000 });
  // Las animaciones de entrada dejarían la tarjeta a medio opacar.
  await page.waitForTimeout(600);

  await capturar(page, 'propuesta');
  await capturar(page, 'propuesta-detalle', { clip: await recorte(tarjeta) });

  for (const [nombre, ruta] of [
    ['limites', '/limites'],
    ['destinos', '/destinos'],
    ['historial', '/historial'],
  ]) {
    await page.goto(`${WEB}${ruta}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    await capturar(page, nombre);
  }

  // Móvil: la navegación cambia entera, y es la mitad de la nota de diseño.
  const movil = await browser.newContext({
    ...devices['Pixel 7'],
    deviceScaleFactor: 2,
    locale: 'es-ES',
    storageState: await escritorio.storageState(),
  });
  const pequeña = await movil.newPage();
  await pequeña.goto(`${WEB}/dashboard`);
  await pequeña.getByRole('heading', { name: 'Jupi' }).waitFor();
  await pequeña.waitForTimeout(400);
  await capturar(pequeña, 'movil');

  await browser.close();
  console.log(`\nListo. En ${DESTINO}`);
}

/** Recorta con un margen, para que la tarjeta no salga pegada al borde. */
async function recorte(locator, margen = 12) {
  const caja = await locator.boundingBox();
  if (!caja) throw new Error('No se pudo medir la tarjeta');

  return {
    x: Math.max(0, caja.x - margen),
    y: Math.max(0, caja.y - margen),
    width: caja.width + margen * 2,
    height: caja.height + margen * 2,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
