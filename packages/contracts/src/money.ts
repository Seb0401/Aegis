import { STELLAR_DECIMALS } from './common.js';

/**
 * Aritmética de montos sin coma flotante.
 *
 * Todo el backend compara y suma dinero con estas funciones. Usar `Number` para
 * sumar saldos introduce errores de redondeo que, en un sistema que autoriza
 * pagos, se convierten en decisiones equivocadas.
 *
 * Internamente se trabaja con BigInt en "stroops": el entero que resulta de
 * multiplicar por 10^7.
 */

const SCALE = 10n ** BigInt(STELLAR_DECIMALS);

/** Convierte un string decimal a stroops. Lanza si el formato es inválido. */
export function toStroops(amount: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,7}))?$/.exec(amount.trim());
  if (!match) {
    throw new Error(`Monto inválido: "${amount}"`);
  }
  const [, sign, whole, fraction = ''] = match;
  const padded = fraction.padEnd(STELLAR_DECIMALS, '0');
  const value = BigInt(whole!) * SCALE + BigInt(padded || '0');
  return sign === '-' ? -value : value;
}

/** Convierte stroops de vuelta a string decimal con 7 decimales. */
export function fromStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(STELLAR_DECIMALS, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Suma una lista de montos decimales. */
export function addAmounts(...amounts: string[]): string {
  return fromStroops(amounts.reduce((acc, a) => acc + toStroops(a), 0n));
}

/** Resta `b` de `a`. El resultado puede ser negativo. */
export function subtractAmounts(a: string, b: string): string {
  return fromStroops(toStroops(a) - toStroops(b));
}

/**
 * Multiplica dos montos decimales, por ejemplo una cantidad por su precio.
 *
 * Se divide entre SCALE porque multiplicar dos valores escalados por 10^7 da un
 * resultado escalado por 10^14. La división trunca, así que el resultado nunca
 * sobrestima un valor: al comprobar límites, redondear hacia abajo es el lado
 * seguro del error.
 */
export function multiplyAmounts(a: string, b: string): string {
  return fromStroops((toStroops(a) * toStroops(b)) / SCALE);
}

/** Multiplica un monto por un entero. */
export function multiplyAmount(amount: string, factor: number): string {
  if (!Number.isInteger(factor)) {
    throw new Error('multiplyAmount solo acepta factores enteros');
  }
  return fromStroops(toStroops(amount) * BigInt(factor));
}

/** -1 si a < b, 0 si son iguales, 1 si a > b. */
export function compareAmounts(a: string, b: string): -1 | 0 | 1 {
  const left = toStroops(a);
  const right = toStroops(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isGreaterThan(a: string, b: string): boolean {
  return compareAmounts(a, b) === 1;
}

export function isLessThan(a: string, b: string): boolean {
  return compareAmounts(a, b) === -1;
}

export function isZero(amount: string): boolean {
  return toStroops(amount) === 0n;
}

export function isNegative(amount: string): boolean {
  return toStroops(amount) < 0n;
}

export function maxAmount(a: string, b: string): string {
  return isGreaterThan(a, b) ? a : b;
}

/**
 * Porcentaje que `part` representa de `total`, con dos decimales.
 * Devuelve 0 si `total` es cero, para no propagar divisiones por cero a las señales.
 */
export function percentageOf(part: string, total: string): number {
  const totalStroops = toStroops(total);
  if (totalStroops === 0n) return 0;
  // Se escala por 10000 para conservar dos decimales sin usar floats.
  const scaled = (toStroops(part) * 10000n) / totalStroops;
  return Number(scaled) / 100;
}

/** Ratio `amount / reference` como número. Devuelve `Infinity` si la referencia es cero. */
export function ratioOf(amount: string, reference: string): number {
  const refStroops = toStroops(reference);
  if (refStroops === 0n) return Number.POSITIVE_INFINITY;
  return Number((toStroops(amount) * 10000n) / refStroops) / 10000;
}

/** Mediana de una lista de montos. Devuelve "0" si la lista está vacía. */
export function medianAmount(amounts: string[]): string {
  if (amounts.length === 0) return '0';
  const sorted = amounts.map(toStroops).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return fromStroops(sorted[middle]!);
  }
  return fromStroops((sorted[middle - 1]! + sorted[middle]!) / 2n);
}

/** Formatea un monto para mostrarlo: quita ceros finales innecesarios. */
export function formatAmount(amount: string): string {
  const normalized = fromStroops(toStroops(amount));
  return normalized.replace(/0+$/, '').replace(/\.$/, '');
}
