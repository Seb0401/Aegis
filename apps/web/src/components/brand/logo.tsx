import { cn } from '@/lib/utils';

/**
 * El símbolo de Aegis.
 *
 * Va sobre una superficie clara a propósito: la «A» del logo es azul muy
 * oscuro y sobre el fondo de la aplicación —que también lo es— desaparecería.
 * La tarjeta blanca es lo que lo hace legible, igual que el icono de una
 * aplicación en una pantalla de inicio oscura.
 *
 * No lleva el nombre dentro: donde hace falta, el texto «Aegis» va al lado con
 * la tipografía de la interfaz, que se adapta al tamaño y al tema. La versión
 * con las letras incrustadas (`docs/images/logo.png`) es para fuera: el README,
 * formularios, redes.
 *
 * El archivo sale de `images/logo-original.png` vía `scripts/logo.mjs`.
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-50',
        className,
      )}
      style={{ width: size, height: size, padding: size * 0.14 }}
    >
      <img
        src="/logo.png"
        alt=""
        aria-hidden
        draggable={false}
        className="size-full select-none object-contain"
      />
    </span>
  );
}
