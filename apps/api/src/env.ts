import { z } from 'zod';

/**
 * Validación de la configuración al arrancar.
 *
 * Si falta algo, el proceso muere aquí con un mensaje claro. Prefiero un fallo
 * ruidoso en el arranque a un `undefined` silencioso a las tres de la mañana.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3001),
    API_HOST: z.string().default('0.0.0.0'),
    WEB_ORIGIN: z.string().default('http://localhost:3000'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    JWT_EXPIRES_IN: z.string().default('12h'),
    AUTH_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    USE_FAKE_STELLAR: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    ALLOW_DEV_LOGIN: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
    STELLAR_HORIZON_URL: z.string().default('https://horizon-testnet.stellar.org'),
    /**
     * Seed del signer delegado del agente. Solo backend: nunca al frontend,
     * nunca a los logs, nunca al LLM.
     */
    STELLAR_AGENT_SIGNER_SECRET: z.string().optional(),
    /**
     * Única cuenta para la que el signer del agente puede firmar. Es la misma
     * variable que usa el runbook M1 de BE1. El ejecutor rechaza cualquier
     * otra: si alguien manipulara el origen de una transacción, no podría
     * firmarla igualmente.
     */
    STELLAR_DEMO_ACCOUNT_ADDRESS: z.string().optional(),
    /**
     * Margen para firmar y enviar. 180 s y no 30: entre que el usuario abre
     * Freighter y confirma pasa más tiempo del que uno cree, y una transacción
     * que llega vencida falla con `tx_too_late`.
     */
    STELLAR_TRANSACTION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(180),

    // ── Precios (ADR 0011) ──────────────────────────────────────────
    // `fixed` no sale a la red y es determinista: es lo que usan los tests y
    // lo que permite una demo sin depender de que un tercero esté en pie.
    PRICE_SOURCE: z.enum(['market', 'fixed']).default('market'),
    PRICE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    PRICE_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
    MARKET_PRICE_BASE_URL: z.string().optional(),
    /** Tasa fija de XLM. Solo se usa si el mercado no responde. */
    PRICE_XLM_USD: z.string().optional(),
    /** USDC_TEST lo emitimos nosotros: su precio es una convención. */
    PRICE_USDC_TEST_USD: z.string().default('1'),
    AI_GATEWAY_API_KEY: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    AGENT_MODEL: z.string().min(1).default('google/gemini-3.1-flash-lite'),
    AGENT_FALLBACK_MODEL: z.string().min(1).default('openai/gpt-oss-20b'),
    AGENT_PROVIDER_ORDER: z.string().default('google'),
    AGENT_FALLBACK_PROVIDER_ORDER: z.string().default('groq'),
    AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  })
  .superRefine((env, ctx) => {
    // Conectar con Stellar de verdad sin las credenciales necesarias tiene que
    // fallar AQUÍ, al arrancar, y no en la primera propuesta que alguien cree.
    if (!env.USE_FAKE_STELLAR) {
      if (!env.STELLAR_AGENT_SIGNER_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STELLAR_AGENT_SIGNER_SECRET'],
          message: 'Hace falta la seed del signer del agente con USE_FAKE_STELLAR=false.',
        });
      }

      if (!env.STELLAR_DEMO_ACCOUNT_ADDRESS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STELLAR_DEMO_ACCOUNT_ADDRESS'],
          message: 'Hace falta la cuenta que el agente puede firmar con USE_FAKE_STELLAR=false.',
        });
      }
    }

    // Dos puertas traseras cómodas en desarrollo que serían un desastre en
    // producción. El esquema las cierra por nosotros.
    if (env.NODE_ENV !== 'production') return;

    if (env.USE_FAKE_STELLAR) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['USE_FAKE_STELLAR'],
        message: 'No se puede usar el cliente Stellar falso en producción.',
      });
    }

    if (env.ALLOW_DEV_LOGIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOW_DEV_LOGIN'],
        message: 'No se puede permitir el login de desarrollo en producción.',
      });
    }

    if (env.STELLAR_NETWORK === 'mainnet') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STELLAR_NETWORK'],
        message: 'Mainnet está fuera del MVP (D-02). Ver §15 del PLAN.md.',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  · ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Configuración inválida. Revisa tu .env (hay una plantilla en .env.example):\n${details}`,
    );
  }

  return result.data;
}
