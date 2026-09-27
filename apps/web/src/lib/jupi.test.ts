import type { Proposal, RiskLevel } from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import {
  JUPI_ALT,
  JUPI_MOODS,
  moodForAgent,
  moodForProposal,
  moodForRisk,
  jupiIdleLine,
} from './jupi';

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

describe('jupiIdleLine', () => {
  const base = { hora: 10, diasSinApartar: 1, metasCumplidas: 0, repartoActivo: false };

  it('celebra una meta cumplida por encima de todo lo demás', () => {
    const linea = jupiIdleLine({ ...base, hora: 23, metasCumplidas: 1 });

    expect(linea).toContain('meta');
    expect(linea).not.toContain('Buenas noches');
  });

  it('avisa de que llevas semanas sin apartar, sin regañar', () => {
    // «Deberías ahorrar más» es un sermón, y de algo que administra tu dinero
    // eso se tolera una vez. Un dato y una oferta, no un juicio.
    const linea = jupiIdleLine({ ...base, diasSinApartar: 21 });

    expect(linea).toContain('3 semanas');
    expect(linea.toLowerCase()).not.toContain('deberías');
  });

  it('con el reparto activo, la culpa no es tuya', () => {
    // Si el reparto está encendido y no se ha movido nada es porque no ha
    // entrado dinero. Decirle a alguien que «lleva tres semanas sin apartar»
    // cuando lo tiene automatizado sería culparle de algo que no hizo.
    const linea = jupiIdleLine({ ...base, diasSinApartar: 21, repartoActivo: true });

    expect(linea).toContain('no ha entrado dinero');
  });

  it('saluda según la hora cuando no hay nada que contar', () => {
    expect(jupiIdleLine({ ...base, hora: 9 })).toContain('Buenos días');
    expect(jupiIdleLine({ ...base, hora: 16 })).toContain('Buenas tardes');
    expect(jupiIdleLine({ ...base, hora: 22 })).toContain('Buenas noches');
  });

  it('sin historial, invita a empezar', () => {
    expect(jupiIdleLine({ ...base, diasSinApartar: null })).toContain('Pídeme');
  });
});
