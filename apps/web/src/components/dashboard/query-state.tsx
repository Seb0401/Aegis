'use client';

import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
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
  rows = 3,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyLabel?: string;
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
    return <p className="text-sm text-muted-foreground">{emptyLabel ?? 'Todavía no hay nada.'}</p>;
  }

  return <>{children}</>;
}
