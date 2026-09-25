import { FIXTURE_DESTINATIONS, type Proposal } from '@aegis/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proposals } from '../db/schema.js';
import { FakeStellarExecutor, FakeStellarReader } from '@aegis/stellar/testing';
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

describe('reconciliación de envíos sin desenlace (BE1-09)', () => {
  /** Deja una propuesta como si el proceso hubiera muerto tras enviarla. */
  async function dejarEnviada(hash: string | null): Promise<string> {
    const proposal = await proponer();

    await harness.db
      .update(proposals)
      .set({
        status: 'SUBMITTED',
        txHash: hash,
        updatedAt: new Date(Date.now() - 10 * 60_000),
      })
      .where(eq(proposals.id, proposal.id));

    return proposal.id;
  }

  async function estado(id: string) {
    const [row] = await harness.db
      .select({ status: proposals.status, failureReason: proposals.failureReason })
      .from(proposals)
      .where(eq(proposals.id, id));
    return row;
  }

  it('confirma la que el ledger dice que tuvo éxito', async () => {
    const id = await dejarEnviada('a'.repeat(64));

    const resultado = await harness.app.services.sweeper.sweep();

    expect(resultado.reconciled).toBeGreaterThanOrEqual(1);
    expect((await estado(id))?.status).toBe('CONFIRMED');
    expect(await auditoriaDe(id)).toContain('TX_CONFIRMED');
  });

  it('marca como fallida la que el ledger rechazó', async () => {
    const hash = 'b'.repeat(64);
    const harnessFallido = await createTestApp({
      overrides: {
        agent: createScriptedAgent(),
        reader: new FakeStellarReader({
          transactionStatuses: { [hash]: { found: true, successful: false } },
        }),
      },
    });

    try {
      const sesion = await login(harnessFallido.app, ADDRESS);
      const destino = await createDestination(harnessFallido.app, sesion.headers, {
        kind: 'GOAL',
        label: VIAJE.label,
        address: VIAJE.address,
      });
      await setPolicy(harnessFallido.app, sesion.headers, { mode: 'MANUAL' });

      const respuesta = await harnessFallido.app.inject({
        method: 'POST',
        url: '/proposals',
        headers: sesion.headers,
        payload: {
          summary: 'Propuesta que la red rechaza',
          actions: [
            {
              type: 'PAYMENT',
              destinationId: destino.id,
              asset: 'USDC_TEST',
              amount: '2',
              memo: null,
              label: 'Pago',
            },
          ],
        },
      });
      const creada = JSON.parse(respuesta.body).proposal;

      await harnessFallido.db
        .update(proposals)
        .set({ status: 'SUBMITTED', txHash: hash, updatedAt: new Date(Date.now() - 10 * 60_000) })
        .where(eq(proposals.id, creada.id));

      await harnessFallido.app.services.sweeper.sweep();

      const [row] = await harnessFallido.db
        .select({ status: proposals.status, failureReason: proposals.failureReason })
        .from(proposals)
        .where(eq(proposals.id, creada.id));

      expect(row?.status).toBe('FAILED');
      expect(row?.failureReason).toContain('rechazó');
    } finally {
      await harnessFallido.close();
    }
  });

  it('NO toca la que no tiene hash: no sabríamos por cuál preguntar', async () => {
    // Marcarla como fallida sería mentir sobre dinero que quizá se movió.
    const id = await dejarEnviada(null);

    await harness.app.services.sweeper.sweep();

    expect((await estado(id))?.status).toBe('SUBMITTED');
  });

  it('respeta el margen antes de preguntarle al ledger', async () => {
    const proposal = await proponer();
    await harness.db
      .update(proposals)
      .set({ status: 'SUBMITTED', txHash: 'c'.repeat(64), updatedAt: new Date() })
      .where(eq(proposals.id, proposal.id));

    // Recién enviada, una transacción puede no ser visible todavía en Horizon.
    await harness.app.services.sweeper.sweep();

    expect((await estado(proposal.id))?.status).toBe('SUBMITTED');
  });
});

describe('un envío sin respuesta no se da por fallido', () => {
  /**
   * Ejecutor al que la red le cuelga el teléfono.
   *
   * Es el caso feo de verdad: el pago puede haber entrado en el ledger o no, y
   * desde aquí no hay forma de saberlo. Horizon lo distingue con un 504 y
   * `@aegis/stellar` lo traduce a `TX_STATUS_UNKNOWN`.
   */
  class EjecutorMudo extends FakeStellarExecutor {
    override async submit(): Promise<{ hash: string }> {
      throw Object.assign(new Error('Horizon agotó el tiempo de espera'), {
        code: 'TX_STATUS_UNKNOWN',
      });
    }
  }

  it('queda en SUBMITTED con su hash, y el barrido lo resuelve contra el ledger', async () => {
    const mudo = await createTestApp({
      overrides: { agent: createScriptedAgent(), executor: new EjecutorMudo() },
    });

    try {
      const sesion = await login(mudo.app, ADDRESS);
      const destino = await createDestination(mudo.app, sesion.headers, {
        kind: 'GOAL',
        label: VIAJE.label,
        address: VIAJE.address,
      });
      // Autónomo: la API firma y envía sola, sin pasar por la wallet.
      await setPolicy(mudo.app, sesion.headers, { mode: 'AUTONOMOUS', paused: false });

      const respuesta = await mudo.app.inject({
        method: 'POST',
        url: '/agent/messages',
        headers: sesion.headers,
        payload: {
          message: JSON.stringify({
            summary: 'Pago que se queda sin respuesta',
            actions: [
              {
                type: 'PAYMENT',
                destinationId: destino.id,
                asset: 'USDC_TEST',
                amount: '2',
                memo: null,
                label: 'Pago',
              },
            ],
          }),
        },
      });

      const creada = (JSON.parse(respuesta.body) as { proposals: Proposal[] }).proposals[0]!;

      // Lo importante: NO es FAILED. Decir que falló un pago que quizá se hizo
      // es la peor respuesta posible, porque invita a reintentarlo.
      expect(creada.status).toBe('SUBMITTED');
      // Y tiene hash, que es lo que hace que el barrido pueda preguntar.
      expect(creada.txHash).toMatch(/^[0-9a-f]{64}$/);

      const eventos = (await mudo.app.services.audit.list(sesion.userId, 200))
        .filter((e) => e.proposalId === creada.id)
        .map((e) => e.type);
      expect(eventos).toContain('TX_STATUS_UNKNOWN');
      expect(eventos).not.toContain('TX_FAILED');

      // Pasado el margen, el ledger tiene la última palabra.
      await mudo.db
        .update(proposals)
        .set({ updatedAt: new Date(Date.now() - 10 * 60_000) })
        .where(eq(proposals.id, creada.id));

      await mudo.app.services.sweeper.sweep();

      const [row] = await mudo.db
        .select({ status: proposals.status })
        .from(proposals)
        .where(eq(proposals.id, creada.id));

      expect(row?.status).toBe('CONFIRMED');
    } finally {
      await mudo.close();
    }
  });
});
