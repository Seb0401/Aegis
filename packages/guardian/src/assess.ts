import {
  addAmounts,
  assetsWithoutPrice,
  compareAmounts,
  percentageOf,
  ratioOf,
  subtractAmounts,
  isLessThan,
  toUsd,
  RISK_THRESHOLDS,
  type AssetCode,
  type Destination,
  type ResolvedAction,
  type RiskLevel,
  type RiskReport,
  type RiskSignal,
} from '@aegis/contracts';
import {
  ATYPICAL_AMOUNT_RATIO,
  BALANCE_PERCENTAGE_THRESHOLDS,
  NEW_ACCOUNT_AGE_DAYS,
  SIGNAL_WEIGHTS,
  UNUSUAL_VELOCITY_THRESHOLD,
  type GuardianInput,
} from './types.js';

/**
 * Calcula el informe de riesgo de una propuesta (§8.2).
 *
 * El Guardian SIEMPRE corre, también en modo autónomo. Su salida no autoriza ni
 * bloquea por sí misma: el orquestador la usa para degradar a `PENDING_USER`
 * cuando el nivel es MEDIUM o superior.
 *
 * Cada señal deja en `data` las cifras exactas que la sustentan. Esa es la única
 * fuente de números que el explicador puede usar: si un dato no está aquí, el
 * LLM no tiene derecho a mencionarlo.
 */
export function assessRisk(input: GuardianInput): RiskReport {
  const now = input.now ?? new Date();
  const signals: RiskSignal[] = [];

  const destinationsById = new Map(input.destinations.map((d) => [d.id, d]));
  const knownCounterparties = new Set(input.stats.knownCounterparties);
  const balanceByAsset = new Map(input.balances.map((b) => [b.asset, b]));

  const totalByAsset = totalsByAsset(input.actions);

  // ── Señales por acción ────────────────────────────────────────────
  input.actions.forEach((action, actionIndex) => {
    const destination = destinationsById.get(action.destinationId);
    const accountInfo = input.accountInfoByAddress[action.destinationAddress];

    // G-09 · destino en la lista de bloqueo local
    if (destination?.blocked) {
      signals.push({
        id: 'G-09',
        severity: 'HIGH',
        actionIndex,
        data: { destinationLabel: destination.label },
      });
    }

    // G-01 · dirección con la que nunca se ha interactuado
    if (!knownCounterparties.has(action.destinationAddress)) {
      signals.push({
        id: 'G-01',
        severity: destination?.trusted ? 'INFO' : 'HIGH',
        actionIndex,
        data: {
          destinationLabel: action.destinationLabel,
          amount: action.amount,
          asset: action.asset,
          trusted: destination?.trusted ?? false,
        },
      });
    }

    // G-03 · monto atípico frente al historial
    const median = input.stats.medianOutgoingAmount;
    if (median !== '0') {
      const ratio = ratioOf(action.amount, median);
      if (ratio >= ATYPICAL_AMOUNT_RATIO) {
        signals.push({
          id: 'G-03',
          severity: ratio >= ATYPICAL_AMOUNT_RATIO * 3 ? 'HIGH' : 'WARN',
          actionIndex,
          data: {
            amount: action.amount,
            asset: action.asset,
            medianAmount: median,
            ratio: Math.round(ratio * 100) / 100,
            ...usdField('amountUsd', toUsd(action.amount, action.asset, input.prices)),
          },
        });
      }
    }

    // G-05 · la cuenta destino no existe o no puede recibir el activo
    if (accountInfo && !accountInfo.exists) {
      signals.push({
        id: 'G-05',
        severity: 'HIGH',
        actionIndex,
        data: { destinationLabel: action.destinationLabel, exists: false, asset: action.asset },
      });
    } else if (
      accountInfo &&
      action.asset !== 'XLM' &&
      !accountInfo.trustlines.includes(action.asset)
    ) {
      signals.push({
        id: 'G-05',
        severity: 'HIGH',
        actionIndex,
        data: {
          destinationLabel: action.destinationLabel,
          exists: true,
          asset: action.asset,
          missingTrustline: true,
        },
      });
    }

    // G-06 · cuenta destino muy nueva
    if (
      accountInfo?.exists &&
      accountInfo.ageDays !== undefined &&
      accountInfo.ageDays < NEW_ACCOUNT_AGE_DAYS
    ) {
      signals.push({
        id: 'G-06',
        severity: 'WARN',
        actionIndex,
        data: { destinationLabel: action.destinationLabel, ageDays: accountInfo.ageDays },
      });
    }

    // G-07 · activo que el usuario nunca ha enviado
    if (!input.stats.usedAssets.includes(action.asset)) {
      signals.push({
        id: 'G-07',
        severity: 'INFO',
        actionIndex,
        data: { asset: action.asset },
      });
    }
  });

  // ── Señales de la propuesta completa ──────────────────────────────

  // G-02 · porcentaje del saldo comprometido, por activo
  for (const [asset, total] of totalByAsset) {
    const balance = balanceByAsset.get(asset);
    if (!balance) continue;

    const percentage = percentageOf(total, balance.available);
    signals.push({
      id: 'G-02',
      severity:
        percentage >= BALANCE_PERCENTAGE_THRESHOLDS.HIGH
          ? 'HIGH'
          : percentage >= BALANCE_PERCENTAGE_THRESHOLDS.WARN
            ? 'WARN'
            : 'INFO',
      data: {
        asset,
        percentageOfBalance: percentage,
        amount: total,
        availableBalance: balance.available,
        // Se incluye solo si hay precio: un `null` en los datos sería una cifra
        // que el explicador podría acabar mencionando.
        ...usdField('amountUsd', toUsd(total, asset, input.prices)),
      },
    });
  }

  // G-04 · saldo restante por debajo de la reserva mínima
  const primary = primaryAsset(totalByAsset);
  const balanceAfter = computeBalanceAfter(input, totalByAsset, primary);

  if (primary && isLessThan(balanceAfter, input.config.minimumReserve)) {
    signals.push({
      id: 'G-04',
      severity: 'HIGH',
      data: {
        asset: primary,
        balanceAfter,
        minimumReserve: input.config.minimumReserve,
      },
    });
  }

  // G-08 · velocidad inusual de operaciones
  const projectedOperations = input.stats.outgoingLastHour + input.actions.length;
  if (projectedOperations > UNUSUAL_VELOCITY_THRESHOLD) {
    signals.push({
      id: 'G-08',
      severity: 'WARN',
      data: {
        outgoingLastHour: input.stats.outgoingLastHour,
        proposedOperations: input.actions.length,
        threshold: UNUSUAL_VELOCITY_THRESHOLD,
      },
    });
  }

  // ── G-10 · No se ha podido valorar la operación en dólares ────────
  //
  // Solo se avisa si el usuario tiene topes en dólares configurados. Sin ellos,
  // desconocer el precio no impide comprobar nada, y una advertencia que no
  // cambia ninguna decisión es ruido que enseña a ignorar las advertencias.
  const usesUsdCaps = Boolean(
    input.config.maxAmountPerOperationUsd ||
    input.config.maxDailyAmountUsd ||
    input.config.minimumReserveUsd,
  );

  const unpriced = usesUsdCaps ? assetsWithoutPrice([...totalByAsset.keys()], input.prices) : [];

  if (unpriced.length > 0) {
    signals.push({
      id: 'G-10',
      severity: 'WARN',
      data: { assetsWithoutPrice: unpriced },
    });
  }

  const totalUsd = sumUsd(totalByAsset, input);
  const balanceAfterUsd = primary ? toUsd(balanceAfter, primary, input.prices) : null;

  const score = computeScore(signals);

  return {
    score,
    level: levelFromScore(score),
    signals,
    balanceAfter,
    totalUsd,
    balanceAfterUsd,
    evaluatedAt: now.toISOString(),
  };
}

