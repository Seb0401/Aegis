import { createGateway } from '@ai-sdk/gateway';
import { createAiAgent, type AgentCallMetrics } from './ai-agent.js';
import type { Agent } from './types.js';

export interface GatewayAgentOptions {
  apiKey: string;
  model?: string;
  fallbackModel?: string;
  modelProviderOrder?: string[];
  fallbackProviderOrder?: string[];
  timeoutMs?: number;
  onMetrics?: (metrics: AgentCallMetrics) => void;
}

/** Build generative models through Vercel AI Gateway without provider-specific credentials. */
export function createGatewayAgent(options: GatewayAgentOptions): Agent {
  const provider = createGateway({ apiKey: options.apiKey });
  const modelName = options.model ?? 'google/gemini-3.1-flash-lite';
  const fallbackModelName = options.fallbackModel;

  return createAiAgent({
    model: provider(modelName),
    modelName,
    ...(fallbackModelName
      ? {
          fallbackModel: provider(fallbackModelName),
          fallbackModelName,
          fallbackProviderOrder: options.fallbackProviderOrder,
        }
      : {}),
    modelProviderOrder: options.modelProviderOrder,
    timeoutMs: options.timeoutMs,
    onMetrics: options.onMetrics,
  });
}
