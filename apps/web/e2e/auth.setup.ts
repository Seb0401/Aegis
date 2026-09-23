import { expect, test as setup } from '@playwright/test';

/**
 * Entra una sola vez y guarda la sesión para el resto de la tanda.
 *
 * No es solo por velocidad: `/auth/*` está limitado a **10 peticiones por
 * minuto y por IP** (`RATE_LIMITS.auth`), así que una suite que hiciera login
 * en cada test se autobloquearía con 429 a mitad de camino. Reutilizar la
 * sesión es además lo que hace un usuario real: entra una vez.
 */
export const ARCHIVO_SESION = 'e2e/.auth/usuario.json';

setup('autenticar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /entrar sin wallet/i }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { name: 'Jupi' })).toBeVisible();

  // La sesión vive en localStorage, y `storageState` lo guarda con el resto.
  await page.context().storageState({ path: ARCHIVO_SESION });
});
