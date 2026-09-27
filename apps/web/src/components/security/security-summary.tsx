'use client';

import { PageSummary } from '@/components/layout/page-summary';
import { useAudit, useBalances, usePolicy } from '@/lib/api/hooks';
import { formatAmount } from '@/lib/utils';

/**
 * El resumen de Seguridad: las tres respuestas, antes de las tres tarjetas.
 *
 * Quien entra aquí viene a preguntarse si puede fiarse. Obligarle a leer tres
 * tarjetas para sacar esa conclusión es hacerle trabajar por algo que cabe en
 * una línea; las tarjetas están debajo para quien quiera el detalle.
 *
 * El estado del agente se colorea al revés de lo que uno esperaría: pausado
 * sale en ámbar, no en rojo. Pausar no es una avería, es una decisión que
 * alguien tomó, y pintarla como un fallo empujaría a deshacerla sin pensar.
 */
export function SecuritySummary() {
  const policy = usePolicy();
  const audit = useAudit(200);
  const balances = useBalances();

  const pausado = policy.data?.config.paused ?? false;
  const modo = policy.data?.config.mode;
  const cadena = audit.data?.chain;

  return (
    <PageSummary
      items={[
        {
          label: 'El agente',
          value: pausado ? 'En pausa' : 'Activo',
          tone: pausado ? 'warn' : 'good',
          hint: pausado
            ? 'la política deniega todo'
            : modo === 'AUTONOMOUS'
              ? 'ejecuta dentro de tus límites'
              : 'cada operación necesita tu firma',
        },
        {
          label: 'Bitácora',
          value: cadena ? (cadena.valid ? 'Íntegra' : 'Rota') : '…',
          tone: cadena ? (cadena.valid ? 'good' : 'bad') : 'neutral',
          ...(cadena ? { hint: `${cadena.verifiedEvents} eventos verificados` } : {}),
        },
        {
          label: 'Tope por operación',
          value: policy.data ? formatAmount(policy.data.config.maxAmountPerOperation) : '—',
          hint: 'ninguna lo puede pasar',
        },
        {
          label: 'Reserva intocable',
          value: policy.data ? formatAmount(policy.data.config.minimumReserve) : '—',
          hint: balances.data?.balances[0]
            ? `de ${formatAmount(balances.data.balances[0].total)} ${balances.data.balances[0].asset}`
            : undefined,
        },
      ]}
    />
  );
}
