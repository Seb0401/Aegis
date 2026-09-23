import {
  ALLOWED_TRANSITIONS,
  ExplanationSchema,
  PolicyDecisionSchema,
  ProposalInputSchema,
  ProposedActionSchema,
  RiskReportSchema,
  addAmounts,
  compareAmounts,
  formatAmount,
  type Balance,
  type Destination,
  type Explanation,
  type PolicyDecision,
  type Proposal,
  type ProposalInput,
  type ProposalStatus,
  type ProposedAction,
  type ResolvedAction,
  type RiskReport,
  type StellarExecutor,
  type StellarReader,
} from '@aegis/contracts';
import { assessRisk, buildTemplateExplanation } from '@aegis/guardian';
import { evaluatePolicy } from '@aegis/policy-engine';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { proposals } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import { newProposalId } from '../lib/ids.js';
import type { AuditLog } from './audit.js';
import type { DestinationStore } from './destination-store.js';
import type { PolicyStore } from './policy-store.js';

const ActionsSchema = z.array(ProposedActionSchema);

export interface ProposalServiceDeps {
  db: Database;
  audit: AuditLog;
  policies: PolicyStore;
  destinations: DestinationStore;
  reader: StellarReader;
  executor: StellarExecutor;
  explain?: (risk: RiskReport, actions: ResolvedAction[]) => Promise<Explanation>;
}

/**
 * Orquestador de propuestas (BE2-04, BE2-09).
 *
 * Es el corazón del backend y el único sitio donde vive la máquina de estados.
 * El orden del pipeline no es negociable:
 *
 *   DRAFT → POLICY_CHECK → GUARDIAN_REVIEW → (AUTO_APPROVED | PENDING_USER | DENIED)
 *
 * El Guardian corre SIEMPRE, incluso cuando la política ya aprobó sola. Si el
 * riesgo sale MEDIUM o más, una propuesta autónoma se degrada a PENDING_USER
 * (§4.3). Esa degradación es el mecanismo que hace que "autonomía" no signifique
 * "barra libre".
 */
export class ProposalService {
  constructor(private readonly deps: ProposalServiceDeps) {}

