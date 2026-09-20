import { createHash } from 'node:crypto';
import type { AuditEventType } from '@aegis/contracts';
import { desc, eq } from 'drizzle-orm';
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
 * Límite conocido: el encadenado es por usuario y la lectura del último evento
 * más la inserción ocurren dentro de una transacción, pero sin bloqueo
 * explícito. Con escrituras concurrentes del mismo usuario dos eventos podrían
 * apuntar al mismo padre. Para el MVP es aceptable (un usuario no opera en
 * paralelo consigo mismo); si aparece una cola de trabajos (BE2-Q2) habrá que
 * añadir un `SELECT … FOR UPDATE` sobre el usuario.
 */
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

  /** Recalcula la cadena completa de un usuario. Devuelve el primer punto roto. */
  async verifyChain(userId: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const events = await this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.userId, userId))
      .orderBy(auditEvents.seq);

    let previousHash: string | null = null;

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
        return { valid: false, brokenAt: event.id };
      }

      previousHash = event.hash;
    }

    return { valid: true };
  }
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
