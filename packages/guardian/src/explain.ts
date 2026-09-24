import {
  addAmounts,
  formatAmount,
  formatUsd,
  type AssetCode,
  type Explanation,
  type ResolvedAction,
  type RiskReport,
  type RiskSignal,
} from '@aegis/contracts';

/**
 * Explicación determinista a partir del `RiskReport`.
 *
 * Este es el camino de respaldo de AI-06 y, a la vez, la referencia de la que
 * parte el explicador con LLM: primero se construye este texto con datos reales
 * y después el modelo solo puede reescribirlo, nunca añadir cifras (AI-Q5).
 *
 * Por eso vive en el Guardian y no en el agente: las cifras salen de aquí.
 */
export function buildTemplateExplanation(
  report: RiskReport,
  actions: ResolvedAction[],
): Explanation {
  return {
    summary: buildSummary(report, actions),
    warnings: report.signals
      .filter((signal) => signal.severity !== 'INFO')
      .map((signal) => ({ signalId: signal.id, text: describeSignal(signal) })),
    generatedBy: 'template',
  };
}

function buildSummary(report: RiskReport, actions: ResolvedAction[]): string {
  if (actions.length === 0) {
    return 'La propuesta no contiene ninguna operación.';
  }

  const totals = new Map<AssetCode, string>();
  for (const action of actions) {
    totals.set(action.asset, addAmounts(totals.get(action.asset) ?? '0', action.amount));
  }

  const totalText = [...totals.entries()]
    .map(([asset, total]) => `${formatAmount(total)} ${asset}`)
    .join(' y ');

  const paymentsText = actions.length === 1 ? 'en 1 pago' : `en ${actions.length} pagos`;

  const destinations = actions.map((a) => a.destinationLabel);
  const uniqueDestinations = [...new Set(destinations)];
  const destinationsText =
    uniqueDestinations.length <= 3
      ? uniqueDestinations.join(', ')
      : `${uniqueDestinations.slice(0, 3).join(', ')} y ${uniqueDestinations.length - 3} más`;

  // El valor en dólares solo aparece si el informe lo calculó. Es la cifra que
  // la mayoría de la gente entiende de un vistazo, pero inventarla sería peor
  // que omitirla.
  const usdText = report.totalUsd ? ` (unos ${formatUsd(report.totalUsd)})` : '';
  const balanceUsdText = report.balanceAfterUsd
    ? ` (unos ${formatUsd(report.balanceAfterUsd)})`
    : '';

  return (
    `Vas a enviar ${totalText}${usdText} ${paymentsText} a ${destinationsText}. ` +
    `Después te quedarían ${formatAmount(report.balanceAfter)}${balanceUsdText}.`
  );
}

/**
 * Texto de cada señal. Solo usa valores presentes en `signal.data`: si un dato
 * falta, la frase se degrada en vez de inventarlo.
 */
function describeSignal(signal: RiskSignal): string {
  const data = signal.data as Record<string, string | number | boolean | undefined>;
  const label = typeof data.destinationLabel === 'string' ? data.destinationLabel : 'este destino';

  switch (signal.id) {
    case 'G-01':
      return `Nunca has enviado nada a ${label}.`;

    case 'G-02':
      return typeof data.percentageOfBalance === 'number'
        ? `Esta operación representa el ${data.percentageOfBalance}% de tu saldo de ${data.asset}.`
        : 'Esta operación compromete una parte importante de tu saldo.';

    case 'G-03':
      return typeof data.ratio === 'number'
        ? `Es ${data.ratio} veces más que tu envío habitual (${formatAmount(String(data.medianAmount))}).`
        : 'El monto es muy superior a tu envío habitual.';

    case 'G-04':
      return `Después te quedarían ${formatAmount(String(data.balanceAfter))} y tu reserva mínima es ${formatAmount(String(data.minimumReserve))}.`;

    case 'G-05':
      return data.missingTrustline === true
        ? `${label} no puede recibir ${data.asset}: le falta la trustline.`
        : `La cuenta de ${label} no existe en la red.`;

    case 'G-06':
      return `La cuenta de ${label} se creó hace ${data.ageDays} días.`;

    case 'G-07':
      return `Es la primera vez que envías ${data.asset}.`;

    case 'G-08':
      return `Llevas ${data.outgoingLastHour} operaciones en la última hora y esta propuesta añade ${data.proposedOperations}.`;

    case 'G-09':
      return `${label} está en tu lista de bloqueo.`;

    case 'G-10':
      return (
        'No he podido saber cuánto vale esto en dólares, así que no he podido ' +
        'comprobar tus límites en esa moneda.'
      );

    default: {
      // Si aparece una señal nueva sin texto, se avisa en vez de callar.
      const exhaustive: never = signal.id;
      return `Señal de riesgo sin descripción: ${String(exhaustive)}.`;
    }
  }
}
