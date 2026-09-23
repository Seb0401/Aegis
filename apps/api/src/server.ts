import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { buildServices, type Services } from './container.js';
import type { Database } from './db/client.js';
import type { Env } from './env.js';
import { AppError, errors } from './lib/errors.js';
import { RATE_LIMITS } from './lib/rate-limit.js';
import { accountRoutes } from './routes/account.routes.js';
import { agentRoutes } from './routes/agent.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { destinationRoutes } from './routes/destinations.routes.js';
import { policyRoutes } from './routes/policy.routes.js';
import { proposalRoutes } from './routes/proposals.routes.js';

/** Se publica en `/health` y en el OpenAPI para poder correlacionar despliegues. */
const VERSION = '0.1.0';

export interface BuildServerOptions {
  env: Env;
  db: Database;
  overrides?: Parameters<typeof buildServices>[0]['overrides'];
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { env, db } = options;

  const app = Fastify({
    logger: loggerOptions(env),
    // Un id por petición hace que los logs se puedan correlacionar de punta a punta.
    genReqId: () => crypto.randomUUID(),
  });

  // Zod como única fuente de validación y serialización: el contrato de
  // `@aegis/contracts` se aplica tal cual, sin duplicar esquemas JSON.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Red de seguridad global por IP. Los límites finos van por ruta, en
  // `src/lib/rate-limit.ts`.
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 100_000 : RATE_LIMITS.global.max,
    timeWindow: RATE_LIMITS.global.timeWindow,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Aegis API',
        description:
          'Orquestador del agente financiero: propuestas, políticas, Guardian y auditoría.',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${env.API_PORT}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  const services: Services = buildServices({
    db,
    env,
    metricsLogger: (event, metrics) => app.log.info(metrics, event),
    ...(options.overrides ? { overrides: options.overrides } : {}),
  });

  app.decorate('services', services);
  app.decorate('env', env);

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      // Se reutiliza el error de dominio para que el formato de la respuesta
      // esté definido en un único sitio.
      const error = errors.unauthorized('Token ausente o inválido.');
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    if (error instanceof ZodError) {
      return reply.code(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Los datos enviados no son válidos.',
          details: error.issues,
        },
      });
    }

    // El proveedor de tipos de Zod entrega el error como `unknown`, así que a
    // partir de aquí se trabaja con la forma de error de Fastify de forma explícita.
    const fastifyError = error as FastifyError;

    if (fastifyError.validation) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Los datos enviados no son válidos.',
          details: fastifyError.validation,
        },
      });
    }

    // Un error no previsto se registra entero pero al cliente solo le llega un
    // mensaje genérico: los detalles internos no se filtran en la respuesta.
    request.log.error({ err: error }, 'Error no controlado');

    return reply.code(fastifyError.statusCode ?? 500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Algo falló en el servidor.' },
    });
  });

  /**
   * Sonda de salud.
   *
   * Comprueba la base de datos de verdad: un proceso que responde pero no puede
   * consultar nada está caído a efectos prácticos, y una sonda que solo dice
   * "sigo vivo" haría que el orquestador lo mantuviera en rotación.
   */
  app.get(
    '/health',
    { schema: { tags: ['system'], summary: 'Sonda de salud' }, logLevel: 'warn' },
    async (_request, reply) => {
      const startedAt = Date.now();
      let database: 'ok' | 'error' = 'ok';

      try {
        await db.execute(sql`select 1`);
      } catch {
        database = 'error';
      }

      const body = {
        status: database === 'ok' ? ('ok' as const) : ('degraded' as const),
        database,
        databaseLatencyMs: Date.now() - startedAt,
        network: env.STELLAR_NETWORK,
        fakeStellar: env.USE_FAKE_STELLAR,
        uptimeSeconds: Math.round(process.uptime()),
        version: VERSION,
      };

      return reply.code(database === 'ok' ? 200 : 503).send(body);
    },
  );

  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(destinationRoutes);
  await app.register(proposalRoutes);
  await app.register(policyRoutes);
  await app.register(agentRoutes);

  return app;
}

function loggerOptions(env: Env) {
  if (env.NODE_ENV === 'test') return false;

  return {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    // Nunca se registran cabeceras de autorización ni cuerpos completos: por ahí
    // pasarían tokens y XDR firmados (§12).
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    serializers: {
      req: (request: { method: string; url: string; id: string }) => ({
        method: request.method,
        url: request.url,
        id: request.id,
      }),
    },
  };
}
