'use client';

import { Loader2, SendHorizonal } from 'lucide-react';
import { Jupi } from '@/components/jupi/jupi';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeError } from '@/lib/api/errors';
import { useSendMessage } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

/**
 * Chat con el agente — versión base de FE-05.
 *
 * Funciona de punta a punta contra `POST /agent/messages`, pero deliberadamente
 * se queda corto: falta el historial persistido y las respuestas en streaming
 * (la API todavía responde de una sola vez, el SSE está marcado como opcional
 * en §5.2 del PLAN). Las propuestas que genera se ven en su tarjeta, que se
 * refresca sola al invalidar la consulta.
 */

interface ChatTurn {
  id: number;
  role: 'user' | 'agent';
  text: string;
  proposals?: number;
}

export function ChatPanel() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const sendMessage = useSendMessage();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sendMessage.isPending) return;

    setTurns((prev) => [...prev, { id: prev.length, role: 'user', text: message }]);
    setDraft('');

    sendMessage.mutate(
      { message, conversationId },
      {
        onSuccess: (response) => {
          setConversationId(response.conversationId);
          setTurns((prev) => [
            ...prev,
            {
              id: prev.length,
              role: 'agent',
              text: response.reply,
              proposals: response.proposals.length,
            },
          ]);
        },
      },
    );
  }

  return (
    <Card className="flex min-h-[30rem] flex-col xl:sticky xl:top-28">
      <CardHeader>
        <CardTitle>Agente</CardTitle>
        <CardDescription>
          Pídele algo en lenguaje normal. Propone; deciden tus límites y el Guardian.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex-1 space-y-3 overflow-y-auto" aria-live="polite">
          {turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Por ejemplo: «reparte 50 entre mis objetivos y guarda 10 para emergencias».
            </p>
          ) : (
            turns.map((turn) => (
              <div
                key={turn.id}
                className={cn(
                  'flex items-end gap-2',
                  turn.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {turn.role === 'agent' ? (
                  <Jupi
                    mood={turn.proposals ? 'confiado' : 'tranquilo'}
                    size={32}
                    className="shrink-0"
                  />
                ) : null}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                    turn.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground',
                  )}
                >
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                  {turn.proposals ? (
                    <p className="mt-1 text-xs opacity-80">
                      {turn.proposals} propuesta{turn.proposals === 1 ? '' : 's'} creada
                      {turn.proposals === 1 ? '' : 's'}.
                    </p>
                  ) : null}
                </div>
              </div>
            ))
          )}

          {sendMessage.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Jupi mood="pensativo" size={32} className="shrink-0" />
              <Loader2 className="size-4 animate-spin" />
              Pensando…
            </p>
          ) : null}

          {sendMessage.error ? (
            <p role="alert" className="text-sm text-destructive">
              {describeError(sendMessage.error)}
            </p>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <label className="sr-only" htmlFor="chat-input">
            Mensaje para el agente
          </label>
          <textarea
            id="chat-input"
            rows={2}
            value={draft}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter envía, Shift+Enter hace salto de línea.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSubmit(event);
              }
            }}
            placeholder="Escribe lo que quieres hacer…"
            className="min-h-[3rem] flex-1 resize-none rounded-xl border border-input bg-muted/40 px-3 py-2 text-sm"
          />
          <Button type="submit" size="icon" disabled={sendMessage.isPending || !draft.trim()}>
            <SendHorizonal />
            <span className="sr-only">Enviar</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
