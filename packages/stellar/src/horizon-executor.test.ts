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

  it('rechaza construir desde una cuenta que no es la permitida', async () => {
    const { executor } = setup();

    await expect(executor.buildUnsigned(destination.publicKey(), [action()])).rejects.toMatchObject(
      { code: 'INVALID_TRANSACTION' },
    );
  });

  it('rechaza un activo de crédito si no hay emisor configurado', async () => {
    // Firmar un activo con emisor desconocido sería firmar un token que puede
    // haber creado cualquiera.
    const { executor } = setup();

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

describe('pagos en lote (BE1-06)', () => {
  const issuer = Keypair.random();

  function setupConEmisor(): { server: Horizon.Server; executor: HorizonStellarExecutor } {
    const server = new Horizon.Server('https://horizon-testnet.stellar.org');
    vi.spyOn(server, 'loadAccount').mockResolvedValue(
      new Account(source.publicKey(), '100') as never,
    );
    vi.spyOn(server, 'fetchBaseFee').mockResolvedValue(100);

    return {
      server,
      executor: new HorizonStellarExecutor({
        horizonUrl: 'https://horizon-testnet.stellar.org',
        agentSignerSecret: signer.secret(),
        allowedSourceAccount: source.publicKey(),
        transactionTimeoutSeconds: 180,
        usdcTestIssuer: issuer.publicKey(),
        server,
      }),
    };
  }

  function leer(xdr: string): Transaction {
    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    if (!(transaction instanceof Transaction)) throw new Error('se esperaba una tx clasica');
    return transaction;
  }

  beforeEach(() => vi.restoreAllMocks());

  it('mete los cuatro pagos del caso de referencia en UNA transacción', async () => {
    // "Reparte 50 entre 3 objetivos y guarda 10 para emergencias". Que sea una
    // sola transacción importa: Stellar la aplica entera o no la aplica, así
    // que el usuario no puede acabar con dos pagos hechos y dos sin hacer.
    const { executor } = setupConEmisor();
    const destinos = [Keypair.random(), Keypair.random(), Keypair.random(), Keypair.random()];

    const { xdr } = await executor.buildUnsigned(
      source.publicKey(),
      destinos.map((d, i) =>
        action({ destinationAddress: d.publicKey(), amount: i === 3 ? '10' : '13.3333333' }),
      ),
    );

    const transaction = leer(xdr);
    expect(transaction.operations).toHaveLength(4);
    expect(transaction.operations.every((op) => op.type === 'payment')).toBe(true);
  });

  it('cobra comisión por operación, no por transacción', async () => {
    const { executor } = setupConEmisor();

    const una = leer((await executor.buildUnsigned(source.publicKey(), [action()])).xdr);
    const tres = leer(
      (await executor.buildUnsigned(source.publicKey(), [action(), action(), action()])).xdr,
    );

    expect(Number(tres.fee)).toBe(Number(una.fee) * 3);
  });

  it('paga en USDC_TEST con el emisor configurado', async () => {
    const { executor } = setupConEmisor();

    const { xdr } = await executor.buildUnsigned(source.publicKey(), [
      action({ asset: 'USDC_TEST' }),
    ]);

    const operacion = leer(xdr).operations[0];
    if (operacion?.type !== 'payment') throw new Error('se esperaba un pago');
    expect(operacion.asset.getCode()).toBe('USDCTEST');
    expect(operacion.asset.getIssuer()).toBe(issuer.publicKey());
  });

  it('pone el memo solo si todos los pagos comparten el mismo', async () => {
    // En Stellar el memo es de la transacción, no de cada operación. Elegir uno
    // al azar sería etiquetar cuatro pagos con el motivo de uno.
    const { executor } = setupConEmisor();

    const mismo = leer(
      (
        await executor.buildUnsigned(source.publicKey(), [
          action({ memo: 'Ahorro' }),
          action({ memo: 'Ahorro' }),
        ])
      ).xdr,
    );
    expect(mismo.memo.value?.toString()).toBe('Ahorro');

    const distintos = leer(
      (
        await executor.buildUnsigned(source.publicKey(), [
          action({ memo: 'Viaje' }),
          action({ memo: 'Laptop' }),
        ])
      ).xdr,
    );
    expect(distintos.memo.value).toBeFalsy();
  });

  it('rechaza más pagos de los que el usuario puede revisar de un vistazo', async () => {
    const { executor } = setupConEmisor();

    await expect(
      executor.buildUnsigned(
        source.publicKey(),
        Array.from({ length: 11 }, () => action()),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSACTION' });
  });

  it('dice qué acción del lote es la que falla', async () => {
    const { executor } = setupConEmisor();

    await expect(
      executor.buildUnsigned(source.publicKey(), [action(), action({ amount: '0' })]),
    ).rejects.toThrow(/acción 2/);
  });
});

describe('firmar un lote (BE1-06)', () => {
  const issuer = Keypair.random();
  const impostor = Keypair.random();

  function ejecutor(): HorizonStellarExecutor {
    const server = new Horizon.Server('https://horizon-testnet.stellar.org');
    vi.spyOn(server, 'loadAccount').mockResolvedValue(
      new Account(source.publicKey(), '100') as never,
    );
    vi.spyOn(server, 'fetchBaseFee').mockResolvedValue(100);

    return new HorizonStellarExecutor({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      agentSignerSecret: signer.secret(),
      allowedSourceAccount: source.publicKey(),
      transactionTimeoutSeconds: 180,
      usdcTestIssuer: issuer.publicKey(),
      server,
    });
  }

  /** Transacción construida a mano, para colar operaciones que no salen de nosotros. */
  function transaccionCon(operaciones: ReturnType<typeof Operation.payment>[]): string {
    const builder = new TransactionBuilder(new Account(source.publicKey(), '100'), {
      fee: '1000',
      networkPassphrase: Networks.TESTNET,
    });
    for (const operacion of operaciones) builder.addOperation(operacion);
    return builder.setTimeout(120).build().toXDR();
  }

  beforeEach(() => vi.restoreAllMocks());

  it('firma un lote legítimo', async () => {
    const executor = ejecutor();
    const { xdr } = await executor.buildUnsigned(source.publicKey(), [action(), action()]);

    const firmada = await executor.signWithAgent(xdr);
    const transaction = TransactionBuilder.fromXDR(firmada.xdr, Networks.TESTNET);
    expect((transaction as Transaction).signatures).toHaveLength(1);
  });

  it('comprueba TODAS las operaciones, no solo la primera', async () => {
    // Bastaría con que la segunda fuera otra cosa para que el agente estuviera
    // autorizando algo que nadie revisó.
    const xdr = transaccionCon([
      Operation.payment({
        destination: destination.publicKey(),
        asset: Asset.native(),
        amount: '1',
      }),
      Operation.payment({
        destination: destination.publicKey(),
        asset: new Asset('USDCTEST', impostor.publicKey()),
        amount: '1000',
      }),
    ]);

    await expect(ejecutor().signWithAgent(xdr)).rejects.toMatchObject({
      code: 'UNSUPPORTED_ASSET',
    });
  });

  it('rechaza un USDC_TEST de otro emisor aunque el código coincida', async () => {
    // Mismo nombre, emisor distinto, valor ninguno.
    const xdr = transaccionCon([
      Operation.payment({
        destination: destination.publicKey(),
        asset: new Asset('USDCTEST', impostor.publicKey()),
        amount: '1',
      }),
    ]);

    await expect(ejecutor().signWithAgent(xdr)).rejects.toMatchObject({
      code: 'UNSUPPORTED_ASSET',
    });
  });

  it('rechaza una operación que no es un pago colada en el lote', async () => {
    const builder = new TransactionBuilder(new Account(source.publicKey(), '100'), {
      fee: '1000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: '1',
        }),
      )
      // Cambiar los signers de la cuenta es justo lo que el agente nunca debe
      // poder firmar.
      .addOperation(Operation.setOptions({ masterWeight: 0 }));

    await expect(
      ejecutor().signWithAgent(builder.setTimeout(120).build().toXDR()),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSACTION' });
  });
});
