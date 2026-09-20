import type { AgentTools, Proposal } from '@aegis/contracts';

export interface AgentTurnInput {
  /** Texto libre del usuario. Se trata como NO confiable (§12). */
  message: string;
  /** Herramientas con las que el agente lee datos y crea propuestas. */
  tools: AgentTools;
}

export interface AgentTurnResult {
  reply: string;
  /** Propuestas creadas en este turno, ya evaluadas por el backend. */
  proposals: Proposal[];
}

/**
 * Contrato del agente.
 *
 * La API depende solo de esta interfaz, así que cambiar el agente de reglas por
 * el agente con LLM no obliga a tocar el orquestador.
 */
export interface Agent {
  handleMessage(input: AgentTurnInput): Promise<AgentTurnResult>;
}
