import {
  ApproveProposalRequestSchema,
  ProposalInputSchema,
  ProposalResponseSchema,
  ProposalSchema,
  RejectProposalRequestSchema,
} from '@aegis/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RATE_LIMITS, perUserLimit } from '../lib/rate-limit.js';

const ParamsSchema = z.object({ id: z.string().min(1) });

export const proposalRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/proposals',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['proposals'],
        summary: 'Lista las propuestas del usuario, de la más reciente a la más antigua',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
        response: { 200: z.object({ proposals: z.array(ProposalSchema) }) },
      },
    },
    async (request) => {
      const list = await app.services.proposals.list(request.user.sub, request.query.limit);
      return { proposals: list };
    },
  );

  /**
   * Crear una propuesta con acciones concretas, sin pasar por el chat.
   *
   * Es la puerta por la que entra un agente externo a través del servidor MCP.
   * No es un atajo: recorre exactamente el mismo `ProposalService.create` que
   * el agente interno, así que pasa por Policy Engine, Guardian y auditoría.
   *
   * Y deliberadamente **no** ejecuta nada: crea una propuesta. Quien apruebe
   * sigue siendo la persona, desde la interfaz de Aegis.
   */
  app.post(
    '/proposals',
    {
      onRequest: [app.authenticate],
      preHandler: [perUserLimit(app, RATE_LIMITS.agent)],
      schema: {
        tags: ['proposals'],
        summary: 'Propone un pago con acciones concretas (lo usa el servidor MCP)',
        body: ProposalInputSchema,
        response: { 201: ProposalResponseSchema },
      },
    },
    async (request, reply) => {
      const proposal = await app.services.proposals.create(
        request.user.sub,
        request.user.address,
        request.body,
      );

      return reply.code(201).send({ proposal });
    },
  );

  app.get(
    '/proposals/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['proposals'],
        summary: 'Estado, decisión de política, riesgo y explicación',
        params: ParamsSchema,
        response: { 200: ProposalResponseSchema },
      },
    },
    async (request) => {
      const proposal = await app.services.proposals.get(request.user.sub, request.params.id);
      return { proposal };
    },
  );

  app.post(
    '/proposals/:id/approve',
    {
      onRequest: [app.authenticate],
      preHandler: [perUserLimit(app, RATE_LIMITS.approval)],
      schema: {
        tags: ['proposals'],
        summary: 'Aprueba una propuesta con el XDR firmado por la wallet',
        params: ParamsSchema,
        body: ApproveProposalRequestSchema,
        response: { 200: ProposalResponseSchema },
      },
    },
    async (request) => {
      const proposal = await app.services.proposals.approve(request.user.sub, request.params.id, {
        signedXdr: request.body.signedXdr ?? null,
        confirmedTotal: request.body.confirmedTotal ?? null,
      });

      return { proposal };
    },
  );

  app.post(
    '/proposals/:id/reject',
    {
      onRequest: [app.authenticate],
      preHandler: [perUserLimit(app, RATE_LIMITS.approval)],
      schema: {
        tags: ['proposals'],
        summary: 'Rechaza una propuesta pendiente',
        params: ParamsSchema,
        body: RejectProposalRequestSchema,
        response: { 200: ProposalResponseSchema },
      },
    },
    async (request) => {
      const proposal = await app.services.proposals.reject(
        request.user.sub,
        request.params.id,
        request.body.reason ?? null,
      );

      return { proposal };
    },
  );
};
