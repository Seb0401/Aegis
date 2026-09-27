import { SplitRuleSchema } from '@aegis/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const SplitResponseSchema = z.object({
  rule: SplitRuleSchema.nullable(),
  /** Desde cuándo vigila. `null` si todavía no hay regla. */
  watchingSince: z.string().datetime().nullable(),
});

/**
 * Reparto automático de los ingresos (BE2-13).
 *
 * Solo configura: quien actúa es el vigilante, que corre por su cuenta. Aquí
 * no hay forma de disparar un reparto a mano, y es deliberado — un endpoint
 * que reparta bajo demanda sería otra vía para mover dinero, y este servicio
 * ya tiene la suya, con sus límites y su Guardian.
 */
export const splitRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/split-rule',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['split'],
        summary: 'La regla de reparto automático del usuario',
        response: { 200: SplitResponseSchema },
      },
    },
    async (request) => {
      const guardado = await app.services.splits.get(request.user.sub);

      return {
        rule: guardado?.rule ?? null,
        watchingSince: guardado?.watchingSince.toISOString() ?? null,
      };
    },
  );

  app.put(
    '/split-rule',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['split'],
        summary: 'Define el reparto automático',
        description:
          'Las partes van en puntos básicos y no pueden sumar más de 10000. Lo que no se ' +
          'asigna se queda en la cuenta.',
        body: SplitRuleSchema,
        response: { 200: SplitResponseSchema },
      },
    },
    async (request) => {
      /*
        Que los destinos existan se comprueba aquí y no en el vigilante: si se
        dejara pasar, la regla quedaría guardada y fallaría en silencio cada
        vez que entrara dinero, sin que nadie llegara a saber por qué.
      */
      const registrados = await app.services.destinations.list(request.user.sub);
      const conocidos = new Set(registrados.map((destino) => destino.id));

      for (const share of request.body.shares) {
        if (!conocidos.has(share.destinationId)) {
          throw app.httpErrors.unprocessableEntity(
            `El destino ${share.destinationId} no está registrado.`,
          );
        }
      }

      const rule = await app.services.splits.save(request.user.sub, request.body);
      const guardado = await app.services.splits.get(request.user.sub);

      return { rule, watchingSince: guardado?.watchingSince.toISOString() ?? null };
    },
  );
};
