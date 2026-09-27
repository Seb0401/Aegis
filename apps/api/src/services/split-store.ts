import { SplitRuleSchema, type SplitRule } from '@aegis/contracts';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { splitRules } from '../db/schema.js';

/**
 * La regla de reparto de cada usuario (BE2-13).
 *
 * Se valida con Zod **al leer**, no solo al escribir: la fila es JSON y puede
 * venir de una versión anterior del esquema o de una mano en la base de datos.
 * Una regla que no se entiende se trata como que no hay regla, porque actuar
 * sobre un reparto que no se sabe interpretar sería mover dinero a ciegas.
 */
export class SplitRuleStore {
  constructor(private readonly db: Database) {}

  async get(userId: string): Promise<{ rule: SplitRule; watchingSince: Date } | null> {
    const [row] = await this.db
      .select()
      .from(splitRules)
      .where(eq(splitRules.userId, userId))
      .limit(1);

    if (!row) return null;

    const parsed = SplitRuleSchema.safeParse(row.config);
    if (!parsed.success) return null;

    return { rule: parsed.data, watchingSince: row.watchingSince };
  }

  /**
   * Guarda la regla.
   *
   * `watchingSince` se mueve al presente **solo al encenderla estando
   * apagada**. Es la frontera entre «esto ya pasó» y «esto es para mí»: sin
   * ella, activar el reparto dispararía uno por cada ingreso del historial de
   * la cuenta. Y no se toca al editar las partes con la regla ya encendida,
   * porque entonces cambiar un porcentaje haría que Aegis se olvidara de los
   * ingresos que estaba vigilando.
   */
  async save(userId: string, rule: SplitRule): Promise<SplitRule> {
    const actual = await this.get(userId);
    const seEnciende = rule.enabled && !actual?.rule.enabled;

    const valores = {
      userId,
      config: rule,
      updatedAt: new Date(),
      ...(seEnciende || !actual ? { watchingSince: new Date() } : {}),
    };

    await this.db
      .insert(splitRules)
      .values(valores)
      .onConflictDoUpdate({ target: splitRules.userId, set: valores });

    return rule;
  }
}
