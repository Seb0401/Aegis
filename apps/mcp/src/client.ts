import {
  BalancesResponseSchema,
  DestinationsResponseSchema,
  PolicyResponseSchema,
  PriceSnapshotSchema,
  ProposalResponseSchema,
  type Balance,
  type Destination,
  type PolicySummary,
  type PriceSnapshot,
  type Proposal,
  type ProposalInput,
} from '@aegis/contracts';

/**
 * Cliente HTTP de la API de Aegis.
 *
 * El servidor MCP habla con Aegis por HTTP en vez de ir a la base de datos,
 * y eso es deliberado: así hereda **todo** lo que protege a la aplicación —
 * autenticación, Policy Engine, Guardian, auditoría y límites de uso. Un
 * atajo por debajo tendría que reimplementar esas cinco cosas, y la primera
 * que se olvidara sería un agujero.
 */

export interface AegisClientOptions {
  baseUrl: string;
  /** Token de sesión de Aegis. Se envía como Bearer. */
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Error de la API con el código estable del contrato, no solo un mensaje. */
export class AegisApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AegisApiError';
  }
}

export class AegisClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AegisClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getBalances(): Promise<Balance[]> {
    const body = await this.request('GET', '/account/balances');
    return BalancesResponseSchema.parse(body).balances;
  }

  async listDestinations(): Promise<Destination[]> {
    const body = await this.request('GET', '/destinations');
    return DestinationsResponseSchema.parse(body).destinations;
  }

  async getPolicySummary(): Promise<PolicySummary> {
    const body = await this.request('GET', '/policy');
    return PolicyResponseSchema.parse(body).summary;
  }

  async getPrices(): Promise<PriceSnapshot> {
    return PriceSnapshotSchema.parse(await this.request('GET', '/prices'));
  }

  /**
   * Crea una propuesta. **No ejecuta nada**: la propuesta pasa por política y
   * Guardian, y queda esperando a que la apruebe una persona.
   */
  async proposePayment(input: ProposalInput): Promise<Proposal> {
    const body = await this.request('POST', '/proposals', input);
    return ProposalResponseSchema.parse(body).proposal;
  }

  async getProposal(id: string): Promise<Proposal> {
    const body = await this.request('GET', `/proposals/${encodeURIComponent(id)}`);
    return ProposalResponseSchema.parse(body).proposal;
  }

  private async request(method: string, path: string, payload?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.options.token}`,
          accept: 'application/json',
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
        throw new AegisApiError(
          error?.code ?? 'HTTP_ERROR',
          error?.message ?? `La API respondió ${response.status}.`,
          response.status,
        );
      }

      return body;
    } catch (error) {
      if (error instanceof AegisApiError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AegisApiError('TIMEOUT', 'Aegis no respondió a tiempo.', 504);
      }

      throw new AegisApiError(
        'NETWORK_ERROR',
        `No se pudo contactar con Aegis en ${this.baseUrl}.`,
        503,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
