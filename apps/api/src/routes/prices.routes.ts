import { AssetCodeSchema, PriceSnapshotSchema } from '@aegis/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * Precios de los activos (ADR 0011).
 *
 * El frontend la usa para mostrar el valor en dólares junto a cada monto. La
 * respuesta lleva `source` y `asOf` de cada precio a propósito: un precio de
 * hace media hora no es lo mismo que uno de hace diez segundos, y la interfaz
 * debe poder decirlo en vez de presentarlos como equivalentes.
 *
 * No exige sesión: un tipo de cambio público no es dato de nadie. Sí lleva
 * límite por IP, porque detrás hay una llamada a un tercero.
 */
export const priceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/prices',
    {
      config: {
        rateLimit: { max: app.env.NODE_ENV === 'test' ? 100_000 : 60, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['prices'],
        summary: 'Precio en dólares de los activos soportados',
        querystring: z.object({
          /** Lista separada por comas. Si se omite, se devuelven todos. */
          assets: z.string().optional(),
        }),
        response: { 200: PriceSnapshotSchema },
      },
    },
    async (request) => {
      const requested = request.query.assets
        ?.split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      const parsed = AssetCodeSchema.array().safeParse(requested);
      const assets =
        parsed.success && parsed.data.length > 0 ? parsed.data : AssetCodeSchema.options;

      return app.services.prices.getPrices(assets);
    },
  );
};
