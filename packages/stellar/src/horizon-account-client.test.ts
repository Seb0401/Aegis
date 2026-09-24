import { Horizon, Keypair, NotFoundError } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { HorizonAccountClient } from './horizon-account-client.js';

function serverWithAccount(account: object): Horizon.Server {
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  vi.spyOn(server, 'loadAccount').mockResolvedValue(account as never);
  vi.spyOn(server, 'ledgers').mockReturnValue({
    order: () => ({
      limit: () => ({
        call: async () => ({ records: [{ base_reserve_in_stroops: 5_000_000 }] }),
      }),
    }),
  } as unknown as ReturnType<Horizon.Server['ledgers']>);
  return server;
}

describe('HorizonAccountClient', () => {
  it('calcula el saldo XLM disponible con reserva, sponsorship y liabilities', async () => {
    const address = Keypair.random().publicKey();
    const account = {
      subentry_count: 2,
      num_sponsoring: 1,
      num_sponsored: 0,
      balances: [
        {
          asset_type: 'native',
          balance: '10.0000000',
          buying_liabilities: '0.0000000',
          selling_liabilities: '0.2500000',
        },
      ],
    };
    const client = new HorizonAccountClient({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      server: serverWithAccount(account),
    });

    await expect(client.getBalances(address)).resolves.toEqual([
      { asset: 'XLM', total: '10.0000000', available: '7.2500000' },
    ]);
  });

  it('devuelve cuenta inexistente ante 404', async () => {
    const address = Keypair.random().publicKey();
    const server = new Horizon.Server('https://horizon-testnet.stellar.org');
    vi.spyOn(server, 'loadAccount').mockRejectedValue(
      new NotFoundError('missing', { status: 404 }),
    );
    const client = new HorizonAccountClient({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      server,
    });

    await expect(client.getAccountInfo(address)).resolves.toEqual({
      exists: false,
      trustlines: [],
    });
  });

  it('incluye XLM y las trustlines de crédito', async () => {
    const address = Keypair.random().publicKey();
    const account = {
      balances: [
        { asset_type: 'native', balance: '2', selling_liabilities: '0' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC_TEST', asset_issuer: address },
      ],
    };
    const client = new HorizonAccountClient({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      server: serverWithAccount(account),
    });

    await expect(client.getAccountInfo(address)).resolves.toEqual({
      exists: true,
      trustlines: ['XLM', 'USDC_TEST'],
    });
  });
});
