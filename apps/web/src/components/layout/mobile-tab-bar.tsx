'use client';

import { MoreHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { ChatSheet } from '@/components/chat/chat-sheet';
import { Jupi } from '@/components/jupi/jupi';
import { useAgentThinking, usePolicy, useProposals } from '@/lib/api/hooks';
import { moodForAgent } from '@/lib/jupi';
import { MOBILE_PRIMARY, MOBILE_SECONDARY, type NavLink } from '@/lib/navigation';
import { isActionable } from '@/lib/proposals';
import { cn } from '@/lib/utils';

/**
 * Navegación de móvil: las cuatro secciones abajo, al alcance del pulgar, y el
 * agente en el centro, elevado.
 *
 * El botón central lleva a Jupi con la cara que toque, así que la barra dice
 * de un vistazo si hay algo esperándote sin tener que abrir nada. El punto de
 * aviso no es decorativo: solo aparece cuando hay una propuesta que necesita
 * tu decisión.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);
  const [masOpen, setMasOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);

  const policy = usePolicy();
  const proposals = useProposals(20, { poll: true });
  const thinking = useAgentThinking();

  const paused = policy.data?.config.paused ?? false;
  const pending = proposals.data?.proposals.find(isActionable);
  const mood = moodForAgent({ paused, thinking, ...(pending ? { pending } : {}) });

  /*
    Dos a la izquierda, el agente en el centro, una más «Más» a la derecha.
    Son cinco huecos y no dan para siete secciones: apretarlas daría objetivos
    de pulsación de menos de treinta píxeles, que en un teléfono no se
    aciertan.
  */
  const [left, right] = [MOBILE_PRIMARY.slice(0, 2), MOBILE_PRIMARY.slice(2)];
  const enMas = MOBILE_SECONDARY.some((link) => link.href === pathname);

  return (
    <>
      <ChatSheet
        open={chatOpen}
        onClose={() => {
          setChatOpen(false);
          // Devolver el foco a donde estaba evita que, al cerrar, el teclado
          // vuelva a empezar desde el principio de la página.
          fabRef.current?.focus();
        }}
      />

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
          {left.map((link) => (
            <TabLink key={link.href} link={link} active={pathname === link.href} />
          ))}

          <div className="flex justify-center">
            <button
              ref={fabRef}
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Abrir el chat con el agente"
              aria-haspopup="dialog"
              aria-expanded={chatOpen}
              className="relative -mt-7 flex size-[4.25rem] items-center justify-center rounded-full border-4 border-sidebar bg-primary shadow-lg transition-transform active:scale-95"
            >
              <Jupi mood={mood} size={40} />
              {pending ? (
                <span
                  aria-hidden
                  className="absolute top-0 right-0 size-3.5 rounded-full border-2 border-sidebar bg-risk-medium"
                />
              ) : null}
              <span className="sr-only">
                {pending ? 'Tienes una propuesta esperando tu autorización' : 'Agente'}
              </span>
            </button>
          </div>

          {right.map((link) => (
            <TabLink key={link.href} link={link} active={pathname === link.href} />
          ))}

          <button
            type="button"
            onClick={() => setMasOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={masOpen}
            className={cn(
              'flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] transition-colors',
              // Se marca también cuando estás en una sección que vive dentro:
              // si no, la barra diría que no estás en ninguna parte.
              enMas ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <MoreHorizontal className={cn('size-5', enMas && 'stroke-[2.5]')} />
            Más
          </button>
        </div>
      </nav>

      {masOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setMasOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Más secciones"
            className="rise-in w-full rounded-t-[var(--radius)] border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Más secciones</h2>
              <button
                type="button"
                onClick={() => setMasOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>

            <nav aria-label="Más secciones" className="flex flex-col">
              {MOBILE_SECONDARY.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMasOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors',
                      active ? 'bg-primary font-medium text-primary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    <Icon className="size-4.5 shrink-0" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}

      {/* Hueco para que la barra fija no tape el final del contenido. */}
      <div aria-hidden className="h-20 lg:hidden" />
    </>
  );
}

function TabLink({ link, active }: { link: NavLink; active: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] transition-colors',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className={cn('size-5', active && 'stroke-[2.5]')} />
      {link.label}
    </Link>
  );
}
