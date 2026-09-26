/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOURS, marcarTourVisto, yaVioElTour } from './tour';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('guiones', () => {
  it('los dos tours tienen pasos y empiezan sin señalar nada', () => {
    // El primer paso de ambos se centra: resaltar una caja antes de decir de
    // qué va esto deja a la persona mirando un recuadro sin contexto.
    for (const [nombre, pasos] of Object.entries(TOURS)) {
      expect(pasos.length, nombre).toBeGreaterThan(2);
      expect(pasos[0]?.target, nombre).toBeUndefined();
    }
  });

  it('cada paso que señala algo lo hace por `data-tour`, no por clases', () => {
    // Una clase de CSS se renombra al refactorizar y el tour se rompe en
    // silencio. El anclaje explícito es lo que hace que un renombrado que lo
    // rompa se note.
    for (const pasos of Object.values(TOURS)) {
      for (const paso of pasos) {
        if (paso.target) expect(paso.target).toMatch(/^[a-z-]+$/);
      }
    }
  });

  it('el tour del jurado no le pide hacer nada', () => {
    // Quien lo abre sin nadie al lado tiene que poder leerlo entero sin tocar.
    const textos = TOURS.jurado.map((paso) => paso.body.toLowerCase()).join(' ');

    expect(textos).not.toContain('haz clic');
    expect(textos).not.toContain('pulsa aquí');
  });
});

describe('recordar que ya se vio', () => {
  it('lo recuerda entre visitas', () => {
    expect(yaVioElTour()).toBe(false);

    marcarTourVisto();

    expect(yaVioElTour()).toBe(true);
  });

  it('con el almacenamiento bloqueado, no se enseña ni revienta', () => {
    // En navegación privada `localStorage` puede lanzar. Un tour que tumba la
    // aplicación por no poder recordar si ya se vio sería absurdo, y repetirlo
    // en cada carga sería molesto: ante la duda, no se enseña.
    // Se interviene el prototipo, no `window.localStorage`: jsdom resuelve
    // esa propiedad en cada acceso, así que un espía puesto sobre el objeto
    // que devuelve una vez no afecta a la siguiente lectura.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });

    expect(yaVioElTour()).toBe(true);
    expect(() => marcarTourVisto()).not.toThrow();
  });
});
