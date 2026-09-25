import type { AssetCode, ResolvedAction, StellarExecutor } from '@aegis/contracts';
import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  type FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import { amountToStroops } from './amounts.js';
import { ON_CHAIN_ASSET_CODE } from './assets.js';
import { mapHorizonError, StellarClientError } from './errors.js';
import { validateAddress, validateHorizonUrl } from './horizon-account-client.js';

export interface HorizonStellarExecutorOptions {
  horizonUrl: string;
  agentSignerSecret: string;
  allowedSourceAccount: string;
  transactionTimeoutSeconds?: number;
  /**
   * Emisor del activo de prueba `USDC_TEST` (BE1-11).
   *
   * Sin él, el ejecutor rechaza cualquier pago que no sea XLM. Es a propósito:
   * firmar un activo con un emisor desconocido sería firmar un token que puede
   * haber creado cualquiera.
   */
  usdcTestIssuer?: string;
  /**
   * Código del activo en la red. Por defecto `USDCTEST`, el nuestro; ponlo a
   * `USDC` para usar el USDC canónico de testnet.
   */
  usdcTestAssetCode?: string;
  server?: Horizon.Server;
}

/**
 * Máximo de pagos por transacción.
 *
 * Coincide con el tope de `ProposalInputSchema`. Stellar admite hasta 100
 * operaciones, pero una propuesta que el usuario no puede leer de un vistazo no
 * es una propuesta que pueda aprobar con criterio.
 */
const MAX_PAYMENTS_PER_TRANSACTION = 10;

/**
 * Ejecutor de transacciones en testnet.
 *
 * Construye, firma y envía pagos en lote: el caso central del producto
 * ("reparte 50 entre tus objetivos") son varios pagos que deben ejecutarse
 * juntos o no ejecutarse. Stellar lo resuelve con varias operaciones en una
 * sola transacción, que es atómica: o entran todas o no entra ninguna.
 */
export class HorizonStellarExecutor implements StellarExecutor {
  readonly server: Horizon.Server;
  readonly agentPublicKey: string;
  private readonly signer: Keypair;
  private readonly allowedSourceAccount: string;
  private readonly timeoutSeconds: number;
  private readonly usdcTestIssuer: string | undefined;
  private readonly usdcTestAssetCode: string;

