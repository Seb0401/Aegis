import {
  addAmounts,
  maxAmount,
  subtractAmounts,
  type AssetCode,
  type PolicyConfig,
  type PolicySummary,
} from '@aegis/contracts';

/**
 * Resumen que el agente puede leer a través de `AgentTools.getPolicySummary()`.
 *
 * Solo expone lo que el agente necesita para proponer algo razonable. No incluye
 * nada sensible: el LLM no toma decisiones de autorización, solo evita proponer
 * cosas que sabemos de antemano que se van a rechazar.
 */
export function buildPolicySummary(
  config: PolicyConfig,
  dailySpentByAsset: Partial<Record<AssetCode, string>> = {},
  dailySpentUsd = '0',
): PolicySummary {
  // El límite diario se comparte entre activos en el MVP, así que se resta el
  // total gastado en la ventana. Ver ADR 0003 sobre el tratamiento multi-activo.
  const totalSpent = Object.values(dailySpentByAsset).reduce<string>(
    (acc, amount) => (amount ? addAmounts(acc, amount) : acc),
    '0',
  );

  const remaining = maxAmount('0', subtractAmounts(config.maxDailyAmount, totalSpent));

  const remainingUsd = config.maxDailyAmountUsd
    ? maxAmount('0', subtractAmounts(config.maxDailyAmountUsd, dailySpentUsd))
    : null;

  return {
    mode: config.mode,
    paused: config.paused,
    maxAmountPerOperation: config.maxAmountPerOperation,
    maxDailyAmount: config.maxDailyAmount,
    minimumReserve: config.minimumReserve,
    allowedAssets: config.allowedAssets,
    remainingDailyAmount: remaining,
    maxAmountPerOperationUsd: config.maxAmountPerOperationUsd,
    remainingDailyAmountUsd: remainingUsd,
  };
}
