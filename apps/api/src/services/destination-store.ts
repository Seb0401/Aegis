import type {
  CreateDestinationInput,
  Destination,
  DestinationKind,
  UpdateDestinationInput,
} from '@aegis/contracts';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { destinations } from '../db/schema.js';
import { AppError, errors } from '../lib/errors.js';
import { newDestinationId } from '../lib/ids.js';

type Row = typeof destinations.$inferSelect;

/** Código de Postgres para violación de restricción única. */
const UNIQUE_VIOLATION = '23505';

export class DestinationStore {
  constructor(private readonly db: Database) {}

  async list(userId: string): Promise<Destination[]> {
    const rows = await this.db
      .select()
      .from(destinations)
      .where(eq(destinations.userId, userId))
      .orderBy(asc(destinations.createdAt));

    return rows.map(toDestination);
  }

  async create(userId: string, input: CreateDestinationInput): Promise<Destination> {
    try {
      const [row] = await this.db
        .insert(destinations)
        .values({
          id: newDestinationId(),
          userId,
          kind: input.kind,
          label: input.label,
          address: input.address,
          targetAmount: input.targetAmount ?? null,
          targetAsset: input.targetAsset ?? null,
          trusted: input.trusted ?? false,
          blocked: false,
        })
        .returning();

      return toDestination(row!);
    } catch (error) {
      // Sin esto, registrar dos veces la misma dirección devolvía un 500 y el
      // frontend no podía distinguirlo de una caída del servidor.
      if (isUniqueViolation(error)) {
        throw new AppError(
          'DESTINATION_ALREADY_EXISTS',
          'Ya tienes un destino registrado con esa dirección.',
          409,
        );
      }

      throw error;
    }
  }

  /**
   * Actualiza un destino existente.
   *
   * La dirección nunca cambia (ver `UpdateDestinationInputSchema`): esto sirve
   * para renombrar, marcar como de confianza o bloquear.
   */
  async update(userId: string, id: string, patch: UpdateDestinationInput): Promise<Destination> {
    const changes: Partial<typeof destinations.$inferInsert> = {};

    if (patch.label !== undefined) changes.label = patch.label;
    if (patch.trusted !== undefined) changes.trusted = patch.trusted;
    if (patch.blocked !== undefined) changes.blocked = patch.blocked;
    if (patch.targetAmount !== undefined) changes.targetAmount = patch.targetAmount ?? null;
    if (patch.targetAsset !== undefined) changes.targetAsset = patch.targetAsset ?? null;

    const [row] = await this.db
      .update(destinations)
      .set(changes)
      .where(and(eq(destinations.id, id), eq(destinations.userId, userId)))
      .returning();

    // La condición sobre `userId` es también el control de acceso: si el
    // destino es de otra persona no se actualiza nada y aquí sale un 404.
    if (!row) throw errors.notFound('el destino');

    return toDestination(row);
  }

  async findById(userId: string, id: string): Promise<Destination | undefined> {
    const [row] = await this.db
      .select()
      .from(destinations)
      .where(and(eq(destinations.id, id), eq(destinations.userId, userId)))
      .limit(1);

    return row ? toDestination(row) : undefined;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

function toDestination(row: Row): Destination {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as DestinationKind,
    label: row.label,
    address: row.address,
    targetAmount: row.targetAmount,
    targetAsset: row.targetAsset as Destination['targetAsset'],
    trusted: row.trusted,
    blocked: row.blocked,
    createdAt: row.createdAt.toISOString(),
  };
}
