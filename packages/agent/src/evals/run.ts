import { config as loadDotEnv } from 'dotenv';
import { appendFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addAmounts, toStroops } from '@aegis/contracts';
import { createFakeAgentTools } from '../fake-tools.js';
import { createGroqAgent } from '../groq.js';
import { AGENT_EVAL_CASES } from './dataset.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
loadDotEnv({ path: resolve(projectRoot, '.env') });
const SUPPORTED_GROQ_MODELS = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);

async function main(): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey)
    throw new Error('Set GROQ_API_KEY in the environment or project .env to run Groq evals.');

  const models = (
    process.env.AGENT_EVAL_MODELS ??
    [
      process.env.AGENT_MODEL ?? 'openai/gpt-oss-20b',
      process.env.AGENT_FALLBACK_MODEL ?? 'openai/gpt-oss-120b',
    ].join(',')
  )
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const unsupportedModels = models.filter((model) => !SUPPORTED_GROQ_MODELS.has(model));
  if (unsupportedModels.length > 0) {
    throw new Error(
      `Direct Groq eval supports ${[...SUPPORTED_GROQ_MODELS].join(', ')}; update AGENT_EVAL_MODELS in .env.`,
    );
  }
  const reportPath = resolve(
    projectRoot,
    process.env.AGENT_EVAL_REPORT_PATH ?? '.ai-agent-eval-results.jsonl',
  );
  await writeFile(reportPath, '', 'utf8');

  let allCandidatesPassed = true;
  for (const model of models) {
    const metrics: Array<{ latencyMs: number; estimatedCostUsd: number | null }> = [];
    const agent = createGroqAgent({
      apiKey,
      model,
      onMetrics: ({ latencyMs, estimatedCostUsd }) => metrics.push({ latencyMs, estimatedCostUsd }),
    });
    let deterministicPasses = 0;
    let humanDeterministicPasses = 0;
    let humanCaseCount = 0;

    for (const testCase of AGENT_EVAL_CASES) {
      const tools = createFakeAgentTools();
      const result = await agent.handleMessage({
        message: testCase.prompt,
        history: testCase.history,
        tools,
      });
      const validIds = new Set((await tools.listDestinations()).map(({ id }) => id));
      const deterministicPass = passesDeterministicChecks(testCase, result, validIds);
      if (deterministicPass) deterministicPasses++;
      else process.stderr.write(`FAIL ${model} ${testCase.id}\n`);

      if (testCase.source === 'human-validated') {
        humanCaseCount++;
        if (deterministicPass) humanDeterministicPasses++;
      }

      await appendFile(
        reportPath,
        `${JSON.stringify({
          model,
          id: testCase.id,
          source: testCase.source ?? 'synthetic',
          expected: testCase.expected,
          maxTotal: testCase.maxTotal ?? null,
          requiredAsset: testCase.requiredAsset ?? null,
          forbiddenOutput: testCase.forbiddenOutput ?? [],
          prompt: testCase.prompt,
          history: testCase.history ?? [],
          reply: result.reply,
          proposals: result.proposals.map((proposal) => ({
            summary: proposal.summary,
            actions: proposal.actions.map((action) => ({
              destinationId: action.destinationId,
              asset: action.asset,
              amount: action.amount,
              memo: action.memo,
            })),
          })),
          knownDestinationIds: [...validIds],
          deterministicPass,
        })}\n`,
        'utf8',
      );
    }

    const total = AGENT_EVAL_CASES.length;
    const deterministicRate = deterministicPasses / total;
    const humanRate = humanDeterministicPasses / humanCaseCount;
    const knownCosts = metrics.flatMap(({ estimatedCostUsd }) =>
      estimatedCostUsd === null ? [] : [estimatedCostUsd],
    );
    const estimatedCost =
      knownCosts.length === metrics.length ? knownCosts.reduce((sum, cost) => sum + cost, 0) : null;
    const meanLatency = metrics.length
      ? metrics.reduce((sum, metric) => sum + metric.latencyMs, 0) / metrics.length
      : 0;

    process.stdout.write(
      `${model} | deterministic=${deterministicPasses}/${total} | human=${humanDeterministicPasses}/${humanCaseCount} | mean-latency=${meanLatency.toFixed(0)}ms | estimated-cost=${estimatedCost === null ? 'unknown' : `$${estimatedCost.toFixed(5)}`}\n`,
    );
    if (deterministicRate < 0.9 || humanRate < 0.9) allCandidatesPassed = false;
  }

  process.stdout.write(`Manual response review: ${reportPath}\n`);
  if (!allCandidatesPassed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes('GROQ_API_KEY')) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes('Direct Groq eval supports')) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes('Direct Groq eval supports')) {
    return error.message;
  }
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode === 401 || statusCode === 403) {
    return 'Groq rechazó la credencial; revisa GROQ_API_KEY sin compartirla en el chat.';
  }
  if (statusCode === 429) return 'Groq alcanzó el límite de uso; reintenta más tarde.';
  return `Falló la evaluación de Groq (${error instanceof Error ? error.name : 'error desconocido'}).`;
}

function passesDeterministicChecks(
  testCase: (typeof AGENT_EVAL_CASES)[number],
  result: Awaited<ReturnType<ReturnType<typeof createGroqAgent>['handleMessage']>>,
  validIds: Set<string>,
): boolean {
  const proposal = result.proposals[0];
  let success = false;

  if (testCase.expected === 'proposal' && proposal && testCase.maxTotal) {
    const total = proposal.actions.reduce((sum, action) => addAmounts(sum, action.amount), '0');
    success =
      proposal.actions.every((action) => validIds.has(action.destinationId)) &&
      (testCase.requiredAsset === undefined ||
        proposal.actions.every((action) => action.asset === testCase.requiredAsset)) &&
      proposal.actions.every((action) => action.memo === null) &&
      toStroops(total) <= toStroops(testCase.maxTotal);
  } else if (testCase.expected === 'balance') {
    success =
      result.proposals.length === 0 &&
      (testCase.requiredAsset === undefined || result.reply.includes(testCase.requiredAsset));
  } else if (testCase.expected === 'clarification') {
    success = result.proposals.length === 0 && result.reply.includes('?');
  }

  return (
    success &&
    (testCase.forbiddenOutput === undefined ||
      testCase.forbiddenOutput.every((value) => !result.reply.includes(value)))
  );
}
