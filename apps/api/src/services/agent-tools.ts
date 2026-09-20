import type {
  AgentTools,
  Balance,
  Destination,
  PolicySummary,
  Proposal,
  ProposalInput,
  StellarReader,
} from '@aegis/contracts';
import { buildPolicySummary } from '@aegis/policy-engine';
import type { DestinationStore } from './destination-store.js';
import type { PolicyStore } from './policy-store.js';
import type { ProposalService } from './proposal-service.js';

export interface AgentToolsDeps {
  reader: StellarReader;
  destinations: DestinationStore;
  policies: PolicyStore;
  proposals: ProposalService;
}

/**
 * Implementación de `AgentTools` (BE2 la provee, AI la consume).
 *
 * Todo lo que el agente puede hacer pasa por aquí, y cada herramienta está
 * atada a un usuario concreto: el agente no puede pedir datos de otra persona
 * porque no existe forma de nombrarla en la firma de estas funciones.
 *
 * `createProposal` no es un atajo: entra por el mismo `ProposalService` que
 * usa la API, así que pasa por política, Guardian y auditoría igual que todo lo
 * demás. El agente no tiene un camino privilegiado.
 */
export function createAgentTools(
  deps: AgentToolsDeps,
  user: { id: string; address: string },
): AgentTools {
  return {
    async getBalances(): Promise<Balance[]> {
      return deps.reader.getBalances(user.address);
    },

    async listDestinations(): Promise<Destination[]> {
      const all = await deps.destinations.list(user.id);
      // Un destino bloqueado no debería ni aparecer ante el agente.
      return all.filter((destination) => !destination.blocked);
    },

    async createProposal(input: ProposalInput): Promise<Proposal> {
      return deps.proposals.create(user.id, user.address, input);
    },

    async getPolicySummary(): Promise<PolicySummary> {
      const [config, dailySpent] = await Promise.all([
        deps.policies.getConfig(user.id),
        deps.policies.getDailySpentByAsset(user.id),
      ]);

      return buildPolicySummary(config, dailySpent);
    },
  };
}
