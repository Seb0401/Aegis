import {
  BalancesResponseSchema,
  DelegationPrepareResponseSchema,
  TransactionsResponseSchema,
} from '@aegis/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/account/balances',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['account'],
        summary: 'Saldos de la cuenta del usuario',
        response: { 200: BalancesResponseSchema },
      },
    },
    async (request) => {
      const address = request.user.address;
      const balances = await app.services.reader.getBalances(address);

      return { address, balances };
    },
  );

  app.post(
    '/account/delegation/prepare',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['account'],
        summary: 'XDR sin firmar para añadir el signer delegado del agente',
        body: z.object({ agentPublicKey: z.string() }),
        response: { 200: DelegationPrepareResponseSchema },
      },
    },
    async (request) => {
      // La clave pública del agente la decide BE1 (BE1-Q3: ¿una por usuario o
      // una global del servicio?). Hasta que se responda, llega en el cuerpo.
      const { agentPublicKey } = request.body;

      const { xdr } = await app.services.executor.buildDelegationXdr(
        request.user.address,
        agentPublicKey,
      );

      return { xdr, agentPublicKey };
    },
  );

  app.get(
    '/transactions',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['account'],
        summary: 'Historial de transacciones',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
        response: { 200: TransactionsResponseSchema },
      },
    },
    async (request) => {
      const transactions = await app.services.reader.getHistory(request.user.address, {
        limit: request.query.limit,
      });

      return { transactions };
    },
  );
};
