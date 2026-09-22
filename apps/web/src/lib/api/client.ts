import {
  ApiErrorSchema,
  AuditEventSchema,
  AuthChallengeResponseSchema,
  AuthVerifyResponseSchema,
  BalancesResponseSchema,
  DelegationPrepareResponseSchema,
  DestinationSchema,
  DestinationsResponseSchema,
  PolicyResponseSchema,
  ProposalResponseSchema,
  ProposalSchema,
  TransactionsResponseSchema,
  type AgentMessageRequest,
  type ApproveProposalRequest,
  type CreateDestinationRequest,
  type RejectProposalRequest,
  type UpdateDestinationInput,
  type UpdatePolicyInput,
} from '@aegis/contracts';
import { z, type ZodType, type ZodTypeDef } from 'zod';
import { API_URL } from '../env';
import { API_ERROR_CODES, ApiError } from './errors';

/**
 * Cliente HTTP tipado (FE-02).
 *
 * Todo lo que entra y sale se valida con los esquemas de `@aegis/contracts`,
 * que son los mismos que usa la API para serializar. Si el backend cambia un
 * campo sin avisar, el error sale aquí y no tres pantallas más adentro.
 *
 * La sesión va en `Authorization: Bearer`, no en una cookie: la API no usa
 * cookies y así el cliente se comporta igual en el navegador que en un test.
 */

/** Respuestas que la API define en línea y que no están en `@aegis/contracts`. */
const HealthResponseSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
  database: z.unknown().optional(),
});

const AuditResponseSchema = z.object({
  events: z.array(AuditEventSchema),
  chain: z.object({
    valid: z.boolean(),
    brokenAt: z.string().optional(),
    verifiedEvents: z.number(),
    complete: z.boolean(),
  }),
});
export type AuditResponse = z.infer<typeof AuditResponseSchema>;

const AgentMessageResponseSchema = z.object({
  conversationId: z.string(),
  reply: z.string(),
  proposals: z.array(ProposalSchema),
});

const ProposalsListSchema = z.object({ proposals: z.array(ProposalSchema) });
const DestinationResponseSchema = z.object({ destination: DestinationSchema });

