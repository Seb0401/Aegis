import { expect, test } from '@playwright/test';

/**
 * Lo que solo existe en móvil: la barra inferior y el chat en hoja.
 *
 * Corre en un Pixel 7 emulado (ver `playwright.config.ts`), porque estas
 * comprobaciones no tienen sentido a 1440px: ahí los elementos ni se montan.
 */

test.describe('navegación móvil', () => {
  test.beforeEach(async ({ page }) => {
    // La sesión la deja puesta el proyecto `sesión` (`auth.setup.ts`).
    await page.goto('/dashboard');
  });

  test('la cabecera se queda solo con el título', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hola');

    // El subtítulo y los controles bajan o desaparecen: ocupaban media pantalla.
    await expect(page.getByText(/tu agente de ia ya está listo/i)).toBeHidden();
  });

  test('las cuatro secciones están abajo y el agente en el centro', async ({ page }) => {
    const barra = page.getByRole('navigation', { name: 'Secciones' });

    for (const seccion of ['Panel', 'Límites', 'Destinos', 'Historial']) {
      await expect(barra.getByRole('link', { name: seccion })).toBeVisible();
    }

    await expect(page.getByRole('button', { name: /abrir el chat con el agente/i })).toBeVisible();
  });

  test('el botón central abre el chat y se cierra con Escape', async ({ page }) => {
    await page.getByRole('button', { name: /abrir el chat con el agente/i }).click();

    const hoja = page.getByRole('dialog', { name: /chat con el agente/i });
    await expect(hoja).toBeVisible();

    // El foco entra en la hoja, no se queda en la página de debajo.
    await expect(hoja.getByRole('textbox', { name: /mensaje para el agente/i })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(hoja).toBeHidden();
  });

  test('el kill switch sigue a un toque, en la tarjeta de Jupi', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^pausar agente/i })).toBeVisible();
  });

  test('la conversación no se pierde al cerrar y abrir la hoja', async ({ page }) => {
    const abrir = page.getByRole('button', { name: /abrir el chat con el agente/i });
    // Se mira dentro del diálogo: el panel de la columna de escritorio también
    // está montado (oculto por CSS) y pinta los mismos mensajes, porque los dos
    // leen la misma conversación de `ChatProvider`.
    const hoja = page.getByRole('dialog', { name: /chat con el agente/i });

    await abrir.click();
    await hoja.getByRole('textbox', { name: /mensaje para el agente/i }).fill('¿cuánto tengo?');
    await page.keyboard.press('Enter');

    await expect(hoja.getByText('¿cuánto tengo?')).toBeVisible();
    await page.keyboard.press('Escape');

    await abrir.click();
    await expect(hoja.getByText('¿cuánto tengo?')).toBeVisible();
  });
});
