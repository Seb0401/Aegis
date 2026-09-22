'use client';

import { useEffect, type ReactNode } from 'react';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
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
  // Cada pantalla con su título: en una pestaña entre veinte, «Aegis» a secas
  // no dice en cuál estabas. También es lo primero que anuncia un lector de
  // pantalla al navegar.
  useEffect(() => {
    document.title = title ? `${title} · Aegis` : 'Aegis';
  }, [title]);

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
          <main id="contenido" tabIndex={-1} className="flex min-w-0 flex-col gap-5">
            {children}
          </main>
          {/*
            Por debajo de `lg` el chat no se apila aquí: vive en la hoja que
            abre el botón central de la barra inferior, y comparte estado con
            esta columna a través de `ChatProvider`.
          */}
          {aside ? <aside className="hidden min-w-0 flex-col gap-5 lg:flex">{aside}</aside> : null}
        </div>

        <MobileTabBar />
      </div>
    </div>
  );
}
