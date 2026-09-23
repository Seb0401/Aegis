// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El kill switch (FE-12).
 *
 * Es el botón que para al agente, así que lo que se comprueba es que diga la
 * verdad: su nombre accesible tiene que decir **qué hace y qué implica**, y el
 * estado que envía a la API tiene que ser el contrario del actual, no un valor
 * fijo.
 */

const setPausedMutate = vi.fn();
let paused = false;
let loading = false;

vi.mock('@/lib/api/hooks', () => ({
  usePolicy: () => ({ data: { config: { paused } }, isLoading: loading }),
  useSetPaused: () => ({ mutate: setPausedMutate, isPending: false }),
}));

const { KillSwitch } = await import('./kill-switch');

beforeEach(() => {
  vi.clearAllMocks();
  paused = false;
  loading = false;
});

describe('KillSwitch', () => {
  it('con el agente activo, ofrece pausarlo y dice la consecuencia', () => {
    render(<KillSwitch />);

    const button = screen.getByRole('button', {
      name: /pausar agente\. la política pasará a denegar cualquier operación/i,
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('pausa al agente, no manda un valor fijo', async () => {
    const user = userEvent.setup();
    render(<KillSwitch />);

    await user.click(screen.getByRole('button'));
    expect(setPausedMutate).toHaveBeenCalledWith(true);
  });

  it('con el agente pausado, ofrece reactivarlo', async () => {
    paused = true;
    const user = userEvent.setup();
    render(<KillSwitch />);

    const button = screen.getByRole('button', { name: /reactivar agente/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await user.click(button);
    expect(setPausedMutate).toHaveBeenCalledWith(false);
  });

  it('mientras carga la política no enseña un estado que no conoce', () => {
    loading = true;
    render(<KillSwitch />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
