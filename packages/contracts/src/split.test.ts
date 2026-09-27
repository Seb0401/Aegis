import { describe, expect, it } from 'vitest';
import { addAmounts } from './money.js';
import { SplitRuleSchema, splitAmount, unassignedBasisPoints, type SplitShare } from './split.js';

/**
 * Aquí se reparte dinero de verdad, así que lo que hay que fijar no es que el
 * reparto sea «aproximadamente» correcto: es que **la suma cuadre exacta** y
 * que nunca salga más de lo que entró. Un stroop perdido por división entera,
 * repetido en cada nómina, es un fallo que nadie ve hasta que alguien suma.
 */

function partes(...bp: number[]): SplitShare[] {
  return bp.map((basisPoints, indice) => ({ destinationId: `dest_${indice}`, basisPoints }));
}

describe('splitAmount', () => {
  it('reparte en partes iguales cuando la división es exacta', () => {
    expect(splitAmount('100', partes(5000, 5000))).toEqual(['50.0000000', '50.0000000']);
  });

  it('no pierde ni un stroop cuando la división no es exacta', () => {
    // Tres partes de un tercio: la división entera deja restos, y esos restos
    // son dinero que tiene que acabar en algún sitio.
    const trozos = splitAmount('100', partes(3333, 3333, 3334));

    expect(addAmounts(...trozos)).toBe('100.0000000');
  });

  it('nunca reparte más de lo que entró', () => {
    for (const importe of ['0.0000001', '1', '13.3333333', '999999.9999999']) {
      const trozos = splitAmount(importe, partes(3333, 3333, 3334));
      const suma = addAmounts(...trozos);

      expect(Number(suma), `${importe} repartido suma ${suma}`).toBeLessThanOrEqual(
        Number(importe),
      );
    }
  });

  it('deja fuera lo que no se asigna', () => {
    // 60% repartido, 40% se queda en la cuenta: «aparta esto y déjame el
    // resto para vivir» es el caso normal, no la excepción.
    const trozos = splitAmount('100', partes(4000, 2000));

    expect(trozos).toEqual(['40.0000000', '20.0000000']);
    expect(addAmounts(...trozos)).toBe('60.0000000');
  });

  it('los stroops sobrantes no van siempre al primero', () => {
    // Si el resto se lo quedara siempre quien está arriba de la lista, el
    // orden en que configuraste los objetivos te haría ganar dinero en
    // silencio. Con 0.0000002 y tres partes iguales solo hay dos stroops
    // para tres: los reparte el resto mayor, no la posición.
    const trozos = splitAmount('0.0000002', partes(3333, 3333, 3334));

    expect(addAmounts(...trozos)).toBe('0.0000002');
    // La parte más grande (3334) es la que más resto acumula, así que se
    // lleva uno de los dos stroops.
    expect(trozos[2]).toBe('0.0000001');
  });

  it('con importe cero, todo a cero', () => {
    expect(splitAmount('0', partes(5000, 5000))).toEqual(['0.0000000', '0.0000000']);
  });

  it('sin partes, no reparte nada', () => {
    expect(splitAmount('100', [])).toEqual([]);
  });

  it('es determinista: el mismo reparto da siempre lo mismo', () => {
    // Un reparto que dependiera del orden de un `Map` o de la hora sería
    // imposible de auditar después.
    const primero = splitAmount('777.7777777', partes(1111, 2222, 3333, 3334));
    const segundo = splitAmount('777.7777777', partes(1111, 2222, 3333, 3334));

    expect(primero).toEqual(segundo);
  });
});

describe('unassignedBasisPoints', () => {
  it('dice cuánto se queda en la cuenta', () => {
    expect(unassignedBasisPoints({ shares: partes(4000, 2000) })).toBe(4000);
    expect(unassignedBasisPoints({ shares: partes(10_000) })).toBe(0);
  });
});

describe('SplitRuleSchema', () => {
  const base = { enabled: true, asset: 'XLM' as const, minimumIncome: '1' };

  it('acepta un reparto que no llega al 100%', () => {
    expect(SplitRuleSchema.safeParse({ ...base, shares: partes(4000, 2000) }).success).toBe(true);
  });

  it('rechaza pasarse del 100%', () => {
    const resultado = SplitRuleSchema.safeParse({ ...base, shares: partes(6000, 5000) });

    expect(resultado.success).toBe(false);
  });

  it('rechaza el mismo destino dos veces', () => {
    // Dos entradas para el mismo sitio no son un reparto: son una suma escrita
    // de forma confusa, y al editarlas nadie sabría cuál manda.
    const resultado = SplitRuleSchema.safeParse({
      ...base,
      shares: [
        { destinationId: 'dest_1', basisPoints: 2000 },
        { destinationId: 'dest_1', basisPoints: 3000 },
      ],
    });

    expect(resultado.success).toBe(false);
  });

  it('rechaza una parte de cero', () => {
    expect(SplitRuleSchema.safeParse({ ...base, shares: partes(0) }).success).toBe(false);
  });
});