  constructor(options: HorizonStellarExecutorOptions) {
    validateHorizonUrl(options.horizonUrl);
    validateAddress(options.allowedSourceAccount);

    if (!StrKey.isValidEd25519SecretSeed(options.agentSignerSecret)) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'STELLAR_AGENT_SIGNER_SECRET no es una seed Stellar válida.',
      );
    }

    this.timeoutSeconds = options.transactionTimeoutSeconds ?? 180;
    if (!Number.isInteger(this.timeoutSeconds) || this.timeoutSeconds < 30) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'El timeout de transacción debe ser un entero de al menos 30 segundos.',
      );
    }

    this.server = options.server ?? new Horizon.Server(options.horizonUrl);
    this.signer = Keypair.fromSecret(options.agentSignerSecret);
    this.agentPublicKey = this.signer.publicKey();
    this.allowedSourceAccount = options.allowedSourceAccount;

    if (options.usdcTestIssuer) validateAddress(options.usdcTestIssuer);
    this.usdcTestIssuer = options.usdcTestIssuer;
    this.usdcTestAssetCode = options.usdcTestAssetCode ?? ON_CHAIN_ASSET_CODE.USDC_TEST;
  }

  /**
   * Traduce nuestro código de activo al de Stellar.
   *
   * Un activo de crédito son dos cosas: el código y **quién lo emite**.
   * Quedarse solo con el código permitiría pagar con un `USDC_TEST` emitido por
   * cualquiera, que no vale nada.
   */
  /**
   * Rechaza cualquier activo que no sea XLM o nuestro `USDC_TEST`.
   *
   * Comprobar solo el código dejaría pasar un `USDC_TEST` emitido por otra
   * cuenta: mismo nombre, valor ninguno. El emisor es la mitad del activo.
   */
  private assertAllowedAsset(asset: Asset): void {
    if (asset.isNative()) return;

    if (!this.usdcTestIssuer) {
      throw new StellarClientError(
        'UNSUPPORTED_ASSET',
        'Falta USDC_TEST_ISSUER: sin emisor configurado solo se pueden enviar XLM.',
      );
    }

    if (asset.getCode() !== this.usdcTestAssetCode || asset.getIssuer() !== this.usdcTestIssuer) {
      throw new StellarClientError(
        'UNSUPPORTED_ASSET',
        'El activo no es XLM ni el USDC_TEST del emisor configurado.',
      );
    }
  }

  private assetFor(code: AssetCode): Asset {
    if (code === 'XLM') return Asset.native();

    if (!this.usdcTestIssuer) {
      throw new StellarClientError(
        'UNSUPPORTED_ASSET',
        'Falta USDC_TEST_ISSUER: sin emisor configurado solo se pueden enviar XLM.',
      );
    }

    return new Asset(this.usdcTestAssetCode, this.usdcTestIssuer);
  }

  /** Clave pública derivada de la seed custodiada. Nunca llega del cliente. */
  getAgentPublicKey(): string {
    return this.agentPublicKey;
  }

  async buildUnsigned(accountId: string, actions: ResolvedAction[]): Promise<{ xdr: string }> {
    this.assertAllowedSource(accountId);
    validatePaymentActions(actions);

    try {
      // La cuenta se carga JUSTO antes de construir: el número de secuencia
      // sube con cada transacción, y reutilizar uno viejo da `tx_bad_seq`.
      const [account, baseFee] = await Promise.all([
        this.server.loadAccount(accountId),
        this.server.fetchBaseFee(),
      ]);

      // `fee` es la comisión POR OPERACIÓN: el SDK la multiplica por el número
      // de operaciones al construir. Multiplicarla aquí la cobraría dos veces.
      const builder = new TransactionBuilder(account, {
        fee: String(baseFee),
        networkPassphrase: Networks.TESTNET,
      });

      for (const action of actions) {
        builder.addOperation(
          Operation.payment({
            destination: action.destinationAddress,
            asset: this.assetFor(action.asset),
            amount: action.amount,
          }),
        );
      }

      const memo = singleMemoFor(actions);
      if (memo) builder.addMemo(Memo.text(memo));

      const transaction = builder.setTimeout(this.timeoutSeconds).build();
      return { xdr: transaction.toXDR() };
    } catch (error) {
      // Un activo sin emisor no es un fallo de Horizon: se deja pasar tal cual
      // para que el mensaje siga siendo el útil.
      if (error instanceof StellarClientError) throw error;
      throw mapHorizonError(error, 'build');
    }
  }

  async signWithAgent(xdr: string): Promise<{ xdr: string }> {
    const transaction = parseTransaction(xdr);
    this.assertAllowedSource(transaction.source);

    if (transaction.signatures.length > 0) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'El agente solo firma XDR sin firmas previas durante M1.',
      );
    }

    const maxTime = Number(transaction.timeBounds?.maxTime ?? 0);
    const now = Math.floor(Date.now() / 1000);
    if (maxTime <= now || maxTime > now + this.timeoutSeconds + 5) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'La transacción debe tener un timebound M1 vigente.',
      );
    }

    if (
      transaction.operations.length === 0 ||
      transaction.operations.length > MAX_PAYMENTS_PER_TRANSACTION
    ) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        `Una transacción debe llevar entre 1 y ${MAX_PAYMENTS_PER_TRANSACTION} pagos.`,
      );
    }

    // Se comprueba CADA operación, no solo la primera. El agente firma la
    // transacción entera: basta con que una operación sea otra cosa para que
    // esté autorizando algo que nadie revisó.
    for (const operation of transaction.operations) {
      if (operation.type !== 'payment') {
        throw new StellarClientError(
          'INVALID_TRANSACTION',
          'El agente solo firma transacciones compuestas de pagos.',
        );
      }

      if (operation.source && operation.source !== this.allowedSourceAccount) {
        throw new StellarClientError(
          'INVALID_TRANSACTION',
          'Cada operación debe usar la cuenta permitida como origen.',
        );
      }

      this.assertAllowedAsset(operation.asset);

      validateAddress(operation.destination);
      if (amountToStroops(operation.amount) <= 0n) {
        throw new StellarClientError('INVALID_TRANSACTION', 'El monto debe ser mayor que cero.');
      }
    }

    transaction.sign(this.signer);
    return { xdr: transaction.toXDR() };
  }

  /**
   * Hash de la transacción sin enviarla.
   *
   * El hash es función del contenido firmado y de la red, así que Stellar lo
   * deja calcular en local. Es lo que permite preguntar por una transacción
   * cuyo envío se quedó sin respuesta.
   */
  hashOf(signedXdr: string): string {
    return parseTransaction(signedXdr).hash().toString('hex');
  }

  async submit(xdr: string): Promise<{ hash: string }> {
    const transaction = parseTransaction(xdr);
    this.assertAllowedSource(transaction.source);

    try {
      const result = await this.server.submitTransaction(transaction);
      return { hash: result.hash };
    } catch (error) {
      throw mapHorizonError(error, 'submit');
    }
  }

  async buildDelegationXdr(accountId: string, agentPublicKey: string): Promise<{ xdr: string }> {
    this.assertAllowedSource(accountId);
    validateAddress(agentPublicKey);

    if (agentPublicKey !== this.agentPublicKey) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'La clave pública no corresponde al signer configurado por el backend.',
      );
    }

    try {
      const [account, fee] = await Promise.all([
        this.server.loadAccount(accountId),
        this.server.fetchBaseFee(),
      ]);
      const transaction = new TransactionBuilder(account, {
        fee: String(fee),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.setOptions({
            masterWeight: 2,
            lowThreshold: 1,
            medThreshold: 1,
            highThreshold: 2,
            signer: { ed25519PublicKey: agentPublicKey, weight: 1 },
          }),
        )
        .setTimeout(this.timeoutSeconds)
        .build();

      return { xdr: transaction.toXDR() };
    } catch (error) {
      throw mapHorizonError(error, 'build');
    }
  }

  private assertAllowedSource(accountId: string): void {
    validateAddress(accountId);
    if (accountId !== this.allowedSourceAccount) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'El signer M1 solo puede firmar para la cuenta demo configurada.',
      );
    }
  }
}

