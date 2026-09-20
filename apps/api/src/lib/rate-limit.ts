import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';

/**
 * Límites de uso por ruta (BE2-11).
 *
 * El límite global por IP es una red de seguridad contra el ruido, pero no
 * sirve para lo que de verdad importa aquí:
 *
 *  - `/auth/*` se ataca desde muchas IPs y con pocas peticiones cada una, así
 *    que lleva un límite estricto por IP para encarecer la fuerza bruta.
 *  - `/agent/messages` cuesta dinero (llamadas al LLM) y crea propuestas, así
 *    que se limita **por usuario**: compartir IP en una oficina no debe hacer
 *    que unos consuman la cuota de otros.
 *
 * El límite por usuario va en `preHandler` y no en `onRequest` a propósito: el
 * plugin de rate limit corre antes que la autenticación, así que en `onRequest`
 * `request.user` todavía no existe y la clave sería siempre la IP.
 */

interface LimitOptions {
  max: number;
  timeWindow: string;
}

/**
 * En los tests los límites se desactivan: una suite que dispara cien peticiones
 * seguidas no está atacando a nadie.
 */
function effectiveMax(app: FastifyInstance, max: number): number {
  return app.env.NODE_ENV === 'test' ? 100_000 : max;
}

/** Límite por IP, aplicado como configuración de ruta. */
export function ipLimit(app: FastifyInstance, options: LimitOptions): RouteShorthandOptions {
  return {
    config: {
      rateLimit: {
        max: effectiveMax(app, options.max),
        timeWindow: options.timeWindow,
      },
    },
  };
}

/** Límite por usuario autenticado, con la IP como respaldo. */
export function perUserLimit(app: FastifyInstance, options: LimitOptions) {
  return app.rateLimit({
    max: effectiveMax(app, options.max),
    timeWindow: options.timeWindow,
    keyGenerator: (request: FastifyRequest) => {
      const user = (request as FastifyRequest & { user?: { sub?: string } }).user;
      return user?.sub ?? request.ip;
    },
  });
}

/**
 * Valores por defecto, en un solo sitio para poder razonar sobre ellos.
 * Provisionales: dependen de `BE2-Q3` y del coste real del LLM (`Q-10`).
 */
export const RATE_LIMITS = {
  /** Red de seguridad global, por IP. */
  global: { max: 120, timeWindow: '1 minute' },
  /** Login: caro de adivinar, barato de pedir. */
  auth: { max: 10, timeWindow: '1 minute' },
  /** Conversación con el agente: cuesta dinero y crea propuestas. */
  agent: { max: 20, timeWindow: '1 minute' },
  /** Aprobar y rechazar: mueve dinero, aunque el usuario legítimo no repite. */
  approval: { max: 30, timeWindow: '1 minute' },
} as const;
