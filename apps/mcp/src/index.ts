#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AegisClient } from './client.js';
import { createTools, toToolError } from './tools.js';

/**
 * Servidor MCP de Aegis.
 *
 * Deja que cualquier agente compatible con MCP (Claude Desktop, Cursor, un
 * agente propio) opere sobre Stellar **a través de** Aegis: puede consultar
 * saldos, leer los límites del usuario y proponer pagos, pero no puede enviar
 * dinero. Toda propuesta pasa por el Policy Engine y el Guardian, queda
 * auditada, y la aprueba una persona.
 *
 * Configuración, por variables de entorno:
 *   AEGIS_API_URL    URL de la API (por defecto http://localhost:3001)
 *   AEGIS_API_TOKEN  token de sesión de Aegis
 *
 * Se comunica por stdio, que es el transporte estándar de MCP. Por eso nada
 * escribe en stdout salvo el propio protocolo: un `console.log` despistado
 * corrompería la conversación. Los mensajes van a stderr.
 */

const DEFAULT_API_URL = 'http://localhost:3001';

function readConfig(): { baseUrl: string; token: string } {
  const baseUrl = process.env.AEGIS_API_URL ?? DEFAULT_API_URL;
  const token = process.env.AEGIS_API_TOKEN;

  if (!token) {
    throw new Error(
      [
        'Falta AEGIS_API_TOKEN.',
        '',
        'Consigue un token iniciando sesión en Aegis. En desarrollo:',
        `  curl -s ${baseUrl}/auth/dev-login -H 'content-type: application/json' \\`,
        `    -d '{"address":"G..."}'`,
        '',
        'El token identifica al usuario cuyos límites y destinos se van a usar.',
      ].join('\n'),
    );
  }

  return { baseUrl, token };
}

async function main(): Promise<void> {
  const config = readConfig();

  const server = new McpServer({
    name: 'aegis',
    version: '0.1.0',
  });

  const client = new AegisClient(config);

  for (const tool of createTools(client)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) => {
        try {
          return { content: [{ type: 'text' as const, text: await tool.handler(args ?? {}) }] };
        } catch (error) {
          // Un fallo se devuelve como contenido de error, no como excepción: el
          // agente que llama necesita poder leerlo y corregir, no recibir una
          // caída del transporte.
          return {
            content: [{ type: 'text' as const, text: toToolError(error) }],
            isError: true,
          };
        }
      },
    );
  }

  await server.connect(new StdioServerTransport());
  console.error(`Aegis MCP listo · API en ${config.baseUrl}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
