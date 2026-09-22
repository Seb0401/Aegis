'use client';

import type {
  AgentMessageRequest,
  ApproveProposalRequest,
  CreateDestinationRequest,
  UpdateDestinationInput,
  UpdatePolicyInput,
} from '@aegis/contracts';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient, useAuth } from '../auth/auth-context';

/**
 * Hooks de datos (FE-02).
 *
 * Las claves de consulta viven aquí y en un solo sitio: cuando una mutación
 * cambia algo (aprobar, pausar, crear un destino) hay que invalidar justo lo
 * que dejó de ser cierto, y eso solo sale bien si las claves no están
 * desparramadas por las pantallas.
 */

export const queryKeys = {
  balances: ['balances'] as const,
  transactions: (limit: number) => ['transactions', limit] as const,
  destinations: ['destinations'] as const,
  proposals: (limit: number) => ['proposals', limit] as const,
  proposal: (id: string) => ['proposal', id] as const,
  policy: ['policy'] as const,
  audit: (limit: number) => ['audit', limit] as const,
};

/** Solo se consulta cuando hay sesión: sin token, la API responde 401. */
function useAuthenticated(): boolean {
  return useAuth().status === 'authenticated';
}

export function useBalances() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.balances,
    queryFn: () => client.getBalances(),
    enabled: useAuthenticated(),
  });
}

export function usePolicy() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.policy,
    queryFn: () => client.getPolicy(),
    enabled: useAuthenticated(),
  });
}

export function useDestinations() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.destinations,
    queryFn: () => client.getDestinations(),
    enabled: useAuthenticated(),
  });
}

export function useTransactions(limit = 20) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.transactions(limit),
    queryFn: () => client.getTransactions(limit),
    enabled: useAuthenticated(),
  });
}

/**
 * Lista de propuestas.
 *
 * `refetchInterval` es un sondeo deliberado: la API todavía no publica los
 * cambios de estado (SIGNED → SUBMITTED → CONFIRMED) por SSE ni websocket, así
 * que para que el historial se mueva solo hay que preguntar. Si algún día
 * aparece un canal en vivo, se cambia aquí y nada más.
 */
export function useProposals(limit = 20, { poll = false }: { poll?: boolean } = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.proposals(limit),
    queryFn: () => client.getProposals(limit),
    enabled: useAuthenticated(),
    ...(poll ? { refetchInterval: 5000 } : {}),
  });
}

export function useProposal(id: string | null) {
  const client = useApiClient();
  const authenticated = useAuthenticated();
  return useQuery({
    queryKey: queryKeys.proposal(id ?? ''),
    queryFn: () => client.getProposal(id as string),
    enabled: authenticated && id !== null,
  });
}

export function useAudit(limit = 50) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.audit(limit),
    queryFn: () => client.getAudit(limit),
    enabled: useAuthenticated(),
  });
}

// ── Mutaciones ──────────────────────────────────────────────────────

/** Clave de la mutación del agente, para poder preguntar desde fuera si está pensando. */
const AGENT_MESSAGE_KEY = ['agent-message'] as const;

/**
 * ¿Hay un mensaje al agente en vuelo?
 *
 * Lo usa Jupi para poner cara de estar pensando mientras el agente trabaja,
 * aunque la mascota viva en otro componente distinto del chat.
 */
export function useAgentThinking(): boolean {
  return useIsMutating({ mutationKey: AGENT_MESSAGE_KEY }) > 0;
}

export function useSendMessage() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: AGENT_MESSAGE_KEY,
    mutationFn: (input: AgentMessageRequest) => client.sendMessage(input),
    onSuccess: () => {
      // Un mensaje al agente puede crear propuestas y consumir límite diario.
      void queryClient.invalidateQueries({ queryKey: ['proposals'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.policy });
    },
  });
}

export function useApproveProposal() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: ApproveProposalRequest }) =>
      client.approveProposal(id, body ?? {}),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.proposal(data.proposal.id), data);
      void queryClient.invalidateQueries({ queryKey: ['proposals'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.balances });
      void queryClient.invalidateQueries({ queryKey: queryKeys.policy });
    },
  });
}

export function useRejectProposal() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      client.rejectProposal(id, reason ? { reason } : {}),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.proposal(data.proposal.id), data);
      void queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
  });
}

/** Alta de un destino (FE-10). Es la única puerta por la que entra una dirección nueva. */
export function useCreateDestination() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDestinationRequest) => client.createDestination(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.destinations });
    },
  });
}

/** Renombrar, marcar de confianza o bloquear (FE-10). */
export function useUpdateDestination() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDestinationInput }) =>
      client.updateDestination(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.destinations });
      // `trusted` y `blocked` cambian lo que la política y el Guardian deciden,
      // así que lo que ya estaba propuesto puede evaluarse distinto a partir de ahora.
      void queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
  });
}

/**
 * XDR sin firmar que añade el signer del agente a la cuenta (FE-04).
 *
 * No invalida nada: preparar la delegación no cambia el estado del servidor,
 * solo construye una transacción que después firma el usuario.
 */
export function usePrepareDelegation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: (agentPublicKey: string) => client.prepareDelegation(agentPublicKey),
  });
}

/** Edición de límites y modo de operación (FE-09). */
export function useUpdatePolicy() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePolicyInput) => client.updatePolicy(input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.policy, data);
    },
  });
}

/** Kill switch (FE-12). */
export function useSetPaused() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paused: boolean) => client.setPaused(paused),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.policy, data);
    },
  });
}