/**
 * Valida el lote de pagos antes de construir nada.
 *
 * Se comprueba aquí y no solo al firmar porque un error de forma debe salir
 * inmediatamente, con un mensaje que diga qué acción falla, y no después de
 * haber ido a la red a cargar la cuenta.
 */
function validatePaymentActions(actions: ResolvedAction[]): void {
  if (actions.length === 0) {
    throw new StellarClientError('INVALID_TRANSACTION', 'No hay ninguna acción que ejecutar.');
  }

  if (actions.length > MAX_PAYMENTS_PER_TRANSACTION) {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      `Una transacción admite como mucho ${MAX_PAYMENTS_PER_TRANSACTION} pagos.`,
    );
  }

  actions.forEach((action, index) => {
    const cual = `La acción ${index + 1}`;

    if (action.type !== 'PAYMENT') {
      throw new StellarClientError('INVALID_TRANSACTION', `${cual} no es un pago.`);
    }

    validateAddress(action.destinationAddress);

    try {
      if (amountToStroops(action.amount) <= 0n) throw new Error('zero');
    } catch {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        `${cual} debe tener un monto positivo con hasta 7 decimales.`,
      );
    }

    // El memo de Stellar se mide en bytes, no en caracteres: una tilde ocupa
    // dos y un emoji cuatro.
    if (action.memo && Buffer.byteLength(action.memo, 'utf8') > 28) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        `${cual} tiene un memo de más de 28 bytes.`,
      );
    }
  });
}

/**
 * Memo de la transacción, si hay uno solo.
 *
 * En Stellar el memo es de la **transacción**, no de cada operación. Con varios
 * pagos distintos no se puede conservar el memo de cada uno, así que solo se
 * pone cuando todos coinciden. Elegir uno al azar sería etiquetar cuatro pagos
 * con el motivo de uno.
 */
function singleMemoFor(actions: ResolvedAction[]): string | null {
  const memos = new Set(actions.map((a) => a.memo).filter((memo): memo is string => Boolean(memo)));
  return memos.size === 1 ? [...memos][0]! : null;
}

function parseTransaction(xdr: string): Transaction {
  try {
    const parsed: Transaction | FeeBumpTransaction = TransactionBuilder.fromXDR(
      xdr,
      Networks.TESTNET,
    );
    if (!(parsed instanceof Transaction)) {
      throw new Error('fee bump no soportada');
    }
    return parsed;
  } catch {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'El XDR no es una transacción clásica válida de testnet.',
    );
  }
}
