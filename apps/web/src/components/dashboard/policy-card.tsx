'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePolicy } from '@/lib/api/hooks';
import { formatAmount } from '@/lib/utils';
import { QueryState } from './query-state';

/**
 * Límites vigentes (FE-09, reglas P-01…P-08).
 *
 * De momento es solo lectura: el formulario de edición es la tarea FE-09
 * completa y merece su propio PR con confirmación por campo.
 */
export function PolicyCard() {
  const { data, isLoading, error } = usePolicy();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Límites
          {data?.config.paused ? <Badge variant="critical">Agente pausado</Badge> : null}
        </CardTitle>
        <CardDescription>
          Los aplica el backend antes que nada. El agente no puede saltárselos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState isLoading={isLoading} error={error} rows={4}>
          {data ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Row
                label="Máximo por operación"
                value={formatAmount(data.config.maxAmountPerOperation)}
              />
              <Row label="Límite diario" value={formatAmount(data.config.maxDailyAmount)} />
              <Row
                label="Queda hoy"
                value={formatAmount(data.summary.remainingDailyAmount)}
                emphasis
              />
              <Row label="Reserva intocable" value={formatAmount(data.config.minimumReserve)} />
              <Row label="Modo" value={data.config.mode === 'AUTONOMOUS' ? 'Autónomo' : 'Manual'} />
              <Row label="Activos" value={data.config.allowedAssets.join(', ')} />
            </dl>
          ) : null}
        </QueryState>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={emphasis ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</dd>
    </div>
  );
}
