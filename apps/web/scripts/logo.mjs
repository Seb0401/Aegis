// @ts-check
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * Deriva todas las piezas del logo a partir del original.
 *
 * El original (`images/logo-original.png`) viene exportado **sin canal alfa y
 * con el damero de transparencia pintado encima**: los píxeles del fondo son
 * literalmente cuadros de gris 241 y blanco 254. Puesto tal cual sobre el azul
 * oscuro de la aplicación se vería un recuadro a cuadros, así que aquí se
 * recorta ese fondo de verdad.
 *
 * No vale con "borrar lo claro": la marca de verificación del escudo es blanca.
 * Por eso el fondo se busca **desde los bordes hacia dentro**, y lo que queda
 * encerrado por el dibujo se conserva.
 *
 *   node scripts/logo.mjs
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../..');
const ORIGINAL = resolve(RAIZ, 'images/logo-original.png');
const DOCS = resolve(RAIZ, 'docs/images');
const PUBLICO = resolve(AQUI, '../public');
const APP = resolve(AQUI, '../src/app');

/** Fondo de la aplicación, para las versiones con tarjeta. */
const FONDO = '#0a1430';

async function main() {
  await mkdir(DOCS, { recursive: true });

  const base64 = (await readFile(ORIGINAL)).toString('base64');
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent('<body style="margin:0"><canvas id="c"></canvas></body>');

  const piezas = await page.evaluate(recortar, base64);

  console.log(`  símbolo: ${piezas.marca.ancho}x${piezas.marca.alto}`);
  console.log(`  completo: ${piezas.completo.ancho}x${piezas.completo.alto}`);

  await escribir(resolve(DOCS, 'logo-marca.png'), piezas.marca.dataUrl);
  await escribir(resolve(DOCS, 'logo.png'), piezas.completo.dataUrl);
  await escribir(resolve(PUBLICO, 'logo.png'), piezas.marca.dataUrl);

  // Versiones sobre tarjeta: para el icono de la aplicación y para cualquier
  // sitio que pida un cuadrado. El símbolo es azul oscuro sobre transparente,
  // así que sobre un fondo oscuro necesita una tarjeta clara detrás.
  for (const [nombre, lado, radio, destino] of [
    ['logo-cuadrado.png', 1024, 232, DOCS],
    ['icon-512.png', 512, 116, PUBLICO],
    ['icon-192.png', 192, 44, PUBLICO],
    // Next sirve estos dos por convención de nombre desde `src/app`.
    ['icon.png', 512, 116, APP],
    ['apple-icon.png', 180, 40, APP],
  ]) {
    const dataUrl = await page.evaluate(tarjeta, {
      marca: piezas.marca.dataUrl,
      lado,
      radio,
      fondo: FONDO,
    });
    await escribir(resolve(destino, nombre), dataUrl);
    console.log(`  ✓ ${nombre}`);
  }

  const social = await page.evaluate(tarjetaSocial, {
    completo: piezas.completo.dataUrl,
    fondo: FONDO,
  });
  await escribir(resolve(APP, 'opengraph-image.png'), social);
  console.log('  ✓ opengraph-image.png');

  await browser.close();
  console.log(`\nListo. En ${DOCS}, ${PUBLICO} y ${APP}`);
}

