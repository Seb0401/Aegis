'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { ChatSheet } from '@/components/chat/chat-sheet';
import { Jupi } from '@/components/jupi/jupi';
import { useAgentThinking, usePolicy, useProposals } from '@/lib/api/hooks';
import { moodForAgent } from '@/lib/jupi';
import { NAV_LINKS } from '@/lib/navigation';
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
  const fabRef = useRef<HTMLButtonElement>(null);

  const policy = usePolicy();
  const proposals = useProposals(20, { poll: true });
  const thinking = useAgentThinking();

  const paused = policy.data?.config.paused ?? false;
  const pending = proposals.data?.proposals.find(isActionable);
  const mood = moodForAgent({ paused, thinking, ...(pending ? { pending } : {}) });

  const [left, right] = [NAV_LINKS.slice(0, 2), NAV_LINKS.slice(2)];

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
        </div>
      </nav>

      {/* Hueco para que la barra fija no tape el final del contenido. */}
      <div aria-hidden className="h-20 lg:hidden" />
    </>
  );
}

function TabLink({ link, active }: { link: (typeof NAV_LINKS)[number]; active: boolean }) {
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
