import { describe, expect, it } from 'vitest';
import { AGENT_EVAL_CASES, HUMAN_AGENT_EVAL_CASES } from './dataset.js';
import { extractRequestedAsset, extractRequestedBudget } from '../safety.js';

describe('agent evaluation corpus', () => {
  it('contains at least 30 unique cases covering proposals, balances, and clarification', () => {
    expect(AGENT_EVAL_CASES.length).toBe(65);
    expect(HUMAN_AGENT_EVAL_CASES).toHaveLength(30);
    expect(new Set(AGENT_EVAL_CASES.map(({ id }) => id)).size).toBe(AGENT_EVAL_CASES.length);
    expect(new Set(AGENT_EVAL_CASES.map(({ expected }) => expected))).toEqual(
      new Set(['proposal', 'balance', 'clarification']),
    );
  });

  it('includes a detectable explicit budget in every proposal case', () => {
    for (const testCase of AGENT_EVAL_CASES.filter(({ expected }) => expected === 'proposal')) {
      expect(
        extractRequestedBudget([
          ...(testCase.history ?? []),
          { role: 'user', content: testCase.prompt },
        ]),
        testCase.id,
      ).toBeDefined();
    }
  });

  it('has an explicit asset in every proposal case', () => {
    for (const testCase of AGENT_EVAL_CASES.filter(({ expected }) => expected === 'proposal')) {
      const actualAsset = extractRequestedAsset([
        ...(testCase.history ?? []),
        { role: 'user', content: testCase.prompt },
      ]);
      expect(actualAsset, testCase.id).toBeDefined();
      if (testCase.requiredAsset) expect(actualAsset, testCase.id).toBe(testCase.requiredAsset);
    }
  });
});