async function escribir(ruta, dataUrl) {
  await writeFile(ruta, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

/**
 * Corre en el navegador: quita el fondo y devuelve las dos piezas recortadas.
 *
 * Se ejecuta ahí porque `canvas` da acceso a los píxeles sin añadir ninguna
 * dependencia de imagen al monorepo, y Chrome ya está instalado para los E2E.
 */
function recortar(datos) {
  return (async () => {
    const img = new Image();
    img.src = `data:image/png;base64,${datos}`;
    await img.decode();

    const { width: W, height: H } = img;
    const lienzo = document.getElementById('c');
    lienzo.width = W;
    lienzo.height = H;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const imagen = ctx.getImageData(0, 0, W, H);
    const px = imagen.data;

    /** Claro y sin color: el damero y el blanco del papel. */
    const esFondo = (i) => {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      return r > 224 && g > 224 && b > 224 && Math.max(r, g, b) - Math.min(r, g, b) < 14;
    };

    // Relleno por inundación desde los bordes. Lo que el dibujo encierra —el
    // blanco de la marca de verificación— no se toca porque no se alcanza.
    const fondo = new Uint8Array(W * H);
    const pila = [];
    for (let x = 0; x < W; x++) {
      pila.push(x, x + (H - 1) * W);
    }
    for (let y = 0; y < H; y++) {
      pila.push(y * W, W - 1 + y * W);
    }

    while (pila.length) {
      const p = pila.pop();
      if (fondo[p]) continue;
      if (!esFondo(p * 4)) continue;
      fondo[p] = 1;

      const x = p % W;
      const y = (p - x) / W;
      if (x > 0) pila.push(p - 1);
      if (x < W - 1) pila.push(p + 1);
      if (y > 0) pila.push(p - W);
      if (y < H - 1) pila.push(p + W);
    }

    // El borde del dibujo viene mezclado con el fondo (antialias). Si se deja
    // opaco, la marca queda con una orla clara que canta sobre el azul oscuro.
    // A esos píxeles se les da transparencia según lo claros que sean, y se
    // les quita la parte de fondo que llevan mezclada.
    const FONDO_MEDIO = 247;
    const UMBRAL = 224;

    const tocaFondo = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (fondo[ny * W + nx]) return true;
        }
      }
      return false;
    };

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        const i = p * 4;

        if (fondo[p]) {
          px[i + 3] = 0;
          continue;
        }

        if (!tocaFondo(x, y)) continue;

        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum <= UMBRAL) continue;

        const alfa = Math.max(0, Math.min(1, (FONDO_MEDIO - lum) / (FONDO_MEDIO - UMBRAL)));
        if (alfa <= 0) {
          px[i + 3] = 0;
          continue;
        }

        // C = a·F + (1-a)·B  →  F = (C - (1-a)·B) / a
        for (let k = 0; k < 3; k++) {
          const v = (px[i + k] - (1 - alfa) * FONDO_MEDIO) / alfa;
          px[i + k] = Math.max(0, Math.min(255, Math.round(v)));
        }
        px[i + 3] = Math.round(alfa * 255);
      }
    }

    ctx.putImageData(imagen, 0, 0);

    /** Caja ajustada de una franja, mirando solo lo que tiene opacidad. */
    const caja = (desdeY, hastaY) => {
      let minX = W;
      let minY = H;
      let maxX = -1;
      let maxY = -1;
      for (let y = desdeY; y < hastaY; y++) {
        for (let x = 0; x < W; x++) {
          if (px[(y * W + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { minX, minY, maxX, maxY };
    };

    // La franja vacía que separa el símbolo de las letras.
    let corte = H - 1;
    let vacias = 0;
    for (let y = Math.floor(H * 0.55); y < Math.floor(H * 0.8); y++) {
      let tinta = 0;
      for (let x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] > 8) tinta++;
      }
      if (tinta === 0) {
        vacias++;
        if (vacias > 6) {
          corte = y;
          break;
        }
      } else {
        vacias = 0;
      }
    }

    const sacar = ({ minX, minY, maxX, maxY }, margen) => {
      const ancho = maxX - minX + 1 + margen * 2;
      const alto = maxY - minY + 1 + margen * 2;
      const fuera = document.createElement('canvas');
      fuera.width = ancho;
      fuera.height = alto;
      fuera
        .getContext('2d')
        .drawImage(lienzo, minX, minY, maxX - minX + 1, maxY - minY + 1, margen, margen, maxX - minX + 1, maxY - minY + 1);
      return { dataUrl: fuera.toDataURL('image/png'), ancho, alto };
    };

    return {
      marca: sacar(caja(0, corte), 8),
      completo: sacar(caja(0, H), 8),
    };
  })();
}

/** Compone el símbolo centrado sobre una tarjeta redondeada. */
function tarjeta({ marca, lado, radio, fondo }) {
  return (async () => {
    const img = new Image();
    img.src = marca;
    await img.decode();

    const c = document.createElement('canvas');
    c.width = lado;
    c.height = lado;
    const ctx = c.getContext('2d');

    ctx.fillStyle = fondo;
    ctx.beginPath();
    ctx.roundRect(0, 0, lado, lado, radio);
    ctx.fill();

    // El símbolo es azul oscuro: sobre el fondo de la aplicación necesita una
    // superficie clara detrás o no se ve.
    const margen = lado * 0.13;
    const interior = lado - margen * 2;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(margen, margen, interior, interior, radio * 0.62);
    ctx.fill();

    const hueco = interior * 0.82;
    const escala = Math.min(hueco / img.width, hueco / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);

    return c.toDataURL('image/png');
  })();
}

/**
 * La imagen que se ve al compartir un enlace (1200x630).
 *
 * Esta sí lleva las letras: quien la ve no tiene alrededor la interfaz que le
 * diga de qué producto se trata.
 */
function tarjetaSocial({ completo, fondo }) {
  return (async () => {
    const img = new Image();
    img.src = completo;
    await img.decode();

    const W = 1200;
    const H = 630;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, W, H);

    const placa = { x: 380, y: 88, w: 440, h: 440, r: 100 };
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(placa.x, placa.y, placa.w, placa.h, placa.r);
    ctx.fill();

    const hueco = placa.w * 0.74;
    const escala = Math.min(hueco / img.width, hueco / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, placa.x + (placa.w - w) / 2, placa.y + (placa.h - h) / 2, w, h);

    ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
    ctx.font = '500 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tu dinero, con inteligencia', W / 2, 578);

    return c.toDataURL('image/png');
  })();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
