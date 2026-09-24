import {
  DEFAULT_POLICY_CONFIG,
  FIXTURE_DESTINATIONS,
  FIXTURE_PRICE_SNAPSHOT,
  type Balance,
  type Destination,
  type PolicyConfig,
  type PolicyRuleId,
  type ProposedAction,
} from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from './evaluate.js';
import type { PolicyEvaluationInput } from './types.js';

const NOW = new Date('2026-09-19T12:00:00.000Z');

const VIAJE = FIXTURE_DESTINATIONS[0]!;
const LAPTOP = FIXTURE_DESTINATIONS[1]!;
const CURSO = FIXTURE_DESTINATIONS[2]!;
const EMERGENCIAS = FIXTURE_DESTINATIONS[3]!;

/** Saldo holgado, para que los tests aíslen la regla que quieren probar. */
const RICH_BALANCES: Balance[] = [
  { asset: 'XLM', total: '100.0000000', available: '100.0000000' },
  { asset: 'USDC_TEST', total: '250.0000000', available: '250.0000000' },
];

function action(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    type: 'PAYMENT',
    destinationId: VIAJE.id,
    asset: 'USDC_TEST',
    amount: '1',
    memo: null,
    label: 'Objetivo: Viaje',
    ...overrides,
  };
}

/**
 * Escenario base deliberadamente permisivo: modo autónomo, saldo de sobra y
 * todos los destinos con historial. Así, si un test da REQUIRE_USER o DENY,
 * es exclusivamente por la regla que ese test está probando.
 */
function scenario(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  const config: PolicyConfig = {
    ...DEFAULT_POLICY_CONFIG,
    mode: 'AUTONOMOUS',
    ...overrides.config,
  };

  const destinations: Destination[] = overrides.destinations ?? FIXTURE_DESTINATIONS;

  return {
    config,
    actions: overrides.actions ?? [action()],
    destinations,
    balances: overrides.balances ?? RICH_BALANCES,
    dailySpentByAsset: overrides.dailySpentByAsset ?? {},
    // Con precios, que es el caso normal. La ausencia se prueba aparte, en P-10.
    prices: overrides.prices ?? FIXTURE_PRICE_SNAPSHOT,
    dailySpentUsd: overrides.dailySpentUsd ?? '0',
    operationsLastHour: overrides.operationsLastHour ?? 0,
    knownCounterparties: overrides.knownCounterparties ?? destinations.map((d) => d.address),
    now: overrides.now ?? NOW,
    ...(overrides.expiresAt ? { expiresAt: overrides.expiresAt } : {}),
  };
}

function ruleIds(input: PolicyEvaluationInput): PolicyRuleId[] {
  return evaluatePolicy(input).reasons.map((r) => r.ruleId);
}

describe('camino feliz', () => {
  it('aprueba sola una operación pequeña a un destino conocido en modo autónomo', () => {
    const result = evaluatePolicy(scenario());

    expect(result.decision).toBe('AUTO_APPROVE');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]!.effect).toBe('AUTO_APPROVE');
    expect(result.evaluatedAt).toBe(NOW.toISOString());
  });
});

describe('P-08 · kill switch', () => {
  it('deniega todo y no evalúa nada más', () => {
    const result = evaluatePolicy(
      scenario({
        config: { ...DEFAULT_POLICY_CONFIG, mode: 'AUTONOMOUS', paused: true },
        // Aunque además el activo sea inválido, solo debe informar del kill switch.
        actions: [action({ asset: 'XLM', amount: '9999' })],
      }),
    );

    expect(result.decision).toBe('DENY');
    expect(result.reasons).toEqual([expect.objectContaining({ ruleId: 'P-08', effect: 'DENY' })]);
  });
});

describe('P-09 · expiración', () => {
  it('deniega una propuesta caducada', () => {
    const result = evaluatePolicy(scenario({ expiresAt: '2026-09-19T11:59:00.000Z' }));

    expect(result.decision).toBe('DENY');
    expect(result.reasons[0]!.ruleId).toBe('P-09');
  });

  it('acepta una propuesta todavía vigente', () => {
    const result = evaluatePolicy(scenario({ expiresAt: '2026-09-19T12:05:00.000Z' }));

    expect(result.decision).toBe('AUTO_APPROVE');
  });
});

describe('P-01 · monto máximo por operación', () => {
  it('escala al usuario si una acción supera el límite', () => {
    const result = evaluatePolicy(scenario({ actions: [action({ amount: '5.0000001' })] }));

    expect(result.decision).toBe('REQUIRE_USER');
    expect(result.reasons[0]!.ruleId).toBe('P-01');
    expect(result.reasons[0]!.actionIndex).toBe(0);
  });

  it('acepta un monto exactamente igual al límite', () => {
    // El límite es inclusivo: 5 está permitido, 5.0000001 no.
    const result = evaluatePolicy(scenario({ actions: [action({ amount: '5' })] }));

    expect(result.decision).toBe('AUTO_APPROVE');
  });
});

