import type { ProposalStatus } from '@aegis/contracts';
import { and, inArray, lt } from 'drizzle-orm';
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
 * Ambos casos escriben en la bitácora. Un cambio de estado sin evento de
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
}

export interface ProposalSweeperOptions {
  db: Database;
  audit: AuditLog;
  /** Tiempo sin avanzar tras el cual un estado intermedio se da por perdido. */
  staleAfterMs?: number;
  /** Se invoca con los errores del barrido en segundo plano. */
  onError?: (error: unknown) => void;
}

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
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

    return { expired, abandoned };
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
