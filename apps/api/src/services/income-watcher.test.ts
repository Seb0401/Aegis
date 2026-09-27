import { FIXTURE_DESTINATIONS, type TxSummary } from '@aegis/contracts';
import { FakeStellarReader } from '@aegis/stellar/testing';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { processedIncomes } from '../db/schema.js';
import { createDestination, createTestApp, login, setPolicy, type TestApp } from '../test/app.js';
import { createScriptedAgent } from '../test/scripted-agent.js';

/**
 * El vigilante de ingresos (BE2-13).
 *
 * Esto reparte dinero sin que nadie lo pida, así que lo que hay que fijar no
 * es que funcione: es que **no pueda hacer daño**. Un reparto duplicado son
 * dos pagos reales por el mismo ingreso, y un reparto de un ingreso viejo es
 * una sorpresa desagradable el día que alguien enciende la regla.
 */

const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';
const VIAJE = FIXTURE_DESTINATIONS[0]!;
const LAPTOP = FIXTURE_DESTINATIONS[1]!;

let abiertos: TestApp[] = [];

afterEach(async () => {
  await Promise.all(abiertos.map((app) => app.close()));
  abiertos = [];
});

/** Un ingreso reciente, que es lo único que el vigilante mira. */
function ingreso(overrides: Partial<TxSummary> = {}): TxSummary {
  return {
    hash: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
    direction: 'IN',
    counterparty: 'GCP65WTJPNWJFRPXWJDJQ6JZP5LHPTHG2YDXNTTDOKCSHDHCQPCK6CYU',
    asset: 'USDC_TEST',
    amount: '300',
    memo: 'Nómina',
    successful: true,
    ...overrides,
  };
}

/**
 * Monta la aplicación con un historial a medida y la regla ya puesta.
 *
 * El historial va por el lector falso, que es justo donde estaría Horizon.
 */
async function montar(historial: TxSummary[], opciones: { partes?: number[] } = {}) {
  const harness = await createTestApp({
    overrides: {
      agent: createScriptedAgent(),
      reader: new FakeStellarReader({ history: historial }),
    },
  });
  abiertos.push(harness);

  const sesion = await login(harness.app, ADDRESS);

  const viaje = await createDestination(harness.app, sesion.headers, {
    kind: 'GOAL',
    label: VIAJE.label,
    address: VIAJE.address,
  });
  const laptop = await createDestination(harness.app, sesion.headers, {
    kind: 'GOAL',
    label: LAPTOP.label,
    address: LAPTOP.address,
  });

  await setPolicy(harness.app, sesion.headers, { mode: 'MANUAL' });

  const [uno, dos] = opciones.partes ?? [4000, 2000];

  const respuesta = await harness.app.inject({
    method: 'PUT',
    url: '/split-rule',
    headers: sesion.headers,
    payload: {
      enabled: true,
      asset: 'USDC_TEST',
      minimumIncome: '10',
      shares: [
        { destinationId: viaje.id, basisPoints: uno },
        { destinationId: laptop.id, basisPoints: dos },
      ],
    },
  });

  if (respuesta.statusCode !== 200) {
    throw new Error(`No se pudo guardar la regla (${respuesta.statusCode}): ${respuesta.body}`);
  }

  return { harness, sesion, destinos: { viaje, laptop } };
}

async function propuestas(harness: TestApp, headers: Record<string, string>) {
  const respuesta = await harness.app.inject({
    method: 'GET',
    url: '/proposals?limit=50',
    headers,
  });
  return JSON.parse(respuesta.body).proposals as Array<{
    id: string;
    summary: string;
    actions: Array<{ amount: string; destinationId: string }>;
  }>;
}

describe('reparte cuando entra dinero', () => {
  it('convierte un ingreso en una propuesta con las partes configuradas', async () => {
    const { harness, sesion } = await montar([ingreso({ amount: '300' })]);

    const resultado = await harness.app.services.incomeWatcher.watch();

    expect(resultado.split).toBe(1);

    const lista = await propuestas(harness, sesion.headers);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.summary).toContain('Reparto automático');

    // 40% y 20% de 300. El 40% restante se queda en la cuenta.
    expect(lista[0]!.actions.map((a) => a.amount)).toEqual(['120.0000000', '60.0000000']);
  });

  it('la propuesta pasa por los límites como cualquier otra', async () => {
    // Nada de un camino especial para el reparto automático: decide **cuándo**
    // proponer, nunca qué se puede autorizar.
    const { harness, sesion } = await montar([ingreso({ amount: '300' })]);

    await harness.app.services.incomeWatcher.watch();

    const lista = await propuestas(harness, sesion.headers);
    const detalle = await harness.app.inject({
      method: 'GET',
      url: `/proposals/${lista[0]!.id}`,
      headers: sesion.headers,
    });

    const propuesta = JSON.parse(detalle.body).proposal;
    expect(propuesta.policy).not.toBeNull();
    expect(propuesta.risk).not.toBeNull();
    expect(propuesta.status).toBe('PENDING_USER');
  });
});

