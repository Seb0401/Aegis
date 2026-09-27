import { z } from 'zod';
import { AmountSchema, AssetCodeSchema, IdSchema } from './common.js';
import { fromStroops, toStroops } from './money.js';

/**
 * Reparto automático de los ingresos (BE2-13).
 *
 * Es la promesa del producto: que no tengas que acordarte. Defines qué parte
 * va a cada objetivo y, cuando entra dinero, Aegis actúa sin que se lo pidas
 * —dentro de tus límites y pasando por el Guardian, como todo lo demás—.
 */

/**
 * Las partes van en **puntos básicos** (2500 = 25%), y enteros.
 *
 * Con porcentajes decimales en coma flotante, tres partes de 33,33% no suman
 * 99,99 sino 99,99000000000001, y a partir de ahí el reparto de dinero real
 * arrastra el error. Con enteros, lo que suma es exactamente lo que se ve.
 */
export const SplitShareSchema = z.object({
  destinationId: IdSchema,
  basisPoints: z.number().int().min(1).max(10_000),
});
export type SplitShare = z.infer<typeof SplitShareSchema>;

export const MAX_BASIS_POINTS = 10_000;

export const SplitRuleSchema = z
  .object({
    /** Apagarla no borra el reparto: se conserva para volver a encenderlo. */
    enabled: z.boolean().default(false),
    asset: AssetCodeSchema,
    /**
     * Por debajo de esto la regla no actúa.
     *
     * Existe porque un ingreso de céntimos generaría cuatro pagos cuyas
     * comisiones se comerían el reparto, y porque una cuenta que recibe
     * movimientos pequeños a menudo llenaría la bandeja de propuestas.
     */
    minimumIncome: AmountSchema.default('1'),
    shares: z.array(SplitShareSchema).min(1).max(8),
  })
  .refine(
    (rule) =>
      rule.shares.reduce((total, share) => total + share.basisPoints, 0) <= MAX_BASIS_POINTS,
    { message: 'Las partes no pueden sumar más del 100%.', path: ['shares'] },
  )
  .refine(
    (rule) => new Set(rule.shares.map((share) => share.destinationId)).size === rule.shares.length,
    { message: 'Hay un destino repetido en el reparto.', path: ['shares'] },
  );
export type SplitRule = z.infer<typeof SplitRuleSchema>;

/**
 * Parte del ingreso que **no** se reparte y se queda en la cuenta.
 *
 * Que las partes no tengan que sumar 100 es deliberado: «aparta el 60% y
 * déjame el resto para vivir» es lo que hace de verdad quien usa esto.
 */
export function unassignedBasisPoints(rule: Pick<SplitRule, 'shares'>): number {
  return MAX_BASIS_POINTS - rule.shares.reduce((total, share) => total + share.basisPoints, 0);
}

/**
 * Reparte un importe según las partes, sin perder ni inventar un stroop.
 *
 * La división entera deja restos: repartir 100 en tres partes de 33,33% da
 * tres trozos que suman menos que el total asignado. Esos stroops sobrantes no
 * se pueden tirar —son dinero— ni dar siempre al primero de la lista, que
 * beneficiaría en silencio a quien esté arriba.
 *
 * Se usa el método del **resto mayor**: cada parte se queda con su división
 * entera y los stroops que sobran van, de uno en uno, a quien tenía el resto
 * más grande. Es lo que hacen los repartos de escaños, y por la misma razón:
 * es determinista, no favorece al orden de la lista y la suma cuadra exacta.
 *
 * Nunca devuelve más de lo que entró: lo repartido es, como mucho, la parte
 * asignada del ingreso.
 */
export function splitAmount(amount: string, shares: SplitShare[]): string[] {
  if (shares.length === 0) return [];

  const total = toStroops(amount);
  if (total <= 0n) return shares.map(() => fromStroops(0n));

  const base = MAX_BASIS_POINTS;
  const asignados = shares.reduce((suma, share) => suma + share.basisPoints, 0);

  // El objetivo es lo que corresponde al conjunto de las partes, redondeado
  // hacia abajo: así el reparto no puede pasarse del ingreso ni aunque las
  // partes sumen justo 100%.
  const objetivo = (total * BigInt(asignados)) / BigInt(base);

  const trozos = shares.map((share) => {
    const producto = total * BigInt(share.basisPoints);
    return {
      entero: producto / BigInt(base),
      resto: producto % BigInt(base),
    };
  });

  let repartido = trozos.reduce((suma, trozo) => suma + trozo.entero, 0n);

  // Índices ordenados por resto descendente; a igualdad de resto, el primero
  // de la lista. Empatar y decidir por orden es arbitrario, pero es
  // determinista, que es lo que importa para poder reproducir un reparto.
  const porResto = trozos
    .map((trozo, indice) => ({ indice, resto: trozo.resto }))
    .sort((a, b) => (b.resto === a.resto ? a.indice - b.indice : b.resto > a.resto ? 1 : -1));

  const resultado = trozos.map((trozo) => trozo.entero);

  for (const { indice } of porResto) {
    if (repartido >= objetivo) break;
    resultado[indice] = resultado[indice]! + 1n;
    repartido += 1n;
  }

  return resultado.map(fromStroops);
}
