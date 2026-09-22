'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { cn } from '@/lib/utils';

/**
 * Armazón de la aplicación, con la forma del mockup: barra lateral fija a la
 * izquierda, cabecera con el saludo y el estado del sistema, y el contenido
 * debajo. El chat sigue acompañando al panel en vez de sustituirlo (FE-Q4).
 *
 * La columna del chat solo existe cuando hay chat: si no, las pantallas sin
 * panel lateral dejaban un hueco vacío a la derecha.
 */
export function AppShell({
  children,
  aside,
  title,
  subtitle,
}: {
  children: ReactNode;
  aside?: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar {...(title ? { title } : {})} {...(subtitle ? { subtitle } : {})} />

        <div
          className={cn(
            'grid flex-1 grid-cols-1 items-start gap-5 p-4 sm:p-6',
            aside && 'xl:grid-cols-[minmax(0,1fr)_400px]',
          )}
        >
          <main className="flex min-w-0 flex-col gap-5">{children}</main>
          {aside ? <aside className="flex min-w-0 flex-col gap-5">{aside}</aside> : null}
        </div>
      </div>
    </div>
  );
}
