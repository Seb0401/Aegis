'use client';

import { fromStroops, toStroops, type RiskReport } from '@aegis/contracts';
import { Lock, TrendingDown, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Amount } from '@/components/ui/amount';
import { usePolicy } from '@/lib/api/hooks';
import { cn, formatAmount } from '@/lib/utils';

/**
 * Qué te deja esto, antes de firmarlo.
 *
 * El Guardian ya dice si algo es arriesgado y por qué; esto responde a la
 * pregunta de al lado, que es más simple y más humana: **cómo quedo después**.
 * Con cuánto me quedo, cuánto del día me he gastado y si me acerco a la
 * reserva que dije que no se tocaba.
 *
 * Todo sale de datos que la propuesta ya trae y de los límites que ya están
 * cargados: no hace ni una llamada más. Enseñarlo no cuesta nada y es lo que
 * separa «aprobar porque el botón está ahí» de aprobar sabiendo.
 */
export function ImpactPanel({
  risk,
  total,
  asset,
  className,
}: {
  risk: RiskReport;
  /** Total de la propuesta en su activo. */
  total: string;
  asset: string;
  className?: string;
}) {
  const policy = usePolicy();
  const resumen = policy.data?.summary;

  const restanteHoy = resumen?.remainingDailyAmount;
  const reserva = resumen?.minimumReserve;

  // Qué parte de lo que queda del día se lleva esta propuesta. Por encima del
  // 100% no se recorta: que se vea que no cabe es justamente la información.
  const consumo =
    restanteHoy && toStroops(restanteHoy) > 0n
      ? Number(total) / Number(restanteHoy)
      : total && toStroops(total) > 0n
        ? 1
        : 0;

  const quedaSobreReserva =
    reserva !== undefined ? toStroops(risk.balanceAfter) - toStroops(reserva) : null;

  return (
    <section
      aria-label="Cómo te deja esta operación"
      className={cn('flex flex-col gap-3 rounded-lg bg-muted/40 p-3.5', className)}
    >
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Cómo te deja
      </h4>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Dato
          icono={<Wallet className="size-3.5" />}
          titulo="Te quedarías con"
          valor={
            <Amount
              value={risk.balanceAfter}
              asset={asset}
              className="text-base font-medium"
              assetClassName="text-xs font-normal text-muted-foreground"
            />
          }
          pie={
            risk.balanceAfterUsd ? `≈ ${Number(risk.balanceAfterUsd).toFixed(2)} USD` : undefined
          }
        />

        <Dato
          icono={<TrendingDown className="size-3.5" />}
          titulo="De lo que te queda hoy"
          valor={
            <span className="text-base font-medium tabular-nums">
              {restanteHoy ? `${Math.round(Math.min(consumo, 9.99) * 100)}%` : '—'}
            </span>
          }
          pie={restanteHoy ? `quedaban ${formatAmount(restanteHoy)} ${asset}` : undefined}
          alerta={consumo > 1}
        />

        <Dato
          icono={<Lock className="size-3.5" />}
          titulo="Sobre tu reserva"
          valor={
            quedaSobreReserva === null ? (
              <span className="text-base font-medium">—</span>
            ) : quedaSobreReserva >= 0n ? (
              <span className="text-base font-medium text-risk-low tabular-nums">
                +{formatAmount(fromStroops(quedaSobreReserva))}
              </span>
            ) : (
              <span className="text-base font-medium text-risk-critical tabular-nums">
                {formatAmount(fromStroops(quedaSobreReserva))}
              </span>
            )
          }
          pie={reserva ? `intocable: ${formatAmount(reserva)} ${asset}` : undefined}
          alerta={quedaSobreReserva !== null && quedaSobreReserva < 0n}
        />
      </dl>
    </section>
  );
}

function Dato({
  icono,
  titulo,
  valor,
  pie,
  alerta,
}: {
  icono: ReactNode;
  titulo: string;
  valor: ReactNode;
  pie?: string | undefined;
  alerta?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={alerta ? 'text-risk-high' : undefined}>{icono}</span>
        {titulo}
      </dt>
      <dd className="leading-tight">{valor}</dd>
      {pie ? <p className="text-[11px] text-muted-foreground">{pie}</p> : null}
    </div>
  );
}
