import {
  DEFAULT_POLICY_CONFIG,
  FIXTURE_DESTINATIONS,
  FIXTURE_PRICE_SNAPSHOT,
  type AccountInfo,
  type Balance,
  type HistoryStats,
  type ResolvedAction,
  type RiskSignalId,
} from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import { assessRisk, computeScore, levelFromScore } from './assess.js';
import { buildTemplateExplanation } from './explain.js';
import type { GuardianInput } from './types.js';

const NOW = new Date('2026-09-19T12:00:00.000Z');

const VIAJE = FIXTURE_DESTINATIONS[0]!;
const ANA = FIXTURE_DESTINATIONS[4]!;

const BALANCES: Balance[] = [
  { asset: 'XLM', total: '100.0000000', available: '100.0000000' },
  { asset: 'USDC_TEST', total: '250.0000000', available: '250.0000000' },
];

/** Historial "sano": el usuario ya envió a Viaje, con una mediana de 10. */
const STATS: HistoryStats = {
  medianOutgoingAmount: '10.0000000',
  knownCounterparties: [VIAJE.address],
  outgoingLastHour: 0,
  usedAssets: ['USDC_TEST'],
};

const HEALTHY_ACCOUNT: AccountInfo = {
  exists: true,
  ageDays: 400,
  trustlines: ['XLM', 'USDC_TEST'],
};

function action(overrides: Partial<ResolvedAction> = {}): ResolvedAction {
  return {
    type: 'PAYMENT',
    destinationId: VIAJE.id,
    destinationAddress: VIAJE.address,
    destinationLabel: VIAJE.label,
    asset: 'USDC_TEST',
    amount: '10',
    memo: null,
    label: 'Objetivo: Viaje',
    ...overrides,
  };
}

function scenario(overrides: Partial<GuardianInput> = {}): GuardianInput {
  const actions = overrides.actions ?? [action()];

  return {
    actions,
    destinations: overrides.destinations ?? FIXTURE_DESTINATIONS,
    balances: overrides.balances ?? BALANCES,
    config: overrides.config ?? DEFAULT_POLICY_CONFIG,
    // Con precios, que es el caso normal. La ausencia se prueba aparte, en G-10.
    prices: overrides.prices ?? FIXTURE_PRICE_SNAPSHOT,
    stats: overrides.stats ?? STATS,
    accountInfoByAddress:
      overrides.accountInfoByAddress ??
      Object.fromEntries(actions.map((a) => [a.destinationAddress, HEALTHY_ACCOUNT])),
    now: overrides.now ?? NOW,
    ...(overrides.estimatedFee ? { estimatedFee: overrides.estimatedFee } : {}),
  };
}

function signalIds(input: GuardianInput): RiskSignalId[] {
  return assessRisk(input).signals.map((s) => s.id);
}

describe('escenario tranquilo', () => {
  it('da riesgo LOW para un envío habitual a un destino conocido', () => {
    const report = assessRisk(scenario());

    expect(report.level).toBe('LOW');
    // Solo queda la señal informativa del porcentaje de saldo.
    expect(report.signals.every((s) => s.severity === 'INFO')).toBe(true);
    expect(report.balanceAfter).toBe('240.0000000');
    expect(report.evaluatedAt).toBe(NOW.toISOString());
  });
});

describe('G-01 · dirección nunca vista', () => {
  it('marca HIGH un destino sin historial y sin marca de confianza', () => {
    const report = assessRisk(
      scenario({
        actions: [
          action({
            destinationId: ANA.id,
            destinationAddress: ANA.address,
            destinationLabel: ANA.label,
          }),
        ],
      }),
    );

    const signal = report.signals.find((s) => s.id === 'G-01');
    expect(signal?.severity).toBe('HIGH');
    expect(signal?.actionIndex).toBe(0);
  });

  it('baja a INFO si el usuario marcó el destino como de confianza', () => {
    const trusted = { ...ANA, trusted: true };
    const report = assessRisk(
      scenario({
        destinations: [trusted],
        actions: [
          action({
            destinationId: trusted.id,
            destinationAddress: trusted.address,
            destinationLabel: trusted.label,
          }),
        ],
      }),
    );

    expect(report.signals.find((s) => s.id === 'G-01')?.severity).toBe('INFO');
  });
});

describe('G-02 · porcentaje del saldo', () => {
  it('avisa a partir del 50 % y sube a HIGH a partir del 70 %', () => {
    const warn = assessRisk(
      scenario({
        actions: [action({ amount: '150' })],
        balances: [{ asset: 'USDC_TEST', total: '250', available: '250' }],
      }),
    );
    expect(warn.signals.find((s) => s.id === 'G-02')?.severity).toBe('WARN');

    const high = assessRisk(
      scenario({
        actions: [action({ amount: '200' })],
        balances: [{ asset: 'USDC_TEST', total: '250', available: '250' }],
      }),
    );
    expect(high.signals.find((s) => s.id === 'G-02')?.severity).toBe('HIGH');
  });

  it('guarda el porcentaje exacto en los datos de la señal', () => {
    const report = assessRisk(
      scenario({
        actions: [action({ amount: '180' })],
        balances: [{ asset: 'USDC_TEST', total: '250', available: '250' }],
      }),
    );

    expect(report.signals.find((s) => s.id === 'G-02')?.data).toMatchObject({
      percentageOfBalance: 72,
      asset: 'USDC_TEST',
    });
  });
});

