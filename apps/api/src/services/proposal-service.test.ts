import type { PolicyDecision, RiskReport } from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import { decideNextStatus, totalOf } from './proposal-service.js';

function policy(decision: PolicyDecision['decision']): PolicyDecision {
  return { decision, reasons: [], evaluatedAt: '2026-09-19T12:00:00.000Z' };
}

function risk(level: RiskReport['level'], score: number): RiskReport {
  return {
    score,
    level,
    signals: [],
    balanceAfter: '100.0000000',
    evaluatedAt: '2026-09-19T12:00:00.000Z',
  };
}

describe('decideNextStatus · degradación por riesgo', () => {
  it('ejecuta sola una propuesta aprobada por política y de riesgo bajo', () => {
    expect(decideNextStatus(policy('AUTO_APPROVE'), risk('LOW', 10))).toBe('AUTO_APPROVED');
  });

  it('devuelve el control al usuario en cuanto el riesgo deja de ser LOW', () => {
    // Esta es la regla que hace que "modo autónomo" no signifique "barra libre".
    expect(decideNextStatus(policy('AUTO_APPROVE'), risk('MEDIUM', 35))).toBe('PENDING_USER');
    expect(decideNextStatus(policy('AUTO_APPROVE'), risk('HIGH', 70))).toBe('PENDING_USER');
    expect(decideNextStatus(policy('AUTO_APPROVE'), risk('CRITICAL', 95))).toBe('PENDING_USER');
  });

  it('nunca ejecuta sola algo que la política mandó confirmar, aunque el riesgo sea bajo', () => {
    expect(decideNextStatus(policy('REQUIRE_USER'), risk('LOW', 0))).toBe('PENDING_USER');
  });
});

describe('totalOf', () => {
  it('suma sin errores de coma flotante', () => {
    expect(totalOf([{ amount: '0.1' }, { amount: '0.2' }])).toBe('0.3000000');
  });

  it('suma el caso de referencia del PLAN', () => {
    const total = totalOf([
      { amount: '13.33' },
      { amount: '13.33' },
      { amount: '13.34' },
      { amount: '10' },
    ]);

    expect(total).toBe('50.0000000');
  });

  it('devuelve 0 sin acciones', () => {
    expect(totalOf([])).toBe('0.0000000');
  });
});