export interface ApiClientOptions {
  baseUrl?: string;
  /** De dónde sale el token en cada petición. Se lee al vuelo, no se captura. */
  getToken?: () => string | null;
  /** Se llama cuando la API responde 401, para cerrar la sesión en la UI. */
  onUnauthorized?: () => void;
  /** Inyectable para los tests. */
  fetchImpl?: typeof fetch;
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /**
   * El tercer parámetro (`unknown` como entrada) no es decorativo: sin él, TS
   * infiere `T` a partir del tipo de ENTRADA del esquema, donde todo lo que
   * tiene `.default()` es opcional. Así `T` es siempre el tipo de salida, que
   * es lo que de verdad devuelve la API.
   */
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** Por defecto true: casi toda la API exige sesión. */
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: (() => void) | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? API_URL).replace(/\/$/, '');
    this.getToken = options.getToken ?? (() => null);
    this.onUnauthorized = options.onUnauthorized;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, options: RequestOptions<T>): Promise<T> {
    const { method = 'GET', body, schema, auth = true, query, signal } = options;

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';

    if (auth) {
      const token = this.getToken();
      if (!token) {
        throw new ApiError(API_ERROR_CODES.unauthorized, 'No has iniciado sesión.', 401);
      }
      headers.authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      // Un fallo de red no distingue entre "la API no está levantada" y "CORS
      // la rechazó": el navegador lanza el mismo TypeError en los dos casos.
      throw new ApiError(
        API_ERROR_CODES.network,
        'No se pudo contactar con la API.',
        0,
        cause instanceof Error ? cause.message : cause,
      );
    }

    const payload = await this.readJson(response);

    if (!response.ok) {
      throw this.toApiError(response.status, payload);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError(
        API_ERROR_CODES.invalidResponse,
        `La respuesta de ${method} ${path} no cumple el contrato.`,
        response.status,
        parsed.error.issues,
      );
    }

    return parsed.data;
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  private toApiError(status: number, payload: unknown): ApiError {
    if (status === 401) this.onUnauthorized?.();

    const envelope = ApiErrorSchema.safeParse(payload);
    if (envelope.success) {
      const { code, message, details } = envelope.data.error;
      return new ApiError(code, message, status, details);
    }

    // El rate limit de Fastify responde sin el sobre de error de la aplicación.
    if (status === 429) {
      return new ApiError(
        API_ERROR_CODES.rateLimited,
        'Demasiadas peticiones seguidas.',
        status,
        payload,
      );
    }

    return new ApiError(
      `HTTP_${status}`,
      typeof payload === 'string' && payload ? payload : `La API respondió ${status}.`,
      status,
      payload,
    );
  }

  // ── Sondas ────────────────────────────────────────────────────────

  health() {
    return this.request('/health', { schema: HealthResponseSchema, auth: false });
  }

  // ── Auth (FE-03) ──────────────────────────────────────────────────

  requestChallenge(address: string) {
    return this.request('/auth/challenge', {
      method: 'POST',
      body: { address },
      schema: AuthChallengeResponseSchema,
      auth: false,
    });
  }

  verifyChallenge(challengeId: string, signature: string) {
    return this.request('/auth/verify', {
      method: 'POST',
      body: { challengeId, signature },
      schema: AuthVerifyResponseSchema,
      auth: false,
    });
  }

  /** Atajo de desarrollo: solo funciona con `ALLOW_DEV_LOGIN=true` en la API. */
  devLogin(address: string) {
    return this.request('/auth/dev-login', {
      method: 'POST',
      body: { address },
      schema: AuthVerifyResponseSchema,
      auth: false,
    });
  }

  // ── Cuenta ────────────────────────────────────────────────────────

  getBalances() {
    return this.request('/account/balances', { schema: BalancesResponseSchema });
  }

  getTransactions(limit = 50) {
    return this.request('/transactions', { schema: TransactionsResponseSchema, query: { limit } });
  }

  /** XDR sin firmar que añade el signer del agente a la cuenta (FE-04). */
  prepareDelegation(agentPublicKey: string) {
    return this.request('/account/delegation/prepare', {
      method: 'POST',
      body: { agentPublicKey },
      schema: DelegationPrepareResponseSchema,
    });
  }

  // ── Destinos (FE-10) ──────────────────────────────────────────────

  getDestinations() {
    return this.request('/destinations', { schema: DestinationsResponseSchema });
  }

  createDestination(input: CreateDestinationRequest) {
    return this.request('/destinations', {
      method: 'POST',
      body: input,
      schema: DestinationResponseSchema,
    });
  }

  updateDestination(id: string, input: UpdateDestinationInput) {
    return this.request(`/destinations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      schema: DestinationResponseSchema,
    });
  }

  // ── Propuestas (FE-06, FE-07) ─────────────────────────────────────

  getProposals(limit = 50) {
    return this.request('/proposals', { schema: ProposalsListSchema, query: { limit } });
  }

  getProposal(id: string) {
    return this.request(`/proposals/${encodeURIComponent(id)}`, { schema: ProposalResponseSchema });
  }

  /**
   * Aprobar.
   *
   * `signedXdr` es obligatorio cuando la política devolvió REQUIRE_USER, y
   * `confirmedTotal` cuando el riesgo es HIGH o CRITICAL. Si falta alguno, la
   * API responde SIGNATURE_REQUIRED o CONFIRMATION_REQUIRED.
   */
  approveProposal(id: string, body: ApproveProposalRequest = {}) {
    return this.request(`/proposals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body,
      schema: ProposalResponseSchema,
    });
  }

  rejectProposal(id: string, body: RejectProposalRequest = {}) {
    return this.request(`/proposals/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body,
      schema: ProposalResponseSchema,
    });
  }

  // ── Política y kill switch (FE-09, FE-12) ─────────────────────────

  getPolicy() {
    return this.request('/policy', { schema: PolicyResponseSchema });
  }

  updatePolicy(input: UpdatePolicyInput) {
    return this.request('/policy', { method: 'PUT', body: input, schema: PolicyResponseSchema });
  }

  setPaused(paused: boolean) {
    return this.request('/policy/pause', {
      method: 'POST',
      body: { paused },
      schema: PolicyResponseSchema,
    });
  }

  // ── Auditoría (FE-11) ─────────────────────────────────────────────

  getAudit(limit = 100) {
    return this.request('/audit', { schema: AuditResponseSchema, query: { limit } });
  }

  // ── Agente (FE-05) ────────────────────────────────────────────────

  sendMessage(input: AgentMessageRequest) {
    return this.request('/agent/messages', {
      method: 'POST',
      body: input,
      schema: AgentMessageResponseSchema,
    });
  }
}
