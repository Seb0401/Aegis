'use client';

import { MAX_BASIS_POINTS, type SplitRule } from '@aegis/contracts';
import { CircleCheck, Loader2, Repeat, Save, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { describeError } from '@/lib/api/errors';
import { usePolicy, useDestinations, useSaveSplitRule, useSplitRule } from '@/lib/api/hooks';
import { cn, formatAmount } from '@/lib/utils';

/**
 * El reparto automático (BE2-13).
 *
 * Es la promesa del producto: dices qué parte va a cada sitio y, cuando entra
 * dinero, Aegis actúa sin que se lo pidas. Hasta ahora había que pedírselo
 * cada vez, que es justo el trabajo que esto venía a quitar.
 *
 * Dos decisiones de la pantalla que no son estéticas:
 *
 *  - **Lo que no repartes se queda en tu cuenta, y se dice.** No obligar a
 *    sumar 100 es lo que hace que «aparta el 60% y déjame el resto para
 *    vivir» se pueda expresar, que es lo que de verdad hace la gente.
 *  - **Encenderlo no mira hacia atrás.** Se avisa en pantalla, porque si no,
 *    la duda razonable es si activar esto va a disparar un pago por cada
 *    nómina del año.
 */
export function SplitRuleCard() {
  const destinations = useDestinations();
  const guardada = useSplitRule();
  const guardar = useSaveSplitRule();
  const policy = usePolicy();

  const disponibles = (destinations.data?.destinations ?? []).filter((d) => !d.blocked);

  const [enabled, setEnabled] = useState(false);
  const [minimo, setMinimo] = useState('10');
  const [partes, setPartes] = useState<Record<string, number>>({});
  const [tocado, setTocado] = useState(false);

  // La regla del servidor manda mientras nadie haya tocado nada. Después no,
  // o un refresco de fondo borraría lo que se está escribiendo.
  useEffect(() => {
    if (tocado || !guardada.data) return;

    const regla = guardada.data.rule;
    setEnabled(regla?.enabled ?? false);
    setMinimo(regla?.minimumIncome ? String(Number(regla.minimumIncome)) : '10');
    setPartes(
      Object.fromEntries(
        (regla?.shares ?? []).map((share) => [share.destinationId, share.basisPoints / 100]),
      ),
    );
  }, [guardada.data, tocado]);

  const asignado = Object.values(partes).reduce((total, porcentaje) => total + porcentaje, 0);
  const sobrante = 100 - asignado;
  const sePasa = asignado > 100;
  const sinPartes = asignado <= 0;

  /*
    Aviso de que el reparto va a chocar con los límites.

    Se mide contra el ingreso mínimo porque es el caso más favorable: si ya
    con el ingreso más pequeño que hace actuar a la regla una parte se pasa
    del tope por operación, con cualquier ingreso mayor se pasará también.

    No es un error y no impide guardar —los límites están para frenar, y
    frenar es lo que van a hacer—, pero sin este aviso lo que se ve es una
    propuesta denegada que parece un fallo de la aplicación.
  */
  const topeOperacion = Number(policy.data?.config.maxAmountPerOperation ?? 0);
  const mayorParte = Math.max(0, ...Object.values(partes));
  const mayorPago = (Number(minimo) || 0) * (mayorParte / 100);
  const chocaConLimite = topeOperacion > 0 && mayorPago > topeOperacion;

  function cambiar(destinationId: string, valor: string) {
    setTocado(true);
    const numero = Math.max(0, Math.min(100, Number(valor) || 0));
    setPartes((previo) => ({ ...previo, [destinationId]: numero }));
  }

  function enviar() {
    const rule: SplitRule = {
      enabled,
      asset: 'USDC_TEST',
      minimumIncome: String(Number(minimo) || 0),
      shares: Object.entries(partes)
        .filter(([, porcentaje]) => porcentaje > 0)
        .map(([destinationId, porcentaje]) => ({
          destinationId,
          // A puntos básicos, redondeando: el formulario habla en porcentajes
          // con dos decimales y el contrato en enteros.
          basisPoints: Math.round((porcentaje * MAX_BASIS_POINTS) / 100),
        })),
    };

    guardar.mutate(rule, { onSuccess: () => setTocado(false) });
  }

  if (disponibles.length === 0) return null;

  return (
    <Card data-tour="reparto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4 text-primary" />
          Reparto automático
        </CardTitle>
        <CardDescription>
          Cuando entre dinero en tu cuenta, Aegis lo reparte así. Sin que se lo pidas.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(evento) => {
              setTocado(true);
              setEnabled(evento.target.checked);
            }}
            className="mt-0.5 size-4"
          />
          <span>
            Repartir automáticamente
            <span className="block text-xs text-muted-foreground">
              Solo cuenta lo que entre a partir de ahora: encenderlo no reparte lo que ya recibiste.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-3">
          {disponibles.map((destino) => (
            <div key={destino.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm">{destino.label}</span>

              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={partes[destino.id] ?? 0}
                  onChange={(evento) => cambiar(destino.id, evento.target.value)}
                  aria-label={`Porcentaje para ${destino.label}`}
                  className="w-20 text-right tabular-nums"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>

        {/*
          El resto, siempre a la vista. Es la cifra que convierte esto en algo
          que se entiende: lo que no repartes no desaparece, se queda contigo.
        */}
        <div
          className={cn(
            'flex items-baseline justify-between gap-3 rounded-lg px-3.5 py-3',
            sePasa ? 'bg-destructive/10' : 'bg-muted/40',
          )}
        >
          <span className="text-sm text-muted-foreground">
            {sePasa ? 'Te has pasado del 100%' : 'Se queda en tu cuenta'}
          </span>
          <span
            className={cn(
              'font-display text-xl font-semibold tabular-nums',
              sePasa && 'text-destructive',
            )}
          >
            {sePasa ? `${asignado}%` : `${Math.round(sobrante * 100) / 100}%`}
          </span>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span>Ingreso mínimo para actuar</span>
          <Input
            type="number"
            min={0}
            step={1}
            value={minimo}
            onChange={(evento) => {
              setTocado(true);
              setMinimo(evento.target.value);
            }}
            className="w-32 tabular-nums"
          />
          <span className="text-xs text-muted-foreground">
            Por debajo de esto no se reparte: las comisiones de varios pagos se comerían un ingreso
            pequeño.
          </span>
        </label>

        {chocaConLimite ? (
          <p className="flex items-start gap-2 rounded-lg bg-risk-medium/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-risk-medium" />
            <span>
              Con un ingreso de {formatAmount(String(Number(minimo) || 0))}, el pago más grande
              sería de {formatAmount(String(Math.round(mayorPago * 1e7) / 1e7))} y tu tope por
              operación es {formatAmount(String(topeOperacion))}. El reparto se preparará igual,
              pero te lo pedirá firmar a ti en vez de ejecutarse solo.
            </span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button onClick={enviar} disabled={guardar.isPending || sePasa || (enabled && sinPartes)}>
            {guardar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Guardar reparto
          </Button>

          {enabled && sinPartes ? (
            <span className="text-sm text-muted-foreground">
              Pon al menos un porcentaje para poder encenderlo.
            </span>
          ) : null}

          {!tocado && guardar.isSuccess ? (
            <span className="rise-in flex items-center gap-1.5 rounded-full bg-risk-low/15 px-3 py-1.5 text-sm text-risk-low">
              <CircleCheck className="size-4" />
              {enabled ? 'Aegis repartirá tus próximos ingresos' : 'Reparto guardado y apagado'}
            </span>
          ) : null}

          {guardar.error ? (
            <span role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              {describeError(guardar.error)}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
