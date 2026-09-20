import { FIXTURE_DESTINATIONS, type Destination } from '@aegis/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDestination, createTestApp, login, type TestApp } from '../test/app.js';

/**
 * Registro de destinos (BE2-05).
 *
 * Es la única puerta por la que entra una dirección Stellar nueva, así que aquí
 * se concentran el saneado del texto libre y el control de acceso.
 */

/** Espacio de ancho cero: invisible, pero hace distintas dos etiquetas iguales. */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
/** Anulación de derecha a izquierda: invierte el orden visual del texto. */
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e);

const VIAJE = FIXTURE_DESTINATIONS[0]!;
const LAPTOP = FIXTURE_DESTINATIONS[1]!;
const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

let harness: TestApp;
let app: FastifyInstance;
let headers: { authorization: string };

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
  headers = (await login(app, ADDRESS)).headers;
});

afterAll(async () => {
  await harness.close();
});

describe('POST /destinations', () => {
  it('registra un objetivo y lo devuelve en la lista', async () => {
    const destino = await createDestination(app, headers, {
      kind: 'GOAL',
      label: VIAJE.label,
      address: VIAJE.address,
    });

    expect(destino.kind).toBe('GOAL');
    expect(destino.blocked).toBe(false);

    const lista = await app.inject({ method: 'GET', url: '/destinations', headers });
    const { destinations } = JSON.parse(lista.body) as { destinations: Destination[] };

    expect(destinations.map((d) => d.id)).toContain(destino.id);
  });

  it('rechaza una dirección con checksum inválido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/destinations',
      headers,
      payload: { kind: 'CONTACT', label: 'Falsa', address: 'GAAAA' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('no deja registrar dos veces la misma dirección', async () => {
    const payload = { kind: 'CONTACT' as const, label: 'Ana', address: LAPTOP.address };

    const primera = await app.inject({ method: 'POST', url: '/destinations', headers, payload });
    const segunda = await app.inject({ method: 'POST', url: '/destinations', headers, payload });

    expect(primera.statusCode).toBe(201);
    // Antes esto devolvía un 500 y el frontend no podía distinguirlo de una caída.
    expect(segunda.statusCode).toBe(409);
    expect(JSON.parse(segunda.body).error.code).toBe('DESTINATION_ALREADY_EXISTS');
  });
});

describe('saneado del texto libre', () => {
  it('quita caracteres invisibles y de anulación bidireccional de la etiqueta', async () => {
    // Se construyen con fromCharCode a propósito: pegarlos literalmente dejaría
    // en el código fuente unos bytes que nadie puede ver al revisar el PR.
    const destino = await createDestination(app, headers, {
      kind: 'CONTACT',
      label: `Vi${ZERO_WIDTH_SPACE}aje${RIGHT_TO_LEFT_OVERRIDE} oculto`,
      address: 'GDHGYXQQSKAHXJTOT3W43LSO76V3ZCK5IAWH2O7MLYSJ7J3C7BR3W5A4',
    });

    expect(destino.label).toBe('Viaje oculto');
    expect(destino.label).not.toContain(ZERO_WIDTH_SPACE);
    expect(destino.label).not.toContain(RIGHT_TO_LEFT_OVERRIDE);
  });

  it('recorta los espacios repetidos', async () => {
    const destino = await createDestination(app, headers, {
      kind: 'CONTACT',
      label: '  Ana    Pérez  ',
      address: 'GDRX6ATFBUJMFDUBRAD7OV535ZADFSVPF2GRUR6EA37LFEJUQ2KIU66D',
    });

    expect(destino.label).toBe('Ana Pérez');
  });

  it('rechaza una etiqueta que se queda vacía tras sanear', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/destinations',
      headers,
      payload: {
        kind: 'CONTACT',
        label: ZERO_WIDTH_SPACE.repeat(3),
        address: 'GCP65WP64YSGDF6IWPIMRROF4OALYFMWX74DVUMF5VE2LRABO5CK6CYU',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('PATCH /destinations/:id', () => {
  let destino: Destination;

  beforeAll(async () => {
    destino = await createDestination(app, headers, {
      kind: 'CONTACT',
      label: 'Editable',
      address: 'GCTKRF7KHNLSUV7C5MKQD5JXEDJKFLD2H7NUPHC7WC4TCTV4BFFVUVDY',
    });
  });

  it('permite bloquear y desbloquear un destino', async () => {
    const bloqueado = await app.inject({
      method: 'PATCH',
      url: `/destinations/${destino.id}`,
      headers,
      payload: { blocked: true },
    });

    expect(bloqueado.statusCode).toBe(200);
    expect(JSON.parse(bloqueado.body).destination.blocked).toBe(true);

    const desbloqueado = await app.inject({
      method: 'PATCH',
      url: `/destinations/${destino.id}`,
      headers,
      payload: { blocked: false },
    });

    expect(JSON.parse(desbloqueado.body).destination.blocked).toBe(false);
  });

  it('deja el cambio en la bitácora con el valor anterior y el nuevo', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/destinations/${destino.id}`,
      headers,
      payload: { trusted: true },
    });

    const auditoria = await app.inject({ method: 'GET', url: '/audit', headers });
    const { events } = JSON.parse(auditoria.body) as {
      events: Array<{ type: string; payload: Record<string, unknown> }>;
    };

    const evento = events.find((e) => e.type === 'DESTINATION_UPDATED');
    expect(evento?.payload.trusted).toEqual({ before: false, after: true });
  });

  it('no permite cambiar la dirección', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/destinations/${destino.id}`,
      headers,
      payload: { address: 'GDHGYXQQSKAHXJTOT3W43LSO76V3ZCK5IAWH2O7MLYSJ7J3C7BR3W5A4' },
    });

    // El cuerpo solo admite campos conocidos y ninguno de ellos cambia: si se
    // pudiera editar la dirección, marcar un destino como "de confianza" sería
    // un cheque en blanco hacia otra cuenta.
    expect(response.statusCode).toBe(400);
  });

  it('exige al menos un campo que cambiar', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/destinations/${destino.id}`,
      headers,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('devuelve 404 al editar el destino de otro usuario', async () => {
    const otro = await login(app, 'GCWECULR5SPOTSDONAHN4WWRBR62UV4QOZP5DAUOMWISRIITQ4IA5VIS');

    const response = await app.inject({
      method: 'PATCH',
      url: `/destinations/${destino.id}`,
      headers: otro.headers,
      payload: { blocked: true },
    });

    expect(response.statusCode).toBe(404);
  });
});
