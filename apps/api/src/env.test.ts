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
