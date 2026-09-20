import {
  AuthChallengeRequestSchema,
  AuthChallengeResponseSchema,
  AuthVerifyRequestSchema,
  AuthVerifyResponseSchema,
} from '@aegis/contracts';
import { isValidStellarAddress } from '@aegis/stellar';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errors } from '../lib/errors.js';

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/challenge',
    {
      schema: {
        tags: ['auth'],
        summary: 'Pide un reto para firmar con la wallet',
        body: AuthChallengeRequestSchema,
        response: { 200: AuthChallengeResponseSchema },
      },
    },
    async (request) => {
      const { address } = request.body;
      const result = await app.services.auth.createChallenge(address);

      return {
        challenge: result.challenge,
        challengeId: result.challengeId,
        expiresAt: result.expiresAt.toISOString(),
      };
    },
  );

  app.post(
    '/auth/verify',
    {
      schema: {
        tags: ['auth'],
        summary: 'Verifica la firma del reto y devuelve un token de sesión',
        body: AuthVerifyRequestSchema,
        response: { 200: AuthVerifyResponseSchema },
      },
    },
    async (request) => {
      const { challengeId, signature } = request.body;
      const user = await app.services.auth.verify(challengeId, signature);

      await app.services.audit.append({
        userId: user.id,
        type: 'AUTH_LOGIN',
        payload: { address: user.address, method: 'wallet' },
      });

      return {
        token: app.jwt.sign({ sub: user.id, address: user.address }),
        user: { id: user.id, address: user.address },
      };
    },
  );

  /**
   * Atajo de desarrollo: entra sin firmar nada.
   *
   * Existe para que FE y AI no necesiten una wallet configurada para probar.
   * `loadEnv` impide activarlo en producción, y la ruta lo vuelve a comprobar:
   * una puerta trasera merece dos cerraduras.
   */
  app.post(
    '/auth/dev-login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Solo en desarrollo: inicia sesión sin firma',
        body: z.object({ address: z.string() }),
        response: { 200: AuthVerifyResponseSchema },
      },
    },
    async (request) => {
      if (!app.env.ALLOW_DEV_LOGIN || app.env.NODE_ENV === 'production') {
        throw errors.devLoginDisabled();
      }

      const { address } = request.body;
      if (!isValidStellarAddress(address)) {
        throw errors.invalidProposal('La dirección no es una clave pública de Stellar válida.');
      }

      const user = await app.services.auth.findOrCreateUser(address);

      await app.services.audit.append({
        userId: user.id,
        type: 'AUTH_LOGIN',
        payload: { address: user.address, method: 'dev' },
      });

      return {
        token: app.jwt.sign({ sub: user.id, address: user.address }),
        user: { id: user.id, address: user.address },
      };
    },
  );
};
