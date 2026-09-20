import {
  CreateDestinationInputSchema,
  DestinationSchema,
  DestinationsResponseSchema,
  UpdateDestinationInputSchema,
} from '@aegis/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * Registro de objetivos y contactos (BE2-05).
 *
 * Este es el único sitio por el que entra una dirección Stellar nueva al
 * sistema, y siempre viene del usuario desde la UI. El agente jamás llega aquí:
 * solo puede leer la lista y referenciar ids (principio nº 2 del PLAN).
 */
export const destinationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/destinations',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['destinations'],
        summary: 'Lista los objetivos y contactos registrados',
        response: { 200: DestinationsResponseSchema },
      },
    },
    async (request) => {
      const list = await app.services.destinations.list(request.user.sub);
      return { destinations: list };
    },
  );

  app.post(
    '/destinations',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['destinations'],
        summary: 'Registra un objetivo o contacto nuevo',
        body: CreateDestinationInputSchema,
        response: { 201: z.object({ destination: DestinationSchema }) },
      },
    },
    async (request, reply) => {
      const destination = await app.services.destinations.create(request.user.sub, request.body);

      await app.services.audit.append({
        userId: request.user.sub,
        type: 'DESTINATION_CREATED',
        payload: {
          destinationId: destination.id,
          label: destination.label,
          kind: destination.kind,
          trusted: destination.trusted,
        },
      });

      return reply.code(201).send({ destination });
    },
  );

  /**
   * Renombrar, marcar como de confianza o bloquear un destino.
   *
   * Los dos últimos cambian de verdad el comportamiento del sistema: `trusted`
   * exime de la señal G-01 y `blocked` hace que la política deniegue cualquier
   * pago a ese destino (P-03). Por eso quedan en la bitácora con su valor
   * anterior y el nuevo.
   */
  app.patch(
    '/destinations/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['destinations'],
        summary: 'Actualiza un destino: etiqueta, confianza o bloqueo',
        params: z.object({ id: z.string().min(1) }),
        body: UpdateDestinationInputSchema,
        response: { 200: z.object({ destination: DestinationSchema }) },
      },
    },
    async (request) => {
      const userId = request.user.sub;
      const before = await app.services.destinations.findById(userId, request.params.id);
      const destination = await app.services.destinations.update(
        userId,
        request.params.id,
        request.body,
      );

      await app.services.audit.append({
        userId,
        type: 'DESTINATION_UPDATED',
        payload: {
          destinationId: destination.id,
          label: destination.label,
          trusted: { before: before?.trusted ?? null, after: destination.trusted },
          blocked: { before: before?.blocked ?? null, after: destination.blocked },
        },
      });

      return { destination };
    },
  );
};
