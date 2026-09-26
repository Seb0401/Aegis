'use client';

import { useCountUp } from '@/lib/motion';
import { cn, formatAmount } from '@/lib/utils';

/**
 * Una cifra de dinero que llega contando.
 *
 * Cuenta con **los mismos decimales que va a tener al final**, no con los que
 * tocarían a cada paso: si el número de decimales cambiara mientras sube, el
 * texto se ensancharía y encogería y daría la sensación de estar roto. Por eso
 * también va en cifras tabulares, donde todos los dígitos ocupan lo mismo.
 *
 * Y al terminar imprime exactamente lo que imprimiría `formatAmount`, sin
 * recalcularlo: el destino de la animación y el valor de verdad no pueden
 * diferir ni en el último decimal cuando hablamos de dinero.
 */
export function Amount({
  value,
  asset,
  className,
  assetClassName,
}: {
  /** Importe en el formato de Stellar, como cadena. */
  value: string;
  asset?: string;
  className?: string;
  assetClassName?: string;
}) {
  // `formatAmount` lanza si el importe no es válido. Aquí eso no puede tumbar
  // la pantalla: este componente se dibuja al lado del botón de aprobar, y
  // dejar en blanco la cifra que alguien está a punto de firmar sería peor que
  // cualquier formato feo. Se enseña el valor crudo, que es honesto —es lo que
  // llegó— en vez de inventar un cero que parecería correcto.
  let destino: string;
  try {
    destino = formatAmount(value);
  } catch {
    destino = value;
  }

  const decimales = destino.includes('.') ? destino.split('.')[1]!.length : 0;

  const numero = Number(value);
  const contando = useCountUp(Number.isFinite(numero) ? numero : 0);

  // `useCountUp` devuelve el destino exacto en cuanto termina (y de entrada si
  // el movimiento está desactivado), así que esta comparación es la que hace
  // que el último fotograma sea el texto canónico y no una aproximación.
  const texto = contando === numero ? destino : contando.toFixed(decimales);

  return (
    <span className={cn('tabular-nums', className)}>
      {texto}
      {asset ? <span className={assetClassName}> {asset}</span> : null}
    </span>
  );
}
