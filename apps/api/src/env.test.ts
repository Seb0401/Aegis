import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('agent environment settings', () => {
  it('uses deterministic defaults when the optional Gateway key is empty', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://aegis:aegis@localhost:5432/aegis',
      JWT_SECRET: 'secreto-de-test-suficientemente-largo-para-pasar-la-validacion',
      AI_GATEWAY_API_KEY: '',
    });

    expect(env.AI_GATEWAY_API_KEY).toBeUndefined();
    expect(env.AGENT_MODEL).toBe('google/gemini-3.1-flash-lite');
    expect(env.AGENT_FALLBACK_MODEL).toBe('openai/gpt-oss-20b');
    expect(env.AGENT_PROVIDER_ORDER).toBe('google');
    expect(env.AGENT_FALLBACK_PROVIDER_ORDER).toBe('groq');
    expect(env.AGENT_TIMEOUT_MS).toBe(15_000);
  });
});

describe('conexión con Stellar (M2)', () => {
  const base = {
    DATABASE_URL: 'postgresql://aegis:aegis@localhost:5432/aegis',
    JWT_SECRET: 'secreto-de-test-suficientemente-largo-para-pasar-la-validacion',
  };

  it('con el cliente falso no pide credenciales de Stellar', () => {
    const env = loadEnv({ ...base, USE_FAKE_STELLAR: 'true' });

    expect(env.USE_FAKE_STELLAR).toBe(true);
    expect(env.STELLAR_HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
  });

  it('sin cliente falso exige la seed del signer y la cuenta permitida', () => {
    // Tiene que fallar al arrancar, no en la primera propuesta que alguien cree.
    expect(() => loadEnv({ ...base, USE_FAKE_STELLAR: 'false' })).toThrow(
      /STELLAR_AGENT_SIGNER_SECRET/,
    );

    expect(() =>
      loadEnv({ ...base, USE_FAKE_STELLAR: 'false', STELLAR_AGENT_SIGNER_SECRET: 'S...' }),
    ).toThrow(/STELLAR_DEMO_ACCOUNT_ADDRESS/);
  });

  it('arranca contra la red real con las credenciales completas', () => {
    const env = loadEnv({
      ...base,
      USE_FAKE_STELLAR: 'false',
      STELLAR_AGENT_SIGNER_SECRET: 'SBSEED',
      STELLAR_DEMO_ACCOUNT_ADDRESS: 'GCUENTA',
    });

    expect(env.USE_FAKE_STELLAR).toBe(false);
    // 180 s y no 30: el margen que evita `tx_too_late` mientras el usuario
    // confirma en Freighter.
    expect(env.STELLAR_TRANSACTION_TIMEOUT_SECONDS).toBe(180);
  });
});
