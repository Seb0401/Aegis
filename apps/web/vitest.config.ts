import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // El mismo alias que usa la aplicación: sin esto, un test de componente no
    // resuelve los imports `@/...`.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  /*
    `postcss.config.mjs` usa el formato de plugins por nombre que entiende Next,
    pero no Vite. Darle a Vite una configuración de PostCSS vacía evita que
    busque ese archivo: los tests no compilan CSS.
  */
  css: { postcss: { plugins: [] } },
  test: {
    /*
      El entorno por defecto es Node, que es lo que necesitan los tests de
      `lib/`. Los de componente piden jsdom con un docblock
      `@vitest-environment jsdom` al principio del archivo: así cada uno dice
      lo que necesita y ninguno paga por el otro.
    */
    /*
      `globals` no es para escribir `describe` sin importarlo —los tests lo
      importan igual—, sino porque Testing Library registra su limpieza entre
      tests enganchándose al `afterEach` global. Sin esto, cada render se
      acumula en el mismo `document` y las consultas encuentran el botón dos
      veces.
    */
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
