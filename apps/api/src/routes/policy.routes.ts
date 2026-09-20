import {
  AuditEventSchema,
  PausePolicyRequestSchema,
  PolicyResponseSchema,
  UpdatePolicyInputSchema,
} from '@aegis/contracts';
import { buildPolicySummary } from '@aegis/policy-engine';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const policyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/policy',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['policy'],
        summary: 'Reglas y modo de operación actuales',
        response: { 200: PolicyResponseSchema },
      },
    },
    async (request) => respondWithPolicy(app, request.user.sub),
  );

  app.put(
    '/policy',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['policy'],
        summary: 'Actualiza las reglas (parcial)',
        body: UpdatePolicyInputSchema,
        response: { 200: PolicyResponseSchema },
      },
    },
    async (request) => {
      const userId = request.user.sub;
      const before = await app.services.policies.getConfig(userId);
      const after = await app.services.policies.updateConfig(userId, request.body);

      await app.services.audit.append({
        userId,
        type: 'POLICY_UPDATED',
        payload: { changes: diff(before, after) },
      });

      return respondWithPolicy(app, userId);
    },
  );

  /**
   * Kill switch (P-08).
   *
   * Tiene su propia ruta, separada de `PUT /policy`, para que el frontend pueda
   * exponerlo como un botón grande y accesible sin pasar por el formulario de
   * configuración. Parar al agente tiene que ser lo más fácil de la aplicación.
   */
  app.post(
    '/policy/pause',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['policy'],
        summary: 'Pausa o reactiva al agente',
        body: PausePolicyRequestSchema,
        response: { 200: PolicyResponseSchema },
      },
    },
    async (request) => {
      const userId = request.user.sub;
      await app.services.policies.updateConfig(userId, { paused: request.body.paused });

      await app.services.audit.append({
        userId,
        type: 'KILL_SWITCH_TOGGLED',
        payload: { paused: request.body.paused },
      });

      return respondWithPolicy(app, userId);
    },
  );

  app.get(
    '/audit',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['policy'],
        summary: 'Bitácora de auditoría del usuario, con el estado de la cadena de hashes',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
        response: {
          200: z.object({
            events: z.array(AuditEventSchema),
            chain: z.object({ valid: z.boolean(), brokenAt: z.string().optional() }),
          }),
        },
      },
    },
    async (request) => {
      const userId = request.user.sub;
      const [rows, chain] = await Promise.all([
        app.services.audit.list(userId, request.query.limit),
        app.services.audit.verifyChain(userId),
      ]);

      return {
        events: rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          proposalId: row.proposalId,
          type: row.type as z.infer<typeof AuditEventSchema>['type'],
          payload: row.payload as Record<string, unknown>,
          previousHash: row.previousHash,
          hash: row.hash,
          createdAt: row.createdAt.toISOString(),
        })),
        chain,
      };
    },
  );
};

async function respondWithPolicy(app: Parameters<FastifyPluginAsyncZod>[0], userId: string) {
  const [config, dailySpent] = await Promise.all([
    app.services.policies.getConfig(userId),
    app.services.policies.getDailySpentByAsset(userId),
  ]);

  return { config, summary: buildPolicySummary(config, dailySpent) };
}

/** Diferencias entre dos configuraciones, para que la auditoría sea legible. */
function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  for (const key of Object.keys(after)) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) changes[key] = { before: before[key], after: after[key] };
  }

  return changes;
}
