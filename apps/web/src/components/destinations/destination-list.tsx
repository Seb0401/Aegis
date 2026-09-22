'use client';

import type { Destination } from '@aegis/contracts';
import { Ban, Loader2, PiggyBank, ShieldCheck, ShieldOff, Target, User } from 'lucide-react';
import { QueryState } from '@/components/dashboard/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeError } from '@/lib/api/errors';
import { useDestinations, useUpdateDestination } from '@/lib/api/hooks';
import { formatAmount } from '@/lib/utils';

/**
 * Destinos registrados, con lo único que se puede cambiar de ellos (FE-10).
 *
 * `trusted` y `blocked` no son etiquetas decorativas: el primero exime de la
 * señal G-01 del Guardian y el segundo hace que la política deniegue cualquier
 * pago a ese destino (P-03). Por eso el botón dice qué implica cada uno en vez
 * de limitarse a un interruptor sin contexto.
 *
 * La dirección no se puede editar, a propósito: cambiarla convertiría un «este
 * destino es de confianza» en un cheque en blanco hacia otra cuenta.
 */

const KIND_LABEL: Record<Destination['kind'], string> = {
  GOAL: 'Objetivo',
  CONTACT: 'Contacto',
  EMERGENCY_FUND: 'Emergencias',
};

function KindIcon({ kind }: { kind: Destination['kind'] }) {
  if (kind === 'GOAL') return <Target className="size-4 text-muted-foreground" />;
  if (kind === 'EMERGENCY_FUND') return <PiggyBank className="size-4 text-muted-foreground" />;
  return <User className="size-4 text-muted-foreground" />;
}

export function DestinationList() {
  const { data, isLoading, error } = useDestinations();
  const update = useUpdateDestination();
  const destinations = data?.destinations ?? [];
  const pendingId = update.isPending ? update.variables?.id : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivos y contactos</CardTitle>
        <CardDescription>{destinations.length} destinos registrados.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={destinations.length === 0}
          emptyLabel="Aún no has registrado ningún destino."
        >
          <ul className="flex flex-col divide-y divide-border">
            {destinations.map((destination) => {
              const busy = pendingId === destination.id;
              return (
                <li key={destination.id} className="flex flex-col gap-2 py-3 first:pt-0">
                  <div className="flex items-center gap-3">
                    <KindIcon kind={destination.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {destination.label}
                        {destination.blocked ? (
                          <Badge variant="critical">
                            <Ban className="size-3" />
                            Bloqueado
                          </Badge>
                        ) : destination.trusted ? (
                          <Badge variant="low">
                            <ShieldCheck className="size-3" />
                            De confianza
                          </Badge>
                        ) : null}
                      </p>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {destination.address}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {KIND_LABEL[destination.kind]}
                        {destination.targetAmount
                          ? ` · meta ${formatAmount(destination.targetAmount, destination.targetAsset ?? undefined)}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pl-7">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || destination.blocked}
                      title={
                        destination.blocked
                          ? 'Desbloquéalo primero'
                          : 'Exime a este destino de la señal G-01 del Guardian'
                      }
                      onClick={() =>
                        update.mutate({
                          id: destination.id,
                          input: { trusted: !destination.trusted },
                        })
                      }
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                      {destination.trusted ? 'Quitar confianza' : 'Marcar de confianza'}
                    </Button>

                    <Button
                      size="sm"
                      variant={destination.blocked ? 'secondary' : 'ghost'}
                      disabled={busy}
                      title={
                        destination.blocked
                          ? 'Vuelve a permitir pagos a este destino'
                          : 'La política denegará cualquier pago a este destino (P-03)'
                      }
                      onClick={() =>
                        update.mutate({
                          id: destination.id,
                          input: { blocked: !destination.blocked },
                        })
                      }
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <ShieldOff />}
                      {destination.blocked ? 'Desbloquear' : 'Bloquear'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </QueryState>

        {update.error ? (
          <p role="alert" className="text-sm text-destructive">
            {describeError(update.error)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
