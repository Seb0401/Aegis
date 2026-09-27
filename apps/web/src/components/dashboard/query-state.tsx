'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Jupi } from '@/components/jupi/jupi';
import { Skeleton } from '@/components/ui/skeleton';
import { describeError } from '@/lib/api/errors';

/**
 * Los tres estados de una consulta, en un solo sitio.
 *
 * Que cargar, fallar y "no hay nada" se vean igual en todas las tarjetas evita
 * la trampa clásica: una lista vacía por error de red que parece una lista
 * vacía de verdad.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyLabel,
  emptyAction,
  rows = 3,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyLabel?: string;
  /** Qué hacer para que deje de estar vacío. Un sitio al que ir. */
  emptyAction?: { label: string; href: string };
  rows?: number;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        {describeError(error)}
      </p>
    );
  }

  if (isEmpty) {
    /*
      Un vacío que solo dice «no hay nada» deja a quien acaba de entrar
      mirando una caja gris sin saber si falta configurar algo o si la
      aplicación está rota. Con Jupi y un sitio al que ir, el vacío pasa de
      ser un callejón a ser el primer paso.
    */
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Jupi mood="pensativo" size={72} />
        <p className="max-w-sm text-sm text-muted-foreground">
          {emptyLabel ?? 'Todavía no hay nada.'}
        </p>
        {emptyAction ? (
          <Link
            href={emptyAction.href}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {emptyAction.label}
          </Link>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
