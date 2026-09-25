import { createHash } from 'node:crypto';
import type { AuditEventType } from '@aegis/contracts';
import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { auditEvents } from '../db/schema.js';
import { newAuditId } from '../lib/ids.js';

/**
 * Bitácora append-only con hash encadenado (BE2-06, BE2-Q4).
 *
 * Cada evento incluye el hash del anterior del mismo usuario. Si alguien edita
 * una fila pasada directamente en la base de datos, todos los hashes siguientes
 * dejan de cuadrar y `verifyChain` lo detecta.
 *
 * Leer el último evento y escribir el siguiente ocurre dentro de una
 * transacción y **tomando un cerrojo por usuario**: si no, dos escrituras
 * simultáneas del mismo usuario podrían leer el mismo padre y la cadena se
 * bifurcaría. Una bitácora que se bifurca deja de demostrar nada, que es lo
 * único que aporta.
 */
/** La transacción que entrega Drizzle, sin tener que nombrar su tipo entero. */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Cuántos eventos verifica `verifyChain` cuando no se le dice otra cosa. */
const DEFAULT_VERIFY_LIMIT = 200;

export interface ChainVerification {
  valid: boolean;
  /** Id del primer evento que no cuadra, si lo hay. */
  brokenAt?: string;
  /** Cuántos eventos se han comprobado en esta llamada. */
  verifiedEvents: number;
  /** `false` si la ventana verificada no llega al principio de la cadena. */
  complete: boolean;
}

export interface AuditEntry {
  userId: string;
  type: AuditEventType;
  payload?: Record<string, unknown>;
  proposalId?: string | null;
}

export class AuditLog {
  constructor(private readonly db: Database) {}

  async append(entry: AuditEntry): Promise<{ id: string; hash: string }> {
    return this.db.transaction(async (tx) => {
      await lockChain(tx, entry.userId);

      const [previous] = await tx
        .select({ hash: auditEvents.hash })
        .from(auditEvents)
        .where(eq(auditEvents.userId, entry.userId))
        .orderBy(desc(auditEvents.seq))
        .limit(1);

      const id = newAuditId();
      const createdAt = new Date();
      const payload = redact(entry.payload ?? {});
      const previousHash = previous?.hash ?? null;

      const hash = computeHash({
        id,
        userId: entry.userId,
        proposalId: entry.proposalId ?? null,
        type: entry.type,
        payload,
        previousHash,
        createdAt: createdAt.toISOString(),
      });

      await tx.insert(auditEvents).values({
        id,
        userId: entry.userId,
        proposalId: entry.proposalId ?? null,
        type: entry.type,
        payload,
        previousHash,
        hash,
        createdAt,
      });

      return { id, hash };
    });
  }

  async list(userId: string, limit = 100) {
    return this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.userId, userId))
      .orderBy(desc(auditEvents.seq))
      .limit(limit);
  }

  /**
   * Recalcula la cadena y devuelve el primer punto roto.
   *
   * Por defecto verifica solo los últimos `limit` eventos. Recalcular la cadena
   * entera en cada petición es O(n) sobre una tabla que solo crece: con unos
   * pocos miles de eventos, `GET /audit` empezaría a arrastrarse.
   *
   * Verificar una ventana sigue detectando cualquier manipulación **dentro** de
   * ella, que es donde de verdad se mira. El resultado dice si la ventana cubre
   * toda la cadena (`complete`), para no dar una garantía que no se ha
   * comprobado. Para una auditoría exhaustiva se pasa `limit: 0`.
   */
  async verifyChain(userId: string, options: { limit?: number } = {}): Promise<ChainVerification> {
    const limit = options.limit ?? DEFAULT_VERIFY_LIMIT;

    const query = this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.userId, userId))
      .orderBy(desc(auditEvents.seq));

    const recent = limit > 0 ? await query.limit(limit) : await query;
    const events = recent.reverse();

    if (events.length === 0) {
      return { valid: true, verifiedEvents: 0, complete: true };
    }

    // El primer evento de la ventana solo puede enlazar con la nada si es
    // también el primero de la cadena.
    const complete = events[0]!.previousHash === null;
    let previousHash: string | null = events[0]!.previousHash;

    for (const event of events) {
      const expected = computeHash({
        id: event.id,
        userId: event.userId,
        proposalId: event.proposalId,
        type: event.type as AuditEventType,
        payload: event.payload as Record<string, unknown>,
        previousHash,
        createdAt: event.createdAt.toISOString(),
      });

      if (event.previousHash !== previousHash || event.hash !== expected) {
        return {
          valid: false,
          brokenAt: event.id,
          verifiedEvents: events.length,
          complete,
        };
      }

      previousHash = event.hash;
    }

    return { valid: true, verifiedEvents: events.length, complete };
  }
}

/**
 * Serializa las escrituras de la bitácora de un usuario.
 *
 * Es un cerrojo consultivo de Postgres, atado a la transacción: se suelta solo
 * al terminar, pase lo que pase. Se prefiere a un `SELECT … FOR UPDATE` sobre
 * la fila del usuario porque no compite con nada más que toque esa fila: lo
 * que hay que serializar es la cadena, no el usuario.
 *
 * Dos usuarios distintos pueden coincidir en el mismo número —`hashtext` tiene
 * colisiones— y entonces uno espera al otro. Da igual: es raro, dura lo que
 * dura una inserción, y el resultado sigue siendo correcto.
 */
async function lockChain(tx: Transaction, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`audit:${userId}`})::bigint)`);
}

interface HashInput {
  id: string;
  userId: string;
  proposalId: string | null;
  type: AuditEventType;
  payload: Record<string, unknown>;
  previousHash: string | null;
  createdAt: string;
}

function computeHash(input: HashInput): string {
  // `stableStringify` es lo que hace verificable la cadena: sin un orden fijo de
  // claves, el mismo evento produciría hashes distintos según cómo se serialice.
  const canonical = stableStringify({
    id: input.id,
    userId: input.userId,
    proposalId: input.proposalId,
    type: input.type,
    payload: input.payload,
    previousHash: input.previousHash,
    createdAt: input.createdAt,
  });

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`);

  return `{${entries.join(',')}}`;
}

/**
 * Última línea de defensa: aunque nadie debería pasar secretos a la bitácora,
 * si ocurre no se persisten (§12).
 */
const FORBIDDEN_KEYS = /secret|private|seed|passphrase|password|token|signer/i;

function redact(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.test(key)) {
      result[key] = '[redactado]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redact(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}
