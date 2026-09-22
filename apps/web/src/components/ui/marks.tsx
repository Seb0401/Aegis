import { cn } from '@/lib/utils';

/**
 * Figuras propias de Aegis, dibujadas a mano en SVG.
 *
 * Nada de emojis: un emoji lo dibuja el sistema operativo, así que cambia de
 * forma entre Windows, Android y iOS, no hereda el color del texto y no se
 * puede alinear con el resto de la iconografía. Estas se trazan con el mismo
 * grosor que los iconos de la interfaz y toman el color de donde estén.
 */

/**
 * Mano saludando, para el «Hola» de la cabecera.
 *
 * Tres dedos y pulgar, bien separados: a 20px, cuatro dedos pegados se
 * emborronan y dejan de leerse como una mano.
 */
export function WaveMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('size-5', className)}
    >
      {/* Palma y muñeca. */}
      <path d="M6.6 11.5v2.6c0 3.4 2.4 5.9 5.7 5.9s5.5-2.5 5.5-5.9v-3.4" />
      {/* Dedos, en abanico. */}
      <path d="M6.6 12V9.9a1.4 1.4 0 0 1 2.8 0v1.6" />
      <path d="M9.4 11.5V6.7a1.4 1.4 0 0 1 2.8 0v4.5" />
      <path d="M12.2 11.2V6.1a1.4 1.4 0 0 1 2.8 0v5" />
      <path d="M15 11.2V7.6a1.4 1.4 0 0 1 2.8 0v3" />
      {/* Arcos de movimiento. */}
      <path d="M19.9 6.2a5 5 0 0 1 1.4 3.1" opacity="0.6" />
      <path d="M4.1 6.2a5 5 0 0 0-1.4 3.1" opacity="0.35" />
    </svg>
  );
}

/**
 * El anillo de Jupi, reducido a marca.
 *
 * Se usa donde hace falta un signo de «esto es de Aegis» sin traer la mascota
 * entera: un planeta y su órbita inclinada.
 */
export function OrbitMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={cn('size-5', className)}
    >
      <circle cx="12" cy="12" r="5.2" />
      <ellipse cx="12" cy="12" rx="10.4" ry="3.6" transform="rotate(-22 12 12)" opacity="0.65" />
    </svg>
  );
}
