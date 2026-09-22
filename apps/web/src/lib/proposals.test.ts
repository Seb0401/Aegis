import type { Proposal, ProposedAction } from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import {
  isActionable,
  isLive,
  matchesTotal,
  needsTotalConfirmation,
  proposalTotal,
  totalsByAsset,
} from './proposals';

/**
 * El total que se muestra y el que valida la API tienen que ser el mismo
 * número. Si divergen, el usuario escribe lo que ve y la API le responde
 * CONFIRMATION_REQUIRED sin que nada en pantalla explique por qué.
 */

function action(amount: string, asset: ProposedAction['asset'] = 'XLM'): ProposedAction {
  return {
    type: 'PAYMENT',
    destinationId: 'dest_1',
    asset,
    amount,
    label: 'Objetivo: Viaje',
  };
}

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'prop_1',
    userId: 'user_1',
    status: 'PENDING_USER',
    summary: 'Reparto entre objetivos',
    actions: [action('10')],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('proposalTotal', () => {
  it('suma sin perder decimales', () => {
    // 0.1 + 0.2 con floats daría 0.30000000000000004.
    expect(proposalTotal([action('0.1'), action('0.2')])).toBe('0.3000000');
  });

  it('suma todas las acciones sin separar por activo, igual que totalOf() en la API', () => {
    const total = proposalTotal([action('10', 'XLM'), action('5.5', 'USDC_TEST')]);
    expect(total).toBe('15.5000000');
  });

  it('devuelve cero cuando no hay acciones', () => {
    expect(proposalTotal([])).toBe('0.0000000');
  });
});

describe('totalsByAsset', () => {
  it('agrupa por activo para mostrarlo al usuario', () => {
    const totals = totalsByAsset([
      action('10', 'XLM'),
      action('5', 'USDC_TEST'),
      action('2.5', 'XLM'),
    ]);

    expect(totals).toEqual([
      ['XLM', '12.5000000'],
      ['USDC_TEST', '5.0000000'],
    ]);
  });
});

describe('matchesTotal', () => {
  it('acepta el mismo monto escrito con otra precisión', () => {
    expect(matchesTotal('15.5', '15.5000000')).toBe(true);
    expect(matchesTotal(' 15.50 ', '15.5000000')).toBe(true);
  });

  it('rechaza un monto distinto', () => {
    expect(matchesTotal('15.51', '15.5000000')).toBe(false);
  });

  it('trata el texto a medias como "todavía no coincide", sin lanzar', () => {
    expect(matchesTotal('', '15.5000000')).toBe(false);
    expect(matchesTotal('15.', '15.5000000')).toBe(false);
    expect(matchesTotal('quince', '15.5000000')).toBe(false);
  });
});

describe('estado de la propuesta', () => {
  it('solo se puede actuar desde PENDING_USER', () => {
    expect(isActionable(proposal())).toBe(true);
    expect(isActionable(proposal({ status: 'CONFIRMED' }))).toBe(false);
    expect(isActionable(proposal({ status: 'AUTO_APPROVED' }))).toBe(false);
  });

  it('sigue viva mientras la red pueda cambiarla', () => {
    expect(isLive(proposal({ status: 'SUBMITTED' }))).toBe(true);
    expect(isLive(proposal({ status: 'CONFIRMED' }))).toBe(false);
    expect(isLive(proposal({ status: 'EXPIRED' }))).toBe(false);
  });

  it('exige reescribir el total solo con riesgo alto o crítico', () => {
    const risk = {
      score: 70,
      level: 'HIGH' as const,
      signals: [],
      balanceAfter: '10',
      evaluatedAt: new Date().toISOString(),
    };
    expect(needsTotalConfirmation(proposal({ risk }))).toBe(true);
    expect(needsTotalConfirmation(proposal({ risk: { ...risk, level: 'CRITICAL' } }))).toBe(true);
    expect(needsTotalConfirmation(proposal({ risk: { ...risk, level: 'MEDIUM' } }))).toBe(false);
    expect(needsTotalConfirmation(proposal())).toBe(false);
  });
});
