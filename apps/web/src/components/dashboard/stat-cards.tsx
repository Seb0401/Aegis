'use client';

import { subtractAmounts, toStroops } from '@aegis/contracts';
import { ChevronRight, Gauge, Settings2, Wallet } from 'lucide-react';
import Link from 'next/link';
import { QueryState } from '@/components/dashboard/query-state';
import { Card } from '@/components/ui/card';
import { useBalances, usePolicy } from '@/lib/api/hooks';
import { formatAmount } from '@/lib/utils';

/**
 * La fila de tres tarjetas del mockup: saldo, límite diario y modo.
 *
 * Es un resumen, no una versión recortada: el detalle completo de los límites
 * sigue estando en /limites, y el desglose de saldos sigue distinguiendo total
 * de disponible, que es la diferencia que evita creer que se puede gastar más
 * de lo que hay.
 */
export function StatCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <BalanceStat />
      <DailyLimitStat />
      <ModeStat />
    </div>
  );
}

function StatShell({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        {label}
      </span>
      {children}
    </Card>
  );
}

function BalanceStat() {
  const { data, isLoading, error } = useBalances();
  const balances = data?.balances ?? [];
  // El primero es el que va en grande; el resto, en una línea debajo. No se
  // convierte nada entre activos: Aegis no tiene precios y no va a inventarlos.
  const [main, ...rest] = [...balances].sort((a, b) =>
    Number(toStroops(b.available) - toStroops(a.available)),
  );

  return (
    <StatShell icon={<Wallet className="size-4" />} label="Saldo disponible">
      <QueryState isLoading={isLoading} error={error} rows={2}>
        {main ? (
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {formatAmount(main.available)}
              </span>
              <span className="text-sm text-muted-foreground">{main.asset}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {formatAmount(main.total)} en total
              {rest.length > 0
                ? ` · ${rest.map((b) => `${formatAmount(b.available)} ${b.asset}`).join(' · ')}`
                : ''}
            </p>
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

  const max = data?.config.maxDailyAmount;
  const remaining = data?.summary.remainingDailyAmount;
  // Porcentaje ya gastado de la ventana de 24 h (regla P-02).
  const usedPercent =
    max && remaining && toStroops(max) > 0n
      ? Math.min(
          100,
          Math.max(0, Number((toStroops(subtractAmounts(max, remaining)) * 100n) / toStroops(max))),
        )
      : 0;

  return (
    <StatShell icon={<Gauge className="size-4" />} label="Límite diario">
      <QueryState isLoading={isLoading} error={error} rows={2}>
        {data ? (
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {formatAmount(max ?? '0')}
              </span>
              <span className="text-sm text-muted-foreground">por 24 h</span>
            </p>

            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={usedPercent}
              aria-label="Parte del límite diario ya consumida"
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-success transition-[width]"
                style={{ width: `${100 - usedPercent}%` }}
              />
            </div>

            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              Te queda {formatAmount(remaining ?? '0')}
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

  return (
    <StatShell icon={<Settings2 className="size-4" />} label="Modo de operación">
      <QueryState isLoading={isLoading} error={error} rows={2}>
        {mode ? (
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold">
                {mode === 'AUTONOMOUS' ? 'Autónomo' : 'Manual'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {mode === 'AUTONOMOUS'
                  ? 'Ejecuta dentro de tus límites; el Guardian puede devolvértelo'
                  : 'Requiere tu autorización'}
              </p>
            </div>
            <Link
              href="/limites"
              aria-label="Cambiar el modo de operación"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        ) : null}
      </QueryState>
    </StatShell>
  );
}
