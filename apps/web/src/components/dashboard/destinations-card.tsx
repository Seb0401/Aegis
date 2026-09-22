'use client';

import type { Destination } from '@aegis/contracts';
import { Ban, PiggyBank, ShieldCheck, Target, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDestinations } from '@/lib/api/hooks';
import { shortAddress } from '@/lib/utils';
import { QueryState } from './query-state';

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

/**
 * Objetivos y contactos (FE-10, solo lectura de momento).
 *
 * Este es el único sitio por el que entra una dirección Stellar nueva, y solo
 * escrita por el usuario: el agente únicamente referencia ids de esta lista
 * (principio nº 2). El alta con confirmación es la tarea FE-10 completa.
 */
export function DestinationsCard() {
  const { data, isLoading, error } = useDestinations();
  const destinations = data?.destinations ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivos y contactos</CardTitle>
        <CardDescription>
          El agente solo puede enviar dinero a lo que esté en esta lista.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={destinations.length === 0}
          emptyLabel="Aún no has registrado ningún destino."
        >
          <ul className="flex flex-col divide-y divide-border">
            {destinations.map((destination) => (
              <li key={destination.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <KindIcon kind={destination.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{destination.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[destination.kind]} · {shortAddress(destination.address)}
                  </p>
                </div>
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
              </li>
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
