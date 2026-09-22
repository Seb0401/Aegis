'use client';

import type { Proposal } from '@aegis/contracts';
import { Bot, FileText, Rocket, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Jupi } from '@/components/jupi/jupi';
import { SessionControls } from '@/components/layout/session-controls';
import { Card } from '@/components/ui/card';
import { useAgentThinking, usePolicy, useProposals } from '@/lib/api/hooks';
import { jupiStatusLine, moodForAgent } from '@/lib/jupi';
import { isActionable } from '@/lib/proposals';
import { cn } from '@/lib/utils';

/**
 * La tarjeta de Jupi del mockup: la mascota, en qué anda, y las cuatro etapas
 * por las que pasa cualquier operación.
 *
 * Las etapas no son decoración: se encienden según lo que ya ocurrió con la
 * propuesta que está en curso, así que la tarjeta explica el flujo del
 * proyecto (agente propone → política decide → Guardian analiza → Stellar
 * ejecuta) mientras sucede.
 */

interface Stage {
  id: string;
  icon: typeof Bot;
  title: string;
  hint: string;
  /** ¿Esta etapa ya ocurrió para la propuesta en curso? */
  done: (proposal: Proposal | undefined) => boolean;
}

const STAGES: Stage[] = [
  {
    id: 'agente',
    icon: Bot,
    title: 'Agente',
    hint: 'Propone la operación',
    done: (p) => Boolean(p),
  },
  {
    id: 'policy',
    icon: SlidersHorizontal,
    title: 'Policy Engine',
    hint: 'Revisa tus límites',
    done: (p) => Boolean(p?.policy),
  },
  {
    id: 'guardian',
    icon: ShieldCheck,
    title: 'Guardian',
    hint: 'Analiza riesgo y explica',
    done: (p) => Boolean(p?.risk),
  },
  {
    id: 'stellar',
    icon: Rocket,
    title: 'Stellar',
    hint: 'Ejecuta la operación',
    done: (p) => Boolean(p?.txHash),
  },
];

export function JupiCard() {
  const policy = usePolicy();
  const proposals = useProposals(20, { poll: true });
  const thinking = useAgentThinking();

  const paused = policy.data?.config.paused ?? false;
  const pending = proposals.data?.proposals.find(isActionable);
  const mood = moodForAgent({ paused, thinking, ...(pending ? { pending } : {}) });

  return (
    <Card className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex items-center gap-4">
        <Jupi mood={mood} size={128} float={!paused} className="shrink-0" />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Jupi</h2>
            <span
              className={
                paused
                  ? 'rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive'
                  : 'rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success'
              }
            >
              {paused ? 'En pausa' : 'Activo'}
            </span>
          </div>

          <p className="mt-1.5 text-sm text-muted-foreground">
            Tu asistente. Analiza, propone y ejecuta operaciones dentro de los límites que tú pones.
          </p>

          <p className="mt-3 text-sm">
            {jupiStatusLine({ paused, thinking, ...(pending ? { pending } : {}) })}
          </p>

          {pending ? (
            <a
              href="#propuesta-pendiente"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm transition-colors hover:bg-accent"
            >
              <FileText className="size-4" />
              Ver explicación
            </a>
          ) : null}
        </div>
      </div>

      {/* Solo en móvil: la cabecera de ahí se queda con el título y nada más. */}
      <SessionControls />

      <ol className="flex flex-col gap-1.5" aria-label="Etapas de una operación">
        {STAGES.map((stage) => {
          const done = stage.done(pending);
          const Icon = stage.icon;
          return (
            <li
              key={stage.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                done ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/40',
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg',
                  done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{stage.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{stage.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
