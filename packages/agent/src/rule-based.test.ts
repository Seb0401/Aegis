import { FIXTURE_DESTINATIONS, type Destination } from '@aegis/contracts';
import { describe, expect, it } from 'vitest';
import { createFakeAgentTools } from './fake-tools.js';
import { createRuleBasedAgent, matchDestinations, splitEvenly } from './rule-based.js';

/**
 * El agente de reglas.
 *
 * Lo que hay que fijar no es cuánto entiende, sino **qué hace cuando no
 * entiende**. Un agente que adivina con dinero es el problema que este
 * proyecto intenta resolver, y eso no cambia porque quien adivine sea un `if`
 * en vez de un modelo de lenguaje.
 */

const agente = createRuleBasedAgent();

async function pedir(message: string, destinations?: Destination[]) {
  const tools = createFakeAgentTools(destinations ? { destinations } : {});
  const resultado = await agente.handleMessage({ message, tools });
  return { ...resultado, tools };
}

describe('apartar para un objetivo concreto', () => {
  it('entiende «aparta 20 para el viaje»', async () => {
    const { reply, proposals } = await pedir('aparta 20 para el viaje');

    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.actions).toHaveLength(1);
    expect(proposals[0]!.actions[0]!.amount).toBe('20');
    expect(reply).toContain('Viaje');
  });

  it('encuentra el objetivo aunque no escribas el nombre entero', async () => {
    const { proposals } = await pedir('guarda 15 para cusco', [
      { ...FIXTURE_DESTINATIONS[0]!, label: 'Viaje a Cusco' },
    ]);

    expect(proposals).toHaveLength(1);
  });

  it('no inventa un destino que no existe', async () => {
    const { reply, proposals } = await pedir('aparta 20 para la moto');

    expect(proposals).toHaveLength(0);
    expect(reply).toContain('moto');
    expect(reply).toContain('Regístralo');
  });

  it('pregunta en vez de elegir cuando el nombre encaja con varios', async () => {
    // Mandar dinero al destino equivocado por resolver una ambigüedad a ojo
    // no tiene vuelta atrás.
    const { reply, proposals } = await pedir('aparta 20 para el viaje', [
      { ...FIXTURE_DESTINATIONS[0]!, id: 'd1', label: 'Viaje a Cusco' },
      { ...FIXTURE_DESTINATIONS[1]!, id: 'd2', label: 'Viaje a Lima' },
    ]);

    expect(proposals).toHaveLength(0);
    expect(reply).toContain('Cusco');
    expect(reply).toContain('Lima');
    expect(reply).toContain('¿A cuál');
  });

  it('no manda dinero a un destino bloqueado', async () => {
    const { proposals } = await pedir('aparta 20 para el viaje', [
      { ...FIXTURE_DESTINATIONS[0]!, label: 'Viaje', blocked: true },
    ]);

    expect(proposals).toHaveLength(0);
  });
});

describe('fracciones', () => {
  it('entiende «la mitad de»', async () => {
    const { proposals } = await pedir('reparte la mitad de 300 entre mis objetivos');

    const total = proposals[0]!.actions.reduce((suma, a) => suma + Number(a.amount), 0);
    expect(total).toBeCloseTo(150, 5);
  });

  it('entiende los porcentajes', async () => {
    const { proposals } = await pedir('reparte el 30% de 300 entre mis objetivos');

    const total = proposals[0]!.actions.reduce((suma, a) => suma + Number(a.amount), 0);
    expect(total).toBeCloseTo(90, 5);
  });

  it('nunca propone más de lo pedido al aplicar una fracción', async () => {
    // Un tercio de 100 no es exacto. Redondear hacia arriba propondría un
    // céntimo más de lo que la persona dijo, y la regla AI-05 no admite
    // excepciones por redondeo.
    const { proposals } = await pedir('reparte un tercio de 100 entre mis objetivos');

    const total = proposals[0]!.actions.reduce((suma, a) => suma + Number(a.amount), 0);
    expect(total).toBeLessThanOrEqual(100 / 3);
  });
});

describe('preguntas', () => {
  it('dice cuánto queda del límite de hoy', async () => {
    const { reply, proposals } = await pedir('¿cuánto me queda hoy?');

    expect(proposals).toHaveLength(0);
    expect(reply).toContain('20');
  });

  it('sigue diciendo el saldo', async () => {
    const { reply } = await pedir('¿cuánto tengo?');

    expect(reply).toContain('disponibles');
  });
});

describe('lo que no entiende', () => {
  it('lo dice, y explica qué sí sabe hacer', async () => {
    const { reply, proposals } = await pedir('cómprame bitcoin');

    expect(proposals).toHaveLength(0);
    expect(reply).toContain('reparte');
  });

  it('no crea nada con una petición sin cantidad', async () => {
    const { proposals } = await pedir('aparta algo para el viaje');

    expect(proposals).toHaveLength(0);
  });
});

describe('matchDestinations', () => {
  const destinos = [
    { ...FIXTURE_DESTINATIONS[0]!, id: 'd1', label: 'Viaje a Cusco' },
    { ...FIXTURE_DESTINATIONS[1]!, id: 'd2', label: 'Laptop' },
  ];

  it('prefiere la coincidencia exacta a la parcial', () => {
    const conAmbas = [...destinos, { ...FIXTURE_DESTINATIONS[0]!, id: 'd3', label: 'Viaje' }];

    expect(matchDestinations(conAmbas, 'viaje').map((d) => d.id)).toEqual(['d3']);
  });

  it('ignora acentos y mayúsculas', () => {
    expect(matchDestinations([{ ...destinos[0]!, label: 'Máquina' }], 'maquina')).toHaveLength(1);
  });

  it('no encaja con una palabra demasiado corta', () => {
    // «la» encajaría con casi todo. Preferimos no entender a apuntar mal.
    expect(matchDestinations(destinos, 'la')).toHaveLength(0);
  });
});

describe('splitEvenly', () => {
  it('reparte sin perder stroops', () => {
    expect(splitEvenly('100', 3)).toEqual(['33.3333334', '33.3333333', '33.3333333']);
  });
});
