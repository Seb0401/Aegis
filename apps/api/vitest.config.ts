import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // Crear una base de datos y aplicarle las migraciones tarda más que un
    // test unitario normal; el timeout por defecto de 5 s se queda corto.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
