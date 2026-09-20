import { AgentMessageRequestSchema, AgentMessageResponseSchema } from '@aegis/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { newConversationId, newMessageId } from '../lib/ids.js';
import { agentMessages } from '../db/schema.js';
import { createAgentTools } from '../services/agent-tools.js';

export const agentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/agent/messages',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['agent'],
        summary: 'Envía un mensaje al agente y recibe su respuesta y sus propuestas',
        body: AgentMessageRequestSchema,
        response: { 200: AgentMessageResponseSchema },
      },
    },
    async (request) => {
      const user = { id: request.user.sub, address: request.user.address };
      const conversationId = request.body.conversationId ?? newConversationId();

      const tools = createAgentTools(
        {
          reader: app.services.reader,
          destinations: app.services.destinations,
          policies: app.services.policies,
          proposals: app.services.proposals,
        },
        user,
      );

      await app.services.db.insert(agentMessages).values({
        id: newMessageId(),
        userId: user.id,
        conversationId,
        role: 'user',
        content: request.body.message,
      });

      const result = await app.services.agent.handleMessage({
        message: request.body.message,
        tools,
      });

      await app.services.db.insert(agentMessages).values({
        id: newMessageId(),
        userId: user.id,
        conversationId,
        role: 'assistant',
        content: result.reply,
      });

      return {
        conversationId,
        reply: result.reply,
        proposals: result.proposals,
      };
    },
  );
};
