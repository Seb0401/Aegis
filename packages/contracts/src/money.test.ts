import { describe, expect, it } from 'vitest';
import {
  addAmounts,
  compareAmounts,
  formatAmount,
  fromStroops,
  medianAmount,
  percentageOf,
  ratioOf,
  subtractAmounts,
  toStroops,
} from './money.js';

describe('toStroops / fromStroops', () => {
  it('convierte ida y vuelta sin perder precisión', () => {
    expect(toStroops('1')).toBe(10_000_000n);
    expect(toStroops('0.0000001')).toBe(1n);
    expect(fromStroops(10_000_000n)).toBe('1.0000000');
    expect(fromStroops(1n)).toBe('0.0000001');
  });

  it('rechaza formatos inválidos', () => {
    expect(() => toStroops('1.12345678')).toThrow();
    expect(() => toStroops('abc')).toThrow();
    expect(() => toStroops('')).toThrow();
  });
});

describe('addAmounts', () => {
  it('no arrastra el error de coma flotante de 0.1 + 0.2', () => {
    // Con números: 0.1 + 0.2 === 0.30000000000000004
    expect(addAmounts('0.1', '0.2')).toBe('0.3000000');
  });

  it('suma el caso de referencia del PLAN: $50 en 4 pagos', () => {
    expect(addAmounts('13.33', '13.33', '13.34', '10')).toBe('50.0000000');
  });
});

describe('subtractAmounts', () => {
  it('permite resultados negativos', () => {
    expect(subtractAmounts('5', '8')).toBe('-3.0000000');
  });
});

describe('compareAmounts', () => {
  it('compara por valor, no por texto', () => {
    // Como strings, "10" < "9". Como dinero, no.
    expect(compareAmounts('10', '9')).toBe(1);
    expect(compareAmounts('5.0000000', '5')).toBe(0);
  });
});

describe('percentageOf', () => {
  it('calcula el porcentaje del saldo (señal G-02)', () => {
    expect(percentageOf('72', '100')).toBe(72);
    expect(percentageOf('1', '3')).toBeCloseTo(33.33, 2);
  });

  it('devuelve 0 si el total es cero en vez de dividir por cero', () => {
    expect(percentageOf('10', '0')).toBe(0);
  });
});

describe('ratioOf', () => {
  it('calcula el múltiplo frente a la mediana (señal G-03)', () => {
    expect(ratioOf('80', '10')).toBe(8);
  });

  it('devuelve Infinity si la referencia es cero', () => {
    expect(ratioOf('10', '0')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('medianAmount', () => {
  it('devuelve 0 sin historial', () => {
    expect(medianAmount([])).toBe('0');
  });

  it('usa el valor central con longitud impar', () => {
    expect(medianAmount(['1', '100', '5'])).toBe('5.0000000');
  });

  it('promedia los dos centrales con longitud par', () => {
    expect(medianAmount(['1', '2', '3', '4'])).toBe('2.5000000');
  });
});

describe('formatAmount', () => {
  it('quita los ceros sobrantes', () => {
    expect(formatAmount('12.5000000')).toBe('12.5');
    expect(formatAmount('12.0000000')).toBe('12');
    expect(formatAmount('120')).toBe('120');
  });
});
