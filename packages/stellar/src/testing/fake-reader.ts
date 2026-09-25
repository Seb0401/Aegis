import {
  FIXTURE_BALANCES,
  FIXTURE_DESTINATIONS,
  FIXTURE_HISTORY,
  addAmounts,
  medianAmount,
  subtractAmounts,
  type AccountInfo,
  type Balance,
  type HistoryStats,
  type ResolvedAction,
  type SimulationResult,
  type StellarReader,
  type TransactionStatus,
  type TxSummary,
} from '@aegis/contracts';

export interface FakeStellarReaderOptions {
  balances?: Balance[];
  history?: TxSummary[];
  /** Información por dirección. Lo no listado se considera una cuenta sana y antigua. */
  accounts?: Record<string, AccountInfo>;
  /** Direcciones que deben responder `exists: false`. */
  nonExistentAddresses?: string[];
  /** Comisión fija que devuelve la simulación. */
  fee?: string;
  /** Estado que devuelve `getTransactionStatus`, por hash. */
  transactionStatuses?: Record<string, TransactionStatus>;
}

/**
 * Implementación en memoria de `StellarReader`.
 *
 * Existe para desbloquear a BE2 y a AI mientras BE1 construye el cliente real
 * (§6.2 del PLAN). Es determinista y no hace ninguna petición de red, así que
 * también sirve para los tests de la API.
 *
 * No intenta imitar a Stellar con fidelidad: imita el *contrato*. Cuando llegue
 * la implementación real, ambas deben pasar los mismos tests de contrato.
 */
export class FakeStellarReader implements StellarReader {
  private readonly balances: Balance[];
  private readonly history: TxSummary[];
  private readonly accounts: Record<string, AccountInfo>;
  private readonly nonExistent: Set<string>;
  private readonly fee: string;
  private readonly transactionStatuses: Record<string, TransactionStatus>;

  constructor(options: FakeStellarReaderOptions = {}) {
    this.balances = options.balances ?? FIXTURE_BALANCES;
    this.history = options.history ?? FIXTURE_HISTORY;
    this.accounts = options.accounts ?? defaultAccounts();
    this.nonExistent = new Set(options.nonExistentAddresses ?? []);
    this.fee = options.fee ?? '0.0000100';
    this.transactionStatuses = options.transactionStatuses ?? {};
  }

  async getBalances(_accountId: string): Promise<Balance[]> {
    return this.balances.map((b) => ({ ...b }));
  }

  async getHistory(_accountId: string, opts?: { limit?: number }): Promise<TxSummary[]> {
    const sorted = [...this.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts?.limit ? sorted.slice(0, opts.limit) : sorted;
  }

  async getAccountInfo(address: string): Promise<AccountInfo> {
    if (this.nonExistent.has(address)) {
      return { exists: false, trustlines: [] };
    }

    return (
      this.accounts[address] ?? {
        exists: true,
        ageDays: 365,
        trustlines: ['XLM', 'USDC_TEST'],
      }
    );
  }

  async getHistoryStats(_accountId: string): Promise<HistoryStats> {
    const outgoing = this.history.filter((tx) => tx.direction === 'OUT' && tx.successful);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    return {
      medianOutgoingAmount: medianAmount(outgoing.map((tx) => tx.amount)),
      knownCounterparties: [...new Set(this.history.map((tx) => tx.counterparty))],
      outgoingLastHour: outgoing.filter((tx) => new Date(tx.createdAt).getTime() >= oneHourAgo)
        .length,
      usedAssets: [...new Set(outgoing.map((tx) => tx.asset))],
    };
  }

  /** Por defecto toda transacción existe y tuvo éxito, que es el camino feliz. */
  async getTransactionStatus(hash: string): Promise<TransactionStatus> {
    return this.transactionStatuses[hash] ?? { found: true, successful: true };
  }

  async simulatePayments(_accountId: string, actions: ResolvedAction[]): Promise<SimulationResult> {
    const errors: string[] = [];

    // Solo se simula el activo principal, que es lo que consume el Guardian.
    const primaryAsset = actions[0]?.asset ?? 'XLM';
    const total = actions
      .filter((a) => a.asset === primaryAsset)
      .reduce((acc, a) => addAmounts(acc, a.amount), '0');

    for (const action of actions) {
      const info = await this.getAccountInfo(action.destinationAddress);
      if (!info.exists) {
        errors.push(`La cuenta ${action.destinationLabel} no existe en la red.`);
      } else if (action.asset !== 'XLM' && !info.trustlines.includes(action.asset)) {
        errors.push(`${action.destinationLabel} no tiene trustline para ${action.asset}.`);
      }
    }

    const balance = this.balances.find((b) => b.asset === primaryAsset);
    const balanceAfter = balance ? subtractAmounts(balance.available, total) : '0';

    return { fee: this.fee, balanceAfter, errors };
  }
}

/** Los objetivos del fixture son cuentas antiguas y sanas; el contacto es reciente. */
function defaultAccounts(): Record<string, AccountInfo> {
  const entries = FIXTURE_DESTINATIONS.map((destination): [string, AccountInfo] => [
    destination.address,
    {
      exists: true,
      ageDays: destination.kind === 'CONTACT' ? 3 : 365,
      trustlines: ['XLM', 'USDC_TEST'],
    },
  ]);

  return Object.fromEntries(entries);
}
