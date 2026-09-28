import type { TxSummary } from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './utils';
import { cumulativeFlow, dailyLimitUsage, goalProgress, reservedAmount, sentTo } from './stats';

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

describe('sentTo', () => {
  const DESTINO = 'GB7G7EXAMPLEADDRESSFORTESTINGONLY00000000000000000RVVZJ4';
  const OTRO = 'GCWECUEXAMPLEADDRESSFORTESTINGONLY0000000000000000IA5VIS';

  function pago(overrides: Partial<TxSummary>): TxSummary {
    return {
      hash: 'h',
      createdAt: '2026-09-20T10:00:00.000Z',
      direction: 'OUT',
      counterparty: DESTINO,
      asset: 'USDC_TEST',
      amount: '10',
      memo: null,
      successful: true,
      ...overrides,
    } as TxSummary;
  }

  it('suma lo enviado a ese destino', () => {
    expect(sentTo([pago({ amount: '10' }), pago({ amount: '5.5' })], DESTINO, 'USDC_TEST')).toBe(
      '15.5000000',
    );
  });

  it('no cuenta lo que fue a otro sitio', () => {
    expect(sentTo([pago({ counterparty: OTRO })], DESTINO, 'USDC_TEST')).toBe('0.0000000');
  });

  it('no cuenta lo que entró', () => {
    expect(sentTo([pago({ direction: 'IN' })], DESTINO, 'USDC_TEST')).toBe('0.0000000');
  });

  it('no cuenta lo que falló', () => {
    // Una transacción fallida no movió nada. Sumarla haría creer que vas más
    // adelantado de lo que estás, que es justo lo que una barra de progreso
    // hacia una meta de ahorro no puede hacer.
    expect(sentTo([pago({ successful: false })], DESTINO, 'USDC_TEST')).toBe('0.0000000');
  });

  it('no mezcla activos', () => {
    expect(sentTo([pago({ asset: 'XLM' })], DESTINO, 'USDC_TEST')).toBe('0.0000000');
  });
});

describe('goalProgress', () => {
  it('devuelve la fracción cubierta', () => {
    expect(goalProgress('25', '100')).toBeCloseTo(0.25);
  });

  it('se recorta al llegar a la meta', () => {
    // Pasarse es buena noticia, pero una barra que se sale de su caja es un
    // fallo visual. El exceso lo cuenta la cifra de al lado.
    expect(goalProgress('150', '100')).toBe(1);
  });

  it('sin meta no hay progreso que enseñar', () => {
    expect(goalProgress('25', null)).toBeNull();
    expect(goalProgress('25', '0')).toBeNull();
  });
});

describe('formatRelativeTime', () => {
  const AHORA = new Date('2026-09-28T12:00:00.000Z');
  const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();

  it('lo muy reciente no lleva número', () => {
    expect(formatRelativeTime(hace(10_000), AHORA)).toBe('hace un momento');
  });

  it('minutos y horas', () => {
    expect(formatRelativeTime(hace(5 * 60_000), AHORA)).toBe('hace 5 min');
    expect(formatRelativeTime(hace(3 * 3600_000), AHORA)).toBe('hace 3 horas');
    expect(formatRelativeTime(hace(3600_000), AHORA)).toBe('hace 1 hora');
  });

  it('ayer y los días de esta semana', () => {
    expect(formatRelativeTime(hace(24 * 3600_000), AHORA)).toBe('ayer');
    expect(formatRelativeTime(hace(3 * 24 * 3600_000), AHORA)).toBe('hace 3 días');
  });

  it('pasada una semana vuelve a la fecha', () => {
    // «hace 23 días» obliga a hacer la cuenta para saber de qué día hablamos.
    expect(formatRelativeTime(hace(30 * 24 * 3600_000), AHORA)).toMatch(/2026|ago|sept/);
  });

  it('nunca habla en futuro', () => {
    // Un reloj mal puesto daría fechas por delante, y «dentro de 2 horas»
    // junto a un pago ya hecho asusta sin motivo.
    const futuro = new Date(AHORA.getTime() + 2 * 3600_000).toISOString();

    expect(formatRelativeTime(futuro, AHORA)).toBe('hace un momento');
  });

  it('una fecha ilegible se devuelve tal cual, sin romper', () => {
    expect(formatRelativeTime('no-es-una-fecha', AHORA)).toBe('no-es-una-fecha');
  });
});