describe('P-02 · límite diario acumulado', () => {
  it('escala al usuario cuando la propuesta rompe el acumulado de 24 h', () => {
    const result = evaluatePolicy(
      scenario({
        actions: [action({ amount: '3' })],
        dailySpentByAsset: { USDC_TEST: '18' },
      }),
    );

    expect(result.decision).toBe('REQUIRE_USER');
    expect(
      ruleIds(
        scenario({ actions: [action({ amount: '3' })], dailySpentByAsset: { USDC_TEST: '18' } }),
      ),
    ).toContain('P-02');
  });

  it('no se dispara si el acumulado queda justo en el límite', () => {
    const result = evaluatePolicy(
      scenario({
        actions: [action({ amount: '2' })],
        dailySpentByAsset: { USDC_TEST: '18' },
      }),
    );

    expect(result.decision).toBe('AUTO_APPROVE');
  });
});

describe('P-03 · destinos', () => {
  it('deniega un destinationId que no existe', () => {
    const result = evaluatePolicy(
      scenario({ actions: [action({ destinationId: 'dest_inventado' })] }),
    );

    expect(result.decision).toBe('DENY');
    expect(result.reasons[0]!.ruleId).toBe('P-03');
  });

  it('deniega un destino bloqueado por el usuario', () => {
    const blocked: Destination = { ...VIAJE, blocked: true };

    const result = evaluatePolicy(
      scenario({
        destinations: [blocked],
        knownCounterparties: [blocked.address],
        actions: [action({ destinationId: blocked.id })],
      }),
    );

    expect(result.decision).toBe('DENY');
  });

  it('escala al usuario si el destino nunca ha recibido nada', () => {
    const result = evaluatePolicy(scenario({ knownCounterparties: [] }));

    expect(result.decision).toBe('REQUIRE_USER');
    expect(ruleIds(scenario({ knownCounterparties: [] }))).toContain('P-03');
  });

  it('no escala si el usuario desactivó la confirmación para destinos nuevos', () => {
    const result = evaluatePolicy(
      scenario({
        knownCounterparties: [],
        config: {
          ...DEFAULT_POLICY_CONFIG,
          mode: 'AUTONOMOUS',
          requireConfirmationForNewDestination: false,
        },
      }),
    );

    expect(result.decision).toBe('AUTO_APPROVE');
  });
});

describe('P-04 · activos permitidos', () => {
  it('deniega un activo fuera de la lista blanca', () => {
    const result = evaluatePolicy(
      scenario({
        actions: [action({ asset: 'XLM', amount: '1' })],
        config: { ...DEFAULT_POLICY_CONFIG, mode: 'AUTONOMOUS', allowedAssets: ['USDC_TEST'] },
      }),
    );

    expect(result.decision).toBe('DENY');
    expect(result.reasons[0]!.ruleId).toBe('P-04');
  });
});

describe('P-05 · operaciones por hora', () => {
  it('cuenta las acciones de la propuesta, no solo el historial', () => {
    // 8 ya hechas + 3 propuestas = 11 > 10.
    const result = evaluatePolicy(
      scenario({
        operationsLastHour: 8,
        actions: [action(), action(), action()],
      }),
    );

    expect(result.decision).toBe('REQUIRE_USER');
    expect(
      ruleIds(scenario({ operationsLastHour: 8, actions: [action(), action(), action()] })),
    ).toContain('P-05');
  });
});

describe('P-06 · fondos y reserva mínima', () => {
  it('deniega si no hay saldo suficiente', () => {
    const result = evaluatePolicy(
      scenario({
        actions: [action({ amount: '5' })],
        balances: [{ asset: 'USDC_TEST', total: '4', available: '4' }],
      }),
    );

    expect(result.decision).toBe('DENY');
    expect(
      ruleIds(
        scenario({
          actions: [action({ amount: '5' })],
          balances: [{ asset: 'USDC_TEST', total: '4', available: '4' }],
        }),
      ),
    ).toContain('P-06');
  });

  it('deniega si la operación se comería la reserva intocable', () => {
    // Disponible 12, envía 5 → quedarían 7, por debajo de la reserva de 10.
    const result = evaluatePolicy(
      scenario({
        actions: [action({ amount: '5' })],
        balances: [{ asset: 'USDC_TEST', total: '12', available: '12' }],
      }),
    );

    expect(result.decision).toBe('DENY');
  });

  it('deniega si el activo no aparece entre los saldos', () => {
    const result = evaluatePolicy(
      scenario({
        actions: [action({ asset: 'XLM', amount: '1' })],
        balances: [{ asset: 'USDC_TEST', total: '250', available: '250' }],
      }),
    );

    expect(result.decision).toBe('DENY');
  });

  it('suma las acciones del mismo activo antes de comparar con la reserva', () => {
    // Tres pagos de 5 = 15. Con 20 disponibles quedarían 5, bajo la reserva de 10.
    const result = evaluatePolicy(
      scenario({
        actions: [
          action({ amount: '5', destinationId: VIAJE.id }),
          action({ amount: '5', destinationId: LAPTOP.id }),
          action({ amount: '5', destinationId: CURSO.id }),
        ],
        balances: [{ asset: 'USDC_TEST', total: '20', available: '20' }],
        dailySpentByAsset: {},
        config: { ...DEFAULT_POLICY_CONFIG, mode: 'AUTONOMOUS', maxDailyAmount: '1000' },
      }),
    );

    expect(result.decision).toBe('DENY');
  });
});

