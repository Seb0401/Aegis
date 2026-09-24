import type {
  AccountInfo,
  Balance,
  HistoryStats,
  ResolvedAction,
  SimulationResult,
  StellarExecutor,
  StellarReader,
  TxSummary,
} from '@aegis/contracts';

/**
 * Andamiaje para BE1.
 *
 * Estas clases mantienen el modo desacoplado de la API. M1 ya dispone de
 * `HorizonAccountClient` y `HorizonStellarExecutor`, pero el cableado completo
 * del `StellarReader` real pertenece a M2/M3.
 */

class NotImplementedError extends Error {
  constructor(method: string, task: string) {
    super(
      `@aegis/stellar: ${method}() todavía no está disponible en este adaptador (${task}). ` +
        `Usa los fakes de "@aegis/stellar/testing" o arranca la API con USE_FAKE_STELLAR=true.`,
    );
    this.name = 'NotImplementedError';
  }
}

export class NotImplementedStellarReader implements StellarReader {
  async getBalances(_accountId: string): Promise<Balance[]> {
    throw new NotImplementedError('getBalances', 'integración M2');
  }

  async getHistory(_accountId: string, _opts?: { limit?: number }): Promise<TxSummary[]> {
    throw new NotImplementedError('getHistory', 'BE1-07');
  }

  async getAccountInfo(_address: string): Promise<AccountInfo> {
    throw new NotImplementedError('getAccountInfo', 'integración M2');
  }

  async getHistoryStats(_accountId: string): Promise<HistoryStats> {
    throw new NotImplementedError('getHistoryStats', 'BE1-07');
  }

  async simulatePayments(
    _accountId: string,
    _actions: ResolvedAction[],
  ): Promise<SimulationResult> {
    throw new NotImplementedError('simulatePayments', 'BE1-08');
  }
}

export class NotImplementedStellarExecutor implements StellarExecutor {
  async buildUnsigned(_accountId: string, _actions: ResolvedAction[]): Promise<{ xdr: string }> {
    throw new NotImplementedError('buildUnsigned', 'cableado API M2');
  }

  async signWithAgent(_xdr: string): Promise<{ xdr: string }> {
    throw new NotImplementedError('signWithAgent', 'cableado API M2');
  }

  async submit(_xdr: string): Promise<{ hash: string }> {
    throw new NotImplementedError('submit', 'cableado API M2');
  }

  async buildDelegationXdr(_accountId: string, _agentPublicKey: string): Promise<{ xdr: string }> {
    throw new NotImplementedError('buildDelegationXdr', 'integración BE1-05/M2');
  }
}
