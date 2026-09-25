import type { Balance, TxSummary } from './common.js';
import type { Destination } from './destination.js';
import type { PolicySummary } from './policy.js';
import type { Proposal, ProposalInput, ResolvedAction } from './proposal.js';

/**
 * Puertos internos (§5.3). Existen para que nadie bloquee a nadie:
 * cada consumidor programa contra la interfaz y usa un fake hasta que la
 * implementación real esté lista.
 */

/** Información de una cuenta observada en la red, para las señales G-05 y G-06. */
export interface AccountInfo {
  exists: boolean;
  /** Días desde la creación de la cuenta. `undefined` si no existe. */
  ageDays?: number;
  /** Códigos de activo para los que la cuenta tiene trustline. XLM siempre está. */
  trustlines: string[];
}

/** Resultado de simular una propuesta antes de firmarla (BE1-08). */
export interface SimulationResult {
  /** Comisión total estimada, en XLM. */
  fee: string;
  /** Saldo del activo principal tras ejecutar, ya descontada la comisión. */
  balanceAfter: string;
  /** Errores que impedirían el envío (p. ej. falta de trustline). */
  errors: string[];
}

/** Estadísticas derivadas del historial, usadas por G-01, G-03 y G-08. */
export interface HistoryStats {
  /** Mediana de los montos enviados. "0" si no hay historial. */
  medianOutgoingAmount: string;
  /** Direcciones con las que la cuenta ya interactuó. */
  knownCounterparties: string[];
  /** Operaciones salientes en la última hora. */
  outgoingLastHour: number;
  /** Códigos de activo que la cuenta ya ha enviado alguna vez. */
  usedAssets: string[];
}

/**
 * Estado de una transacción ya enviada (BE1-09).
 *
 * Existe para reconciliar: si el proceso muere entre que la red acepta un pago
 * y que lo anotamos, la propuesta se queda en SUBMITTED sin que nadie sepa si
 * el dinero se movió. Preguntarle al ledger es la única respuesta honesta.
 */
export interface TransactionStatus {
  /** `false` si la red no conoce esa transacción. */
  found: boolean;
  /** Solo tiene sentido si `found` es `true`. */
  successful: boolean;
}

/** Lectura de la red. Lo implementa BE1; lo consumen BE2 y AI. */
export interface StellarReader {
  getBalances(accountId: string): Promise<Balance[]>;
  getHistory(accountId: string, opts?: { limit?: number }): Promise<TxSummary[]>;
  getAccountInfo(address: string): Promise<AccountInfo>;
  getHistoryStats(accountId: string): Promise<HistoryStats>;
  simulatePayments(accountId: string, actions: ResolvedAction[]): Promise<SimulationResult>;
  /** Consulta si una transacción llegó al ledger y si tuvo éxito (BE1-09). */
  getTransactionStatus(hash: string): Promise<TransactionStatus>;
}

/** Escritura en la red. Lo implementa BE1; lo consume el orquestador (BE2). */
export interface StellarExecutor {
  /** Construye la transacción sin firmar y devuelve su XDR. */
  buildUnsigned(accountId: string, actions: ResolvedAction[]): Promise<{ xdr: string }>;
  /** Firma con el signer delegado del agente. Solo si la política lo autorizó. */
  signWithAgent(xdr: string): Promise<{ xdr: string }>;
  /** Envía a la red y devuelve el hash. */
  submit(xdr: string): Promise<{ hash: string }>;
  /** XDR para que el usuario añada el signer del agente a su cuenta (BE1-05). */
  buildDelegationXdr(accountId: string, agentPublicKey: string): Promise<{ xdr: string }>;
  /**
   * Clave pública del signer que el backend custodia.
   *
   * La expone el ejecutor porque es **derivada de la seed**, no elegida: si el
   * cliente pudiera indicar qué clave delegar, podría hacer que el usuario
   * autorizara a firmar a una cuenta que no es la nuestra.
   */
  getAgentPublicKey(): string;
}

/** Herramientas que el agente puede invocar. Lo implementa BE2; lo consume AI. */
export interface AgentTools {
  getBalances(): Promise<Balance[]>;
  listDestinations(): Promise<Destination[]>;
  createProposal(input: ProposalInput): Promise<Proposal>;
  getPolicySummary(): Promise<PolicySummary>;
}
