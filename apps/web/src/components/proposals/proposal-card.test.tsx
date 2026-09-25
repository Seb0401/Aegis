// @vitest-environment jsdom
import type { Proposal, RiskLevel } from '@aegis/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletError } from '@/lib/auth/wallet';

/**
 * La pantalla donde se autoriza dinero.
 *
 * Aquí no se prueba el dibujo: se prueba que **no se pueda firmar por error**.
 * Los tres casos que importan son que el monto haya que reescribirlo cuando el
 * riesgo es alto, que lo que se manda a la API sea exactamente lo firmado, y
 * que un fallo de la wallet devuelva el control en vez de dejar la tarjeta
 * bloqueada — que es el fallo real que se encontró probando en el navegador.
 */

const ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

const signXdr = vi.fn();
const approveMutate = vi.fn();
const rejectMutate = vi.fn();

vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({
    session: { token: 't', user: { id: 'user_1', address: ADDRESS } },
    wallet: {
      name: 'Freighter',
      installUrl: 'https://www.freighter.app/',
      installLabel: 'Instalar Freighter',
      signXdr,
    },
  }),
}));

vi.mock('@/lib/api/hooks', () => ({
  useDestinations: () => ({
    data: {
      destinations: [
        {
          id: 'dest_1',
          userId: 'user_1',
          kind: 'GOAL',
          label: 'Viaje',
          address: ADDRESS,
          targetAmount: null,
          targetAsset: null,
          trusted: false,
          blocked: false,
          createdAt: new Date().toISOString(),
        },
      ],
    },
  }),
  useApproveProposal: () => ({ mutate: approveMutate, isPending: false, error: null }),
  useRejectProposal: () => ({ mutate: rejectMutate, isPending: false, error: null }),
}));

const { ProposalCard } = await import('./proposal-card');

function proposal(level: RiskLevel | null = 'CRITICAL'): Proposal {
  return {
    id: 'prop_1',
    userId: 'user_1',
    status: 'PENDING_USER',
    summary: 'Reparto entre objetivos',
    actions: [
      { type: 'PAYMENT', destinationId: 'dest_1', asset: 'XLM', amount: '30', label: 'Viaje' },
      { type: 'PAYMENT', destinationId: 'dest_1', asset: 'XLM', amount: '20', label: 'Viaje' },
    ],
    unsignedXdr: 'XDR-SIN-FIRMAR',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...(level
      ? {
          risk: {
            score: 90,
            level,
            signals: [],
            balanceAfter: '10',
            evaluatedAt: new Date().toISOString(),
          },
        }
      : {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  signXdr.mockResolvedValue('XDR-FIRMADO');
});

describe('ProposalCard con riesgo crítico', () => {
  it('no deja aprobar hasta que el total escrito coincide', async () => {
    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal()} />);

    const approve = screen.getByRole('button', { name: /aprobar y firmar/i });
    expect(approve).toBeDisabled();

    const input = screen.getByRole('textbox');
    await user.type(input, '49');
    expect(approve).toBeDisabled();

    await user.clear(input);
    await user.type(input, '50');
    expect(approve).toBeEnabled();
  });

  it('manda a la API el XDR que firmó la wallet y el total confirmado', async () => {
    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal()} />);

    await user.type(screen.getByRole('textbox'), '50');
    await user.click(screen.getByRole('button', { name: /aprobar y firmar/i }));

    expect(signXdr).toHaveBeenCalledWith('XDR-SIN-FIRMAR', ADDRESS);
    expect(approveMutate).toHaveBeenCalledWith({
      id: 'prop_1',
      body: { signedXdr: 'XDR-FIRMADO', confirmedTotal: '50' },
    });
  });

  it('suma las operaciones sin perder decimales al pedir el total', () => {
    render(<ProposalCard proposal={proposal()} />);
    expect(screen.getByText(/escribe el total para confirmar: 50/i)).toBeInTheDocument();
  });
});

describe('ProposalCard con riesgo bajo', () => {
  it('no pide reescribir el monto y aprueba sin confirmedTotal', async () => {
    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal('LOW')} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /aprobar y firmar/i }));

    expect(approveMutate).toHaveBeenCalledWith({
      id: 'prop_1',
      body: { signedXdr: 'XDR-FIRMADO' },
    });
  });
});

describe('cuando la wallet falla', () => {
  it('devuelve el control con un error accionable, sin quedarse colgada', async () => {
    // El fallo real: sin Freighter, la promesa no resolvía nunca y la tarjeta
    // se quedaba en «Firma en la wallet…» con todo bloqueado.
    signXdr.mockRejectedValue(
      new WalletError('NOT_INSTALLED', 'No se encontró Freighter en este navegador.'),
    );

    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal('LOW')} />);

    await user.click(screen.getByRole('button', { name: /aprobar y firmar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se encontró freighter/i);
    expect(screen.getByRole('link', { name: /instalar freighter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aprobar y firmar/i })).toBeEnabled();
    expect(approveMutate).not.toHaveBeenCalled();
  });

  it('no llama a la API si la propuesta no trae XDR que firmar', async () => {
    const user = userEvent.setup();
    const sinXdr = { ...proposal('LOW'), unsignedXdr: null };
    render(<ProposalCard proposal={sinXdr} />);

    await user.click(screen.getByRole('button', { name: /aprobar y firmar/i }));

    expect(signXdr).not.toHaveBeenCalled();
    expect(approveMutate).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no ha generado/i);
  });
});

describe('rechazo', () => {
  it('envía el motivo escrito', async () => {
    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal('LOW')} />);

    await user.click(screen.getByRole('button', { name: /^rechazar$/i }));
    await user.type(screen.getByRole('textbox'), 'Son demasiados pagos');
    await user.click(screen.getByRole('button', { name: /confirmar rechazo/i }));

    expect(rejectMutate).toHaveBeenCalledWith({ id: 'prop_1', reason: 'Son demasiados pagos' });
  });
});