describe('P-07 · modo de operación', () => {
  it('en modo manual todo pasa por el usuario', () => {
    const result = evaluatePolicy(
      scenario({ config: { ...DEFAULT_POLICY_CONFIG, mode: 'MANUAL' } }),
    );

    expect(result.decision).toBe('REQUIRE_USER');
    expect(result.reasons[0]!.ruleId).toBe('P-07');
  });
});

describe('precedencia y acumulación de razones', () => {
  it('DENY gana sobre REQUIRE_USER', () => {
    const result = evaluatePolicy(
      scenario({
        // P-01 escala (monto alto) y P-04 deniega (activo prohibido).
        actions: [action({ asset: 'XLM', amount: '50' })],
        config: { ...DEFAULT_POLICY_CONFIG, mode: 'AUTONOMOUS', allowedAssets: ['USDC_TEST'] },
      }),
    );

    expect(result.decision).toBe('DENY');
    expect(result.reasons.map((r) => r.ruleId)).toEqual(expect.arrayContaining(['P-01', 'P-04']));
  });

  it('informa de todas las reglas incumplidas, no solo de la primera', () => {
    const ids = ruleIds(
      scenario({
        actions: [action({ amount: '30' })],
        knownCounterparties: [],
        dailySpentByAsset: { USDC_TEST: '19' },
        config: { ...DEFAULT_POLICY_CONFIG, mode: 'MANUAL' },
      }),
    );

    expect(new Set(ids)).toEqual(new Set(['P-01', 'P-02', 'P-03', 'P-07']));
  });
});

describe('caso de referencia del PLAN §1.4', () => {
  it('"$50 entre 3 objetivos + $10 de emergencia" exige confirmación con los valores por defecto', () => {
    const result = evaluatePolicy(
      scenario({
        config: DEFAULT_POLICY_CONFIG, // modo MANUAL, tope de 5 por operación
        actions: [
          action({ destinationId: VIAJE.id, amount: '13.33', label: 'Objetivo: Viaje' }),
          action({ destinationId: LAPTOP.id, amount: '13.33', label: 'Objetivo: Laptop' }),
          action({ destinationId: CURSO.id, amount: '13.34', label: 'Objetivo: Curso' }),
          action({ destinationId: EMERGENCIAS.id, amount: '10', label: 'Emergencias' }),
        ],
      }),
    );

    expect(result.decision).toBe('REQUIRE_USER');
    // Ninguna acción se puede ejecutar sola: las cuatro superan el tope de 5.
    expect(result.reasons.filter((r) => r.ruleId === 'P-01' && r.unit === 'asset')).toHaveLength(4);
    // Y como USDC_TEST vale un dólar, también superan el tope de $5.
    expect(result.reasons.filter((r) => r.ruleId === 'P-01' && r.unit === 'usd')).toHaveLength(4);
    // Y el conjunto rompe el límite diario de 20.
    expect(result.reasons.some((r) => r.ruleId === 'P-02')).toBe(true);
  });
});

