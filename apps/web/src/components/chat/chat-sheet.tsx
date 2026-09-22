'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';
import { ChatPanel } from '@/components/chat/chat-panel';
import { Jupi } from '@/components/jupi/jupi';
import { Button } from '@/components/ui/button';
import { useAgentThinking, usePolicy, useProposals } from '@/lib/api/hooks';
import { moodForAgent } from '@/lib/jupi';
import { isActionable } from '@/lib/proposals';

/**
 * El chat a pantalla completa en móvil, que abre el botón central.
 *
 * Es la misma conversación que la del panel en escritorio: el estado vive en
 * `ChatProvider`, así que abrir y cerrar la hoja no pierde nada.
 */
export function ChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const policy = usePolicy();
  const proposals = useProposals(20, { poll: true });
  const thinking = useAgentThinking();

  const paused = policy.data?.config.paused ?? false;
  const pending = proposals.data?.proposals.find(isActionable);
  const mood = moodForAgent({ paused, thinking, ...(pending ? { pending } : {}) });

  // Escape cierra, y mientras está abierta el fondo no se desplaza.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:hidden">
      <button
        type="button"
        aria-label="Cerrar el chat"
        onClick={onClose}
        className="h-16 w-full bg-background/70 backdrop-blur"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chat con el agente"
        className="flex min-h-0 flex-1 flex-col gap-4 rounded-t-3xl border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <Jupi mood={mood} size={44} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight">Agente</h2>
            <p className="truncate text-xs text-muted-foreground">
              Propone; deciden tus límites y el Guardian.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X />
          </Button>
        </div>

        <ChatPanel bare />
      </div>
    </div>
  );
}
