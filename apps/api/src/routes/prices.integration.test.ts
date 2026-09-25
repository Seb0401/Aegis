import {
  FIXTURE_DESTINATIONS,
  findQuote,
  type PriceProvider,
  type PriceSnapshot,
  type Proposal,
} from '@aegis/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDestination, createTestApp, login, setPolicy, type TestApp } from '../test/app.js';
import { createScriptedAgent } from '../test/scripted-agent.js';

/**
 * Precios en dólares de punta a punta (ADR 0011).
 *
 * Lo que de verdad importa comprobar aquí no es que la conversión sume bien
 * —eso ya lo cubren los tests del motor— sino que el sistema **se comporta
 * distinto** cuando el oráculo no responde: ni se cuelga, ni deniega, ni aplica
 * un límite con un precio inventado.
 */

const VIAJE = FIXTURE_DESTINATIONS[0]!;
const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

/** Proveedor que nunca sabe un precio, como si el oráculo estuviera caído. */
const sinPrecios: PriceProvider = {
  getPrices: async () => ({ capturedAt: new Date().toISOString(), quotes: [] }),
};

async function montar(overrides?: { prices?: PriceProvider }) {
  const harness = await createTestApp({
    overrides: { agent: createScriptedAgent(), ...overrides },
  });

  const session = await login(harness.app, ADDRESS);
  const destino = await createDestination(harness.app, session.headers, {
    kind: 'GOAL',
    label: VIAJE.label,
    address: VIAJE.address,
  });

  return { harness, headers: session.headers, destinoId: destino.id };
}

async function proponer(
  app: FastifyInstance,
  headers: { authorization: string },
  destinoId: string,
  amount: string,
  asset: 'XLM' | 'USDC_TEST' = 'USDC_TEST',
): Promise<Proposal> {
  const response = await app.inject({
    method: 'POST',
    url: '/agent/messages',
    headers,
    payload: {
      message: JSON.stringify({
        summary: 'Propuesta con precios',
        actions: [
          {
            type: 'PAYMENT',
            destinationId: destinoId,
            asset,
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

describe('con precios disponibles', () => {
  let harness: TestApp;
  let app: FastifyInstance;
  let headers: { authorization: string };
  let destinoId: string;

  beforeAll(async () => {
    const montaje = await montar();
    harness = montaje.harness;
    app = harness.app;
    headers = montaje.headers;
    destinoId = montaje.destinoId;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('GET /prices devuelve el precio con su fuente y su antigüedad', async () => {
    const response = await app.inject({ method: 'GET', url: '/prices' });

    expect(response.statusCode).toBe(200);
    const snapshot = JSON.parse(response.body) as PriceSnapshot;

    expect(findQuote(snapshot, 'USDC_TEST')).toMatchObject({ usd: '1', source: 'fixed' });
    // `asOf` permite a la interfaz distinguir un precio fresco de uno rancio.
    expect(findQuote(snapshot, 'XLM')?.asOf).toBeTruthy();
  });

  it('no exige sesión: un tipo de cambio no es dato de nadie', async () => {
    expect((await app.inject({ method: 'GET', url: '/prices' })).statusCode).toBe(200);
  });

  it('guarda la foto de precios junto a la propuesta', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });
    const proposal = await proponer(app, headers, destinoId, '2');

    // Sin esto no se podría explicar dentro de un mes por qué se aprobó.
    expect(findQuote(proposal.prices, 'USDC_TEST')?.usd).toBe('1');
    expect(proposal.risk?.totalUsd).toBe('2.0000000');
  });

  it('el tope en dólares ata aunque el monto quepa en el límite del activo', async () => {
    await setPolicy(app, headers, {
      mode: 'AUTONOMOUS',
      maxAmountPerOperation: '10000',
      maxDailyAmount: '10000',
      minimumReserve: '0',
      maxAmountPerOperationUsd: '5',
      maxDailyAmountUsd: '10000',
      minimumReserveUsd: null,
    });

    // 50 XLM caben en un límite de 10 000 XLM (y en el saldo disponible, que es
    // de 95), pero a 0.12 el XLM son 6 dólares y el tope es de 5.
    const proposal = await proponer(app, headers, destinoId, '50', 'XLM');

    expect(proposal.status).toBe('PENDING_USER');
    const razon = proposal.policy?.reasons.find((r) => r.ruleId === 'P-01' && r.unit === 'usd');
    expect(razon?.message).toContain('$6.00');
  });

  it('la explicación menciona el valor en dólares', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });
    const proposal = await proponer(app, headers, destinoId, '3');

    expect(proposal.explanation?.summary).toContain('$3.00');
  });
});

describe('con el oráculo caído', () => {
  let harness: TestApp;
  let app: FastifyInstance;
  let headers: { authorization: string };
  let destinoId: string;

  beforeAll(async () => {
    const montaje = await montar({ prices: sinPrecios });
    harness = montaje.harness;
    app = harness.app;
    headers = montaje.headers;
    destinoId = montaje.destinoId;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('escala al usuario en vez de denegar', async () => {
    await setPolicy(app, headers, {
      mode: 'AUTONOMOUS',
      maxAmountPerOperation: '10000',
      maxDailyAmount: '10000',
      minimumReserve: '0',
    });

    const proposal = await proponer(app, headers, destinoId, '2');

    // Una caída de un tercero no puede dejar el producto inutilizable.
    expect(proposal.status).toBe('PENDING_USER');
    expect(proposal.status).not.toBe('DENIED');
    expect(proposal.policy?.reasons.some((r) => r.ruleId === 'P-10')).toBe(true);
  });

  it('avisa en el informe de riesgo y no inventa el total en dólares', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });
    const proposal = await proponer(app, headers, destinoId, '2');

    expect(proposal.risk?.signals.some((s) => s.id === 'G-10')).toBe(true);
    expect(proposal.risk?.totalUsd).toBeNull();
    expect(proposal.explanation?.summary).not.toContain('$');
  });

  it('no aplica ninguna regla en dólares a ciegas', async () => {
    await setPolicy(app, headers, {
      mode: 'AUTONOMOUS',
      maxAmountPerOperation: '10000',
      maxDailyAmount: '10000',
      minimumReserve: '0',
      maxAmountPerOperationUsd: '1',
    });

    const proposal = await proponer(app, headers, destinoId, '200');
    const enDolares = proposal.policy?.reasons.filter(
      (r) => r.unit === 'usd' && r.ruleId !== 'P-10',
    );

    expect(enDolares).toEqual([]);
  });
});

describe('delegación del signer (BE1-05)', () => {
  let harness: TestApp;
  let app: FastifyInstance;
  let headers: { authorization: string };

  beforeAll(async () => {
    const montaje = await montar();
    harness = montaje.harness;
    app = harness.app;
    headers = montaje.headers;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('la clave del agente la pone el servidor, no el cliente', async () => {
    // Si el cliente pudiera elegirla, podría hacer que el usuario firmara una
    // delegación a favor de una cuenta ajena creyendo que era Aegis.
    const propia = app.services.executor.getAgentPublicKey();

    const response = await app.inject({
      method: 'POST',
      url: '/account/delegation/prepare',
      headers,
      payload: { agentPublicKey: 'GDRX6ATFBUJMFDUBRAD7OV535ZADFSVPF2GRUR6EA37LFEJUQ2KIU66D' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { agentPublicKey: string; xdr: string };

    expect(body.agentPublicKey).toBe(propia);
    expect(body.xdr).toBeTruthy();
  });

  it('funciona sin enviar nada en el cuerpo', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/account/delegation/prepare',
      headers,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
  });

  it('exige sesión', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/account/delegation/prepare',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });
});
