import {
  FIXTURE_BALANCES,
  FIXTURE_DESTINATIONS,
  ProposalSchema,
  type AgentTools,
  type Balance,
  type Destination,
  type PolicySummary,
  type Proposal,
  type ProposalInput,
} from '@aegis/contracts';

export interface FakeAgentToolsOptions {
  balances?: Balance[];
  destinations?: Destination[];
  policySummary?: PolicySummary;
  now?: () => Date;
}

/** In-memory AgentTools for package tests, evals, and local demos. */
export function createFakeAgentTools(options: FakeAgentToolsOptions = {}): AgentTools & {
  proposals: Proposal[];
} {
  const balances = structuredClone(options.balances ?? FIXTURE_BALANCES);
  const destinations = structuredClone(options.destinations ?? FIXTURE_DESTINATIONS);
  const proposals: Proposal[] = [];
  let sequence = 0;

  const policySummary: PolicySummary = options.policySummary ?? {
    mode: 'MANUAL',
    paused: false,
    maxAmountPerOperation: '5',
    maxDailyAmount: '20',
    minimumReserve: '10',
    allowedAssets: ['XLM', 'USDC_TEST'],
    remainingDailyAmount: '20',
    // Topes en dólares (ADR 0011). El agente los lee para no proponer algo que
    // ya sabemos que va a escalar al usuario.
    maxAmountPerOperationUsd: '5',
    remainingDailyAmountUsd: '20',
  };

  return {
    proposals,
    async getBalances() {
      return structuredClone(balances);
    },
    async listDestinations() {
      return structuredClone(destinations.filter((destination) => !destination.blocked));
    },
    async createProposal(input: ProposalInput) {
      const now = (options.now?.() ?? new Date()).toISOString();
      const proposal = ProposalSchema.parse({
        id: `proposal_fake_${++sequence}`,
        userId: 'user_fake',
        status: 'DRAFT',
        summary: input.summary,
        actions: input.actions,
        policy: null,
        risk: null,
        explanation: null,
        unsignedXdr: null,
        txHash: null,
        failureReason: null,
        createdAt: now,
        expiresAt: new Date(Date.parse(now) + 10 * 60_000).toISOString(),
        updatedAt: now,
      });
      proposals.push(proposal);
      return proposal;
    },
    async getPolicySummary() {
      return structuredClone(policySummary);
    },
  };
}
