import { createTestKeypair } from '@aegis/stellar/testing';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authChallenges } from '../db/schema.js';
import { createTestApp, type TestApp } from '../test/app.js';

/**
 * Login firmando un reto con la wallet (BE2-02).
 *
 * Los tests usan un par de claves real, así que la firma que se verifica es una
 * firma Ed25519 de verdad, no un mock que siempre dice que sí.
 */

let harness: TestApp;
let app: FastifyInstance;

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

async function pedirReto(address: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/challenge',
    payload: { address },
  });

  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.body) as { challenge: string; challengeId: string },
  };
}

describe('POST /auth/challenge', () => {
  it('devuelve un reto que menciona la dirección y avisa de que no mueve fondos', async () => {
    const keypair = createTestKeypair();
    const { statusCode, body } = await pedirReto(keypair.address);

    expect(statusCode).toBe(200);
    expect(body.challenge).toContain(keypair.address);
    expect(body.challenge).toContain('no mueve fondos');
  });

  it('nunca repite el mismo reto para la misma dirección', async () => {
    const keypair = createTestKeypair();
    const primero = await pedirReto(keypair.address);
    const segundo = await pedirReto(keypair.address);

    // Si el reto fuera predecible, una firma capturada valdría para siempre.
    expect(primero.body.challenge).not.toBe(segundo.body.challenge);
    expect(primero.body.challengeId).not.toBe(segundo.body.challengeId);
  });

  it('rechaza una dirección que no es una clave pública de Stellar', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { address: 'no-soy-una-direccion' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /auth/verify', () => {
  it('acepta una firma válida y entrega un token de sesión', async () => {
    const keypair = createTestKeypair();
    const { body } = await pedirReto(keypair.address);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: body.challengeId, signature: keypair.sign(body.challenge) },
    });

    expect(response.statusCode).toBe(200);
    const verified = JSON.parse(response.body) as {
      token: string;
      user: { address: string };
    };
    expect(verified.user.address).toBe(keypair.address);

    // El token sirve de verdad para entrar.
    const policy = await app.inject({
      method: 'GET',
      url: '/policy',
      headers: { authorization: `Bearer ${verified.token}` },
    });
    expect(policy.statusCode).toBe(200);
  });

  it('rechaza la firma de otra wallet', async () => {
    const legítima = createTestKeypair();
    const impostora = createTestKeypair();
    const { body } = await pedirReto(legítima.address);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: body.challengeId, signature: impostora.sign(body.challenge) },
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe('INVALID_SIGNATURE');
  });

  it('rechaza una firma que no es ni base64 válido', async () => {
    const keypair = createTestKeypair();
    const { body } = await pedirReto(keypair.address);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: body.challengeId, signature: 'basura' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('no permite reutilizar un reto ya consumido', async () => {
    const keypair = createTestKeypair();
    const { body } = await pedirReto(keypair.address);
    const signature = keypair.sign(body.challenge);

    const primera = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: body.challengeId, signature },
    });
    const segunda = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: body.challengeId, signature },
    });

    expect(primera.statusCode).toBe(200);
    // Repetir la misma firma es exactamente el ataque que el nonce debe frenar.
    expect(segunda.statusCode).toBe(400);
    expect(JSON.parse(segunda.body).error.code).toBe('INVALID_CHALLENGE');
  });

  it('consume el reto aunque la firma sea incorrecta', async () => {
    const keypair = createTestKeypair();
    const impostora = createTestKeypair();
    const { body } = await pedirReto(keypair.address);

    await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: body.challengeId, signature: impostora.sign(body.challenge) },
    });

    // Un atacante gasta un reto por intento: no puede probar firmas a ciegas
    // contra el mismo texto.
    const segundoIntento = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: body.challengeId, signature: keypair.sign(body.challenge) },
    });

    expect(segundoIntento.statusCode).toBe(400);
  });

  it('rechaza un reto caducado', async () => {
    const keypair = createTestKeypair();
    const { body } = await pedirReto(keypair.address);

    await harness.db
      .update(authChallenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authChallenges.id, body.challengeId));

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: body.challengeId, signature: keypair.sign(body.challenge) },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rechaza un challengeId que no existe', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { challengeId: 'chal_inventado', signature: 'x' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('sesión', () => {
  it('reutiliza el mismo usuario si la wallet vuelve a entrar', async () => {
    const keypair = createTestKeypair();

    const entrar = async () => {
      const { body } = await pedirReto(keypair.address);
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: { challengeId: body.challengeId, signature: keypair.sign(body.challenge) },
      });
      return (JSON.parse(response.body) as { user: { id: string } }).user.id;
    };

    expect(await entrar()).toBe(await entrar());
  });
});
