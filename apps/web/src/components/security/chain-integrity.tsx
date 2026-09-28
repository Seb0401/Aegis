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
          Cada anotación va ligada a la anterior. Si alguien cambiara una de hace un mes, todas las
          siguientes dejarían de cuadrar y se vería.
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
                {chain.valid ? 'El historial está intacto' : 'Alguien tocó el historial'}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {chain.valid
                  ? `Comprobadas una a una las ${chain.verifiedEvents} últimas anotaciones.`
                  : 'Uno de los registros se modificó después de escribirse. Alguien tocó el historial por debajo.'}
                {chain.complete
                  ? ''
                  : ' Se han revisado las más recientes, no el historial completo.'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
