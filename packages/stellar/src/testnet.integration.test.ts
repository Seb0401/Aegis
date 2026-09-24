import type { ResolvedAction } from '@aegis/contracts';
import {
  Horizon,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { HorizonAccountClient } from './horizon-account-client.js';
import { HorizonStellarExecutor } from './horizon-executor.js';

const runTestnet = process.env.RUN_STELLAR_TESTNET === 'true';

describe.skipIf(!runTestnet)('M1 contra Stellar testnet', () => {
  it('financia, delega y paga solo con el signer del agente', async () => {
    const horizonUrl = 'https://horizon-testnet.stellar.org';
    const friendbotUrl = 'https://friendbot.stellar.org';
    const server = new Horizon.Server(horizonUrl);
    const source = Keypair.random();
    const destination = Keypair.random();
    const signer = Keypair.random();

    await Promise.all([
      fund(friendbotUrl, source.publicKey()),
      fund(friendbotUrl, destination.publicKey()),
    ]);

    const executor = new HorizonStellarExecutor({
      horizonUrl,
      agentSignerSecret: signer.secret(),
      allowedSourceAccount: source.publicKey(),
      server,
    });
    const reader = new HorizonAccountClient({ horizonUrl, server });

    const delegation = await executor.buildDelegationXdr(source.publicKey(), signer.publicKey());
    const delegationTx = TransactionBuilder.fromXDR(delegation.xdr, Networks.TESTNET);
    if (!(delegationTx instanceof Transaction)) throw new Error('expected classic transaction');
    delegationTx.sign(source);
    await executor.submit(delegationTx.toXDR());

    const delegatedAccount = await server.loadAccount(source.publicKey());
    expect(delegatedAccount.signers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: source.publicKey(), weight: 2 }),
        expect.objectContaining({ key: signer.publicKey(), weight: 1 }),
      ]),
    );
    expect(delegatedAccount.thresholds).toMatchObject({
      low_threshold: 1,
      med_threshold: 1,
      high_threshold: 2,
    });

    const before = await reader.getBalances(source.publicKey());
    const payment: ResolvedAction = {
      type: 'PAYMENT',
      destinationId: 'testnet-destination',
      destinationAddress: destination.publicKey(),
      destinationLabel: 'Cuenta efímera',
      asset: 'XLM',
      amount: '1.0000000',
      memo: 'Aegis M1 test',
      label: 'Integración M1',
    };
    const unsigned = await executor.buildUnsigned(source.publicKey(), [payment]);
    const signed = await executor.signWithAgent(unsigned.xdr);
    const result = await executor.submit(signed.xdr);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);

    const after = await reader.getBalances(source.publicKey());
    expect(after[0]?.total).not.toBe(before[0]?.total);

    const fresh = await server.loadAccount(source.publicKey());
    const forbidden = new TransactionBuilder(fresh, {
      fee: String(await server.fetchBaseFee()),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.setOptions({ masterWeight: 1 }))
      .setTimeout(180)
      .build();
    forbidden.sign(signer);
    await expect(executor.submit(forbidden.toXDR())).rejects.toMatchObject({
      code: 'TX_REJECTED',
    });
  }, 120_000);
});

async function fund(friendbotUrl: string, address: string): Promise<void> {
  const response = await fetch(`${friendbotUrl}?addr=${encodeURIComponent(address)}`);
  if (!response.ok) throw new Error(`Friendbot respondió ${response.status}.`);
}
