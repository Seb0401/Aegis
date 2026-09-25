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
        response: { 200: DelegationPrepareResponseSchema },
      },
    },
    async (request) => {
      // La clave la deriva el servidor de la seed que custodia. Antes llegaba
      // en el cuerpo, y eso permitía que un cliente hiciera firmar al usuario
      // una delegación a favor de una cuenta que no es la nuestra: la víctima
      // habría autorizado a un tercero a mover su dinero creyendo que era Aegis.
      const agentPublicKey = app.services.executor.getAgentPublicKey();

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
