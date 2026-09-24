import type { Agent, AgentMessage } from '@aegis/agent';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, login, type TestApp } from '../test/app.js';

const USER_ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

describe('agent conversation history', () => {
  let harness: TestApp;
  let app: FastifyInstance;
  let headers: { authorization: string };
  let receivedHistory: AgentMessage[] | undefined;
  const recordingAgent: Agent = {
    async handleMessage(input) {
      receivedHistory = input.history;
      return { reply: 'Respuesta de prueba.', proposals: [] };
    },
  };

  beforeAll(async () => {
    harness = await createTestApp({ overrides: { agent: recordingAgent } });
    app = harness.app;
    headers = (await login(app, USER_ADDRESS)).headers;
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('passes earlier turns from only the authenticated user conversation', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/agent/messages',
      headers,
      payload: { message: 'Reparte $50 entre mis objetivos.' },
    });
    const { conversationId } = first.json() as { conversationId: string };

    const second = await app.inject({
      method: 'POST',
      url: '/agent/messages',
      headers,
      payload: { conversationId, message: 'Incluye emergencias.' },
    });

    expect(second.statusCode).toBe(200);
    expect(receivedHistory).toEqual([
      { role: 'user', content: 'Reparte $50 entre mis objetivos.' },
      { role: 'assistant', content: 'Respuesta de prueba.' },
    ]);
  });
});
