import { defineConfig, devices } from '@playwright/test';

const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * End-to-end del flujo de la demo (ALL-04, parte de frontend).
 *
 * Usa el **Chrome ya instalado** (`channel: 'chrome'`) en vez de descargar los
 * navegadores de Playwright: son ~150 MB y en esta red las descargas grandes
 * no siempre llegan. Si prefieres los navegadores propios de Playwright,
 * `pnpm exec playwright install chromium` y quita el `channel`.
 *
 * Estos tests necesitan la **API y Postgres levantados**: prueban el flujo
 * real, no una simulación. `e2e/global-setup.ts` lo comprueba antes de
 * empezar y falla diciendo qué falta.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // En CI nadie mira la pantalla: si algo es inestable, que se vea.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: WEB,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },

  projects: [
    // Entra una vez y deja la sesión guardada: `/auth/*` admite 10 peticiones
    // por minuto, y una suite que hiciera login en cada test se bloquearía
    // sola con 429 a mitad de camino.
    { name: 'sesión', testMatch: /auth\.setup\.ts/, use: { channel: 'chrome' } },
    {
      name: 'escritorio',
      dependencies: ['sesión'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: 'e2e/.auth/usuario.json',
      },
      // Lo de móvil no se prueba a 1280px: ahí esos elementos ni se montan.
      testIgnore: /movil\.spec\.ts/,
    },
    {
      name: 'movil',
      dependencies: ['sesión'],
      use: {
        ...devices['Pixel 7'],
        channel: 'chrome',
        storageState: 'e2e/.auth/usuario.json',
      },
      testMatch: /movil\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: WEB,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
  },
});
