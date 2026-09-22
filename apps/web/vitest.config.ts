import { defineConfig } from 'vitest/config';

export default defineConfig({
  /*
    `postcss.config.mjs` usa el formato de plugins por nombre que entiende Next,
    pero no Vite. Darle a Vite una configuración de PostCSS vacía evita que
    busque ese archivo: los tests no compilan CSS.
  */
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