describe('G-03 · monto atípico', () => {
  it('no se dispara sin historial previo', () => {
    const ids = signalIds(
      scenario({
        actions: [action({ amount: '100' })],
        stats: { ...STATS, medianOutgoingAmount: '0' },
      }),
    );

    expect(ids).not.toContain('G-03');
  });

  it('avisa a partir de 3 veces la mediana', () => {
    const report = assessRisk(scenario({ actions: [action({ amount: '35' })] }));
    const signal = report.signals.find((s) => s.id === 'G-03');

    expect(signal?.severity).toBe('WARN');
    expect(signal?.data).toMatchObject({ ratio: 3.5, medianAmount: '10.0000000' });
  });

  it('sube a HIGH a partir de 9 veces la mediana', () => {
    const report = assessRisk(scenario({ actions: [action({ amount: '100' })] }));

    expect(report.signals.find((s) => s.id === 'G-03')?.severity).toBe('HIGH');
  });
});

describe('G-04 · saldo restante bajo la reserva', () => {
  it('se dispara cuando la propuesta deja el saldo bajo la reserva mínima', () => {
    const report = assessRisk(
      scenario({
        actions: [action({ amount: '245' })],
        balances: [{ asset: 'USDC_TEST', total: '250', available: '250' }],
      }),
    );

    const signal = report.signals.find((s) => s.id === 'G-04');
    expect(signal?.severity).toBe('HIGH');
    expect(signal?.data).toMatchObject({ balanceAfter: '5.0000000', minimumReserve: '10' });
  });

  it('descuenta la comisión estimada cuando el activo principal es XLM', () => {
    const report = assessRisk(
      scenario({
        actions: [action({ asset: 'XLM', amount: '20' })],
        balances: [{ asset: 'XLM', total: '100', available: '100' }],
        stats: { ...STATS, usedAssets: ['XLM'] },
        estimatedFee: '0.0001',
      }),
    );

    expect(report.balanceAfter).toBe('79.9999000');
  });
});

describe('G-05 · destino que no puede recibir', () => {
  it('marca HIGH si la cuenta destino no existe', () => {
    const report = assessRisk(
      scenario({
        accountInfoByAddress: { [VIAJE.address]: { exists: false, trustlines: [] } },
      }),
    );

    expect(report.signals.find((s) => s.id === 'G-05')?.data).toMatchObject({ exists: false });
  });

  it('marca HIGH si falta la trustline del activo', () => {
    const report = assessRisk(
      scenario({
        accountInfoByAddress: {
          [VIAJE.address]: { exists: true, ageDays: 300, trustlines: ['XLM'] },
        },
      }),
    );

    expect(report.signals.find((s) => s.id === 'G-05')?.data).toMatchObject({
      missingTrustline: true,
    });
  });

  it('no exige trustline para XLM', () => {
    const ids = signalIds(
      scenario({
        actions: [action({ asset: 'XLM', amount: '1' })],
        stats: { ...STATS, usedAssets: ['XLM'] },
        accountInfoByAddress: {
          [VIAJE.address]: { exists: true, ageDays: 300, trustlines: ['XLM'] },
        },
      }),
    );

    expect(ids).not.toContain('G-05');
  });
});

describe('G-06 · cuenta destino nueva', () => {
  it('avisa si la cuenta se creó hace menos de una semana', () => {
    const report = assessRisk(
      scenario({
        accountInfoByAddress: {
          [VIAJE.address]: { exists: true, ageDays: 2, trustlines: ['XLM', 'USDC_TEST'] },
        },
      }),
    );

    expect(report.signals.find((s) => s.id === 'G-06')?.data).toMatchObject({ ageDays: 2 });
  });
});

describe('G-07 · activo nunca usado', () => {
  it('informa la primera vez que se envía un activo', () => {
    const ids = signalIds(
      scenario({
        actions: [action({ asset: 'XLM', amount: '1' })],
        stats: { ...STATS, usedAssets: ['USDC_TEST'] },
      }),
    );

    expect(ids).toContain('G-07');
  });
});

describe('G-08 · velocidad inusual', () => {
  it('avisa cuando el ritmo de operaciones se dispara', () => {
    const ids = signalIds(
      scenario({
        stats: { ...STATS, outgoingLastHour: 5 },
      }),
    );

    expect(ids).toContain('G-08');
  });
});

describe('G-09 · destino bloqueado', () => {
  it('marca HIGH un destino de la lista de bloqueo', () => {
    const blocked = { ...VIAJE, blocked: true };
    const report = assessRisk(scenario({ destinations: [blocked] }));

    expect(report.signals.find((s) => s.id === 'G-09')?.severity).toBe('HIGH');
  });
});

