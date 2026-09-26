// @ts-check
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * Genera los PNG del logo a partir del SVG y de la tipografía de la interfaz.
 *
 * El PNG se renderiza con Chrome en vez de escribirse a mano porque la parte
 * con el nombre necesita la fuente real de la aplicación (Space Grotesk). Se
 * incrusta en base64 para que el resultado no dependa de que la fuente esté
 * instalada en la máquina de quien lo ejecute.
 *
 *   node scripts/logo.mjs
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const IMAGENES = resolve(AQUI, '../../../docs/images');
const FUENTE = resolve(AQUI, '../public/fonts/space-grotesk-latin.woff2');

const FONDO = '#0a1430';
const AZUL = '#2563eb';
const TEXTO = '#f8fafc';

/** El escudo de la barra lateral, que es la marca que ya usa el producto. */
const ESCUDO = `
  <g fill="none" stroke="${AZUL}" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
    <path d="m9 12 2 2 4-4"/>
  </g>`;

async function paginaHtml(fuenteBase64) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Space Grotesk';
    src: url(data:font/woff2;base64,${fuenteBase64}) format('woff2');
    font-weight: 400 700;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; }

  .lienzo {
    display: flex; align-items: center; justify-content: center;
    background: ${FONDO};
  }
  #horizontal { width: 1200px; height: 400px; gap: 40px; }
  #cuadrado  { width: 512px; height: 512px; }

  .marca {
    display: flex; align-items: center; justify-content: center;
    background: rgb(37 99 235 / 0.15);
  }
  #horizontal .marca { width: 176px; height: 176px; border-radius: 44px; }
  #cuadrado  .marca { width: 320px; height: 320px; border-radius: 80px; }

  .nombre {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 600; font-size: 132px; letter-spacing: -0.03em;
    color: ${TEXTO}; line-height: 1;
  }
  .lema {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 30px; color: rgb(248 250 252 / 0.62);
    letter-spacing: 0.01em; margin-top: 14px;
  }
</style></head><body>

<div class="lienzo" id="horizontal">
  <div class="marca">
    <svg width="104" height="104" viewBox="0 0 24 24">${ESCUDO}</svg>
  </div>
  <div>
    <div class="nombre">Aegis</div>
    <div class="lema">Tu dinero, con inteligencia</div>
  </div>
</div>

<div class="lienzo" id="cuadrado">
  <div class="marca">
    <svg width="190" height="190" viewBox="0 0 24 24">${ESCUDO}</svg>
  </div>
</div>

</body></html>`;
}

async function main() {
  const fuenteBase64 = (await readFile(FUENTE)).toString('base64');
  const html = await paginaHtml(fuenteBase64);

  // Se guarda al lado de las imágenes por si alguien quiere retocarlo.
  await writeFile(resolve(IMAGENES, '.logo.html'), html, 'utf8');

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);

  for (const [id, nombre] of [
    ['horizontal', 'logo.png'],
    ['cuadrado', 'logo-cuadrado.png'],
  ]) {
    await page.locator(`#${id}`).screenshot({ path: resolve(IMAGENES, nombre) });
    console.log(`  ✓ ${nombre}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
