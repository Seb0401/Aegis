import type { TxSummary } from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import { cumulativeFlow, dailyLimitUsage, reservedAmount } from './stats';

const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

function tx(overrides: Partial<TxSummary> & Pick<TxSummary, 'amount' | 'direction'>): TxSummary {
  return {
    hash: Math.random().toString(36).slice(2),
    createdAt: '2026-09-01T00:00:00.000Z',
    counterparty: ADDRESS,
    asset: 'XLM',
    memo: null,
    successful: true,
    ...overrides,
  };
}

describe('cumulativeFlow', () => {
  it('acumula del más antiguo al más reciente, aunque lleguen al revés', () => {
    const flow = cumulativeFlow(
      [
        tx({ amount: '5', direction: 'OUT', createdAt: '2026-09-03T00:00:00.000Z' }),
        tx({ amount: '100', direction: 'IN', createdAt: '2026-09-01T00:00:00.000Z' }),
        tx({ amount: '20', direction: 'OUT', createdAt: '2026-09-02T00:00:00.000Z' }),
      ],
      'XLM',
    );

    expect(flow).toEqual([100, 80, 75]);
  });

  it('ignora otros activos y las transacciones fallidas', () => {
    const flow = cumulativeFlow(
      [
        tx({ amount: '10', direction: 'IN', createdAt: '2026-09-01T00:00:00.000Z' }),
        tx({ amount: '999', direction: 'IN', asset: 'USDC_TEST' }),
        // Una que falló no movió dinero, así que no puede mover la línea.
        tx({ amount: '500', direction: 'OUT', successful: false }),
        tx({ amount: '4', direction: 'OUT', createdAt: '2026-09-02T00:00:00.000Z' }),
      ],
      'XLM',
    );

    expect(flow).toEqual([10, 6]);
  });

  it('conserva los decimales de Stellar', () => {
    const flow = cumulativeFlow(
      [
        tx({ amount: '0.1', direction: 'IN', createdAt: '2026-09-01T00:00:00.000Z' }),
        tx({ amount: '0.2', direction: 'IN', createdAt: '2026-09-02T00:00:00.000Z' }),
      ],
      'XLM',
    );

    expect(flow[1]).toBeCloseTo(0.3, 7);
  });

  it('sin movimientos no hay serie', () => {
    expect(cumulativeFlow([], 'XLM')).toEqual([]);
  });
});

describe('dailyLimitUsage', () => {
  it('traduce lo gastado a una fracción', () => {
    expect(dailyLimitUsage('20', '20')).toBe(0);
    expect(dailyLimitUsage('20', '15')).toBe(0.25);
    expect(dailyLimitUsage('20', '0')).toBe(1);
  });

  it('no se sale de la escala si la API devolviera algo raro', () => {
    expect(dailyLimitUsage('20', '25')).toBe(0);
    expect(dailyLimitUsage('20', '-5')).toBe(1);
    expect(dailyLimitUsage('0', '0')).toBe(0);
  });
});

describe('reservedAmount', () => {
  it('es lo que hay menos lo gastable', () => {
    expect(reservedAmount('100', '95')).toBe('5.0000000');
  });

  it('nunca es negativo', () => {
    expect(reservedAmount('100', '100')).toBe('0');
    expect(reservedAmount('100', '120')).toBe('0');
  });
});
