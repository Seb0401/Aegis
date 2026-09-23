'use client';

import { Loader2, RotateCw, SendHorizonal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Jupi } from '@/components/jupi/jupi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeError } from '@/lib/api/errors';
import { useChat } from '@/lib/chat/chat-context';
import { cn } from '@/lib/utils';

/**
 * Chat con el agente — versión base de FE-05.
 *
 * Funciona de punta a punta contra `POST /agent/messages`, pero deliberadamente
 * se queda corto: falta el historial persistido y las respuestas en streaming
 * (la API todavía responde de una sola vez, el SSE está marcado como opcional
 * en §5.2 del PLAN). El estado vive en `ChatProvider`, porque esta misma
 * conversación se ve en la columna del panel y en la hoja que abre el botón
 * central en móvil.
 */
export function ChatPanel({ bare = false }: { bare?: boolean }) {
  const { turns, send, retry, isPending, error, canRetry } = useChat();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  /*
    El id tiene que ser único por instancia: en móvil hay dos paneles montados
    a la vez —el de la columna de escritorio, oculto por CSS, y el de la hoja—
    y con un id fijo los dos compartían el mismo. El `htmlFor` de la etiqueta
    resolvía siempre al primero, así que el campo visible se quedaba sin nombre
    accesible y sin etiqueta asociada.
  */
  const inputId = useId();

  // El último mensaje siempre a la vista: si no, una respuesta larga aparece
  // fuera de pantalla y parece que no ha pasado nada.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, isPending]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || isPending) return;
    send(draft);
    setDraft('');
  }

  const body = (
    <>
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

        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Jupi mood="pensativo" size={32} className="shrink-0" />
            <Loader2 className="size-4 animate-spin" />
            Pensando…
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">{describeError(error)}</p>
            {canRetry ? (
              <Button size="sm" variant="outline" onClick={retry} disabled={isPending}>
                <RotateCw />
                Reintentar
              </Button>
            ) : null}
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label className="sr-only" htmlFor={inputId}>
          Mensaje para el agente
        </label>
        <textarea
          id={inputId}
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
        <Button type="submit" size="icon" disabled={isPending || !draft.trim()}>
          <SendHorizonal />
          <span className="sr-only">Enviar</span>
        </Button>
      </form>
    </>
  );

  // `bare` lo usa la hoja de móvil, que ya trae su propia cabecera y su marco.
  if (bare) return <div className="flex min-h-0 flex-1 flex-col gap-4">{body}</div>;

  return (
    <Card className="flex min-h-[30rem] flex-col xl:sticky xl:top-28">
      <CardHeader>
        <CardTitle>Agente</CardTitle>
        <CardDescription>
          Pídele algo en lenguaje normal. Propone; deciden tus límites y el Guardian.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">{body}</CardContent>
    </Card>
  );
}
