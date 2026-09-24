import { FIXTURE_DESTINATIONS } from '@aegis/contracts';
import { describe, expect, it, vi } from 'vitest';
import { AegisApiError, AegisClient } from './client.js';
import { createTools, toToolError } from './tools.js';

/**
 * Lo que de verdad hay que fijar aquí no es el formato del texto, sino la
 * frontera: **ninguna herramienta puede mover dinero**. Si alguien añade una
 * tool `aegis_send_payment` algún día, estos tests tienen que romperse.
 */

/** Respuestas de la API por ruta, para no salir a la red. */
function apiFalsa(rutas: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return vi.fn(async (url: string | URL) => {
    const path = new URL(String(url)).pathname;
    const match = rutas[path] ?? {
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'no' } },
    };

    return {
      ok: (match.status ?? 200) < 400,
      status: match.status ?? 200,
      json: async () => match.body,
    };
  }) as unknown as typeof fetch;
}

function tools(rutas: Record<string, { status?: number; body: unknown }>) {
  const client = new AegisClient({
    baseUrl: 'http://localhost:3001',
    token: 'token-de-test',
    fetchImpl: apiFalsa(rutas),
  });

  const lista = createTools(client);
  return {
    lista,
    llamar: (nombre: string, args: Record<string, unknown> = {}) => {
      const tool = lista.find((t) => t.name === nombre);
      if (!tool) throw new Error(`No existe la herramienta ${nombre}`);
      return tool.handler(args);
    },
  };
}

const PROPUESTA_PENDIENTE = {
  proposal: {
    id: 'prop_1',
    userId: 'user_1',
    status: 'PENDING_USER',
    summary: 'Repartir 50 entre objetivos',
    actions: [
      {
        type: 'PAYMENT',
        destinationId: 'dest_1',
        asset: 'USDC_TEST',
        amount: '50',
        memo: null,
        label: 'Objetivo: Viaje',
      },
    ],
    policy: {
      decision: 'REQUIRE_USER',
      unit: 'asset',
      reasons: [
        { ruleId: 'P-01', unit: 'asset', effect: 'REQUIRE_USER', message: 'Supera tu límite.' },
      ],
      evaluatedAt: '2026-09-24T10:00:00.000Z',
    },
    risk: {
      score: 35,
      level: 'MEDIUM',
      signals: [],
      balanceAfter: '200.0000000',
      evaluatedAt: '2026-09-24T10:00:00.000Z',
    },
    explanation: {
      summary: 'Vas a enviar 50 USDC_TEST.',
      warnings: [{ signalId: 'G-02', text: 'Es el 20 % de tu saldo.' }],
      generatedBy: 'template',
    },
    createdAt: '2026-09-24T10:00:00.000Z',
    expiresAt: '2026-09-24T10:10:00.000Z',
    updatedAt: '2026-09-24T10:00:00.000Z',
  },
};

describe('la frontera: proponer, nunca enviar', () => {
  it('ninguna herramienta ejecuta pagos', () => {
    const nombres = tools({}).lista.map((t) => t.name);

    for (const prohibido of ['send', 'execute', 'submit', 'sign', 'approve', 'transfer']) {
      expect(
        nombres.filter((n) => n.includes(prohibido)),
        `ninguna herramienta debería llamarse "${prohibido}"`,
      ).toEqual([]);
    }
  });

  it('la única herramienta que escribe es la de proponer', () => {
    const { lista } = tools({});
    const escriben = lista.filter((t) => Object.keys(t.inputSchema).length > 0);

    expect(escriben.map((t) => t.name).sort()).toEqual([
      'aegis_get_proposal',
      'aegis_propose_payment',
    ]);
  });

  it('describe la propuesta diciendo que el agente NO puede aprobarla', async () => {
    const { llamar } = tools({ '/proposals': { status: 201, body: PROPUESTA_PENDIENTE } });

    const texto = await llamar('aegis_propose_payment', {
      summary: 'Repartir 50',
      actions: [
        { destinationId: 'dest_1', asset: 'USDC_TEST', amount: '50', label: 'Objetivo: Viaje' },
      ],
    });

    // Sin esto, un modelo que lee "PENDING_USER" se inventa una forma de
    // aprobarla, y no existe ninguna.
    expect(texto).toContain('Tú no puedes aprobarla');
    expect(texto).toContain('PENDING_USER');
    expect(texto).toContain('Es el 20 % de tu saldo.');
    expect(texto).toContain('[P-01]');
  });

  it('cuando los límites rechazan, le dice al agente que no insista', async () => {
    const denegada = {
      proposal: { ...PROPUESTA_PENDIENTE.proposal, status: 'DENIED', explanation: null },
    };
    const { llamar } = tools({ '/proposals/prop_1': { body: denegada } });

    const texto = await llamar('aegis_get_proposal', { proposalId: 'prop_1' });

    expect(texto).toContain('No insistas');
  });
});

describe('lecturas', () => {
  it('lista destinos con su id, que es lo único que acepta proponer', async () => {
    const { llamar } = tools({
      '/destinations': { body: { destinations: FIXTURE_DESTINATIONS.slice(0, 2) } },
    });

    const texto = await llamar('aegis_list_destinations');

    expect(texto).toContain(FIXTURE_DESTINATIONS[0]!.id);
    expect(texto).toContain('aegis_propose_payment');
  });

  it('avisa de que el agente está en pausa', async () => {
    const { llamar } = tools({
      '/policy': {
        body: {
          config: {
            maxAmountPerOperation: '5',
            maxDailyAmount: '20',
            requireConfirmationForNewDestination: true,
            allowedAssets: ['XLM', 'USDC_TEST'],
            maxOperationsPerHour: 10,
            minimumReserve: '10',
            mode: 'MANUAL',
            paused: true,
            proposalTtlMinutes: 10,
            maxAmountPerOperationUsd: '5',
            maxDailyAmountUsd: '20',
            minimumReserveUsd: '10',
          },
          summary: {
            mode: 'MANUAL',
            paused: true,
            maxAmountPerOperation: '5',
            maxDailyAmount: '20',
            minimumReserve: '10',
            allowedAssets: ['XLM', 'USDC_TEST'],
            remainingDailyAmount: '20',
            maxAmountPerOperationUsd: '5',
            remainingDailyAmountUsd: '20',
          },
        },
      },
    });

    expect(await llamar('aegis_get_policy_summary')).toContain('EN PAUSA');
  });

  it('dice claramente que no hay destinos en vez de devolver una lista vacía', async () => {
    const { llamar } = tools({ '/destinations': { body: { destinations: [] } } });

    expect(await llamar('aegis_list_destinations')).toContain('no tiene destinos');
  });
});

describe('errores', () => {
  it('traduce el código de error de la API para que el agente pueda corregir', () => {
    const texto = toToolError(
      new AegisApiError('INVALID_PROPOSAL', 'La acción 1 apunta a un destino que no existe.', 422),
    );

    expect(texto).toContain('INVALID_PROPOSAL');
    expect(texto).toContain('no existe');
  });

  it('un fallo de red no se confunde con un rechazo de Aegis', async () => {
    const client = new AegisClient({
      baseUrl: 'http://localhost:3001',
      token: 't',
      fetchImpl: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });

    await expect(client.getBalances()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
