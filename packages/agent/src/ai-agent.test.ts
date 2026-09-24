import { FIXTURE_DESTINATIONS } from '@aegis/contracts';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createAiAgent, replyUsesGroundedNumbers } from './ai-agent.js';
import { createFakeAgentTools } from './fake-tools.js';

describe('agent response grounding', () => {
  it('rejects numbers that were neither requested nor included in a validated proposal', () => {
    expect(replyUsesGroundedNumbers('Tu saldo disponible es 999 USDC_TEST.', [])).toBe(false);
  });

  it('accepts requested amounts and exact validated action totals', () => {
    expect(replyUsesGroundedNumbers('Preparé una propuesta por $50.', [], '50')).toBe(true);
  });

  it('runs bounded tools, validates the central split and never sends Stellar addresses to the model', async () => {
    const usage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'list-1',
              toolName: 'listDestinations',
              input: '{}',
            },
          ],
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'proposal-1',
              toolName: 'createProposal',
              input: JSON.stringify({
                summary: 'Fake total $900',
                actions: [
                  {
                    type: 'PAYMENT',
                    destinationId: 'dest_goal_viaje',
                    asset: 'USDC_TEST',
                    amount: '13.3333334',
                    label: 'Fake',
                  },
                  {
                    type: 'PAYMENT',
                    destinationId: 'dest_goal_laptop',
                    asset: 'USDC_TEST',
                    amount: '13.3333333',
                    label: 'Fake',
                  },
                  {
                    type: 'PAYMENT',
                    destinationId: 'dest_goal_curso',
                    asset: 'USDC_TEST',
                    amount: '13.3333333',
                    label: 'Fake',
                  },
                  {
                    type: 'PAYMENT',
                    destinationId: 'dest_emergencias',
                    asset: 'USDC_TEST',
                    amount: '10',
                    label: 'Fake',
                  },
                ],
                requestedTotal: '50',
              }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [{ type: 'text', text: 'He preparado una propuesta por $50.' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });
    const tools = createFakeAgentTools({ now: () => new Date('2026-09-22T00:00:00.000Z') });
    const agent = createAiAgent({
      model,
      modelName: 'google/gemini-3.1-flash-lite',
      modelProviderOrder: ['google'],
    });

    const result = await agent.handleMessage({
      message: 'Reparte $50 entre mis tres objetivos y guarda $10 para emergencias.',
      tools,
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]!.actions).toHaveLength(4);
    expect(result.proposals[0]!.summary).not.toContain('$900');
    expect(result.reply).toContain('$50');
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(model.doGenerateCalls[0]!.providerOptions?.gateway).toMatchObject({ order: ['google'] });
    expect(JSON.stringify(model.doGenerateCalls)).not.toContain(FIXTURE_DESTINATIONS[0]!.address);
  });
});
