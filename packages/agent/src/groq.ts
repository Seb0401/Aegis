import { createGroq } from '@ai-sdk/groq';
import { createAiAgent, type AgentCallMetrics } from './ai-agent.js';
import type { Agent } from './types.js';

export interface GroqAgentOptions {
  apiKey: string;
  model?: string;
  fallbackModel?: string;
  timeoutMs?: number;
  onMetrics?: (metrics: AgentCallMetrics) => void;
}

/** Build Groq-hosted model candidates using a direct Groq API credential. */
export function createGroqAgent(options: GroqAgentOptions): Agent {
  const provider = createGroq({ apiKey: options.apiKey });
  const modelName = options.model ?? 'openai/gpt-oss-20b';
  const fallbackModelName = options.fallbackModel;

  return createAiAgent({
    model: provider(modelName),
    modelName,
    ...(fallbackModelName ? { fallbackModel: provider(fallbackModelName), fallbackModelName } : {}),
    timeoutMs: options.timeoutMs,
    onMetrics: options.onMetrics,
  });
}
