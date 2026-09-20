import { FIXTURE_DESTINATIONS, type Proposal } from '@aegis/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proposals } from '../db/schema.js';
import { createDestination, createTestApp, login, setPolicy, type TestApp } from '../test/app.js';
import { createScriptedAgent } from '../test/scripted-agent.js';
import { NEEDS_NETWORK_RECONCILIATION, SWEEP_TARGETS } from './sweeper.js';

/**
 * Barrido de propuestas: caducidad real y rescate de estados colgados.
 */

const VIAJE = FIXTURE_DESTINATIONS[0]!;
const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

let harness: TestApp;
let app: FastifyInstance;
let headers: { authorization: string };
let userId: string;
let destinoId: string;

beforeAll(async () => {
  harness = await createTestApp({ overrides: { agent: createScriptedAgent() } });
  app = harness.app;

  const session = await login(app, ADDRESS);
  headers = session.headers;
  userId = session.userId;

  const destino = await createDestination(app, headers, {
    kind: 'GOAL',
    label: VIAJE.label,
    address: VIAJE.address,
  });
  destinoId = destino.id;

  await setPolicy(app, headers, { mode: 'MANUAL' });
});

afterAll(async () => {
  await harness.close();
});

async function proponer(amount = '2'): Promise<Proposal> {
  const response = await app.inject({
    method: 'POST',
    url: '/agent/messages',
    headers,
    payload: {
      message: JSON.stringify({
        summary: 'Propuesta para el barrido',
        actions: [
          {
            type: 'PAYMENT',
            destinationId: destinoId,
            asset: 'USDC_TEST',
            amount,
            memo: null,
            label: 'Pago de test',
          },
        ],
      }),
    },
  });

  return (JSON.parse(response.body) as { proposals: Proposal[] }).proposals[0]!;
}

async function auditoriaDe(proposalId: string): Promise<string[]> {
  const eventos = await harness.app.services.audit.list(userId, 200);
  return eventos.filter((e) => e.proposalId === proposalId).map((e) => e.type);
}

describe('caducidad (P-09)', () => {
  it('caduca lo vencido aunque nadie lo haya leído, y lo deja en la bitácora', async () => {
    const proposal = await proponer();
    expect(proposal.status).toBe('PENDING_USER');

    // Se empuja la caducidad al pasado sin leer la propuesta: así se comprueba
    // que el barrido actúa por su cuenta, no la caducidad perezosa de la lectura.
    await harness.db
      .update(proposals)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(proposals.id, proposal.id));

    const resultado = await harness.app.services.sweeper.sweep();

    expect(resultado.expired).toBeGreaterThanOrEqual(1);

    const [row] = await harness.db
      .select({ status: proposals.status })
      .from(proposals)
      .where(eq(proposals.id, proposal.id));

    expect(row?.status).toBe('EXPIRED');
    expect(await auditoriaDe(proposal.id)).toContain('PROPOSAL_EXPIRED');
  });

  it('una propuesta caducada ya no se puede aprobar', async () => {
    const proposal = await proponer();

    await harness.db
      .update(proposals)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(proposals.id, proposal.id));

    await harness.app.services.sweeper.sweep();

    const response = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload: { signedXdr: 'xdr-firmado' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('no toca lo que todavía está dentro de su ventana', async () => {
    const proposal = await proponer();

    await harness.app.services.sweeper.sweep();

    const [row] = await harness.db
      .select({ status: proposals.status })
      .from(proposals)
      .where(eq(proposals.id, proposal.id));

    expect(row?.status).toBe('PENDING_USER');
  });
});

describe('propuestas abandonadas', () => {
  it('rescata una propuesta que se quedó colgada a mitad del pipeline', async () => {
    const proposal = await proponer();

    // Simula que el proceso murió entre POLICY_CHECK y GUARDIAN_REVIEW.
    await harness.db
      .update(proposals)
      .set({ status: 'GUARDIAN_REVIEW', updatedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(proposals.id, proposal.id));

    const resultado = await harness.app.services.sweeper.sweep();

    expect(resultado.abandoned).toBeGreaterThanOrEqual(1);

    const [row] = await harness.db
      .select({ status: proposals.status, failureReason: proposals.failureReason })
      .from(proposals)
      .where(eq(proposals.id, proposal.id));

    expect(row?.status).toBe('FAILED');
    expect(row?.failureReason).toContain('interrumpió');
    expect(await auditoriaDe(proposal.id)).toContain('PROPOSAL_ABANDONED');
  });

  it('respeta una propuesta intermedia que acaba de moverse', async () => {
    const proposal = await proponer();

    await harness.db
      .update(proposals)
      .set({ status: 'POLICY_CHECK', updatedAt: new Date() })
      .where(eq(proposals.id, proposal.id));

    await harness.app.services.sweeper.sweep();

    const [row] = await harness.db
      .select({ status: proposals.status })
      .from(proposals)
      .where(eq(proposals.id, proposal.id));

    expect(row?.status).toBe('POLICY_CHECK');
  });

  it('NO toca lo ya firmado o enviado, por antiguo que sea', async () => {
    // Es la decisión más importante del barrido: en SIGNED y SUBMITTED existe
    // una transacción que puede haber llegado a la red. Marcarla como fallida
    // sin preguntarle a Stellar sería mentir sobre dinero que quizá se movió.
    for (const status of NEEDS_NETWORK_RECONCILIATION) {
      const proposal = await proponer();

      await harness.db
        .update(proposals)
        .set({ status, updatedAt: new Date(Date.now() - 24 * 60 * 60_000) })
        .where(eq(proposals.id, proposal.id));

      await harness.app.services.sweeper.sweep();

      const [row] = await harness.db
        .select({ status: proposals.status })
        .from(proposals)
        .where(eq(proposals.id, proposal.id));

      expect(row?.status, `${status} no debe tocarse: lo reconcilia BE1-09`).toBe(status);
    }
  });
});

describe('configuración del barrido', () => {
  it('no solapa estados entre caducables y abandonables', () => {
    const solapados = SWEEP_TARGETS.EXPIRABLE.filter((s) => SWEEP_TARGETS.ABANDONABLE.includes(s));

    expect(solapados).toEqual([]);
  });

  it('deja fuera los estados que exigen consultar la red', () => {
    for (const status of NEEDS_NETWORK_RECONCILIATION) {
      expect(SWEEP_TARGETS.EXPIRABLE).not.toContain(status);
      expect(SWEEP_TARGETS.ABANDONABLE).not.toContain(status);
    }
  });

  it('start() y stop() son idempotentes', () => {
    const sweeper = harness.app.services.sweeper;

    expect(() => {
      sweeper.start(60_000);
      sweeper.start(60_000);
      sweeper.stop();
      sweeper.stop();
    }).not.toThrow();
  });
});
