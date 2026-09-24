import type {
  AssetCode,
  Balance,
  Destination,
  PolicyConfig,
  PolicyDecisionKind,
  PriceSnapshot,
  ProposedAction,
} from '@aegis/contracts';

/**
 * Todo lo que el motor necesita para decidir. El motor es una función pura:
 * no consulta la red, no lee la base de datos y no llama a ningún LLM.
 * Si algo no está en esta entrada, no puede influir en la decisión.
 */
export interface PolicyEvaluationInput {
  config: PolicyConfig;
  /** Acciones tal y como las propuso el agente, sin resolver. */
  actions: ProposedAction[];
  /** Destinos registrados del usuario. Un `destinationId` fuera de aquí se deniega. */
  destinations: Destination[];
  /** Saldos actuales del usuario. */
  balances: Balance[];
  /** Importe ya ejecutado en la ventana de 24 h, por activo. */
  dailySpentByAsset?: Partial<Record<AssetCode, string>>;
  /** Operaciones ejecutadas en la última hora (P-05). */
  operationsLastHour?: number;
  /**
   * Direcciones con las que el usuario ya ha interactuado en la cadena.
   * Un destino registrado pero sin historial sigue contando como "nuevo" (P-03).
   */
  knownCounterparties?: string[];
  /** Momento de la evaluación. Se inyecta para que los tests sean deterministas. */
  now?: Date;
  /** Caducidad de la propuesta, si ya se fijó (P-09). */
  expiresAt?: string;

  /**
   * Foto de precios para los topes en dólares (ADR 0011).
   *
   * Llega como dato ya obtenido: el motor sigue siendo una función pura y no
   * consulta ningún oráculo. Si falta, o si falta el precio de algún activo de
   * la propuesta, se dispara P-10 y la decisión pasa al usuario.
   */
  prices?: PriceSnapshot;

  /**
   * Valor en dólares ya comprometido en las últimas 24 h (P-02 en USD).
   *
   * Lo calcula quien llama usando el precio que se registró con cada propuesta,
   * no el de hoy: así el acumulado refleja lo que valía cada operación cuando
   * se autorizó.
   */
  dailySpentUsd?: string;
}

/** Severidad relativa: DENY manda sobre REQUIRE_USER, que manda sobre AUTO_APPROVE. */
export const DECISION_PRECEDENCE: Record<PolicyDecisionKind, number> = {
  AUTO_APPROVE: 0,
  REQUIRE_USER: 1,
  DENY: 2,
};
