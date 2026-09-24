import type { ResolvedAction } from '@aegis/contracts';
import {
  Account,
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StellarClientError } from './errors.js';
import { HorizonStellarExecutor } from './horizon-executor.js';

const source = Keypair.random();
const signer = Keypair.random();
const destination = Keypair.random();

function action(overrides: Partial<ResolvedAction> = {}): ResolvedAction {
  return {
    type: 'PAYMENT',
    destinationId: 'destination-m1',
    destinationAddress: destination.publicKey(),
    destinationLabel: 'Destino M1',
    asset: 'XLM',
    amount: '1.2500000',
    memo: 'Aegis M1',
    label: 'Pago M1',
    ...overrides,
  };
}

function setup(): { server: Horizon.Server; executor: HorizonStellarExecutor } {
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  vi.spyOn(server, 'loadAccount').mockResolvedValue(
    new Account(source.publicKey(), '100') as never,
  );
  vi.spyOn(server, 'fetchBaseFee').mockResolvedValue(100);
  const executor = new HorizonStellarExecutor({
    horizonUrl: 'https://horizon-testnet.stellar.org',
    agentSignerSecret: signer.secret(),
    allowedSourceAccount: source.publicKey(),
    transactionTimeoutSeconds: 180,
    server,
  });
  return { server, executor };
}

describe('HorizonStellarExecutor', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('construye un pago XLM testnet con fee, memo y timeout', async () => {
    const { executor } = setup();
    const { xdr } = await executor.buildUnsigned(source.publicKey(), [action()]);
    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);

    expect(transaction).toBeInstanceOf(Transaction);
    if (!(transaction instanceof Transaction)) throw new Error('expected classic transaction');
    expect(transaction.source).toBe(source.publicKey());
    expect(transaction.fee).toBe('100');
    expect(transaction.memo.value?.toString()).toBe('Aegis M1');
    expect(transaction.timeBounds?.minTime).toBe('0');
    const secondsRemaining =
      Number(transaction.timeBounds?.maxTime) - Math.floor(Date.now() / 1000);
    expect(secondsRemaining).toBeGreaterThanOrEqual(178);
    expect(secondsRemaining).toBeLessThanOrEqual(180);
    expect(transaction.operations).toHaveLength(1);
    expect(transaction.operations[0]).toMatchObject({
      type: 'payment',
      destination: destination.publicKey(),
      amount: '1.2500000',
    });
  });

  it('construye la delegación con los pesos seguros de M1', async () => {
    const { executor } = setup();
    const { xdr } = await executor.buildDelegationXdr(source.publicKey(), signer.publicKey());
    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);

    if (!(transaction instanceof Transaction)) throw new Error('expected classic transaction');
    expect(transaction.operations).toHaveLength(1);
    expect(transaction.operations[0]).toMatchObject({
      type: 'setOptions',
      masterWeight: 2,
      lowThreshold: 1,
      medThreshold: 1,
      highThreshold: 2,
      signer: { ed25519PublicKey: signer.publicKey(), weight: 1 },
    });
  });

  it('firma el pago con el signer configurado', async () => {
    const { executor } = setup();
    const unsigned = await executor.buildUnsigned(source.publicKey(), [action()]);
    const signed = await executor.signWithAgent(unsigned.xdr);
    const transaction = TransactionBuilder.fromXDR(signed.xdr, Networks.TESTNET);

    if (!(transaction instanceof Transaction)) throw new Error('expected classic transaction');
    expect(transaction.signatures).toHaveLength(1);
    expect(
      signer.verify(transaction.hash(), transaction.signatures[0]?.signature() ?? Buffer.alloc(0)),
    ).toBe(true);
  });

  it('rechaza otra cuenta, batches y activos fuera de M1', async () => {
    const { executor } = setup();
    await expect(executor.buildUnsigned(destination.publicKey(), [action()])).rejects.toMatchObject(
      {
        code: 'INVALID_TRANSACTION',
      },
    );
    await expect(
      executor.buildUnsigned(source.publicKey(), [action(), action()]),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSACTION' });
    await expect(
      executor.buildUnsigned(source.publicKey(), [action({ asset: 'USDC_TEST' })]),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_ASSET' });
  });

  it('no firma SetOptions ni una clave pública distinta a la configurada', async () => {
    const { executor } = setup();
    const malicious = new TransactionBuilder(new Account(source.publicKey(), '100'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.setOptions({ masterWeight: 0 }))
      .setTimeout(180)
      .build();

    await expect(executor.signWithAgent(malicious.toXDR())).rejects.toMatchObject({
      code: 'INVALID_TRANSACTION',
    });
    await expect(
      executor.buildDelegationXdr(source.publicKey(), destination.publicKey()),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSACTION' });
  });

  it('no firma XDR con firmas previas ni pagos con otro origen de operación', async () => {
    const { executor } = setup();
    const unsigned = await executor.buildUnsigned(source.publicKey(), [action()]);
    const preSigned = TransactionBuilder.fromXDR(unsigned.xdr, Networks.TESTNET);
    preSigned.sign(source);
    await expect(executor.signWithAgent(preSigned.toXDR())).rejects.toMatchObject({
      code: 'INVALID_TRANSACTION',
    });

    const foreignSource = new TransactionBuilder(new Account(source.publicKey(), '100'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          source: destination.publicKey(),
          destination: source.publicKey(),
          asset: Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(180)
      .build();
    await expect(executor.signWithAgent(foreignSource.toXDR())).rejects.toMatchObject({
      code: 'INVALID_TRANSACTION',
    });
  });

  it('envía una transacción clásica y devuelve solo el hash', async () => {
    const { server, executor } = setup();
    const transaction = new TransactionBuilder(new Account(source.publicKey(), '100'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(180)
      .build();
    vi.spyOn(server, 'submitTransaction').mockResolvedValue({ hash: 'abc123' } as never);

    await expect(executor.submit(transaction.toXDR())).resolves.toEqual({ hash: 'abc123' });
  });

  it('los errores públicos no contienen la seed ni el XDR', async () => {
    const { executor } = setup();
    const secret = signer.secret();
    const invalidXdr = 'esto-no-es-xdr';

    let caught: unknown;
    try {
      await executor.signWithAgent(invalidXdr);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StellarClientError);
    const message = (caught as Error).message;
    expect(message).not.toContain(secret);
    expect(message).not.toContain(invalidXdr);
  });
});
