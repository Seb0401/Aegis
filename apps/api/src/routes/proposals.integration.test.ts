import { FIXTURE_DESTINATIONS, type Proposal } from '@aegis/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDestination,
  createTestApp,
  getProposal,
  login,
  setPolicy,
  type TestApp,
} from '../test/app.js';
import { createScriptedAgent } from '../test/scripted-agent.js';

/**
 * Tests de integración del pipeline completo.
 *
 * Corren contra Postgres real y contra el `FakeStellarReader`, cuyos datos de
 * historial coinciden con las direcciones de `FIXTURE_DESTINATIONS`. Por eso los
 * destinos de estos tests se registran con esas mismas direcciones: así el
 * Guardian los ve como "conocidos" y podemos distinguir un riesgo bajo de uno
 * alto sin inventar un mock a medida.
 */

const VIAJE = FIXTURE_DESTINATIONS[0]!;
const LAPTOP = FIXTURE_DESTINATIONS[1]!;
const CURSO = FIXTURE_DESTINATIONS[2]!;
const EMERGENCIAS = FIXTURE_DESTINATIONS[3]!;

const USER_ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

let harness: TestApp;
let app: FastifyInstance;
let headers: { authorization: string };
let destinations: { viaje: string; laptop: string; curso: string; emergencias: string };

beforeAll(async () => {
  // Se inyecta un agente que obedece literalmente: estos tests comprueban el
  // pipeline, no la capacidad del agente para entender lenguaje natural.
  harness = await createTestApp({ overrides: { agent: createScriptedAgent() } });
  app = harness.app;

  const session = await login(app, USER_ADDRESS);
  headers = session.headers;

  const [viaje, laptop, curso, emergencias] = await Promise.all([
    createDestination(app, headers, { kind: 'GOAL', label: VIAJE.label, address: VIAJE.address }),
    createDestination(app, headers, { kind: 'GOAL', label: LAPTOP.label, address: LAPTOP.address }),
    createDestination(app, headers, { kind: 'GOAL', label: CURSO.label, address: CURSO.address }),
    createDestination(app, headers, {
      kind: 'EMERGENCY_FUND',
      label: EMERGENCIAS.label,
      address: EMERGENCIAS.address,
    }),
  ]);

  destinations = {
    viaje: viaje.id,
    laptop: laptop.id,
    curso: curso.id,
    emergencias: emergencias.id,
  };
});

afterAll(async () => {
  await harness.close();
});

/**
 * Crea una propuesta con acciones exactas, a través del agente de test.
 *
 * Entra por `/agent/messages` como cualquier propuesta real, así que recorre el
 * pipeline entero: no hay puerta trasera para los tests.
 */
async function propose(
  actions: Array<{ destinationId: string; amount: string; label?: string }>,
  summary = 'Propuesta de test',
): Promise<Proposal> {
  const instruction = {
    summary,
    actions: actions.map((a) => ({
      type: 'PAYMENT' as const,
      destinationId: a.destinationId,
      asset: 'USDC_TEST' as const,
      amount: a.amount,
      memo: null,
      label: a.label ?? 'Pago de test',
    })),
  };

  const response = await app.inject({
    method: 'POST',
    url: '/agent/messages',
    headers,
    payload: { message: JSON.stringify(instruction) },
  });

  if (response.statusCode !== 200) {
    throw new Error(`No se pudo crear la propuesta (${response.statusCode}): ${response.body}`);
  }

  return (JSON.parse(response.body) as { proposals: Proposal[] }).proposals[0]!;
}

