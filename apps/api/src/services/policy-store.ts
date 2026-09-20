import {
  DEFAULT_POLICY_CONFIG,
  PolicyConfigSchema,
  ProposedActionSchema,
  addAmounts,
  type AssetCode,
  type PolicyConfig,
  type UpdatePolicyInput,
} from '@aegis/contracts';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { policies, proposals } from '../db/schema.js';

/**
 * Estados que cuentan como "ya comprometido". Una propuesta firmada consume
 * presupuesto aunque la red todavía no la haya confirmado: si no, entre la
 * firma y la confirmación el agente podría gastar dos veces el límite diario.
 */
const COMMITTED_STATUSES = ['SIGNED', 'SUBMITTED', 'CONFIRMED'];

const ActionsSchema = z.array(ProposedActionSchema);

export class PolicyStore {
  constructor(private readonly db: Database) {}

  /** Configuración del usuario, o los valores por defecto de §8.1 si no tiene. */
  async getConfig(userId: string): Promise<PolicyConfig> {
    const [row] = await this.db
      .select({ config: policies.config })
      .from(policies)
      .where(eq(policies.userId, userId))
      .limit(1);

    if (!row) return DEFAULT_POLICY_CONFIG;

    const parsed = PolicyConfigSchema.safeParse(row.config);
    if (!parsed.success) {
      // Una configuración corrupta no puede dejar al agente sin límites:
      // se cae hacia los valores por defecto, que son los más restrictivos.
      return DEFAULT_POLICY_CONFIG;
    }

    return parsed.data;
  }

  async updateConfig(userId: string, patch: UpdatePolicyInput): Promise<PolicyConfig> {
    const current = await this.getConfig(userId);
    const next = PolicyConfigSchema.parse({ ...current, ...patch });

    await this.db
      .insert(policies)
      .values({ userId, config: next, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: policies.userId,
        set: { config: next, updatedAt: new Date() },
      });

    return next;
  }

  /** Importe comprometido en las últimas 24 h, por activo (P-02). */
  async getDailySpentByAsset(
    userId: string,
    now = new Date(),
  ): Promise<Partial<Record<AssetCode, string>>> {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const rows = await this.committedSince(userId, since);

    const totals: Partial<Record<AssetCode, string>> = {};

    for (const row of rows) {
      const actions = ActionsSchema.safeParse(row.actions);
      if (!actions.success) continue;

      for (const action of actions.data) {
        totals[action.asset] = addAmounts(totals[action.asset] ?? '0', action.amount);
      }
    }

    return totals;
  }

  /** Operaciones comprometidas en la última hora (P-05). */
  async getOperationsLastHour(userId: string, now = new Date()): Promise<number> {
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const rows = await this.committedSince(userId, since);

    return rows.reduce((count, row) => {
      const actions = ActionsSchema.safeParse(row.actions);
      return count + (actions.success ? actions.data.length : 0);
    }, 0);
  }

  private async committedSince(userId: string, since: Date) {
    return this.db
      .select({ actions: proposals.actions })
      .from(proposals)
      .where(
        and(
          eq(proposals.userId, userId),
          inArray(proposals.status, COMMITTED_STATUSES),
          gte(proposals.updatedAt, since),
        ),
      );
  }
}
