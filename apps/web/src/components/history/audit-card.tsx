'use client';

import type { AuditEventType } from '@aegis/contracts';
import {
  Ban,
  CircleCheck,
  CirclePause,
  CircleX,
  Clock,
  FileText,
  LogIn,
  PenLine,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Target,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { QueryState } from '@/components/dashboard/query-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAudit } from '@/lib/api/hooks';
import { useState } from 'react';
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils';

/**
 * Bitácora de auditoría (FE-11).
 *
 * Cada evento va encadenado con el hash del anterior, así que la API puede
 * afirmar si la cadena está intacta. Eso se enseña arriba y con todas las
 * letras: una bitácora en la que no se puede confiar no sirve de nada, y el
 * usuario merece saber cuál de los dos casos tiene delante.
 */

const EVENT_LABEL: Record<AuditEventType, string> = {
  PROPOSAL_CREATED: 'Propuesta creada',
  POLICY_EVALUATED: 'Límites evaluados',
  GUARDIAN_EVALUATED: 'Riesgo evaluado',
  STATUS_CHANGED: 'Cambio de estado',
  USER_APPROVED: 'La aprobaste',
  USER_REJECTED: 'La rechazaste',
  AGENT_SIGNED: 'Firmada por el agente',
  TX_SUBMITTED: 'Enviada a la red',
  TX_CONFIRMED: 'Confirmada en la red',
  TX_FAILED: 'Falló en la red',
  TX_STATUS_UNKNOWN: 'Enviada, sin respuesta de la red',
  POLICY_UPDATED: 'Límites modificados',
  KILL_SWITCH_TOGGLED: 'Agente pausado o reactivado',
  DESTINATION_CREATED: 'Destino registrado',
  DESTINATION_UPDATED: 'Destino actualizado',
  PROPOSAL_EXPIRED: 'Propuesta caducada',
  PROPOSAL_ABANDONED: 'Propuesta abandonada',
  AUTH_LOGIN: 'Inicio de sesión',
};

/**
 * Un icono y un tono por tipo de evento.
 *
 * Con el mismo icono en todas las filas, la bitácora es un muro de texto que
 * hay que leer entero para encontrar algo. Con una forma y un color por tipo
 * se recorre con la vista: los verdes son lo que salió bien, los rojos lo que
 * no, y el ámbar lo que decidiste tú.
 *
 * El color acompaña al icono, nunca va solo: quien no distinga los tonos
 * sigue teniendo la forma y la etiqueta.
 */
const EVENT_ICON: Record<AuditEventType, { icon: LucideIcon; tone: string }> = {
  PROPOSAL_CREATED: { icon: FileText, tone: 'text-muted-foreground' },
  POLICY_EVALUATED: { icon: Sliders, tone: 'text-muted-foreground' },
  GUARDIAN_EVALUATED: { icon: ShieldCheck, tone: 'text-muted-foreground' },
  STATUS_CHANGED: { icon: Clock, tone: 'text-muted-foreground' },
  USER_APPROVED: { icon: PenLine, tone: 'text-risk-low' },
  USER_REJECTED: { icon: CircleX, tone: 'text-risk-medium' },
  AGENT_SIGNED: { icon: PenLine, tone: 'text-primary' },
  TX_SUBMITTED: { icon: Send, tone: 'text-primary' },
  TX_CONFIRMED: { icon: CircleCheck, tone: 'text-risk-low' },
  TX_FAILED: { icon: TriangleAlert, tone: 'text-destructive' },
  TX_STATUS_UNKNOWN: { icon: TriangleAlert, tone: 'text-risk-medium' },
  POLICY_UPDATED: { icon: Sliders, tone: 'text-primary' },
  KILL_SWITCH_TOGGLED: { icon: CirclePause, tone: 'text-risk-high' },
  DESTINATION_CREATED: { icon: Target, tone: 'text-primary' },
  DESTINATION_UPDATED: { icon: Target, tone: 'text-muted-foreground' },
  PROPOSAL_EXPIRED: { icon: Clock, tone: 'text-muted-foreground' },
  PROPOSAL_ABANDONED: { icon: Ban, tone: 'text-muted-foreground' },
  AUTH_LOGIN: { icon: LogIn, tone: 'text-muted-foreground' },
};

/**
 * Grupos del filtro.
 *
 * Los inicios de sesión llegaron a ser la mitad de las filas y tapaban lo que
 * alguien viene a buscar aquí, que es qué pasó con su dinero. No se ocultan
 * —forman parte del registro y esconderlos sería falsearlo— pero dejan de ser
 * lo primero que se ve.
 */
const GRUPOS = {
  todo: { label: 'Todo', tipos: null },
  dinero: {
    label: 'Dinero',
    tipos: new Set<AuditEventType>([
      'PROPOSAL_CREATED',
      'USER_APPROVED',
      'AGENT_SIGNED',
      'TX_SUBMITTED',
      'TX_CONFIRMED',
      'TX_FAILED',
      'TX_STATUS_UNKNOWN',
    ]),
  },
  decisiones: {
    label: 'Tus decisiones',
    tipos: new Set<AuditEventType>([
      'USER_APPROVED',
      'USER_REJECTED',
      'POLICY_UPDATED',
      'KILL_SWITCH_TOGGLED',
      'DESTINATION_CREATED',
      'DESTINATION_UPDATED',
    ]),
  },
} as const;

type GrupoId = keyof typeof GRUPOS;

export function AuditCard() {
  const { data, isLoading, error } = useAudit(50);
  const [grupo, setGrupo] = useState<GrupoId>('todo');

  const todos = data?.events ?? [];
  const tipos = GRUPOS[grupo].tipos;
  const events = tipos ? todos.filter((event) => tipos.has(event.type)) : todos;
  const chain = data?.chain;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bitácora</CardTitle>
        <CardDescription>
          Todo lo que ha hecho el agente, en orden. Nada se puede borrar ni cambiar después.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {chain ? (
          <div
            className={
              chain.valid
                ? 'flex items-start gap-2 rounded-md border border-risk-low/40 bg-risk-low/10 p-3 text-sm'
                : 'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm'
            }
          >
            {chain.valid ? (
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-risk-low" />
            ) : (
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            <span>
              {chain.valid
                ? `Intacto: comprobadas las ${chain.verifiedEvents} últimas anotaciones.`
                : 'Algo no cuadra: uno de estos registros se modificó después de escribirse.'}
              {chain.complete ? '' : ' Solo las que se ven aquí.'}
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar la bitácora">
          {(Object.keys(GRUPOS) as GrupoId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setGrupo(id)}
              aria-pressed={grupo === id}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs transition-colors',
                grupo === id
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {GRUPOS[id].label}
            </button>
          ))}
        </div>

        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={events.length === 0}
          emptyLabel="Cada decisión del agente quedará escrita aquí, encadenada a la anterior. Pídele algo y empieza a llenarse."
        >
          <ul className="flex flex-col divide-y divide-border">
            {events.map((event) => {
              const { icon: Icon, tone } = EVENT_ICON[event.type];

              return (
                <li key={event.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{EVENT_LABEL[event.type]}</p>
                    {/*
                      El identificador de la propuesta iba aquí en crudo y no
                      significa nada para quien lee: treinta y tantos
                      caracteres que solo sirven para depurar. Se queda en el
                      título, al alcance de quien lo necesite.
                    */}
                    <p
                      className="text-xs text-muted-foreground"
                      {...(event.proposalId ? { title: `Propuesta ${event.proposalId}` } : {})}
                    >
                      <span title={formatDateTime(event.createdAt)}>
                        {formatRelativeTime(event.createdAt)}
                      </span>
                    </p>
                  </div>
                  <code
                    className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                    title={`Huella de esta anotación: ${event.hash}`}
                  >
                    {event.hash.slice(0, 8)}
                  </code>
                </li>
              );
            })}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
