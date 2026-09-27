import type { TxSummary } from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import { pace, sentBetween, weeksToGoal } from './trends';

/**
 * Un ritmo mal calculado no rompe nada, pero miente sobre cuándo vas a llegar
 * a tu meta — y eso es peor que no decir nada, porque se actúa sobre ello.
 */

const DESTINO = 'GB7G7EXAMPLEADDRESSFORTESTINGONLY00000000000000000RVVZJ4';
const AHORA = new Date('2026-09-27T12:00:00.000Z');
const DIA = 24 * 3600_000;

function pago(diasAtras: number, amount: string, overrides: Partial<TxSummary> = {}): TxSummary {
  return {
    hash: `h${diasAtras}`,
    createdAt: new Date(AHORA.getTime() - diasAtras * DIA).toISOString(),
    direction: 'OUT',
    counterparty: DESTINO,
    asset: 'USDC_TEST',
    amount,
    memo: null,
    successful: true,
    ...overrides,
  } as TxSummary;
}

describe('sentBetween', () => {
  it('suma solo lo que cae dentro de la ventana', () => {
    const movimientos = [pago(1, '10'), pago(10, '20'), pago(40, '100')];

    const resultado = sentBetween(
      movimientos,
      DESTINO,
      'USDC_TEST',
      new Date(AHORA.getTime() - 14 * DIA),
      AHORA,
    );

    expect(resultado).toBe('30.0000000');
  });

  it('ignora lo fallido, lo entrante y lo de otro destino', () => {
    const movimientos = [
      pago(1, '10', { successful: false }),
      pago(1, '20', { direction: 'IN' }),
      pago(1, '30', { counterparty: 'GOTRO' }),
    ];

    const resultado = sentBetween(
      movimientos,
      DESTINO,
      'USDC_TEST',
      new Date(AHORA.getTime() - 7 * DIA),
      AHORA,
    );

    expect(resultado).toBe('0.0000000');
  });
});

describe('pace', () => {
  it('compara dos ventanas del mismo tamaño', () => {
    // 4 semanas = 28 días. Reciente: días 0–28. Anterior: días 28–56.
    const movimientos = [pago(5, '40'), pago(20, '20'), pago(35, '100')];

    const ritmo = pace(movimientos, DESTINO, 'USDC_TEST', 4, AHORA);

    expect(ritmo.reciente).toBe('60.0000000');
    expect(ritmo.anterior).toBe('100.0000000');
    expect(ritmo.diferencia).toBe('-40.0000000');
  });

  it('da la media por semana', () => {
    const ritmo = pace([pago(5, '40')], DESTINO, 'USDC_TEST', 4, AHORA);

    expect(ritmo.porSemana).toBe('10.0000000');
  });

  it('sin movimientos, todo a cero y sin romper', () => {
    const ritmo = pace([], DESTINO, 'USDC_TEST', 4, AHORA);

    expect(ritmo.reciente).toBe('0.0000000');
    expect(ritmo.porSemana).toBe('0.0000000');
  });
});

describe('weeksToGoal', () => {
  it('estima las semanas que faltan', () => {
    expect(weeksToGoal('100', '25')).toBe(4);
  });

  it('redondea hacia arriba: es el lado honesto de un plazo', () => {
    // 100 a 30 por semana son 3,33 semanas. Decir «3» promete de más.
    expect(weeksToGoal('100', '30')).toBe(4);
  });

  it('cero cuando ya has llegado', () => {
    expect(weeksToGoal('0', '25')).toBe(0);
    expect(weeksToGoal('-5', '25')).toBe(0);
  });

  it('sin ritmo no hay estimación, y se dice con null', () => {
    // Un «nunca» o un infinito en pantalla serían peores que no decir nada.
    expect(weeksToGoal('100', '0')).toBeNull();
  });
});
