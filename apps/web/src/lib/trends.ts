import {
  addAmounts,
  subtractAmounts,
  toStroops,
  type AssetCode,
  type TxSummary,
} from '@aegis/contracts';

/**
 * Cómo vas, no solo cuánto llevas.
 *
 * Una lista de pagos dice lo que hiciste; un ritmo dice si vas a llegar. Es la
 * diferencia entre un registro y algo que sirve para decidir.
 *
 * Todo el dinero se suma en BigInt. Lo único que sale como `number` son las
 * semanas que faltan, que es una estimación y se enseña como tal.
 */

const SEMANA_MS = 7 * 24 * 3600_000;

/** Lo que salió hacia una dirección dentro de una ventana de tiempo. */
export function sentBetween(
  transactions: TxSummary[],
  address: string,
  asset: AssetCode,
  desde: Date,
  hasta: Date,
): string {
  const relevantes = transactions.filter((tx) => {
    if (!tx.successful || tx.direction !== 'OUT') return false;
    if (tx.counterparty !== address || tx.asset !== asset) return false;

    const cuando = Date.parse(tx.createdAt);
    return Number.isFinite(cuando) && cuando >= desde.getTime() && cuando < hasta.getTime();
  });

  return addAmounts('0', ...relevantes.map((tx) => tx.amount));
}

export interface Ritmo {
  /** Lo apartado en las últimas `semanas`. */
  reciente: string;
  /** Lo apartado en el periodo anterior de la misma duración. */
  anterior: string;
  /** Diferencia entre los dos. Negativa si has bajado el ritmo. */
  diferencia: string;
  /** Media por semana del periodo reciente. */
  porSemana: string;
}

/**
 * Compara las últimas semanas con las anteriores.
 *
 * Dos ventanas del mismo tamaño y pegadas: comparar «este mes» con «el mes
 * pasado» a mitad de mes compararía quince días contra treinta y diría que
 * vas peor cuando no es verdad.
 */
export function pace(
  transactions: TxSummary[],
  address: string,
  asset: AssetCode,
  semanas = 4,
  ahora = new Date(),
): Ritmo {
  const ventana = semanas * SEMANA_MS;
  const finReciente = ahora;
  const inicioReciente = new Date(ahora.getTime() - ventana);
  const inicioAnterior = new Date(ahora.getTime() - ventana * 2);

  const reciente = sentBetween(transactions, address, asset, inicioReciente, finReciente);
  const anterior = sentBetween(transactions, address, asset, inicioAnterior, inicioReciente);

  return {
    reciente,
    anterior,
    diferencia: subtractAmounts(reciente, anterior),
    porSemana: divideAmount(reciente, semanas),
  };
}

/**
 * Semanas que faltan para la meta al ritmo actual.
 *
 * `null` cuando no se puede estimar: sin ritmo no hay previsión, y un «nunca»
 * o un infinito serían peores que no decir nada. Redondea hacia arriba, que es
 * el lado honesto de una estimación de plazos.
 */
export function weeksToGoal(restante: string, porSemana: string): number | null {
  const falta = toStroops(restante);
  if (falta <= 0n) return 0;

  const ritmo = toStroops(porSemana);
  if (ritmo <= 0n) return null;

  return Math.ceil(Number(falta) / Number(ritmo));
}

/** División entera de un importe. Los stroops sobrantes se pierden a propósito: es una media. */
function divideAmount(amount: string, divisor: number): string {
  if (divisor <= 0) return '0.0000000';

  const stroops = toStroops(amount) / BigInt(Math.trunc(divisor));
  return `${stroops / 10_000_000n}.${String(stroops % 10_000_000n).padStart(7, '0')}`;
}
