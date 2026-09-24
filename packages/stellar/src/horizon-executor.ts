import type { ResolvedAction, StellarExecutor } from '@aegis/contracts';
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
import { mapHorizonError, StellarClientError } from './errors.js';
import { validateAddress, validateHorizonUrl } from './horizon-account-client.js';

export interface HorizonStellarExecutorOptions {
  horizonUrl: string;
  agentSignerSecret: string;
  allowedSourceAccount: string;
  transactionTimeoutSeconds?: number;
  server?: Horizon.Server;
}

/** Ejecutor testnet limitado deliberadamente al alcance de M1. */
export class HorizonStellarExecutor implements StellarExecutor {
  readonly server: Horizon.Server;
  readonly agentPublicKey: string;
  private readonly signer: Keypair;
  private readonly allowedSourceAccount: string;
  private readonly timeoutSeconds: number;

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
  }

  async buildUnsigned(accountId: string, actions: ResolvedAction[]): Promise<{ xdr: string }> {
    this.assertAllowedSource(accountId);
    const action = validateM1Action(actions);

    try {
      const [account, fee] = await Promise.all([
        this.server.loadAccount(accountId),
        this.server.fetchBaseFee(),
      ]);
      const builder = new TransactionBuilder(account, {
        fee: String(fee),
        networkPassphrase: Networks.TESTNET,
      }).addOperation(
        Operation.payment({
          destination: action.destinationAddress,
          asset: Asset.native(),
          amount: action.amount,
        }),
      );

      if (action.memo) builder.addMemo(Memo.text(action.memo));
      const transaction = builder.setTimeout(this.timeoutSeconds).build();
      return { xdr: transaction.toXDR() };
    } catch (error) {
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

    if (transaction.operations.length !== 1 || transaction.operations[0]?.type !== 'payment') {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'M1 solo permite firmar transacciones con un pago.',
      );
    }

    const operation = transaction.operations[0];
    if (operation.source && operation.source !== this.allowedSourceAccount) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'La operación debe usar la cuenta demo como origen.',
      );
    }
    if (!operation.asset.isNative()) {
      throw new StellarClientError('UNSUPPORTED_ASSET', 'M1 solo permite pagos en XLM.');
    }

    validateAddress(operation.destination);
    if (amountToStroops(operation.amount) <= 0n) {
      throw new StellarClientError('INVALID_TRANSACTION', 'El monto debe ser mayor que cero.');
    }

    transaction.sign(this.signer);
    return { xdr: transaction.toXDR() };
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

function validateM1Action(actions: ResolvedAction[]): ResolvedAction {
  if (actions.length !== 1) {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'M1 exige exactamente una acción; los pagos en lote llegan en BE1-06.',
    );
  }

  const action = actions[0];
  if (!action) {
    throw new StellarClientError('INVALID_TRANSACTION', 'Falta la acción de pago.');
  }
  if (action.type !== 'PAYMENT') {
    throw new StellarClientError('INVALID_TRANSACTION', 'M1 solo admite acciones PAYMENT.');
  }
  if (action.asset !== 'XLM') {
    throw new StellarClientError('UNSUPPORTED_ASSET', 'M1 solo permite pagos en XLM.');
  }
  validateAddress(action.destinationAddress);

  try {
    if (amountToStroops(action.amount) <= 0n) throw new Error('zero');
  } catch {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'El monto debe ser positivo y tener como máximo 7 decimales.',
    );
  }

  if (action.memo && Buffer.byteLength(action.memo, 'utf8') > 28) {
    throw new StellarClientError('INVALID_TRANSACTION', 'El memo supera 28 bytes.');
  }

  return action;
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