describe('topes en dólares (ADR 0011)', () => {
  it('escala al usuario aunque el monto quepa en el límite del activo', () => {
    // 100 XLM caben de sobra en un límite de 1000 XLM, pero a 0.12 el XLM son
    // 12 dólares y el tope es de 5. Este es exactamente el agujero que el
    // ADR 0003 dejaba abierto.
    const result = evaluatePolicy(
      scenario({
        actions: [action({ asset: 'XLM', amount: '100' })],
        config: {
          ...DEFAULT_POLICY_CONFIG,
          mode: 'AUTONOMOUS',
          maxAmountPerOperation: '1000',
          maxDailyAmount: '10000',
          // La reserva por activo se desactiva para aislar el tope en dólares.
          minimumReserve: '0',
          maxAmountPerOperationUsd: '5',
          maxDailyAmountUsd: '1000',
          minimumReserveUsd: null,
        },
      }),
    );

    expect(result.decision).toBe('REQUIRE_USER');
    const razon = result.reasons.find((r) => r.ruleId === 'P-01' && r.unit === 'usd');
    expect(razon?.message).toContain('$12.00');
  });

  it('el tope en dólares nunca afloja el del activo', () => {
    // 10 USDC son 10 dólares: cabe en el tope de $50 pero no en el de 5 USDC.
    const result = evaluatePolicy(
      scenario({
        actions: [action({ amount: '10' })],
        config: {
          ...DEFAULT_POLICY_CONFIG,
          mode: 'AUTONOMOUS',
          maxAmountPerOperation: '5',
          maxAmountPerOperationUsd: '50',
          maxDailyAmountUsd: '1000',
        },
      }),
    );

    expect(result.decision).toBe('REQUIRE_USER');
    expect(result.reasons.some((r) => r.ruleId === 'P-01' && r.unit === 'asset')).toBe(true);
    expect(result.reasons.some((r) => r.ruleId === 'P-01' && r.unit === 'usd')).toBe(false);
  });

  it('el límite diario en dólares suma activos distintos', () => {
    // 50 XLM (6 dólares) + 10 USDC (10 dólares) = 16, más 10 ya gastados = 26.
    const result = evaluatePolicy(
      scenario({
        actions: [
          action({ asset: 'XLM', amount: '50', destinationId: VIAJE.id }),
          action({ amount: '10', destinationId: LAPTOP.id }),
        ],
        dailySpentUsd: '10',
        config: {
          ...DEFAULT_POLICY_CONFIG,
          mode: 'AUTONOMOUS',
          maxAmountPerOperation: '1000',
          maxDailyAmount: '10000',
          maxAmountPerOperationUsd: '100',
          maxDailyAmountUsd: '20',
          minimumReserveUsd: null,
        },
      }),
    );

    const razon = result.reasons.find((r) => r.ruleId === 'P-02' && r.unit === 'usd');
    expect(razon?.message).toContain('$26.00');
    expect(result.decision).toBe('REQUIRE_USER');
  });

  it('la reserva en dólares mira todo el patrimonio, no solo el activo enviado', () => {
    // Manda USDC hasta dejar ese saldo a cero; el XLM que queda vale 1.2
    // dólares, por debajo de la reserva de 10.
    const result = evaluatePolicy(
      scenario({
        actions: [action({ amount: '250' })],
        balances: [
          { asset: 'XLM', total: '10', available: '10' },
          { asset: 'USDC_TEST', total: '250', available: '250' },
        ],
        config: {
          ...DEFAULT_POLICY_CONFIG,
          mode: 'AUTONOMOUS',
          maxAmountPerOperation: '1000',
          maxDailyAmount: '10000',
          minimumReserve: '0',
          maxAmountPerOperationUsd: null,
          maxDailyAmountUsd: null,
          minimumReserveUsd: '10',
        },
      }),
    );

    expect(result.decision).toBe('DENY');
    expect(result.reasons.some((r) => r.ruleId === 'P-06' && r.unit === 'usd')).toBe(true);
  });
});

describe('P-10 · sin precio', () => {
  const sinPrecios = { capturedAt: NOW.toISOString(), quotes: [] };

  it('escala al usuario en vez de comprobar el límite a ciegas', () => {
    const result = evaluatePolicy(scenario({ prices: sinPrecios }));

    expect(result.decision).toBe('REQUIRE_USER');
    expect(result.reasons.find((r) => r.ruleId === 'P-10')?.message).toContain('USDC_TEST');
  });

  it('no deniega: una caída del oráculo no inutiliza el producto', () => {
    expect(evaluatePolicy(scenario({ prices: sinPrecios })).decision).not.toBe('DENY');
  });

  it('no molesta si no hay ningún tope en dólares configurado', () => {
    const result = evaluatePolicy(
      scenario({
        prices: sinPrecios,
        config: {
          ...DEFAULT_POLICY_CONFIG,
          mode: 'AUTONOMOUS',
          maxAmountPerOperationUsd: null,
          maxDailyAmountUsd: null,
          minimumReserveUsd: null,
        },
      }),
    );

    expect(result.decision).toBe('AUTO_APPROVE');
  });

  it('sin precio no se aplica ninguna regla en dólares a ciegas', () => {
    const result = evaluatePolicy(
      scenario({
        actions: [action({ amount: '10000' })],
        balances: [{ asset: 'USDC_TEST', total: '100000', available: '100000' }],
        prices: sinPrecios,
      }),
    );

    expect(result.reasons.some((r) => r.ruleId === 'P-10')).toBe(true);
    // Ninguna razón en dólares: sin precio no se inventa una conversión.
    expect(result.reasons.filter((r) => r.unit === 'usd' && r.ruleId !== 'P-10')).toEqual([]);
  });
});
