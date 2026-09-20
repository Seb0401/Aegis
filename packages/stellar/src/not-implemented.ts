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
 * Estas clases cumplen el tipo pero fallan en voz alta. Así el monorepo compila
 * desde el día uno y, si alguien conecta la implementación real antes de tiempo,
 * el error dice exactamente qué tarea del PLAN falta.
 */

class NotImplementedError extends Error {
  constructor(method: string, task: string) {
    super(
      `@aegis/stellar: ${method}() todavía no está implementado (tarea ${task} del PLAN.md). ` +
        `Usa los fakes de "@aegis/stellar/testing" o arranca la API con USE_FAKE_STELLAR=true.`,
    );
    this.name = 'NotImplementedError';
  }
}

export class NotImplementedStellarReader implements StellarReader {
  async getBalances(_accountId: string): Promise<Balance[]> {
    throw new NotImplementedError('getBalances', 'BE1-02');
  }

  async getHistory(_accountId: string, _opts?: { limit?: number }): Promise<TxSummary[]> {
    throw new NotImplementedError('getHistory', 'BE1-07');
  }

  async getAccountInfo(_address: string): Promise<AccountInfo> {
    throw new NotImplementedError('getAccountInfo', 'BE1-02');
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
    throw new NotImplementedError('buildUnsigned', 'BE1-03');
  }

  async signWithAgent(_xdr: string): Promise<{ xdr: string }> {
    throw new NotImplementedError('signWithAgent', 'BE1-03');
  }

  async submit(_xdr: string): Promise<{ hash: string }> {
    throw new NotImplementedError('submit', 'BE1-03');
  }

  async buildDelegationXdr(_accountId: string, _agentPublicKey: string): Promise<{ xdr: string }> {
    throw new NotImplementedError('buildDelegationXdr', 'BE1-05');
  }
}
