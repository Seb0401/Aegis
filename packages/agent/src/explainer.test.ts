import { FIXTURE_DESTINATIONS, FIXTURE_RISK_LOW } from '@aegis/contracts';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { containsOnlyTemplateNumbers, createAiExplainer } from './explainer.js';

describe('explanation numeric guard', () => {
  it('allows rephrasing while retaining source figures', () => {
    expect(
      containsOnlyTemplateNumbers(
        'Enviarás 50 USDC_TEST en 4 pagos.',
        'Vas a enviar 50 USDC_TEST en 4 pagos.',
      ),
    ).toBe(true);
  });

  it('rejects an invented amount, percentage, or additional numeric claim', () => {
    expect(
      containsOnlyTemplateNumbers('Enviarás 500 USDC_TEST.', 'Vas a enviar 50 USDC_TEST.'),
    ).toBe(false);
    expect(containsOnlyTemplateNumbers('Es el 72% del saldo.', 'Es el 50% del saldo.')).toBe(false);
    expect(
      containsOnlyTemplateNumbers(
        'Enviarás 50 USDC_TEST en 2 pagos.',
        'Vas a enviar 50 USDC_TEST en 1 pago.',
      ),
    ).toBe(false);
  });

  it('uses the Guardian template when the model invents an amount', async () => {
    const destination = FIXTURE_DESTINATIONS[0]!;
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: 'Enviarás 999 USDC_TEST en 1 pago a Viaje.' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 5, text: 5, reasoning: undefined },
        },
        warnings: [],
      },
    });
    const explainer = createAiExplainer({ model, modelName: 'google/gemini-3.1-flash-lite' });

    const explanation = await explainer.explain(FIXTURE_RISK_LOW, [
      {
        type: 'PAYMENT',
        destinationId: destination.id,
        destinationAddress: destination.address,
        destinationLabel: destination.label,
        asset: 'USDC_TEST',
        amount: '1',
        memo: null,
        label: 'Objetivo: Viaje',
      },
    ]);

    expect(explanation.generatedBy).toBe('template');
    expect(explanation.summary).not.toContain('999');
  });
});
