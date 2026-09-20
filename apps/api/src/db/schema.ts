import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Esquema de la base de datos.
 *
 * Dos decisiones que conviene entender antes de tocar nada:
 *
 * 1. Los montos se guardan como `text`, no como `numeric` ni `double`. El
 *    formato canónico del proyecto es el string decimal y convertirlo de ida y
 *    vuelta solo añade sitios donde perder precisión.
 *
 * 2. Las estructuras ricas (acciones, decisión de política, informe de riesgo)
 *    van en `jsonb` y se validan con los esquemas Zod de `@aegis/contracts` al
 *    leerlas. En un MVP de seis semanas el contrato cambia más rápido que las
 *    migraciones; la validación al leer nos da la seguridad sin el peaje.
 */

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    address: text('address').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_address_idx').on(table.address)],
);

/** Retos de login pendientes de firma. Se consumen una sola vez (BE2-02). */
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: text('id').primaryKey(),
    address: text('address').notNull(),
    challenge: text('challenge').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_challenges_address_idx').on(table.address)],
);

export const destinations = pgTable(
  'destinations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    address: text('address').notNull(),
    targetAmount: text('target_amount'),
    targetAsset: text('target_asset'),
    trusted: boolean('trusted').notNull().default(false),
    blocked: boolean('blocked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('destinations_user_idx').on(table.userId),
    // Un usuario no puede registrar dos veces la misma dirección: evita
    // duplicados que confundirían al agente al elegir destino.
    uniqueIndex('destinations_user_address_idx').on(table.userId, table.address),
  ],
);

/** Configuración de política por usuario. Un registro por usuario (P-01…P-09). */
export const policies = pgTable('policies', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  config: jsonb('config').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const proposals = pgTable(
  'proposals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    summary: text('summary').notNull(),
    actions: jsonb('actions').notNull(),
    policy: jsonb('policy'),
    risk: jsonb('risk'),
    explanation: jsonb('explanation'),
    /** XDR preparado para que lo firme el usuario con su wallet. */
    unsignedXdr: text('unsigned_xdr'),
    txHash: text('tx_hash'),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('proposals_user_idx').on(table.userId),
    index('proposals_status_idx').on(table.status),
    index('proposals_user_updated_idx').on(table.userId, table.updatedAt),
  ],
);

/**
 * Bitácora append-only (BE2-06).
 *
 * Nunca se actualiza ni se borra: solo se inserta. Cada fila encadena el hash
 * de la anterior del mismo usuario, así que alterar un evento pasado rompe la
 * cadena y se detecta (BE2-Q4).
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    /** Orden total de inserción. Es lo que define la cadena. */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    proposalId: text('proposal_id'),
    type: text('type').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    previousHash: text('previous_hash'),
    hash: text('hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_user_seq_idx').on(table.userId, table.seq),
    index('audit_events_proposal_idx').on(table.proposalId),
  ],
);

/** Turnos de conversación con el agente. */
export const agentMessages = pgTable(
  'agent_messages',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('agent_messages_conversation_idx').on(table.conversationId, table.createdAt)],
);
