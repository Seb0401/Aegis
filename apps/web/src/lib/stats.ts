import {
  fromStroops,
  subtractAmounts,
  toStroops,
  type AssetCode,
  type TxSummary,
} from '@aegis/contracts';

/**
 * Cálculos de las tarjetas de estadísticas.
 *
 * Regla que se mantiene también aquí: el dinero se suma en BigInt. Lo único
 * que sale como `number` es la serie de la sparkline, que es una **forma**, no
 * una cifra — nadie va a leer un saldo de ahí, y las cantidades exactas están
 * al lado en grande.
 */

/**
 * Flujo acumulado de los movimientos de un activo, del más antiguo al más
 * reciente. Las transacciones fallidas no cuentan: no movieron nada.
 */
export function cumulativeFlow(transactions: TxSummary[], asset: AssetCode): number[] {
  const relevant = transactions
    .filter((tx) => tx.asset === asset && tx.successful)
    .slice()
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  let running = 0n;
  return relevant.map((tx) => {
    const amount = toStroops(tx.amount);
    running += tx.direction === 'IN' ? amount : -amount;
    // 10^7 stroops = 1 unidad. Se divide solo al final, para la gráfica.
    return Number(running) / 10_000_000;
  });
}

/**
 * Fracción del límite diario ya consumida, entre 0 y 1.
 *
 * `remaining` lo calcula la API sobre la ventana real de 24 h; aquí solo se
 * convierte en proporción para el anillo.
 */
export function dailyLimitUsage(maxDaily: string, remaining: string): number {
  const max = toStroops(maxDaily);
  if (max <= 0n) return 0;

  const used = toStroops(subtractAmounts(maxDaily, remaining));
  if (used <= 0n) return 0;
  if (used >= max) return 1;

  // Se escala por 10000 antes de dividir para no perder los decimales.
  return Number((used * 10_000n) / max) / 10_000;
}

/**
 * Parte del saldo que la red mantiene retenida: lo que hay menos lo gastable.
 *
 * Es la diferencia que evita creer que se puede gastar el total.
 */
export function reservedAmount(total: string, available: string): string {
  const reserved = subtractAmounts(total, available);
  return toStroops(reserved) > 0n ? reserved : '0';
}

/**
 * Cuánto se ha enviado ya a un destino, en su activo.
 *
 * Solo cuenta lo que **salió** hacia esa dirección y llegó a confirmarse. Una
 * transacción fallida no movió nada, y sumarla haría creer que vas más
 * adelantado de lo que estás — en una barra de progreso hacia una meta de
 * ahorro, eso es exactamente la mentira que no puede contar.
 *
 * En BigInt, como todo el dinero de la aplicación.
 */
export function sentTo(transactions: TxSummary[], address: string, asset: AssetCode): string {
  const stroops = transactions
    .filter(
      (tx) =>
        tx.successful &&
        tx.direction === 'OUT' &&
        tx.counterparty === address &&
        tx.asset === asset,
    )
    .reduce((suma, tx) => suma + toStroops(tx.amount), 0n);

  return fromStroops(stroops);
}

/**
 * Fracción de una meta ya cubierta, entre 0 y 1.
 *
 * Se recorta arriba: pasarse de la meta es una buena noticia, pero una barra
 * que se sale de su caja es un fallo visual. El exceso se cuenta con la cifra
 * de al lado, no estirando la barra.
 *
 * Devuelve `null` cuando no hay meta contra la que medir, para que quien lo
 * use enseñe otra cosa en vez de un 0% que parecería un fracaso.
 */
export function goalProgress(sent: string, target: string | null): number | null {
  if (!target) return null;

  const meta = toStroops(target);
  if (meta <= 0n) return null;

  // A número solo para la anchura de la barra: la cifra exacta se enseña
  // aparte y sale de las cadenas, no de esto.
  return Math.min(1, Number(toStroops(sent)) / Number(meta));
}
