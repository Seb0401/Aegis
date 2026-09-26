/**
 * @vitest-environment jsdom
 */
import type { Proposal, ProposalStatus } from '@aegis/contracts';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useJustConfirmed } from './just-confirmed';

/**
 * La regla que sostiene esta celebración: distingue **«acaba de pasar»** de
 * **«ya estaba pasado»**. Si se rompe, cada recarga de la página festeja un
 * pago de la semana anterior y la interrupción deja de significar nada.
 */

function propuesta(id: string, status: ProposalStatus): Proposal {
  return {
    id,
    userId: 'user_1',
    status,
    summary: 'Reparto',
    actions: [],
    policy: null,
    risk: null,
    explanation: null,
    prices: null,
    unsignedXdr: null,
    txHash: status === 'CONFIRMED' ? 'a'.repeat(64) : null,
    failureReason: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Proposal;
}

describe('useJustConfirmed', () => {
  it('no celebra lo que ya estaba confirmado al abrir', () => {
    const { result } = renderHook(() => useJustConfirmed([propuesta('p1', 'CONFIRMED')]));

    expect(result.current.confirmed).toBeNull();
  });

  it('celebra cuando una propuesta pasa a confirmada con la página abierta', () => {
    const { result, rerender } = renderHook(({ lista }) => useJustConfirmed(lista), {
      initialProps: { lista: [propuesta('p1', 'SUBMITTED')] },
    });

    expect(result.current.confirmed).toBeNull();

    rerender({ lista: [propuesta('p1', 'CONFIRMED')] });

    expect(result.current.confirmed?.id).toBe('p1');
  });

  it('celebra la que nace ya confirmada: es el camino autónomo', () => {
    // En modo autónomo la API firma y envía en la misma petición, así que la
    // propuesta nunca se ve en otro estado. Si solo se miraran los cambios de
    // estado, el pago que el agente hace solo —el más vistoso— sería justo el
    // único que no se celebraría.
    const { result, rerender } = renderHook(({ lista }) => useJustConfirmed(lista), {
      initialProps: { lista: [propuesta('p1', 'PENDING_USER')] },
    });

    rerender({ lista: [propuesta('p1', 'PENDING_USER'), propuesta('p2', 'CONFIRMED')] });

    expect(result.current.confirmed?.id).toBe('p2');
  });

  it('pero no si se confirmó hace rato', () => {
    // La que aparece confirmada y vieja pudo confirmarse en cualquier momento:
    // no hay acontecimiento que celebrar.
    const antigua = {
      ...propuesta('p2', 'CONFIRMED'),
      updatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    };

    const { result, rerender } = renderHook(({ lista }) => useJustConfirmed(lista), {
      initialProps: { lista: [propuesta('p1', 'PENDING_USER')] },
    });

    rerender({ lista: [propuesta('p1', 'PENDING_USER'), antigua] });

    expect(result.current.confirmed).toBeNull();
  });

  it('no repite la celebración en cada vuelta del sondeo', () => {
    const { result, rerender } = renderHook(({ lista }) => useJustConfirmed(lista), {
      initialProps: { lista: [propuesta('p1', 'SUBMITTED')] },
    });

    rerender({ lista: [propuesta('p1', 'CONFIRMED')] });
    result.current.dismiss();
    // El sondeo sigue trayendo la misma propuesta confirmada una y otra vez.
    rerender({ lista: [propuesta('p1', 'CONFIRMED')] });

    expect(result.current.confirmed).toBeNull();
  });

  it('se puede cerrar', () => {
    const { result, rerender } = renderHook(({ lista }) => useJustConfirmed(lista), {
      initialProps: { lista: [propuesta('p1', 'SIGNED')] },
    });

    rerender({ lista: [propuesta('p1', 'CONFIRMED')] });
    expect(result.current.confirmed).not.toBeNull();

    result.current.dismiss();
    rerender({ lista: [propuesta('p1', 'CONFIRMED')] });

    expect(result.current.confirmed).toBeNull();
  });
});