/**
 * Incluye un dato en dólares solo si existe.
 *
 * Las claves de `data` son la única fuente de cifras del explicador. Meter un
 * `amountUsd: null` sería tentar a que el LLM lo mencione como si fuera un
 * valor; omitir la clave no deja esa puerta abierta.
 */
function usdField(key: string, value: string | null): Record<string, string> {
  return value === null ? {} : { [key]: value };
}

/** Suma en dólares los totales por activo. `null` si falta algún precio. */
function sumUsd(totals: Map<AssetCode, string>, input: GuardianInput): string | null {
  let sum = '0';

  for (const [asset, total] of totals) {
    const usd = toUsd(total, asset, input.prices);
    if (usd === null) return null;
    sum = addAmounts(sum, usd);
  }

  return sum;
}

/** Suma ponderada de las señales, acotada a 100. */
export function computeScore(signals: RiskSignal[]): number {
  const total = signals.reduce((acc, signal) => acc + SIGNAL_WEIGHTS[signal.severity], 0);
  return Math.min(100, total);
}

export function levelFromScore(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (score >= RISK_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= RISK_THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

function totalsByAsset(actions: ResolvedAction[]): Map<AssetCode, string> {
  const totals = new Map<AssetCode, string>();
  for (const action of actions) {
    totals.set(action.asset, addAmounts(totals.get(action.asset) ?? '0', action.amount));
  }
  return totals;
}

/** El activo con el mayor importe comprometido: es el que define `balanceAfter`. */
function primaryAsset(totals: Map<AssetCode, string>): AssetCode | undefined {
  let best: AssetCode | undefined;
  let bestTotal = '0';
  for (const [asset, total] of totals) {
    if (best === undefined || compareAmounts(total, bestTotal) === 1) {
      best = asset;
      bestTotal = total;
    }
  }
  return best;
}

function computeBalanceAfter(
  input: GuardianInput,
  totals: Map<AssetCode, string>,
  primary: AssetCode | undefined,
): string {
  if (!primary) return '0';

  const balance = input.balances.find((b) => b.asset === primary);
  if (!balance) return '0';

  const spent = totals.get(primary) ?? '0';
  // La comisión de Stellar siempre se paga en XLM, así que solo se descuenta
  // cuando el activo principal es XLM.
  const fee = primary === 'XLM' ? (input.estimatedFee ?? '0') : '0';

  return subtractAmounts(subtractAmounts(balance.available, spent), fee);
}

/** Localiza a los destinos del input por id. Útil para las pruebas y el explicador. */
export function indexDestinations(destinations: Destination[]): Map<string, Destination> {
  return new Map(destinations.map((d) => [d.id, d]));
}
