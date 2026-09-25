'use client';

import type { AuditEventType } from '@aegis/contracts';
import { Link2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { QueryState } from '@/components/dashboard/query-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAudit } from '@/lib/api/hooks';
import { formatDateTime } from '@/lib/utils';

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
  KILL_SWITCH_TOGGLED: 'Kill switch',
  DESTINATION_CREATED: 'Destino registrado',
  DESTINATION_UPDATED: 'Destino actualizado',
  PROPOSAL_EXPIRED: 'Propuesta caducada',
  PROPOSAL_ABANDONED: 'Propuesta abandonada',
  AUTH_LOGIN: 'Inicio de sesión',
};

export function AuditCard() {
  const { data, isLoading, error } = useAudit(50);
  const events = data?.events ?? [];
  const chain = data?.chain;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bitácora</CardTitle>
        <CardDescription>
          Registro append-only: cada evento lleva el hash del anterior.
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
                ? `Cadena íntegra: ${chain.verifiedEvents} eventos verificados.`
                : `La cadena se rompe en ${chain.brokenAt ?? 'un punto desconocido'}. Alguien tocó la bitácora.`}
              {chain.complete ? '' : ' Se verificó solo la ventana que se muestra.'}
            </span>
          </div>
        ) : null}

        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={events.length === 0}
          emptyLabel="Todavía no hay eventos."
        >
          <ul className="flex flex-col divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                <Link2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{EVENT_LABEL[event.type]}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                    {event.proposalId ? ` · ${event.proposalId}` : ''}
                  </p>
                </div>
                <code
                  className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                  title={event.hash}
                >
                  {event.hash.slice(0, 8)}
                </code>
              </li>
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
