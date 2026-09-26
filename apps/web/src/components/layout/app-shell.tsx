'use client';

import { PanelRightOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { ChatPanel } from '@/components/chat/chat-panel';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { useAgentPanel } from '@/lib/agent-panel';
import { usePolicy } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

/**
 * Armazón de la aplicación: barra lateral a la izquierda, cabecera arriba,
 * contenido debajo y el agente en una columna a la derecha.
 *
 * **El agente vive aquí y no en cada pantalla**, y ese cambio arregla dos
 * cosas. Una: antes solo existía en el Panel, así que para pedirle algo desde
 * Límites o Historial había que volver atrás, y eso convierte al agente en un
 * sitio al que se va en vez de en algo que acompaña. Y dos: la columna
 * aparecía a partir de 1280 px y la alternativa —la hoja del botón central—
 * solo por debajo de 1024, así que en un portátil de 1280 justo no había
 * **ninguna** forma de llegar al chat.
 *
 * Se puede cerrar, y se recuerda. Cerrada, el contenido recupera el ancho
 * entero: en Historial o en Actividad, que son tablas, eso se agradece.
 */
export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const policy = usePolicy();
  const paused = policy.data?.config.paused ?? false;
  const { abierto, alternar } = useAgentPanel();

  return (
    /*
      Con el agente en pausa, la interfaz entera pierde color y se apaga.
      Parar al agente es la decisión más grave que se puede tomar aquí, y
      leerlo en una etiqueta pequeña no está a la altura: quien mire de reojo
      tiene que darse cuenta antes de leer nada.

      Los controles marcados con `not-paused` —el propio kill switch— se
      quedan fuera del velo: apagar el botón que resucita al agente sería
      justo lo contrario de lo que hace falta en ese momento.
    */
    <div className={cn('flex min-h-dvh', paused && 'paused-veil')}>
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar {...(title ? { title } : {})} {...(subtitle ? { subtitle } : {})} />

        <div
          className={cn(
            'grid flex-1 grid-cols-1 items-start gap-5 p-4 sm:p-6',
            abierto && 'lg:grid-cols-[minmax(0,1fr)_minmax(340px,380px)]',
          )}
        >
          <main id="contenido" tabIndex={-1} className="flex min-w-0 flex-col gap-5">
            {children}
          </main>

          {/*
            Por debajo de `lg` esta columna no se apila: ahí el agente vive en
            la hoja que abre el botón central de la barra inferior, y las dos
            comparten la conversación a través de `ChatProvider`.
          */}
          {abierto ? (
            <aside aria-label="Agente" className="sticky top-24 hidden min-w-0 flex-col lg:flex">
              <ChatPanel onHide={alternar} />
            </aside>
          ) : null}
        </div>

        {/*
          Cuando está cerrada, el botón para recuperarla se queda pegado al
          borde derecho. En la cabecera se perdería entre los demás controles,
          y aquí ocupa el sitio que la columna dejó libre, que es donde el ojo
          va a buscarla.
        */}
        {!abierto ? (
          <Button
            variant="outline"
            size="sm"
            onClick={alternar}
            className="fixed right-0 bottom-24 z-30 hidden rounded-r-none border-r-0 bg-card shadow-lg lg:flex"
          >
            <PanelRightOpen />
            Agente
          </Button>
        ) : null}

        <MobileTabBar />
      </div>
    </div>
  );
}
