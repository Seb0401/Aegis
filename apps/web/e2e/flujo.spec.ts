import { expect, test, type Page } from '@playwright/test';

/**
 * El camino de la demo, de punta a punta y contra la API real (ALL-04).
 *
 * No hay mocks a propósito: lo que estos tests cubren es justo lo que no
 * cubren los unitarios — que el cliente, la API, la política y el Guardian se
 * entienden entre ellos.
 */

const MENSAJE = 'reparte 50 entre mis objetivos y guarda 10 para emergencias';

/** Dirección válida de testnet, solo para comprobar el formulario. */
const DIRECCION_PRUEBA = 'GB77EKQZ4NHWGCBARTOSQEF3PD3QLAVJF7LZS7Y6TC2DUDR7VPQKHUEL';

/**
 * La sesión viene puesta por el proyecto `sesión` (`auth.setup.ts`), así que
 * los tests entran directos. Solo hace falta ir a la pantalla.
 */
async function entrar(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Jupi' })).toBeVisible();
}

test.describe('sesión', () => {
  test('el panel muestra el estado de la cuenta', async ({ page }) => {
    await entrar(page);

    await expect(page.getByText('Saldo disponible')).toBeVisible();
    await expect(page.getByText('Límite diario')).toBeVisible();
  });

  test('al cerrar sesión se vuelve a la pantalla de conexión', async ({ page }) => {
    await entrar(page);

    await page.getByRole('button', { name: /cerrar sesión/i }).click();
    await expect(page.getByRole('button', { name: /conectar freighter/i })).toBeVisible();
  });

  test.describe('sin sesión', () => {
    // Este bloque descarta la sesión guardada a propósito.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('una ruta privada devuelve a la pantalla de conexión', async ({ page }) => {
      await page.goto('/limites');
      await expect(page.getByRole('button', { name: /conectar freighter/i })).toBeVisible();
    });
  });
});

test.describe('propuesta', () => {
  test('el agente propone, el Guardian explica y se puede rechazar', async ({ page }) => {
    await entrar(page);

    await page.getByRole('textbox', { name: /mensaje para el agente/i }).fill(MENSAJE);
    await page.keyboard.press('Enter');

    /*
      Todo se mira dentro de la primera tarjeta pendiente, no en la página
      entera: la base es compartida y puede haber propuestas de otra tanda
      esperando. La nueva es la primera porque la lista viene de la más
      reciente a la más antigua.
    */
    const tarjeta = page.locator('#propuesta-pendiente > div').first();

    // La propuesta llega con su análisis: sin él, no hay nada que aprobar.
    await expect(tarjeta.getByText('Espera tu firma')).toBeVisible({ timeout: 20_000 });
    // Por la región con nombre accesible, no por el texto: «Guardian» aparece
    // también en la nota del pie del propio panel.
    const guardian = tarjeta.getByRole('region', { name: /análisis del guardian/i });
    await expect(guardian).toBeVisible();
    await expect(guardian.getByText(/jupi te lo explica en lenguaje normal/i)).toBeVisible();

    // Los motivos de la política salen con su regla.
    await expect(tarjeta.getByRole('heading', { name: 'Tus límites' })).toBeVisible();
    await expect(tarjeta.getByText('P-01').first()).toBeVisible();

    await tarjeta.getByRole('button', { name: /^rechazar$/i }).click();
    await tarjeta.getByRole('button', { name: /confirmar rechazo/i }).click();

    // Pasa al historial. No se comprueba el «nada pendiente de aprobar»
    // global: la base es compartida y puede haber propuestas de otra tanda
    // esperando, que es estado legítimo y no un fallo de este flujo.
    await expect(page.getByText('Rechazada por ti').first()).toBeVisible({ timeout: 15_000 });
  });

  /**
   * Aprobar exige firmar con Freighter, y una extensión de navegador no se
   * puede conducir desde Playwright sin montarla en el perfil y desbloquearla
   * a mano.
   *
   * Queda escrito para que, cuando BE1 cierre el flujo y haya una cuenta de
   * pruebas con su clave, sea rellenar los pasos y quitar el `fixme`.
   */
  test.fixme('aprobar con firma de la wallet', async ({ page }) => {
    await entrar(page);
    // 1. Pedir la propuesta al agente.
    // 2. Escribir el total si el riesgo es HIGH o CRITICAL.
    // 3. Firmar en Freighter (requiere la extensión cargada en el perfil).
    // 4. Comprobar que pasa a SIGNED → SUBMITTED → CONFIRMED.
  });
});

test.describe('kill switch', () => {
  test('pausa al agente y lo reactiva', async ({ page }) => {
    await entrar(page);

    await page.getByRole('button', { name: /^pausar agente/i }).click();
    await expect(page.getByText('Agente en pausa')).toBeVisible();

    await page.getByRole('button', { name: /^reactivar agente/i }).click();
    await expect(page.getByText('Sistema activo')).toBeVisible();
  });
});

test.describe('destinos', () => {
  test('el alta pide confirmar la dirección antes de registrarla', async ({ page }) => {
    await entrar(page);
    await page.getByRole('link', { name: 'Destinos' }).click();

    await page.getByRole('textbox', { name: /etiqueta/i }).fill('Destino de prueba E2E');

    // Una dirección inválida no deja pasar.
    const direccion = page.getByRole('textbox', { name: /dirección stellar/i });
    await direccion.fill('NOESUNADIRECCION');
    await expect(page.getByRole('button', { name: /continuar/i })).toBeDisabled();

    // Con una válida, el segundo paso la enseña entera antes de guardar.
    await direccion.fill(DIRECCION_PRUEBA);
    await page.getByRole('button', { name: /continuar/i }).click();

    await expect(page.getByText(/comprueba la dirección carácter a carácter/i)).toBeVisible();
    await expect(page.getByRole('definition').filter({ hasText: DIRECCION_PRUEBA })).toBeVisible();

    // No se registra: el test comprueba la barrera, no ensucia la base.
    await page.getByRole('button', { name: /volver a editar/i }).click();
  });
});

test.describe('navegación', () => {
  test('las cuatro secciones cargan y el título de la pestaña cambia', async ({ page }) => {
    await entrar(page);

    for (const [seccion, titulo] of [
      ['Límites', 'Límites y modo · Aegis'],
      ['Destinos', 'Objetivos y contactos · Aegis'],
      ['Historial', 'Historial · Aegis'],
    ] as const) {
      await page.getByRole('link', { name: seccion }).click();
      await expect(page).toHaveTitle(titulo);
    }
  });

  test('una ruta que no existe muestra el 404 con salida', async ({ page }) => {
    await page.goto('/esta-ruta-no-existe');

    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByRole('link', { name: /volver al panel/i })).toBeVisible();
  });
});
