'use client';

import { toStroops } from '@aegis/contracts';
import { ChevronRight, Gauge as GaugeIcon, Lock, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { QueryState } from '@/components/dashboard/query-state';
import { Card } from '@/components/ui/card';
import { Gauge } from '@/components/ui/gauge';
import { OrbitMark } from '@/components/ui/marks';
import { Sparkline } from '@/components/ui/sparkline';
import { useBalances, usePolicy, useTransactions } from '@/lib/api/hooks';
import { cumulativeFlow, dailyLimitUsage, reservedAmount } from '@/lib/stats';
import { formatAmount } from '@/lib/utils';

/**
 * Las tres cifras que importan de un vistazo: cuánto hay, cuánto queda del día
 * y quién decide.
 *
 * Las cifras van en Space Grotesk con cifras tabulares, y las figuras —el
 * anillo y la línea de tendencia— están dibujadas a mano en SVG. Ninguna
 * adorna: el anillo dice cuánto del límite diario se ha gastado y la línea, la
 * forma de los últimos movimientos.
 */
export function StatCards() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <BalanceStat />
      <DailyLimitStat />
      <ModeStat />
    </div>
  );
}

function StatShell({
  icon,
  label,
  action,
  children,
}: {
  icon: ReactNode;
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="flex-1 truncate text-sm whitespace-nowrap text-muted-foreground">
          {label}
        </span>
        {action}
      </div>
      {children}
    </Card>
  );
}

function BalanceStat() {
  const balances = useBalances();
  const transactions = useTransactions(50);

  const sorted = [...(balances.data?.balances ?? [])].sort((a, b) =>
    Number(toStroops(b.available) - toStroops(a.available)),
  );
  const [main, ...rest] = sorted;
  const reserved = main ? reservedAmount(main.total, main.available) : '0';
  const flow = main ? cumulativeFlow(transactions.data?.transactions ?? [], main.asset) : [];

  return (
    <StatShell icon={<Wallet className="size-4" />} label="Saldo disponible">
      <QueryState isLoading={balances.isLoading} error={balances.error} rows={2}>
        {main ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-baseline gap-2">
              <span className="font-display text-4xl leading-none font-semibold tabular-nums">
                {formatAmount(main.available)}
              </span>
              <span className="text-sm text-muted-foreground">{main.asset}</span>
            </p>

            {flow.length >= 2 ? (
              <div>
                <Sparkline values={flow} />
                <p className="text-[11px] text-muted-foreground">
                  Flujo acumulado de tus últimos movimientos
                </p>
              </div>
            ) : null}

            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <div className="flex items-center gap-1.5">
                <dt className="text-muted-foreground">En total</dt>
                <dd className="font-medium tabular-nums">{formatAmount(main.total)}</dd>
              </div>
              {toStroops(reserved) > 0n ? (
                <div className="flex items-center gap-1.5">
                  <Lock className="size-3 text-muted-foreground" />
                  <dt className="text-muted-foreground">Retenido por la red</dt>
                  <dd className="font-medium tabular-nums">{formatAmount(reserved)}</dd>
                </div>
              ) : null}
              {rest.map((balance) => (
                <div key={balance.asset} className="flex items-center gap-1.5">
                  <dt className="text-muted-foreground">{balance.asset}</dt>
                  <dd className="font-medium tabular-nums">{formatAmount(balance.available)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">La cuenta no tiene saldos todavía.</p>
        )}
      </QueryState>
    </StatShell>
  );
}

function DailyLimitStat() {
  const { data, isLoading, error } = usePolicy();

  const max = data?.config.maxDailyAmount ?? '0';
  const remaining = data?.summary.remainingDailyAmount ?? '0';
  const used = dailyLimitUsage(max, remaining);
  const percent = Math.round(used * 100);

  return (
    <StatShell icon={<GaugeIcon className="size-4" />} label="Límite diario">
      <QueryState isLoading={isLoading} error={error} rows={2}>
        {data ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <Gauge
                value={used}
                label={`${percent}%`}
                caption="gastado"
                tone={percent >= 90 ? 'danger' : percent >= 60 ? 'warning' : 'success'}
                size={104}
              />
              <div className="min-w-0">
                <p className="font-display text-3xl leading-none font-semibold tabular-nums">
                  {formatAmount(remaining)}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  disponibles hoy,
                  <br />
                  de {formatAmount(max)} cada 24 h
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Regla P-02, aplicada por el backend antes de construir nada.
            </p>
          </div>
        ) : null}
      </QueryState>
    </StatShell>
  );
}

function ModeStat() {
  const { data, isLoading, error } = usePolicy();
  const mode = data?.config.mode;
  const paused = data?.config.paused ?? false;

  return (
    <StatShell
      icon={<OrbitMark className="size-4" />}
      label="Modo"
      action={
        <Link
          href="/limites"
          aria-label="Cambiar el modo de operación"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </Link>
      }
    >
      <QueryState isLoading={isLoading} error={error} rows={2}>
        {mode ? (
          <div className="flex flex-col gap-3">
            <p className="font-display text-3xl leading-none font-semibold">
              {paused ? 'En pausa' : mode === 'AUTONOMOUS' ? 'Autónomo' : 'Manual'}
            </p>

            <p className="text-xs text-muted-foreground">
              {paused
                ? 'El kill switch está activo: la política deniega cualquier operación.'
                : mode === 'AUTONOMOUS'
                  ? 'Ejecuta dentro de tus límites. Si el Guardian ve riesgo medio o mayor, vuelve a ti.'
                  : 'Cada operación necesita tu firma, sin excepciones.'}
            </p>

            {/* Dos escalones: manual exige firma siempre; autónomo, solo cuando hay riesgo. */}
            <div className="flex gap-1.5" aria-hidden>
              <span
                className={
                  paused
                    ? 'h-1.5 flex-1 rounded-full bg-destructive'
                    : 'h-1.5 flex-1 rounded-full bg-primary'
                }
              />
              <span
                className={
                  !paused && mode === 'AUTONOMOUS'
                    ? 'h-1.5 flex-1 rounded-full bg-primary'
                    : 'h-1.5 flex-1 rounded-full bg-muted'
                }
              />
            </div>
          </div>
        ) : null}
      </QueryState>
    </StatShell>
  );
}
