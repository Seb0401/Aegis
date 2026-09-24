import { StrKey } from '@stellar/stellar-sdk';
import { StellarClientError } from './errors.js';
import { validateAddress, validateHorizonUrl } from './horizon-account-client.js';

export interface StellarM1Config {
  horizonUrl: string;
  demoAccountAddress: string;
  agentSignerSecret: string;
  transactionTimeoutSeconds: number;
}

/** Valida solo la configuración del cliente M1; nunca devuelve ni imprime valores parciales. */
export function loadStellarM1Config(source: NodeJS.ProcessEnv = process.env): StellarM1Config {
  if ((source.STELLAR_NETWORK ?? 'testnet') !== 'testnet') {
    throw new StellarClientError('INVALID_TRANSACTION', 'M1 solo funciona en Stellar testnet.');
  }

  const horizonUrl = required(source, 'STELLAR_HORIZON_URL');
  const demoAccountAddress = required(source, 'STELLAR_DEMO_ACCOUNT_ADDRESS');
  const agentSignerSecret = required(source, 'STELLAR_AGENT_SIGNER_SECRET');
  const timeoutRaw = source.STELLAR_TRANSACTION_TIMEOUT_SECONDS ?? '180';
  const transactionTimeoutSeconds = Number(timeoutRaw);

  validateHorizonUrl(horizonUrl);
  validateAddress(demoAccountAddress);
  if (!StrKey.isValidEd25519SecretSeed(agentSignerSecret)) {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'STELLAR_AGENT_SIGNER_SECRET no es una seed Stellar válida.',
    );
  }
  if (!Number.isInteger(transactionTimeoutSeconds) || transactionTimeoutSeconds < 30) {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'STELLAR_TRANSACTION_TIMEOUT_SECONDS debe ser un entero de al menos 30.',
    );
  }

  return {
    horizonUrl,
    demoAccountAddress,
    agentSignerSecret,
    transactionTimeoutSeconds,
  };
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim();
  if (!value) {
    throw new StellarClientError('INVALID_TRANSACTION', `Falta la variable ${name}.`);
  }
  return value;
}
