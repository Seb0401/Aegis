import {
  addAmounts,
  medianAmount,
  subtractAmounts,
  type AccountInfo,
  type AssetCode,
  type Balance,
  type HistoryStats,
  type ResolvedAction,
  type SimulationResult,
  type StellarReader,
  type TransactionStatus,
  type TxSummary,
} from '@aegis/contracts';
import { NotFoundError, type Horizon } from '@stellar/stellar-sdk';
import { stroopsToAmount } from './amounts.js';
import { toInternalAssetCode } from './assets.js';
import { HorizonAccountClient, validateAddress } from './horizon-account-client.js';
import { mapHorizonError } from './errors.js';

/**
 * `StellarReader` completo sobre Horizon (BE1-07 y BE1-08).
 *
 * Compone el `HorizonAccountClient` de M1 en lugar de modificarlo, y le añade
 * lo que le faltaba para que el Guardian pueda trabajar con datos reales:
 * historial, estadísticas derivadas y simulación previa.
 *
 * Por qué importa: sin historial real, las señales G-01 (dirección nunca
 * vista), G-03 (monto atípico) y G-08 (velocidad inusual) se calcularían sobre
 * datos de mentira. En un producto cuyo argumento es "analizamos el riesgo
 * antes de mover tu dinero", eso no es un detalle.
 */

export interface HorizonStellarReaderOptions {
  horizonUrl: string;
  server?: Horizon.Server;
  /** Cuántos pagos se leen para calcular las estadísticas. */
  historyLimit?: number;
  /** Código del activo de crédito en la red. Por defecto `USDCTEST`. */
  usdcTestAssetCode?: string;
}

const DEFAULT_HISTORY_LIMIT = 100;

/** Horizon no admite páginas mayores que esta. */
const MAX_HORIZON_LIMIT = 200;

export class HorizonStellarReader implements StellarReader {
  private readonly accounts: HorizonAccountClient;
  private readonly server: Horizon.Server;
  private readonly historyLimit: number;
  private readonly usdcTestAssetCode: string | undefined;

  constructor(options: HorizonStellarReaderOptions) {
    this.accounts = new HorizonAccountClient({
      horizonUrl: options.horizonUrl,
      ...(options.server ? { server: options.server } : {}),
    });
    this.server = this.accounts.server;
    this.historyLimit = Math.min(options.historyLimit ?? DEFAULT_HISTORY_LIMIT, MAX_HORIZON_LIMIT);
  }

  getBalances(accountId: string): Promise<Balance[]> {
    return this.accounts.getBalances(accountId);
  }

  /**
   * Datos de la cuenta destino, con su antigüedad.
   *
   * La antigüedad no viene en el endpoint de cuentas: hay que mirar su primera
   * operación. Es una petición extra por destino, pero es lo que alimenta la
   * señal G-06 ("esta cuenta se creó hace dos días"), que es justo el patrón de
   * una estafa recién montada.
   */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    const base = await this.accounts.getAccountInfo(address);
    if (!base.exists) return base;

