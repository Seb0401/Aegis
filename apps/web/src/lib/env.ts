/**
 * Configuración del cliente.
 *
 * Todo lo que empieza por `NEXT_PUBLIC_` se incrusta en el bundle del
 * navegador en tiempo de compilación: aquí no puede haber ningún secreto.
 * La clave del signer del agente vive solo en la API (principio nº 3).
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Muestra el atajo de "entrar sin wallet". La API lo vuelve a comprobar con su
 * propio `ALLOW_DEV_LOGIN`, así que esto solo decide si se ve el botón.
 */
export const ALLOW_DEV_LOGIN = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === 'true';

/** Dirección que usa el atajo de desarrollo (la del seed de la API). */
export const DEV_ADDRESS =
  process.env.NEXT_PUBLIC_DEV_ADDRESS ?? 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';
