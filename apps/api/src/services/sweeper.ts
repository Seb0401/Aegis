import type { ProposalStatus, StellarReader } from '@aegis/contracts';
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { proposals } from '../db/schema.js';
import type { AuditLog } from './audit.js';

/**
 * Barrido periódico de propuestas (P-09 y rescate de estados colgados).
 *
 * Resuelve dos problemas distintos:
 *
 * 1. **Caducidad de verdad.** Antes, una propuesta solo caducaba cuando alguien
 *    la leía. La que nadie consultaba se quedaba en `PENDING_USER` para siempre,
 *    y podía aprobarse horas después de su ventana de 10 minutos.
 *
 * 2. **Propuestas abandonadas.** Si el proceso muere entre `POLICY_CHECK` y
 *    `GUARDIAN_REVIEW`, nadie las rescataba: no son estados terminales y la
 *    caducidad perezosa no los miraba.
 *
 * 3. **Envíos sin desenlace** (BE1-09). Si el proceso muere entre que la red
 *    acepta un pago y que lo anotamos, la propuesta se queda en `SUBMITTED` y
 *    nadie sabe si el dinero se movió. Aquí se le pregunta al ledger, que es la
 *    única respuesta honesta.
 *
 * Los tres casos escriben en la bitácora. Un cambio de estado sin evento de
 * auditoría es justo el agujero que el principio nº 6 no permite.
 */

/** Estados que esperan al usuario y por tanto pueden caducar. */
const EXPIRABLE: ProposalStatus[] = ['PENDING_USER', 'AUTO_APPROVED'];

/**
 * Estados intermedios que se pueden abandonar sin riesgo.
 *
 * Deliberadamente **no** incluye `SIGNED` ni `SUBMITTED`. En esos dos ya existe
 * una transacción firmada que puede haber llegado a la red: marcarla como
 * fallida sin preguntarle a Stellar sería mentir sobre dinero que quizá se
 * movió. Reconciliarlos exige consultar la red y es BE1-09.
 */
const ABANDONABLE: ProposalStatus[] = ['DRAFT', 'POLICY_CHECK', 'GUARDIAN_REVIEW'];

export interface SweepResult {
  expired: number;
  abandoned: number;
  reconciled: number;
}

export interface ProposalSweeperOptions {
  db: Database;
  audit: AuditLog;
  /** Tiempo sin avanzar tras el cual un estado intermedio se da por perdido. */
  staleAfterMs?: number;
  /** Se invoca con los errores del barrido en segundo plano. */
  onError?: (error: unknown) => void;
  /**
   * Lector de la red, para reconciliar los envíos sin desenlace.
   * Sin él, el barrido hace lo demás y deja `SUBMITTED` intacto.
   */
  reader?: StellarReader;
  /** Margen antes de ir a preguntarle al ledger por un envío. */
  reconcileAfterMs?: number;
}

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Margen antes de preguntar por una transacción enviada.
 *
 * Dos minutos, no dos segundos: una transacción recién enviada puede tardar en
 * ser visible en Horizon, y preguntar demasiado pronto daría `found: false` y
 * llevaría a marcar como fallido algo que sí se ejecutó.
 */
const DEFAULT_RECONCILE_AFTER_MS = 2 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 1000;

