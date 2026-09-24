import type {
  AccountInfo,
  Balance,
  Destination,
  HistoryStats,
  PolicyConfig,
  PriceSnapshot,
  ResolvedAction,
} from '@aegis/contracts';

/**
 * Entrada del Guardian.
 *
 * Igual que el Policy Engine, es una función pura: recibe hechos ya obtenidos
 * de la red y devuelve señales. No hace peticiones ni llama a ningún LLM.
 *
 * Aquí las acciones ya vienen resueltas (con dirección real) porque varias
 * señales miran propiedades de la cuenta destino.
 */
export interface GuardianInput {
  actions: ResolvedAction[];
  destinations: Destination[];
  balances: Balance[];
  config: PolicyConfig;
  /** Estadísticas del historial del usuario (BE1-07). */
  stats: HistoryStats;
  /** Información de cada cuenta destino, indexada por dirección (BE1). */
  accountInfoByAddress: Record<string, AccountInfo>;
  /**
   * Comisión total estimada por la simulación (BE1-08), en XLM.
   * Si no se pasa, el saldo posterior no la descuenta y se avisa en los datos.
   */
  estimatedFee?: string;
  /**
   * Foto de precios (ADR 0011).
   *
   * Sirve para dos cosas distintas: poner cifras en dólares en las señales, que
   * es lo que el usuario entiende de un vistazo, y avisar con G-10 cuando no se
   * ha podido valorar la operación.
   */
  prices?: PriceSnapshot;
  now?: Date;
}

/** Pesos de cada señal según su severidad. Provisionales (BE2-Q3). */
export const SIGNAL_WEIGHTS = {
  INFO: 0,
  WARN: 15,
  HIGH: 35,
} as const;

/** Umbrales de §8.2 para la señal G-02 (porcentaje del saldo). */
export const BALANCE_PERCENTAGE_THRESHOLDS = {
  WARN: 50,
  HIGH: 70,
} as const;

/** Múltiplo de la mediana a partir del cual G-03 considera el monto atípico. */
export const ATYPICAL_AMOUNT_RATIO = 3;

/** Días por debajo de los cuales G-06 considera "nueva" a una cuenta destino. */
export const NEW_ACCOUNT_AGE_DAYS = 7;

/** Operaciones en la última hora a partir de las cuales G-08 se dispara. */
export const UNUSUAL_VELOCITY_THRESHOLD = 5;
