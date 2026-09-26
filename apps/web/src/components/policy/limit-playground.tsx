'use client';

import type { ProposalInput } from '@aegis/contracts';
import { FlaskConical, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Amount } from '@/components/ui/amount';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDestinations, usePolicy, useSimulation } from '@/lib/api/hooks';
import { RISK_LABEL, RISK_VARIANT } from '@/lib/proposals';
import { cn, formatAmount } from '@/lib/utils';

/**
 * El probador de límites.
 *
 * Responde a «¿y si?» sin comprometerse a nada: mueves el importe y ves, en
 * vivo, qué diría Aegis. No crea ninguna propuesta ni deja rastro en la
 * bitácora —preguntar no es un hecho auditable—, y el veredicto sale del
 * mismo `POST /proposals/simulate` que usa el motor de verdad, con las mismas
 * reglas y el mismo Guardian.
 *
 * Que sea la misma lógica es lo único que lo hace valer. Un probador con su
 * propia aritmética sería una mentira educada: enseñaría un «cabe» y luego la
 * operación real fallaría.
 *
 * Existe porque unos límites que solo se leen como números en un formulario
 * son una promesa abstracta. Aquí se ven actuar, que es otra cosa: subes de
 * 5 y aparece P-01 con su nombre.
 */
export function LimitPlayground() {
  const destinations = useDestinations();
  const policy = usePolicy();

  const disponibles = destinations.data?.destinations.filter((d) => !d.blocked) ?? [];
  const [destinoId, setDestinoId] = useState('');
  const [importe, setImporte] = useState('5');

  // El primer destino en cuanto haya alguno: abrir el probador vacío obliga a
  // una elección antes de poder jugar, que es justo la fricción que sobra.
  useEffect(() => {
    if (!destinoId && disponibles[0]) setDestinoId(disponibles[0].id);
  }, [destinoId, disponibles]);

  /*
    El importe se envía con un respiro. Cada llamada sale a Horizon varias
    veces —saldos, historial, comisión—, así que mandar una por cada tecla
    castigaría a la red y al límite de peticiones sin que nadie llegue a leer
    los resultados intermedios.
  */
  const importeEstable = useDebounced(importe, 400);

  const peticion: ProposalInput | null = useMemo(() => {
    const numero = Number(importeEstable);
    if (!destinoId || !Number.isFinite(numero) || numero <= 0) return null;

    return {
      summary: 'Prueba de límites',
      actions: [
        {
          type: 'PAYMENT',
          destinationId: destinoId,
          asset: 'XLM',
          amount: numero.toFixed(7),
          memo: null,
          label: 'Prueba',
        },
      ],
      requestedTotal: null,
    };
  }, [destinoId, importeEstable]);

  const simulacion = useSimulation(peticion);
  const resultado = simulacion.data;

  /*
    El recorrido se calcula sobre el tope POR OPERACIÓN, no sobre el diario.
    Con el diario en 1000 y el de operación en 5, un deslizador de 0 a 1500
    dejaba toda la zona interesante aplastada en el primer milímetro: se podía
    arrastrar entero sin ver nunca cambiar el veredicto. Cuatro veces el tope
    por operación deja el punto en el que salta P-01 aproximadamente a un
    cuarto del recorrido, con sitio de sobra a los dos lados.
  */
  const topeOperacion = Number(policy.data?.config.maxAmountPerOperation ?? '5');
  const maximoDeslizador = Math.max(topeOperacion * 4, 10);
  const marcaTope = topeOperacion > 0 ? (topeOperacion / maximoDeslizador) * 100 : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" />
          Pruébalos
        </CardTitle>
        <CardDescription>
          Mueve el importe y mira qué diría Aegis. No crea ninguna propuesta ni mueve un céntimo.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Destino</span>
            <select
              value={destinoId}
              onChange={(evento) => setDestinoId(evento.target.value)}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {disponibles.length === 0 ? <option value="">Sin destinos registrados</option> : null}
              {disponibles.map((destino) => (
                <option key={destino.id} value={destino.id}>
                  {destino.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Importe</span>
            <output className="font-display flex h-10 items-center text-3xl leading-none font-semibold tabular-nums">
              {formatAmount(Number(importe || 0).toFixed(7))}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">XLM</span>
            </output>
          </div>
        </div>

        <div className="relative">
          <input
            type="range"
            min={0}
            max={maximoDeslizador}
            step={maximoDeslizador > 100 ? 1 : 0.25}
            value={Number(importe || 0)}
            onChange={(evento) => setImporte(evento.target.value)}
            aria-label="Importe a probar"
            className="deslizador w-full"
          />

          {/*
            Dónde está el tope por operación, marcado sobre la propia barra.
            Sin esto hay que descubrirlo arrastrando a ciegas; con esto se ve
            de antemano hacia dónde hay que ir para romperlo, que es
            justamente lo que se quiere enseñar.
          */}
          {marcaTope !== null && marcaTope < 100 ? (
            <div
              className="pointer-events-none absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${marcaTope}%` }}
              aria-hidden
            >
              <span className="h-6 w-px bg-risk-medium/70" />
              <span className="mt-0.5 text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
                tope {formatAmount(String(topeOperacion))}
              </span>
            </div>
          ) : null}
        </div>

        <Veredicto
          cargando={simulacion.isFetching}
          sinDestinos={disponibles.length === 0}
          error={simulacion.error}
          resultado={resultado ?? null}
        />
      </CardContent>
    </Card>
  );
}

function Veredicto({
  cargando,
  sinDestinos,
  error,
  resultado,
}: {
  cargando: boolean;
  sinDestinos: boolean;
  error: unknown;
  resultado: ReturnType<typeof useSimulation>['data'] | null;
}) {
  if (sinDestinos) {
    return (
      <p className="text-sm text-muted-foreground">
        Registra un destino para poder probar los límites contra él.
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
        <TriangleAlert className="size-4 shrink-0" />
        No se pudo simular. Vuelve a moverlo en un momento.
      </p>
    );
  }

  if (!resultado) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Calculando…
      </p>
    );
  }

  const aprobadaSola = resultado.policy.decision === 'AUTO_APPROVE';
  const denegada = resultado.policy.decision === 'DENY';

  return (
    // Mientras se recalcula, lo anterior se atenúa en vez de desaparecer: un
    // panel que parpadea a vacío en cada paso del deslizador no se puede leer.
    <div className={cn('flex flex-col gap-3 transition-opacity', cargando && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        {/* `critical` es el tono que la insignia reserva para lo denegado. */}
        <Badge variant={denegada ? 'critical' : aprobadaSola ? 'default' : 'outline'}>
          {denegada ? 'Denegada' : aprobadaSola ? 'Se ejecuta sola' : 'Pediría tu firma'}
        </Badge>
        <Badge variant={RISK_VARIANT[resultado.risk.level]}>
          {RISK_LABEL[resultado.risk.level]} · {resultado.risk.score}/100
        </Badge>
        {cargando ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      </div>

      <ul className="flex flex-col gap-1.5">
        {resultado.policy.reasons.map((motivo, indice) => (
          <li key={`${motivo.ruleId}-${indice}`} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">
              {motivo.ruleId}
            </span>
            <span>{motivo.message}</span>
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        Te quedarías con
        <Amount
          value={resultado.risk.balanceAfter}
          asset="XLM"
          className="font-medium text-foreground"
        />
      </p>
    </div>
  );
}

/** Espera a que alguien deje de escribir (o de arrastrar) antes de actuar. */
function useDebounced<T>(valor: T, milisegundos: number): T {
  const [estable, setEstable] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setEstable(valor), milisegundos);
    return () => clearTimeout(temporizador);
  }, [valor, milisegundos]);

  return estable;
}
