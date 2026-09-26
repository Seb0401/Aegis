'use client';

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAudit } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

/**
 * ¿La bitácora sigue cuadrando?
 *
 * Cada evento lleva el hash del anterior, así que editar uno del pasado rompe
 * todos los que vienen detrás. Esta tarjeta enseña el resultado de recalcular
 * esa cadena, y lo enseña **arriba y con todas las letras**: una bitácora en
 * la que no se puede confiar no vale más que un fichero de texto, y el usuario
 * merece saber cuál de los dos casos tiene delante.
 *
 * La misma comprobación sale también en Historial, junto a los eventos. Aquí
 * aparece por sí sola porque es una garantía sobre el sistema entero, no un
 * detalle de una lista: quien viene a esta pantalla viene a preguntarse si
 * puede fiarse, y esta es la respuesta.
 */
export function ChainIntegrity() {
  const { data, isLoading } = useAudit(200);
  const chain = data?.chain;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integridad de la bitácora</CardTitle>
        <CardDescription>
          Cada evento va encadenado al anterior por su hash. Si alguien editara uno, los siguientes
          dejarían de cuadrar.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading || !chain ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" aria-hidden />
        ) : (
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg p-4',
              chain.valid ? 'bg-risk-low/10' : 'bg-destructive/10',
            )}
          >
            <span className={chain.valid ? 'text-risk-low' : 'text-destructive'}>
              {chain.valid ? (
                <ShieldCheck className="size-5 shrink-0" />
              ) : (
                <ShieldAlert className="size-5 shrink-0" />
              )}
            </span>

            <div className="min-w-0">
              <p className="font-medium">
                {chain.valid ? 'La cadena está intacta' : 'La cadena está rota'}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {chain.valid
                  ? `${chain.verifiedEvents} eventos verificados, uno a uno.`
                  : `Se rompe en ${chain.brokenAt ?? 'un punto que no se ha podido señalar'}. Alguien tocó la bitácora por debajo.`}
                {chain.complete
                  ? ''
                  : ' Se comprobó solo la ventana más reciente, no la cadena entera.'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