    const ageDays = await this.accountAgeDays(address);
    return ageDays === undefined ? base : { ...base, ageDays };
  }

  async getHistory(accountId: string, opts?: { limit?: number }): Promise<TxSummary[]> {
    validateAddress(accountId);
    const limit = Math.min(opts?.limit ?? this.historyLimit, MAX_HORIZON_LIMIT);

    try {
      const page = await this.server
        .payments()
        .forAccount(accountId)
        .order('desc')
        .limit(limit)
        .call();

      return page.records.flatMap((record) =>
        toTxSummary(record, accountId, this.usdcTestAssetCode),
      );
    } catch (error) {
      throw mapHorizonError(error, 'read');
    }
  }

  /**
   * Estadísticas derivadas del historial.
   *
   * Se calculan sobre los pagos salientes con éxito, que es lo que describe el
   * comportamiento del usuario. Los entrantes no dicen nada sobre lo que él
   * suele enviar, y los fallidos tampoco.
   */
  async getHistoryStats(accountId: string): Promise<HistoryStats> {
    const history = await this.getHistory(accountId, { limit: this.historyLimit });
    const outgoing = history.filter((tx) => tx.direction === 'OUT' && tx.successful);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    return {
      medianOutgoingAmount: medianAmount(outgoing.map((tx) => tx.amount)),
      // Cuenta también los entrantes: haber recibido de alguien ya es haber
      // interactuado con él, y G-01 pregunta justo eso.
      knownCounterparties: [...new Set(history.map((tx) => tx.counterparty))],
      outgoingLastHour: outgoing.filter((tx) => new Date(tx.createdAt).getTime() >= oneHourAgo)
        .length,
      usedAssets: [...new Set(outgoing.map((tx) => tx.asset))],
    };
  }

  /**
   * Estado de una transacción ya enviada (BE1-09).
   *
   * Que la red no la conozca no significa que haya fallado: puede que nunca
   * llegara, o que todavía esté propagándose. Por eso `found` y `successful`
   * son dos cosas distintas y quien llama decide qué hacer con cada una.
   */
  async getTransactionStatus(hash: string): Promise<TransactionStatus> {
    try {
      const record = await this.server.transactions().transaction(hash).call();
      return { found: true, successful: record.successful === true };
    } catch (error) {
      if (error instanceof NotFoundError) return { found: false, successful: false };
      throw mapHorizonError(error, 'read');
    }
  }

  /**
   * Simulación previa (BE1-08).
   *
   * Comprueba contra la red lo que haría fallar el envío **antes** de pedirle al
   * usuario que firme: que la cuenta destino exista y que pueda recibir el
   * activo. Descubrirlo después de firmar es la peor forma de enterarse.
   */
  async simulatePayments(accountId: string, actions: ResolvedAction[]): Promise<SimulationResult> {
    validateAddress(accountId);

    const errors: string[] = [];
    const [balances, fee] = await Promise.all([
      this.getBalances(accountId),
      this.estimateFee(actions.length),
    ]);

    const uniqueDestinations = [...new Set(actions.map((a) => a.destinationAddress))];
    const infos = new Map<string, AccountInfo>(
      await Promise.all(
        uniqueDestinations.map(
          async (address) => [address, await this.getAccountInfo(address)] as const,
        ),
      ),
    );

    for (const action of actions) {
      const info = infos.get(action.destinationAddress);
      if (!info) continue;

      if (!info.exists) {
        errors.push(`La cuenta de ${action.destinationLabel} no existe en la red.`);
      } else if (action.asset !== 'XLM' && !info.trustlines.includes(action.asset)) {
        errors.push(`${action.destinationLabel} no tiene trustline para ${action.asset}.`);
      }
    }

    // El activo principal es el que más importe mueve; es el que define el
    // saldo posterior que ve el usuario.
    const primary = primaryAsset(actions);
    const balance = balances.find((b) => b.asset === primary);
    const spent = actions
      .filter((a) => a.asset === primary)
      .reduce((acc, a) => addAmounts(acc, a.amount), '0');

    const afterSpend = balance ? subtractAmounts(balance.available, spent) : '0';
    // La comisión siempre se paga en XLM, así que solo se descuenta ahí.
    const balanceAfter = primary === 'XLM' ? subtractAmounts(afterSpend, fee) : afterSpend;

    return { fee, balanceAfter, errors };
  }

  /** Comisión estimada, usando la mediana reciente de la red. */
  private async estimateFee(operationCount: number): Promise<string> {
    const operations = BigInt(Math.max(1, operationCount));

    try {
      const stats = await this.server.feeStats();
      const perOperation = BigInt(stats.fee_charged.p50 || stats.last_ledger_base_fee || '100');
      return stroopsToAmount(perOperation * operations);
    } catch {
      // Si Horizon no responde a esto, la comisión base de Stellar (100
      // stroops) es una estimación razonable y no vale la pena fallar por ella.
      return stroopsToAmount(100n * operations);
    }
  }

  /** Días desde la primera operación de la cuenta. */
  private async accountAgeDays(address: string): Promise<number | undefined> {
    try {
      const page = await this.server.operations().forAccount(address).order('asc').limit(1).call();
      const first = page.records[0];
      if (!first?.created_at) return undefined;

      const millis = Date.now() - new Date(first.created_at).getTime();
      return Math.max(0, Math.floor(millis / (24 * 60 * 60 * 1000)));
    } catch {
      // La antigüedad es información adicional: si no se puede obtener, la
      // señal G-06 simplemente no se dispara. No es motivo para tumbar la
      // evaluación entera de la propuesta.
      return undefined;
    }
  }
}

/**
 * El endpoint de pagos devuelve varios tipos de operación, no solo `payment`:
 * también `create_account`, `account_merge` y los path payments. Se tipa la
 * unión completa y se estrecha dentro.
 */
type PaymentsRecord = Awaited<
  ReturnType<ReturnType<Horizon.Server['payments']>['call']>
>['records'][number];

/**
 * Traduce un pago de Horizon a nuestro resumen.
 *
 * Devuelve un array vacío en vez de `null` para poder usarlo con `flatMap`: los
 * pagos de activos que no soportamos se descartan en silencio, porque incluirlos
 * con un código de activo inventado ensuciaría las estadísticas.
 */
function toTxSummary(
  record: PaymentsRecord,
  accountId: string,
  usdcTestAssetCode?: string,
): TxSummary[] {
  if (record.type !== 'payment') return [];

  const asset = toAssetCode(record, usdcTestAssetCode);
  if (!asset) return [];

  const outgoing = record.from === accountId;
  const counterparty = outgoing ? record.to : record.from;
  if (!counterparty) return [];

  return [
    {
      hash: record.transaction_hash,
      createdAt: new Date(record.created_at).toISOString(),
      direction: outgoing ? 'OUT' : 'IN',
      counterparty,
      asset,
      amount: record.amount,
      // El memo vive en la transacción, no en la operación. Traerlo exigiría una
      // petición por pago; hoy no lo necesita ninguna señal.
      memo: null,
      successful: record.transaction_successful !== false,
    },
  ];
}

function toAssetCode(
  record: Horizon.ServerApi.PaymentOperationRecord,
  usdcTestAssetCode?: string,
): AssetCode | null {
  if (record.asset_type === 'native') return 'XLM';
  if (!record.asset_code) return null;

  return usdcTestAssetCode
    ? toInternalAssetCode(record.asset_code, usdcTestAssetCode)
    : toInternalAssetCode(record.asset_code);
}

function primaryAsset(actions: ResolvedAction[]): AssetCode | undefined {
  const totals = new Map<AssetCode, string>();

  for (const action of actions) {
    totals.set(action.asset, addAmounts(totals.get(action.asset) ?? '0', action.amount));
  }

  let best: AssetCode | undefined;
  let bestTotal = '0';

  for (const [asset, total] of totals) {
    if (best === undefined || Number(total) > Number(bestTotal)) {
      best = asset;
      bestTotal = total;
    }
  }

  return best;
}
