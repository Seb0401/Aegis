import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents } from '../db/schema.js';
import { createTestApp, login, type TestApp } from '../test/app.js';

/**
 * Bitácora append-only con hash encadenado (BE2-06).
 *
 * Lo que de verdad hay que probar aquí no es que se escriban eventos, sino que
 * **manipularlos se nota**. Si la cadena no detecta una edición, la bitácora no
 * vale más que un fichero de texto.
 */

const ADDRESS = 'GB7G7EFKMW57EL2C647XFLA7YWM32PVJ4FYWPJQXPHTNZJKIV5RVVZJ4';

let harness: TestApp;
let app: FastifyInstance;
let userId: string;
let headers: { authorization: string };

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const session = await login(app, ADDRESS);
  userId = session.userId;
  headers = session.headers;
});

afterAll(async () => {
  await harness.close();
});

describe('cadena de hashes', () => {
  it('encadena cada evento con el anterior', async () => {
    await harness.app.services.audit.append({
      userId,
      type: 'POLICY_UPDATED',
      payload: { paso: 1 },
    });
    await harness.app.services.audit.append({
      userId,
      type: 'POLICY_UPDATED',
      payload: { paso: 2 },
    });

    const eventos = await harness.app.services.audit.list(userId, 100);
    const enOrden = [...eventos].reverse();

    expect(enOrden[0]!.previousHash).toBeNull();

    for (let i = 1; i < enOrden.length; i += 1) {
      expect(enOrden[i]!.previousHash).toBe(enOrden[i - 1]!.hash);
    }

    expect(await harness.app.services.audit.verifyChain(userId)).toMatchObject({
      valid: true,
      complete: true,
    });
  });

  it('verifica solo una ventana y lo dice, en vez de prometer de más', async () => {
    for (let i = 0; i < 5; i += 1) {
      await harness.app.services.audit.append({
        userId,
        type: 'POLICY_UPDATED',
        payload: { relleno: i },
      });
    }

    const ventana = await harness.app.services.audit.verifyChain(userId, { limit: 3 });

    expect(ventana.valid).toBe(true);
    expect(ventana.verifiedEvents).toBe(3);
    // La ventana no llega al principio de la cadena, y el resultado no finge
    // que sí: decir "válida" sobre lo que no se ha mirado sería mentir.
    expect(ventana.complete).toBe(false);

    const completa = await harness.app.services.audit.verifyChain(userId, { limit: 0 });
    expect(completa.complete).toBe(true);
    expect(completa.verifiedEvents).toBeGreaterThan(3);
  });

  it('detecta que alguien editó un evento pasado', async () => {
    await harness.app.services.audit.append({
      userId,
      type: 'KILL_SWITCH_TOGGLED',
      payload: { paused: true },
    });

    const eventos = await harness.app.services.audit.list(userId, 100);
    const objetivo = eventos[0]!;

    // Manipulación directa en la base de datos, saltándose la API por completo.
    await harness.db
      .update(auditEvents)
      .set({ payload: { paused: false } })
      .where(eq(auditEvents.id, objetivo.id));

    const resultado = await harness.app.services.audit.verifyChain(userId);

    expect(resultado.valid).toBe(false);
    expect(resultado.brokenAt).toBe(objetivo.id);
  });
});

describe('contenido de la bitácora', () => {
  it('redacta cualquier cosa que parezca un secreto', async () => {
    await harness.app.services.audit.append({
      userId,
      type: 'AGENT_SIGNED',
      payload: {
        hash: 'abc123',
        signerSecret: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        anidado: { privateKey: 'no-debería-guardarse', publico: 'sí' },
      },
    });

    const eventos = await harness.app.services.audit.list(userId, 1);
    const payload = eventos[0]!.payload as Record<string, unknown>;

    expect(payload.signerSecret).toBe('[redactado]');
    expect(payload.anidado).toEqual({ privateKey: '[redactado]', publico: 'sí' });
    // Lo que no es secreto se conserva tal cual.
    expect(payload.hash).toBe('abc123');
  });

  it('cada usuario tiene su propia cadena', async () => {
    const otro = await login(app, 'GCWECULR5SPOTSDONAHN4WWRBR62UV4QOZP5DAUOMWISRIITQ4IA5VIS');

    await harness.app.services.audit.append({
      userId: otro.userId,
      type: 'POLICY_UPDATED',
      payload: {},
    });

    const suyos = await harness.app.services.audit.list(otro.userId, 100);

    expect(suyos.every((e) => e.userId === otro.userId)).toBe(true);
    // La cadena del otro usuario arranca de cero, no cuelga de la del primero.
    expect(suyos[suyos.length - 1]!.previousHash).toBeNull();
  });
});

describe('GET /audit', () => {
  it('expone los eventos y el estado de la cadena', async () => {
    const otro = await login(app, 'GCTKRF7KHNLSUV7C5MKQD5JXEDJKFLD2H7NUPHC7WC4TCTV4BFFVUVDY');

    const response = await app.inject({ method: 'GET', url: '/audit', headers: otro.headers });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      events: Array<{ type: string }>;
      chain: { valid: boolean };
    };

    expect(body.chain.valid).toBe(true);
    expect(body.events.some((e) => e.type === 'AUTH_LOGIN')).toBe(true);
  });

  it('no muestra la bitácora de otro usuario', async () => {
    const response = await app.inject({ method: 'GET', url: '/audit', headers });
    const body = JSON.parse(response.body) as { events: Array<{ userId: string }> };

    expect(body.events.every((e) => e.userId === userId)).toBe(true);
  });
});
