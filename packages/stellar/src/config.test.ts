import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { loadStellarM1Config } from './config.js';

describe('loadStellarM1Config', () => {
  it('acepta una configuración testnet completa', () => {
    const account = Keypair.random();
    const signer = Keypair.random();
    expect(
      loadStellarM1Config({
        STELLAR_NETWORK: 'testnet',
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        STELLAR_DEMO_ACCOUNT_ADDRESS: account.publicKey(),
        STELLAR_AGENT_SIGNER_SECRET: signer.secret(),
        STELLAR_TRANSACTION_TIMEOUT_SECONDS: '180',
      }),
    ).toEqual({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      demoAccountAddress: account.publicKey(),
      agentSignerSecret: signer.secret(),
      transactionTimeoutSeconds: 180,
    });
  });

  it('rechaza mainnet y secretos inválidos sin repetirlos en el mensaje', () => {
    const account = Keypair.random().publicKey();
    expect(() =>
      loadStellarM1Config({
        STELLAR_NETWORK: 'mainnet',
        STELLAR_HORIZON_URL: 'https://horizon.stellar.org',
        STELLAR_DEMO_ACCOUNT_ADDRESS: account,
        STELLAR_AGENT_SIGNER_SECRET: 'no-es-un-secreto',
      }),
    ).toThrow(/testnet/);

    try {
      loadStellarM1Config({
        STELLAR_NETWORK: 'testnet',
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        STELLAR_DEMO_ACCOUNT_ADDRESS: account,
        STELLAR_AGENT_SIGNER_SECRET: 'no-es-un-secreto',
      });
    } catch (error) {
      expect((error as Error).message).not.toContain('no-es-un-secreto');
    }
  });
});
