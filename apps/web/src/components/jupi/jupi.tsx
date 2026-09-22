import { JUPI_ALT, type JupiMood } from '@/lib/jupi';
import { cn } from '@/lib/utils';

/**
 * La mascota.
 *
 * Los sprites vienen del sheet de `images/jupi.jpeg`, recortados sobre fondo
 * transparente. Son decorativos: cuando el estado que representan ya está
 * escrito al lado (y casi siempre lo está), Jupi se marca como `aria-hidden`
 * para no repetírselo a quien usa lector de pantalla.
 */
export function Jupi({
  mood,
  size = 96,
  float = false,
  decorative = true,
  className,
}: {
  mood: JupiMood;
  size?: number;
  /** Flotación lenta. Solo para la mascota grande del panel. */
  float?: boolean;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <img
      src={`/jupi/${mood}.png`}
      width={size}
      height={size}
      alt={decorative ? '' : JUPI_ALT[mood]}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn('select-none object-contain', float && 'jupi-float', className)}
      style={{ width: size, height: 'auto' }}
    />
  );
}