describe('pipeline completo', () => {
  it('lleva una propuesta pequeña y segura hasta CONFIRMED sin intervención', async () => {
    await setPolicy(app, headers, { mode: 'AUTONOMOUS', paused: false });

    const proposal = await propose([{ destinationId: destinations.viaje, amount: '5' }]);

    expect(proposal.policy?.decision).toBe('AUTO_APPROVE');
    expect(proposal.risk?.level).toBe('LOW');
    expect(proposal.status).toBe('CONFIRMED');
    expect(proposal.txHash).toBeTruthy();
    // Una propuesta autónoma no necesita XDR para el usuario.
    expect(proposal.unsignedXdr).toBeFalsy();
  });

  it('deja en PENDING_USER lo que supera los límites y prepara el XDR', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });

    const proposal = await propose([{ destinationId: destinations.viaje, amount: '5' }]);

    expect(proposal.policy?.decision).toBe('REQUIRE_USER');
    expect(proposal.status).toBe('PENDING_USER');
    expect(proposal.unsignedXdr).toBeTruthy();
    expect(proposal.explanation?.summary).toContain('Viaje');
  });

  it('exige la firma del usuario: aprobar sin XDR firmado se rechaza', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });
    const proposal = await propose([{ destinationId: destinations.viaje, amount: '2' }]);

    const response = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe('SIGNATURE_REQUIRED');
    // La propuesta no se ha movido de sitio.
    expect((await getProposal(app, headers, proposal.id)).status).toBe('PENDING_USER');
  });

  it('confirma cuando el usuario aporta el XDR firmado', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });
    const proposal = await propose([{ destinationId: destinations.viaje, amount: '2' }]);

    const response = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload: { signedXdr: 'xdr-firmado-por-la-wallet' },
    });

    expect(response.statusCode).toBe(200);
    const approved = (JSON.parse(response.body) as { proposal: Proposal }).proposal;
    expect(approved.status).toBe('CONFIRMED');
    expect(approved.txHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('permite rechazar y deja la propuesta en un estado terminal', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });
    const proposal = await propose([{ destinationId: destinations.viaje, amount: '2' }]);

    const rejected = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/reject`,
      headers,
      payload: { reason: 'no me convence' },
    });

    expect(JSON.parse(rejected.body).proposal.status).toBe('REJECTED');

    // Aprobar después de rechazar no puede resucitarla.
    const late = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload: { signedXdr: 'tarde' },
    });

    expect(late.statusCode).toBe(409);
    expect(JSON.parse(late.body).error.code).toBe('INVALID_TRANSITION');
  });

  it('no deja aprobar dos veces la misma propuesta', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });
    const proposal = await propose([{ destinationId: destinations.viaje, amount: '2' }]);

    const payload = { signedXdr: 'xdr-firmado' };
    const first = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
  });
});

describe('degradación por riesgo y confirmación reforzada', () => {
  it('devuelve el control al usuario aunque la política aprobara sola', async () => {
    await setPolicy(app, headers, {
      mode: 'AUTONOMOUS',
      maxAmountPerOperation: '1000',
      maxDailyAmount: '100000',
      // Los topes en dólares también se apartan: lo que se prueba aquí es la
      // degradación por riesgo, no los límites.
      maxAmountPerOperationUsd: '100000',
      maxDailyAmountUsd: '100000',
      minimumReserveUsd: null,
    });

    // 200 USDC_TEST sobre un saldo de 250: G-02 HIGH y G-03 HIGH → riesgo HIGH.
    const proposal = await propose([{ destinationId: destinations.viaje, amount: '200' }]);

    expect(proposal.policy?.decision).toBe('AUTO_APPROVE');
    expect(proposal.risk?.level).toBe('HIGH');
    expect(proposal.status).toBe('PENDING_USER');
  });

  it('con riesgo HIGH exige reescribir el monto total', async () => {
    await setPolicy(app, headers, {
      mode: 'AUTONOMOUS',
      maxAmountPerOperation: '1000',
      maxDailyAmount: '100000',
      // Los topes en dólares también se apartan: lo que se prueba aquí es la
      // degradación por riesgo, no los límites.
      maxAmountPerOperationUsd: '100000',
      maxDailyAmountUsd: '100000',
      minimumReserveUsd: null,
    });

    const proposal = await propose([{ destinationId: destinations.viaje, amount: '200' }]);

    const sinConfirmar = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload: { signedXdr: 'xdr-firmado' },
    });

    expect(sinConfirmar.statusCode).toBe(400);
    expect(JSON.parse(sinConfirmar.body).error.code).toBe('CONFIRMATION_REQUIRED');

    const totalIncorrecto = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload: { signedXdr: 'xdr-firmado', confirmedTotal: '199' },
    });

    expect(totalIncorrecto.statusCode).toBe(400);

    const correcto = await app.inject({
      method: 'POST',
      url: `/proposals/${proposal.id}/approve`,
      headers,
      payload: { signedXdr: 'xdr-firmado', confirmedTotal: '200.0000000' },
    });

    expect(correcto.statusCode).toBe(200);
    expect(JSON.parse(correcto.body).proposal.status).toBe('CONFIRMED');
  });
});

describe('política aplicada de punta a punta', () => {
  it('el kill switch deniega cualquier propuesta nueva', async () => {
    await app.inject({
      method: 'POST',
      url: '/policy/pause',
      headers,
      payload: { paused: true },
    });

    const proposal = await propose([{ destinationId: destinations.viaje, amount: '1' }]);

    expect(proposal.status).toBe('DENIED');
    expect(proposal.policy?.reasons[0]?.ruleId).toBe('P-08');
    // Denegada por política: el Guardian ni siquiera llega a correr.
    expect(proposal.risk).toBeFalsy();

    await app.inject({
      method: 'POST',
      url: '/policy/pause',
      headers,
      payload: { paused: false },
    });
  });

  it('deniega un destino bloqueado por el usuario', async () => {
    await setPolicy(app, headers, { mode: 'AUTONOMOUS' });

    const bloqueado = await createDestination(app, headers, {
      kind: 'CONTACT',
      label: 'Sospechoso',
      address: 'GCP65WP64YSGDF6IWPIMRROF4OALYFMWX74DVUMF5VE2LRABO5CK6CYU',
    });

    await app.inject({
      method: 'PATCH',
      url: `/destinations/${bloqueado.id}`,
      headers,
      payload: { blocked: true },
    });

    const proposal = await propose([{ destinationId: bloqueado.id, amount: '1' }]);

    expect(proposal.status).toBe('DENIED');
    expect(proposal.policy?.reasons.some((r) => r.ruleId === 'P-03')).toBe(true);
  });
});

describe('límite diario acumulado (P-02)', () => {
  /**
   * Este bloque usa su propio usuario a propósito.
   *
   * El límite diario se mide sobre lo ya comprometido, así que compartir usuario
   * con los tests anteriores haría que el resultado dependiera del orden de
   * ejecución. Un contador que acumula necesita empezar en cero.
   */
  const OTRO_USUARIO = 'GDHGYXQQSKAHXJTOT3W43LSO76V3ZCK5IAWH2O7MLYSJ7J3C7BR3W5A4';

  let propios: { headers: { authorization: string } };
  let destinoId: string;

  beforeAll(async () => {
    propios = await login(app, OTRO_USUARIO);
    const destino = await createDestination(app, propios.headers, {
      kind: 'GOAL',
      label: VIAJE.label,
      address: VIAJE.address,
    });
    destinoId = destino.id;

    await setPolicy(app, propios.headers, {
      mode: 'AUTONOMOUS',
      maxAmountPerOperation: '100',
      maxDailyAmount: '10',
      minimumReserve: '0',
      // El tope en dólares se aparta para que el test mida solo el del activo.
      maxAmountPerOperationUsd: '100',
      maxDailyAmountUsd: '100',
      minimumReserveUsd: null,
    });
  });

  async function proponer(amount: string): Promise<Proposal> {
    const response = await app.inject({
      method: 'POST',
      url: '/agent/messages',
      headers: propios.headers,
      payload: {
        message: JSON.stringify({
          summary: 'Prueba del límite diario',
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

  it('deja pasar la primera y escala la que rompe el acumulado', async () => {
    const primera = await proponer('8');
    expect(primera.status).toBe('CONFIRMED');

    // 8 ya comprometidos + 5 nuevos = 13 > 10.
    const segunda = await proponer('5');
    expect(segunda.status).toBe('PENDING_USER');
    expect(segunda.policy?.reasons.some((r) => r.ruleId === 'P-02')).toBe(true);
  });
});

describe('aislamiento entre usuarios', () => {
  it('un usuario no puede leer la propuesta de otro', async () => {
    await setPolicy(app, headers, { mode: 'MANUAL' });
    const proposal = await propose([{ destinationId: destinations.viaje, amount: '1' }]);

    const otro = await login(app, 'GDRX6ATFBUJMFDUBRAD7OV535ZADFSVPF2GRUR6EA37LFEJUQ2KIU66D');

    const response = await app.inject({
      method: 'GET',
      url: `/proposals/${proposal.id}`,
      headers: otro.headers,
    });

    // 404, no 403: a un extraño ni siquiera se le confirma que la propuesta existe.
    expect(response.statusCode).toBe(404);
  });

  it('un usuario no ve los destinos de otro', async () => {
    const otro = await login(app, 'GCP65WP64YSGDF6IWPIMRROF4OALYFMWX74DVUMF5VE2LRABO5CK6CYU');

    const response = await app.inject({
      method: 'GET',
      url: '/destinations',
      headers: otro.headers,
    });

    expect(JSON.parse(response.body).destinations).toEqual([]);
  });
});

describe('autenticación', () => {
  it('rechaza las rutas protegidas sin token', async () => {
    for (const url of ['/policy', '/destinations', '/proposals', '/account/balances', '/audit']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, `${url} debería exigir token`).toBe(401);
    }
  });

  it('rechaza un token inventado', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/policy',
      headers: { authorization: 'Bearer esto-no-es-un-jwt' },
    });

    expect(response.statusCode).toBe(401);
  });
});
