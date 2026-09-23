// @vitest-environment jsdom
import type { Explanation, RiskReport } from '@aegis/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuardianPanel } from './guardian-panel';

/**
 * El panel que explica por qué una operación es o no es arriesgada.
 *
 * Lo que se fija aquí es que **no se pierda ni se contradiga** ninguna
 * advertencia. Las dos cosas pasaron de verdad: la clave de React era el
 * `signalId`, así que dos advertencias de la misma señal colapsaban en una; y
 * una señal podía salir a la vez como advertencia y como «informativa».
 */

function report(overrides: Partial<RiskReport> = {}): RiskReport {
  return {
    score: 70,
    level: 'HIGH',
    signals: [],
    balanceAfter: '200',
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('GuardianPanel', () => {
  it('muestra todas las advertencias, aunque repitan señal', () => {
    // Dos destinos nuevos en la misma propuesta: dos G-01. Es lo normal, y
    // esconder una en la pantalla donde se autoriza dinero no es un detalle.
    const explanation: Explanation = {
      summary: 'Vas a enviar 50 a dos destinos nuevos.',
      warnings: [
        { signalId: 'G-01', text: 'Nunca has enviado nada a Viaje a Cusco.' },
        { signalId: 'G-01', text: 'Nunca has enviado nada a Regalo de Ana.' },
      ],
      generatedBy: 'template',
    };

    render(
      <GuardianPanel
        risk={report({
          signals: [
            { id: 'G-01', severity: 'HIGH', actionIndex: 0, data: {} },
            { id: 'G-01', severity: 'HIGH', actionIndex: 1, data: {} },
          ],
        })}
        explanation={explanation}
      />,
    );

    expect(screen.getByText(/viaje a cusco/i)).toBeInTheDocument();
    expect(screen.getByText(/regalo de ana/i)).toBeInTheDocument();
  });

  it('no repite como informativa una señal que ya salió como advertencia', () => {
    const explanation: Explanation = {
      summary: 'Resumen.',
      warnings: [{ signalId: 'G-01', text: 'Nunca has enviado nada a Viaje a Cusco.' }],
      generatedBy: 'template',
    };

    render(
      <GuardianPanel
        risk={report({
          signals: [
            { id: 'G-01', severity: 'HIGH', actionIndex: 0, data: {} },
            // La misma señal, informativa en otra acción.
            { id: 'G-01', severity: 'INFO', actionIndex: 1, data: {} },
            { id: 'G-02', severity: 'INFO', data: {} },
          ],
        })}
        explanation={explanation}
      />,
    );

    const info = screen.getByText(/se evaluaron sin encontrar nada/i);
    expect(info).toHaveTextContent(/porcentaje del saldo/i);
    expect(info).not.toHaveTextContent(/dirección nunca vista/i);
  });

  it('dice el nivel, la puntuación y el saldo que quedaría', () => {
    render(<GuardianPanel risk={report({ level: 'CRITICAL', score: 95 })} explanation={null} />);

    expect(screen.getByText(/riesgo crítico/i)).toBeInTheDocument();
    expect(screen.getByText(/95\/100/)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
  });

  it('sin advertencias lo dice, en vez de dejar un hueco', () => {
    render(
      <GuardianPanel
        risk={report({ level: 'LOW' })}
        explanation={{ summary: 'Todo en orden.', warnings: [], generatedBy: 'template' }}
      />,
    );

    expect(screen.getByText(/ninguna señal saltó por encima de informativa/i)).toBeInTheDocument();
  });
});