  /**
   * Crea una propuesta y la hace pasar por todo el pipeline.
   * Devuelve la propuesta ya evaluada, lista para que el frontend la muestre.
   */
  async create(userId: string, userAddress: string, rawInput: ProposalInput): Promise<Proposal> {
    const input = ProposalInputSchema.parse(rawInput);

    const config = await this.deps.policies.getConfig(userId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.proposalTtlMinutes * 60 * 1000);

    const registered = await this.deps.destinations.list(userId);
    const resolved = this.resolveActions(input.actions, registered);

    this.assertRequestedTotalRespected(input);

    const id = newProposalId();

    await this.deps.db.insert(proposals).values({
      id,
      userId,
      status: 'DRAFT',
      summary: input.summary,
      actions: input.actions,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await this.deps.audit.append({
      userId,
      proposalId: id,
      type: 'PROPOSAL_CREATED',
      payload: { summary: input.summary, actionCount: input.actions.length },
    });

    return this.runPipeline({ id, userId, userAddress, input, resolved, registered, config, now });
  }

  async get(userId: string, id: string): Promise<Proposal> {
    const [row] = await this.deps.db
      .select()
      .from(proposals)
      .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
      .limit(1);

    if (!row) throw errors.notFound('la propuesta');

    const proposal = toProposal(row);
    return this.expireIfNeeded(proposal);
  }

  async list(userId: string, limit = 50): Promise<Proposal[]> {
    const rows = await this.deps.db
      .select()
      .from(proposals)
      .where(eq(proposals.userId, userId))
      .orderBy(desc(proposals.createdAt))
      .limit(limit);

    return rows.map(toProposal);
  }

  /**
   * Aprobación del usuario.
   *
   * Dos puertas antes de tocar la red:
   *  1. Si el riesgo es HIGH o CRITICAL, el usuario debe reescribir el total
   *     (confirmación reforzada, §8.2).
   *  2. Si la política pidió su firma, el XDR firmado es obligatorio: el backend
   *     no puede firmar en su lugar.
   */
  async approve(
    userId: string,
    id: string,
    options: { signedXdr?: string | null; confirmedTotal?: string | null } = {},
  ): Promise<Proposal> {
    const proposal = await this.get(userId, id);

    if (proposal.status !== 'PENDING_USER') {
      throw errors.invalidTransition(proposal.status, 'SIGNED');
    }

    const total = totalOf(proposal.actions);

    if (proposal.risk && (proposal.risk.level === 'HIGH' || proposal.risk.level === 'CRITICAL')) {
      if (!options.confirmedTotal || compareAmounts(options.confirmedTotal, total) !== 0) {
        throw errors.confirmationRequired(
          `El riesgo es ${proposal.risk.level}. Escribe el monto total (${formatAmount(total)}) para confirmar.`,
        );
      }
    }

    if (!options.signedXdr) {
      throw errors.signatureRequired();
    }

    await this.deps.audit.append({
      userId,
      proposalId: id,
      type: 'USER_APPROVED',
      payload: { total, riskLevel: proposal.risk?.level ?? null },
    });

    await this.transition(id, proposal.status, 'SIGNED');

    return this.submit(userId, id, options.signedXdr);
  }

  async reject(userId: string, id: string, reason?: string | null): Promise<Proposal> {
    const proposal = await this.get(userId, id);

    if (proposal.status !== 'PENDING_USER') {
      throw errors.invalidTransition(proposal.status, 'REJECTED');
    }

    await this.deps.audit.append({
      userId,
      proposalId: id,
      type: 'USER_REJECTED',
      payload: { reason: reason ?? null },
    });

    await this.transition(id, proposal.status, 'REJECTED');

    return this.get(userId, id);
  }

  // ── Pipeline ──────────────────────────────────────────────────────

  private async runPipeline(ctx: {
    id: string;
    userId: string;
    userAddress: string;
    input: ProposalInput;
    resolved: ResolvedAction[];
    registered: Destination[];
    config: Awaited<ReturnType<PolicyStore['getConfig']>>;
    now: Date;
  }): Promise<Proposal> {
    const { id, userId, userAddress, input, resolved, registered, config, now } = ctx;

    await this.transition(id, 'DRAFT', 'POLICY_CHECK');

    const [balances, stats, dailySpentByAsset, operationsLastHour] = await Promise.all([
      this.deps.reader.getBalances(userAddress),
      this.deps.reader.getHistoryStats(userAddress),
      this.deps.policies.getDailySpentByAsset(userId, now),
      this.deps.policies.getOperationsLastHour(userId, now),
    ]);

    const decision = evaluatePolicy({
      config,
      actions: input.actions,
      destinations: registered,
      balances,
      dailySpentByAsset,
      operationsLastHour,
      knownCounterparties: stats.knownCounterparties,
      now,
    });

    await this.deps.db
      .update(proposals)
      .set({ policy: decision, updatedAt: new Date() })
      .where(eq(proposals.id, id));

    await this.deps.audit.append({
      userId,
      proposalId: id,
      type: 'POLICY_EVALUATED',
      payload: { decision: decision.decision, reasons: decision.reasons },
    });

    if (decision.decision === 'DENY') {
      await this.transition(id, 'POLICY_CHECK', 'DENIED');
      return this.get(userId, id);
    }

    // El Guardian corre siempre, también cuando la política aprobó sola.
    await this.transition(id, 'POLICY_CHECK', 'GUARDIAN_REVIEW');

    const risk = await this.runGuardian({
      userAddress,
      resolved,
      registered,
      balances,
      config,
      stats,
    });

    const explanation = this.deps.explain
      ? await this.deps.explain(risk, resolved)
      : buildTemplateExplanation(risk, resolved);

    await this.deps.db
      .update(proposals)
      .set({ risk, explanation, updatedAt: new Date() })
      .where(eq(proposals.id, id));

    await this.deps.audit.append({
      userId,
      proposalId: id,
      type: 'GUARDIAN_EVALUATED',
      payload: { score: risk.score, level: risk.level, signals: risk.signals.map((s) => s.id) },
    });

    const next = decideNextStatus(decision, risk);

    if (next === 'PENDING_USER') {
      // Se prepara el XDR sin firmar para que el frontend lo pase por Freighter.
      const { xdr } = await this.deps.executor.buildUnsigned(userAddress, resolved);
      await this.deps.db
        .update(proposals)
        .set({ unsignedXdr: xdr, updatedAt: new Date() })
        .where(eq(proposals.id, id));
    }

    await this.transition(id, 'GUARDIAN_REVIEW', next);

    if (next === 'AUTO_APPROVED') {
      return this.executeAutonomously(userId, userAddress, id, resolved);
    }

    return this.get(userId, id);
  }

  private async runGuardian(args: {
    userAddress: string;
    resolved: ResolvedAction[];
    registered: Destination[];
    balances: Balance[];
    config: Awaited<ReturnType<PolicyStore['getConfig']>>;
    stats: Awaited<ReturnType<StellarReader['getHistoryStats']>>;
  }): Promise<RiskReport> {
    const uniqueAddresses = [...new Set(args.resolved.map((a) => a.destinationAddress))];

    const infos = await Promise.all(
      uniqueAddresses.map(async (address) => {
        const info = await this.deps.reader.getAccountInfo(address);
        return [address, info] as const;
      }),
    );

    const simulation = await this.deps.reader.simulatePayments(args.userAddress, args.resolved);

    return assessRisk({
      actions: args.resolved,
      destinations: args.registered,
      balances: args.balances,
      config: args.config,
      stats: args.stats,
      accountInfoByAddress: Object.fromEntries(infos),
      estimatedFee: simulation.fee,
    });
  }

  /** Camino autónomo: firma el agente y se envía sin intervención del usuario. */
  private async executeAutonomously(
    userId: string,
    userAddress: string,
    id: string,
    resolved: ResolvedAction[],
  ): Promise<Proposal> {
    try {
      const { xdr } = await this.deps.executor.buildUnsigned(userAddress, resolved);
      const signed = await this.deps.executor.signWithAgent(xdr);

      await this.deps.audit.append({
        userId,
        proposalId: id,
        type: 'AGENT_SIGNED',
        payload: { actionCount: resolved.length },
      });

      await this.transition(id, 'AUTO_APPROVED', 'SIGNED');

      return this.submit(userId, id, signed.xdr);
    } catch (error) {
      return this.fail(userId, id, error);
    }
  }

  private async submit(userId: string, id: string, signedXdr: string): Promise<Proposal> {
    try {
      await this.transition(id, 'SIGNED', 'SUBMITTED');

      const { hash } = await this.deps.executor.submit(signedXdr);

      await this.deps.db
        .update(proposals)
        .set({ txHash: hash, updatedAt: new Date() })
        .where(eq(proposals.id, id));

      await this.deps.audit.append({
        userId,
        proposalId: id,
        type: 'TX_SUBMITTED',
        payload: { hash },
      });

      await this.transition(id, 'SUBMITTED', 'CONFIRMED');

      await this.deps.audit.append({
        userId,
        proposalId: id,
        type: 'TX_CONFIRMED',
        payload: { hash },
      });

      return this.get(userId, id);
    } catch (error) {
      return this.fail(userId, id, error);
    }
  }

  private async fail(userId: string, id: string, error: unknown): Promise<Proposal> {
    const reason = error instanceof Error ? error.message : 'Error desconocido';

    const [row] = await this.deps.db
      .select({ status: proposals.status })
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);

    await this.deps.db
      .update(proposals)
      .set({ status: 'FAILED', failureReason: reason, updatedAt: new Date() })
      .where(eq(proposals.id, id));

    await this.deps.audit.append({
      userId,
      proposalId: id,
      type: 'TX_FAILED',
      payload: { reason, previousStatus: row?.status ?? null },
    });

    return this.get(userId, id);
  }

  // ── Utilidades internas ───────────────────────────────────────────

  /**
   * Traduce `destinationId` a dirección real.
   *
   * Aquí se hace cumplir el principio nº 2: si el agente referencia un destino
   * que no está registrado, la propuesta no llega ni a evaluarse.
   */
  private resolveActions(actions: ProposedAction[], registered: Destination[]): ResolvedAction[] {
    const byId = new Map(registered.map((d) => [d.id, d]));

    return actions.map((action, index) => {
      const destination = byId.get(action.destinationId);

      if (!destination) {
        throw errors.invalidProposal(`La acción ${index + 1} apunta a un destino que no existe.`, {
          actionIndex: index,
          destinationId: action.destinationId,
        });
      }

      return {
        ...action,
        destinationAddress: destination.address,
        destinationLabel: destination.label,
      };
    });
  }

  /** Invariante AI-05: el agente no puede proponer más de lo que pidió el usuario. */
  private assertRequestedTotalRespected(input: ProposalInput): void {
    if (!input.requestedTotal) return;

    const total = totalOf(input.actions);

    if (compareAmounts(total, input.requestedTotal) === 1) {
      throw errors.invalidProposal(
        `La propuesta suma ${formatAmount(total)} pero pediste como máximo ${formatAmount(input.requestedTotal)}.`,
        { proposedTotal: total, requestedTotal: input.requestedTotal },
      );
    }
  }

  /** Cambia de estado validando la transición contra la tabla del contrato. */
  private async transition(id: string, from: ProposalStatus, to: ProposalStatus): Promise<void> {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw errors.invalidTransition(from, to);
    }

    // La condición sobre `status` hace la transición atómica: si otra petición
    // ya cambió el estado, esta no pisa nada.
    const updated = await this.deps.db
      .update(proposals)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(proposals.id, id), eq(proposals.status, from)))
      .returning({ id: proposals.id });

    if (updated.length === 0) {
      throw errors.invalidTransition(from, to);
    }
  }

  /**
   * Marca como EXPIRED una propuesta vencida que siga esperando al usuario.
   *
   * Es la red de seguridad para el caso "el usuario abre la propuesta justo
   * después de que venza": el barrido periódico corre cada minuto, así que sin
   * esto habría una ventana en la que se podría aprobar algo ya caducado.
   */
  private async expireIfNeeded(proposal: Proposal): Promise<Proposal> {
    const waiting = proposal.status === 'PENDING_USER' || proposal.status === 'AUTO_APPROVED';
    if (!waiting) return proposal;

    if (new Date(proposal.expiresAt).getTime() > Date.now()) return proposal;

    const updated = await this.deps.db
      .update(proposals)
      .set({ status: 'EXPIRED', updatedAt: new Date() })
      .where(and(eq(proposals.id, proposal.id), eq(proposals.status, proposal.status)))
      .returning({ id: proposals.id });

    // Solo se audita si esta llamada fue la que cambió el estado. Si el barrido
    // se adelantó, el evento ya está escrito y duplicarlo ensuciaría la cadena.
    if (updated.length > 0) {
      await this.deps.audit.append({
        userId: proposal.userId,
        proposalId: proposal.id,
        type: 'PROPOSAL_EXPIRED',
        payload: { expiresAt: proposal.expiresAt, detectedBy: 'lectura' },
      });
    }

    return { ...proposal, status: 'EXPIRED' };
  }
}

