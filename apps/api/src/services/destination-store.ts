import type { CreateDestinationInput, Destination, DestinationKind } from '@aegis/contracts';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { destinations } from '../db/schema.js';
import { newDestinationId } from '../lib/ids.js';

type Row = typeof destinations.$inferSelect;

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
  }

  async findById(userId: string, id: string): Promise<Destination | undefined> {
    const rows = await this.list(userId);
    return rows.find((d) => d.id === id);
  }
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