describe('score y nivel', () => {
  it('ignora las señales informativas', () => {
    expect(computeScore([{ id: 'G-07', severity: 'INFO', data: {} }])).toBe(0);
  });

  it('acota el score a 100', () => {
    const many = Array.from({ length: 10 }, () => ({
      id: 'G-01' as const,
      severity: 'HIGH' as const,
      data: {},
    }));

    expect(computeScore(many)).toBe(100);
  });

  it('traduce el score a los niveles de §8.2', () => {
    expect(levelFromScore(0)).toBe('LOW');
    expect(levelFromScore(29)).toBe('LOW');
    expect(levelFromScore(30)).toBe('MEDIUM');
    expect(levelFromScore(59)).toBe('MEDIUM');
    expect(levelFromScore(60)).toBe('HIGH');
    expect(levelFromScore(84)).toBe('HIGH');
    expect(levelFromScore(85)).toBe('CRITICAL');
  });
});

describe('explicación de respaldo', () => {
  it('usa solo cifras presentes en el informe', () => {
    const input = scenario({
      actions: [action({ amount: '200' })],
      balances: [{ asset: 'USDC_TEST', total: '250', available: '250' }],
    });
    const report = assessRisk(input);
    const explanation = buildTemplateExplanation(report, input.actions);

    expect(explanation.generatedBy).toBe('template');
    expect(explanation.summary).toContain('200 USDC_TEST');
    expect(explanation.summary).toContain('Viaje');
    expect(explanation.summary).toContain('50');
    // Las señales informativas no se muestran como advertencias.
    expect(explanation.warnings.every((w) => w.signalId !== 'G-07')).toBe(true);
    expect(explanation.warnings.length).toBeGreaterThan(0);
  });

  it('resume el caso del PLAN §1.4 con sus cuatro pagos', () => {
    const actions = [
      action({ amount: '13.33', destinationLabel: 'Viaje' }),
      action({ amount: '13.33', destinationLabel: 'Laptop' }),
      action({ amount: '13.34', destinationLabel: 'Curso' }),
      action({ amount: '10', destinationLabel: 'Emergencias' }),
    ];
    const input = scenario({ actions });
    const explanation = buildTemplateExplanation(assessRisk(input), actions);

    expect(explanation.summary).toContain('50 USDC_TEST');
    expect(explanation.summary).toContain('en 4 pagos');
  });
});

describe('G-10 · sin precio', () => {
  it('avisa cuando no se puede valorar el activo y hay topes en dólares', () => {
    const report = assessRisk(scenario({ prices: { capturedAt: NOW.toISOString(), quotes: [] } }));

    const signal = report.signals.find((s) => s.id === 'G-10');
    expect(signal?.severity).toBe('WARN');
    expect(signal?.data).toMatchObject({ assetsWithoutPrice: ['USDC_TEST'] });
  });

  it('no dice nada si el usuario no tiene topes en dólares', () => {
    // Una advertencia que no cambia ninguna decisión solo enseña a ignorarlas.
    const ids = signalIds(
      scenario({
        prices: { capturedAt: NOW.toISOString(), quotes: [] },
        config: {
          ...DEFAULT_POLICY_CONFIG,
          maxAmountPerOperationUsd: null,
          maxDailyAmountUsd: null,
          minimumReserveUsd: null,
        },
      }),
    );

    expect(ids).not.toContain('G-10');
  });

  it('deja los totales en dólares a null en vez de inventarlos', () => {
    const report = assessRisk(scenario({ prices: { capturedAt: NOW.toISOString(), quotes: [] } }));

    expect(report.totalUsd).toBeNull();
    expect(report.balanceAfterUsd).toBeNull();
  });
});

describe('valores en dólares', () => {
  it('calcula el total y el saldo posterior con el precio de la foto', () => {
    // USDC_TEST vale 1 dólar en el fixture, así que 10 unidades son 10 dólares.
    const report = assessRisk(scenario());

    expect(report.totalUsd).toBe('10.0000000');
    expect(report.balanceAfterUsd).toBe('240.0000000');
  });

  it('convierte XLM a su precio real, no a la par', () => {
    // XLM cotiza a 0.12 en el fixture: 100 XLM son 12 dólares, no 100.
    const report = assessRisk(
      scenario({
        actions: [action({ asset: 'XLM', amount: '100' })],
        balances: [{ asset: 'XLM', total: '1000', available: '1000' }],
        stats: { ...STATS, usedAssets: ['XLM'] },
      }),
    );

    expect(report.totalUsd).toBe('12.0000000');
  });

  it('el explicador menciona el valor en dólares cuando existe', () => {
    const input = scenario();
    const explanation = buildTemplateExplanation(assessRisk(input), input.actions);

    expect(explanation.summary).toContain('$10.00');
  });

  it('el explicador omite los dólares si no se pudieron calcular', () => {
    const input = scenario({ prices: { capturedAt: NOW.toISOString(), quotes: [] } });
    const explanation = buildTemplateExplanation(assessRisk(input), input.actions);

    expect(explanation.summary).not.toContain('$');
  });
});