export class ProposalSweeper {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly options: ProposalSweeperOptions) {}

  /**
   * Ejecuta una pasada. Es idempotente: cada actualización va condicionada al
   * estado que esperaba encontrar, así que dos instancias haciendo el barrido a
   * la vez no se pisan (solo duplican trabajo inofensivo).
   */
  async sweep(now = new Date()): Promise<SweepResult> {
    const expired = await this.expireOverdue(now);
    const abandoned = await this.abandonStale(now);
    const reconciled = await this.reconcileSubmitted(now);

    return { expired, abandoned, reconciled };
  }

  /**
   * Cierra las propuestas que se enviaron pero se quedaron sin desenlace.
   *
   * Solo mira las que tienen hash: si no lo hay, no sabemos por qué
   * transacción preguntar y **no se toca nada**. Marcar como fallido algo que
   * quizá se ejecutó sería mentir sobre dinero, que es justo lo que este
   * barrido existe para evitar.
   */
  private async reconcileSubmitted(now: Date): Promise<number> {
    const reader = this.options.reader;
    if (!reader) return 0;

    const threshold = new Date(
      now.getTime() - (this.options.reconcileAfterMs ?? DEFAULT_RECONCILE_AFTER_MS),
    );

    const pendientes = await this.options.db
      .select({
        id: proposals.id,
        userId: proposals.userId,
        txHash: proposals.txHash,
      })
      .from(proposals)
      .where(
        and(
          eq(proposals.status, 'SUBMITTED'),
          isNotNull(proposals.txHash),
          lt(proposals.updatedAt, threshold),
        ),
      );

    let cerradas = 0;

    for (const row of pendientes) {
      const hash = row.txHash;
      if (!hash) continue;

      const status = await reader.getTransactionStatus(hash);

      // Que el ledger no la conozca no basta para darla por perdida: puede
      // seguir propagándose. Se deja para la siguiente pasada.
      if (!status.found) continue;

      const siguiente: ProposalStatus = status.successful ? 'CONFIRMED' : 'FAILED';

      const actualizadas = await this.options.db
        .update(proposals)
        .set({
          status: siguiente,
          updatedAt: now,
          ...(status.successful ? {} : { failureReason: 'La red rechazó la transacción.' }),
        })
        .where(and(eq(proposals.id, row.id), eq(proposals.status, 'SUBMITTED')))
        .returning({ id: proposals.id });

      if (actualizadas.length === 0) continue;

      await this.options.audit.append({
        userId: row.userId,
        proposalId: row.id,
        type: status.successful ? 'TX_CONFIRMED' : 'TX_FAILED',
        payload: { hash, reconciledAt: now.toISOString(), source: 'barrido' },
      });

      cerradas += 1;
    }

    return cerradas;
  }

  private async expireOverdue(now: Date): Promise<number> {
    const overdue = await this.options.db
      .update(proposals)
      .set({ status: 'EXPIRED', updatedAt: now })
      .where(and(inArray(proposals.status, EXPIRABLE), lt(proposals.expiresAt, now)))
      .returning({
        id: proposals.id,
        userId: proposals.userId,
        expiresAt: proposals.expiresAt,
      });

    for (const row of overdue) {
      await this.options.audit.append({
        userId: row.userId,
        proposalId: row.id,
        type: 'PROPOSAL_EXPIRED',
        payload: { expiresAt: row.expiresAt.toISOString(), sweptAt: now.toISOString() },
      });
    }

    return overdue.length;
  }

  private async abandonStale(now: Date): Promise<number> {
    const threshold = new Date(
      now.getTime() - (this.options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS),
    );

    const stale = await this.options.db
      .update(proposals)
      .set({
        status: 'FAILED',
        failureReason: 'La evaluación se interrumpió y no llegó a completarse.',
        updatedAt: now,
      })
      .where(and(inArray(proposals.status, ABANDONABLE), lt(proposals.updatedAt, threshold)))
      .returning({ id: proposals.id, userId: proposals.userId });

    for (const row of stale) {
      await this.options.audit.append({
        userId: row.userId,
        proposalId: row.id,
        type: 'PROPOSAL_ABANDONED',
        payload: { sweptAt: now.toISOString() },
      });
    }

    return stale.length;
  }

  /**
   * Arranca el barrido en segundo plano.
   *
   * Lo llama el proceso principal, no `buildServer`: así los tests controlan
   * cuándo corre el barrido en vez de pelearse con un temporizador de fondo.
   */
  start(intervalMs = DEFAULT_INTERVAL_MS): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      if (this.running) return; // Una pasada lenta no debe solaparse con la siguiente.
      this.running = true;

      void this.sweep()
        .catch((error: unknown) => this.options.onError?.(error))
        .finally(() => {
          this.running = false;
        });
    }, intervalMs);

    // Que el barrido no impida que el proceso termine.
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Estados sobre los que el barrido no actúa y que necesitan BE1-09. */
export const NEEDS_NETWORK_RECONCILIATION: ProposalStatus[] = ['SIGNED', 'SUBMITTED'];

/** Comprueba si un estado quedó fuera del barrido. Existe para documentarlo en los tests. */
export function isSweepable(status: ProposalStatus): boolean {
  return EXPIRABLE.includes(status) || ABANDONABLE.includes(status);
}

/** Estados sobre los que actúa el barrido, expuestos para los tests. */
export const SWEEP_TARGETS = { EXPIRABLE, ABANDONABLE } as const;