describe('no puede repartir dos veces el mismo ingreso', () => {
  it('aunque el vigilante corra varias veces', async () => {
    // Es la garantía que más importa: dos repartos del mismo ingreso son dos
    // pagos reales por el mismo dinero.
    const { harness, sesion } = await montar([ingreso()]);

    const primera = await harness.app.services.incomeWatcher.watch();
    const segunda = await harness.app.services.incomeWatcher.watch();
    const tercera = await harness.app.services.incomeWatcher.watch();

    expect(primera.split).toBe(1);
    expect(segunda.split).toBe(0);
    expect(tercera.split).toBe(0);

    expect(await propuestas(harness, sesion.headers)).toHaveLength(1);
  });

  it('aunque dos vueltas coincidan a la vez', async () => {
    // La carrera la resuelve la clave primaria de la tabla, no un `if`.
    const { harness, sesion } = await montar([ingreso()]);

    const resultados = await Promise.all([
      harness.app.services.incomeWatcher.watch(),
      harness.app.services.incomeWatcher.watch(),
      harness.app.services.incomeWatcher.watch(),
    ]);

    expect(resultados.reduce((total, r) => total + r.split, 0)).toBe(1);
    expect(await propuestas(harness, sesion.headers)).toHaveLength(1);
  });

  it('deja constancia del ingreso repartido', async () => {
    const { harness, sesion } = await montar([ingreso()]);

    await harness.app.services.incomeWatcher.watch();

    const filas = await harness.db
      .select()
      .from(processedIncomes)
      .where(eq(processedIncomes.userId, sesion.userId));

    expect(filas).toHaveLength(1);
    expect(filas[0]!.txHash).toBe('a'.repeat(64));
    // Queda enlazado con la propuesta que generó, para poder seguir el rastro.
    expect(filas[0]!.proposalId).toBeTruthy();
  });
});

describe('qué ingresos ignora', () => {
  it('los anteriores a encender la regla', async () => {
    // Encender el reparto no puede disparar uno por cada nómina del año.
    const viejo = ingreso({
      hash: 'b'.repeat(64),
      createdAt: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
    });

    const { harness } = await montar([viejo]);

    expect((await harness.app.services.incomeWatcher.watch()).split).toBe(0);
  });

  it('los que salen, en vez de entrar', async () => {
    const { harness } = await montar([ingreso({ direction: 'OUT' })]);

    expect((await harness.app.services.incomeWatcher.watch()).split).toBe(0);
  });

  it('los que la red rechazó', async () => {
    const { harness } = await montar([ingreso({ successful: false })]);

    expect((await harness.app.services.incomeWatcher.watch()).split).toBe(0);
  });

  it('los de otro activo', async () => {
    const { harness } = await montar([ingreso({ asset: 'XLM' })]);

    expect((await harness.app.services.incomeWatcher.watch()).split).toBe(0);
  });

  it('los que no llegan al mínimo', async () => {
    // Un ingreso de céntimos generaría pagos cuyas comisiones se comerían el
    // reparto.
    const { harness } = await montar([ingreso({ amount: '2' })]);

    expect((await harness.app.services.incomeWatcher.watch()).split).toBe(0);
  });
});

describe('el kill switch también para esto', () => {
  it('con el agente en pausa no reparte nada', async () => {
    // Si no, con el agente pausado seguirían apareciendo propuestas denegadas
    // por cada ingreso: ruido que contradice lo que el botón promete.
    const { harness, sesion } = await montar([ingreso()]);

    await harness.app.inject({
      method: 'POST',
      url: '/policy/pause',
      headers: sesion.headers,
      payload: { paused: true },
    });

    expect((await harness.app.services.incomeWatcher.watch()).split).toBe(0);
    expect(await propuestas(harness, sesion.headers)).toHaveLength(0);
  });
});

describe('la regla apagada', () => {
  it('no reparte', async () => {
    const { harness, sesion } = await montar([ingreso()]);

    const actual = await harness.app.inject({
      method: 'GET',
      url: '/split-rule',
      headers: sesion.headers,
    });
    const { rule } = JSON.parse(actual.body);

    await harness.app.inject({
      method: 'PUT',
      url: '/split-rule',
      headers: sesion.headers,
      payload: { ...rule, enabled: false },
    });

    expect((await harness.app.services.incomeWatcher.watch()).split).toBe(0);
  });
});

describe('destinos que ya no valen', () => {
  it('se caen del reparto y su parte se queda en la cuenta', async () => {
    // Repartir entre los demás lo que ibas a dar a un destino bloqueado sería
    // tomar por ti una decisión que no tomaste.
    const { harness, sesion, destinos } = await montar([ingreso({ amount: '300' })]);

    await harness.app.inject({
      method: 'PATCH',
      url: `/destinations/${destinos.laptop.id}`,
      headers: sesion.headers,
      payload: { blocked: true },
    });

    await harness.app.services.incomeWatcher.watch();

    const lista = await propuestas(harness, sesion.headers);
    expect(lista[0]!.actions).toHaveLength(1);
    // Sigue siendo el 40% de 300, no el 60%.
    expect(lista[0]!.actions[0]!.amount).toBe('120.0000000');
  });
});
