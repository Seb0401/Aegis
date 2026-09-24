import type { AccountInfo, Balance } from '@aegis/contracts';
import { Horizon, NotFoundError, StrKey } from '@stellar/stellar-sdk';
import { amountToStroops, stroopsToAmount } from './amounts.js';
import { mapHorizonError, StellarClientError } from './errors.js';

export interface HorizonAccountClientOptions {
  horizonUrl: string;
  server?: Horizon.Server;
}

type SponsorshipFields = {
  num_sponsoring?: number;
  num_sponsored?: number;
};

type NativeBalanceLine = {
  asset_type: 'native';
  balance: string;
  selling_liabilities: string;
};

type CreditBalanceLine = {
  asset_code: string;
};

/** Lecturas de cuenta necesarias para M1. Historial y simulación llegan en M2/M3. */
export class HorizonAccountClient {
  readonly server: Horizon.Server;

  constructor(options: HorizonAccountClientOptions) {
    validateHorizonUrl(options.horizonUrl);
    this.server = options.server ?? new Horizon.Server(options.horizonUrl);
  }

  async getBalances(accountId: string): Promise<Balance[]> {
    validateAddress(accountId);

    try {
      const [account, ledgers] = await Promise.all([
        this.server.loadAccount(accountId),
        this.server.ledgers().order('desc').limit(1).call(),
      ]);
      const native = account.balances.find(
        (balance): balance is typeof balance & NativeBalanceLine => balance.asset_type === 'native',
      );
      const ledger = ledgers.records[0];

      if (!native || !ledger) {
        throw new StellarClientError(
          'NETWORK_UNAVAILABLE',
          'Horizon no devolvió el saldo nativo o el ledger actual.',
          true,
        );
      }

      const sponsorship = account as typeof account & SponsorshipFields;
      const reserveEntries =
        2n +
        BigInt(account.subentry_count) +
        BigInt(sponsorship.num_sponsoring ?? 0) -
        BigInt(sponsorship.num_sponsored ?? 0);
      const minimumReserve = reserveEntries * BigInt(ledger.base_reserve_in_stroops);
      const total = amountToStroops(native.balance);
      const liabilities = amountToStroops(native.selling_liabilities);

      return [
        {
          asset: 'XLM',
          total: stroopsToAmount(total),
          available: stroopsToAmount(total - liabilities - minimumReserve),
        },
      ];
    } catch (error) {
      throw mapHorizonError(error, 'read');
    }
  }

  async getAccountInfo(address: string): Promise<AccountInfo> {
    validateAddress(address);

    try {
      const account = await this.server.loadAccount(address);
      const trustlines = account.balances
        .filter((balance): balance is typeof balance & CreditBalanceLine => 'asset_code' in balance)
        .map((balance) => balance.asset_code);

      return { exists: true, trustlines: ['XLM', ...new Set(trustlines)] };
    } catch (error) {
      if (error instanceof NotFoundError) return { exists: false, trustlines: [] };
      throw mapHorizonError(error, 'read');
    }
  }
}

export function validateAddress(address: string): void {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new StellarClientError('INVALID_TRANSACTION', 'La dirección Stellar no es válida.');
  }
}

export function validateHorizonUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new StellarClientError(
      'NETWORK_UNAVAILABLE',
      'STELLAR_HORIZON_URL no es una URL válida.',
    );
  }

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new StellarClientError(
      'NETWORK_UNAVAILABLE',
      'Horizon debe usar HTTPS salvo en desarrollo local.',
    );
  }
}
