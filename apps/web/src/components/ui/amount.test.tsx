/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Amount } from './amount';

/**
 * Una cifra de dinero que se anima tiene una obligación que las demás no
 * tienen: **acabar exactamente en el número de verdad**. Da igual lo bonita
 * que sea la cuenta atrás si el último fotograma redondea un decimal.
 *
 * Estos tests miran el resultado final, que es el que alguien lee antes de
 * firmar. En jsdom no hay `requestAnimationFrame` avanzando ni `matchMedia`,
 * así que el componente pinta el valor de destino directamente, que es
 * justamente el caso que hay que fijar: sin JavaScript de animación, la cifra
 * correcta.
 */
describe('Amount', () => {
  it('imprime el importe formateado, sin ceros de relleno', () => {
    render(<Amount value="250.0000000" />);

    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('no pierde decimales significativos', () => {
    // El reparto de 50 entre 3 objetivos deja estos decimales, y perder el
    // último significaría que la suma de lo que se enseña no da el total.
    render(<Amount value="13.3333334" />);

    expect(screen.getByText('13.3333334')).toBeInTheDocument();
  });

  it('acompaña el activo sin pegarlo a la cifra', () => {
    const { container } = render(<Amount value="4" asset="USDC_TEST" />);

    expect(container.textContent).toBe('4 USDC_TEST');
  });

  it('aguanta un importe que no es un número, sin romper la pantalla', () => {
    // Nunca debería llegar, pero esto se renderiza junto al botón de aprobar:
    // preferimos una cifra rara a una pantalla en blanco.
    expect(() => render(<Amount value="no-es-un-numero" />)).not.toThrow();
  });
});
