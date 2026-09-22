import type { Proposal, RiskLevel } from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import { JUPI_ALT, JUPI_MOODS, moodForAgent, moodForProposal, moodForRisk } from './jupi';

/**
 * Jupi es simpática, pero no puede contradecir al Guardian: si el riesgo es
 * alto, la cara no puede ser de fiesta. Eso es lo que se fija aquí.
 */

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'prop_1',
    userId: 'user_1',
    status: 'PENDING_USER',
    summary: 'Reparto entre objetivos',
    actions: [
      { type: 'PAYMENT', destinationId: 'dest_1', asset: 'XLM', amount: '10', label: 'Viaje' },
    ],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function risk(level: RiskLevel) {
  return {
    score: 50,
    level,
    signals: [],
    balanceAfter: '10',
    evaluatedAt: new Date().toISOString(),
  };
}

/** Caras que no pueden salir cuando hay algo que mirar con atención. */
const CARAS_ALEGRES = ['feliz', 'alegre', 'emocionado', 'confiado'];

describe('moodForRisk', () => {
  it('se pone seria a medida que sube el riesgo', () => {
    expect(moodForRisk('LOW')).toBe('confiado');
    expect(moodForRisk('MEDIUM')).toBe('pensativo');
    expect(moodForRisk('HIGH')).toBe('sorprendido');
    expect(moodForRisk('CRITICAL')).toBe('enojado');
  });

  it('nunca celebra un riesgo alto o crítico', () => {
    expect(CARAS_ALEGRES).not.toContain(moodForRisk('HIGH'));
    expect(CARAS_ALEGRES).not.toContain(moodForRisk('CRITICAL'));
  });
});

describe('moodForProposal', () => {
  it('mientras espera tu firma, la cara la manda el riesgo', () => {
    expect(moodForProposal(proposal({ risk: risk('CRITICAL') }))).toBe('enojado');
    expect(moodForProposal(proposal({ risk: risk('LOW') }))).toBe('confiado');
  });

  it('sin informe de riesgo todavía, no aparenta tranquilidad', () => {
    expect(moodForProposal(proposal())).toBe('determinado');
  });

  it('solo celebra cuando la red confirma, no al firmar', () => {
    expect(moodForProposal(proposal({ status: 'SIGNED' }))).toBe('determinado');
    expect(moodForProposal(proposal({ status: 'SUBMITTED' }))).toBe('determinado');
    expect(moodForProposal(proposal({ status: 'CONFIRMED' }))).toBe('alegre');
  });

  it('una denegación de la política es Jupi protegiendo, no Jupi triste', () => {
    expect(moodForProposal(proposal({ status: 'DENIED' }))).toBe('protegiendo');
    expect(moodForProposal(proposal({ status: 'FAILED' }))).toBe('triste');
    expect(moodForProposal(proposal({ status: 'EXPIRED' }))).toBe('dormido');
  });
});

describe('moodForAgent', () => {
  it('el kill switch manda sobre todo lo demás', () => {
    const mood = moodForAgent({
      paused: true,
      thinking: true,
      pending: proposal({ risk: risk('CRITICAL') }),
    });
    expect(mood).toBe('dormido');
  });

  it('piensa mientras el agente trabaja', () => {
    expect(moodForAgent({ paused: false, thinking: true })).toBe('pensativo');
  });

  it('sin nada que hacer, se queda tranquila', () => {
    expect(moodForAgent({ paused: false, thinking: false })).toBe('tranquilo');
  });

  it('refleja la propuesta pendiente cuando la hay', () => {
    const mood = moodForAgent({
      paused: false,
      thinking: false,
      pending: proposal({ risk: risk('HIGH') }),
    });
    expect(mood).toBe('sorprendido');
  });
});

describe('sprites', () => {
  it('cada cara del sprite sheet tiene texto alternativo', () => {
    for (const mood of JUPI_MOODS) {
      expect(JUPI_ALT[mood]).toBeTruthy();
    }
  });
});
