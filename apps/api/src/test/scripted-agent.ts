import type { Agent, AgentTurnInput, AgentTurnResult } from '@aegis/agent';
import type { ProposalInput } from '@aegis/contracts';

/**
 * Agente de test que hace exactamente lo que se le dice.
 *
 * El agente de reglas real interpreta lenguaje natural, y eso está bien para la
 * demo pero es pésimo para un test: si quiero comprobar qué pasa con un pago de
 * 200 a un destino concreto, no quiero pelearme con el parseo de frases.
 *
 * Este doble recibe la propuesta ya escrita en JSON y la crea tal cual. Entra
 * por el mismo `tools.createProposal`, así que pasa por política, Guardian y
 * auditoría igual que cualquier otra propuesta: no se salta nada del pipeline.
 *
 * Se inyecta con el `overrides.agent` que el contenedor ya expone.
 */
export function createScriptedAgent(): Agent {
  return {
    async handleMessage(input: AgentTurnInput): Promise<AgentTurnResult> {
      const instruction = JSON.parse(input.message) as ProposalInput;
      const proposal = await input.tools.createProposal(instruction);

      return { reply: 'Propuesta creada por el agente de test.', proposals: [proposal] };
    },
  };
}
