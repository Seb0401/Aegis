import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Services } from './container.js';
import type { Env } from './env.js';

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
    env: Env;
    /** Preproceso que exige un JWT válido y deja el usuario en `request.user`. */
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; address: string };
    user: { sub: string; address: string };
  }
}
