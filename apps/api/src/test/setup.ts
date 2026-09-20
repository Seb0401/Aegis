/**
 * Preparación global de los tests.
 *
 * Carga el `.env` de la raíz si existe, para que `TEST_DATABASE_URL` funcione
 * sin tener que exportarla a mano en cada terminal. En CI no hay `.env` y las
 * variables llegan del entorno, así que el fallo se ignora a propósito.
 */
import { resolve } from 'node:path';

try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
} catch {
  // No hay .env: es lo normal en CI.
}