/**
 * Decide el estado tras el Guardian.
 *
 * Esta es la degradación por riesgo: aunque la política dijera AUTO_APPROVE, un
 * riesgo MEDIUM o superior devuelve el control al usuario.
 */
export function decideNextStatus(
  decision: PolicyDecision,
  risk: RiskReport,
): 'AUTO_APPROVED' | 'PENDING_USER' {
  if (decision.decision !== 'AUTO_APPROVE') return 'PENDING_USER';
  if (risk.level !== 'LOW') return 'PENDING_USER';
  return 'AUTO_APPROVED';
}

/** Suma de una lista de acciones, siempre normalizada a 7 decimales. */
export function totalOf(actions: Pick<ProposedAction, 'amount'>[]): string {
  return addAmounts('0', ...actions.map((action) => action.amount));
}

type Row = typeof proposals.$inferSelect;

function toProposal(row: Row): Proposal {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as ProposalStatus,
    summary: row.summary,
    actions: ActionsSchema.parse(row.actions),
    policy: parseOrNull(PolicyDecisionSchema, row.policy) as PolicyDecision | null,
    risk: parseOrNull(RiskReportSchema, row.risk) as RiskReport | null,
    explanation: parseOrNull(ExplanationSchema, row.explanation) as Explanation | null,
    unsignedXdr: row.unsignedXdr,
    txHash: row.txHash,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseOrNull<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
