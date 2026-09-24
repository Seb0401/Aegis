import { describe, expect, it } from 'vitest';
import { amountToStroops, stroopsToAmount } from './amounts.js';

describe('montos Stellar', () => {
  it('convierte sin usar coma flotante', () => {
    expect(amountToStroops('9007199254740993.1234567')).toBe(90071992547409931234567n);
    expect(stroopsToAmount(90071992547409931234567n)).toBe('9007199254740993.1234567');
  });

  it('rellena decimales y acota resultados negativos a cero', () => {
    expect(amountToStroops('1.2')).toBe(12_000_000n);
    expect(stroopsToAmount(-1n)).toBe('0.0000000');
  });

  it('rechaza más de siete decimales', () => {
    expect(() => amountToStroops('1.00000001')).toThrow(/7 decimales/);
  });
});
