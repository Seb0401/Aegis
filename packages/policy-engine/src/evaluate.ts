import {
  addAmounts,
  compareAmounts,
  formatAmount,
  isGreaterThan,
  isLessThan,
  subtractAmounts,
  type AssetCode,
  type Destination,
  type PolicyDecision,
  type PolicyDecisionKind,
  type PolicyReason,
  type ProposedAction,
} from '@aegis/contracts';
import { DECISION_PRECEDENCE, type PolicyEvaluationInput } from './types.js';

/**
 * Evalúa una propuesta contra las reglas P-01…P-09.
 *
 * Contrato del motor:
 *  - Es puro y síncrono. La misma entrada siempre da la misma salida.
 *  - Recoge TODAS las razones, no corta en la primera. El usuario merece ver
 *    todo lo que está mal, no solo lo primero que falló.
 *  - La decisión final es la más restrictiva de todas las razones.
 *
 * Reparto de responsabilidades entre DENY y REQUIRE_USER:
 *  - `DENY` es para lo que el usuario no puede arreglar aprobando: kill switch,
 *    destino bloqueado o desconocido, activo no permitido, fondos insuficientes
 *    y la reserva mínima intocable.
 *  - `REQUIRE_USER` es para lo que solo significa "esto excede lo que el agente
 *    puede hacer solo": montos por encima del límite, destino sin historial,
 *    demasiadas operaciones por hora y el modo MANUAL.
 */
export function evaluatePolicy(input: PolicyEvaluationInput): PolicyDecision {
  const now = input.now ?? new Date();
  const reasons: PolicyReason[] = [];

  const destinationsById = new Map(input.destinations.map((d) => [d.id, d]));
  const balanceByAsset = new Map(input.balances.map((b) => [b.asset, b]));
  const knownCounterparties = new Set(input.knownCounterparties ?? []);

  // ── P-08 · Kill switch ────────────────────────────────────────────
  // Se evalúa primero y corta: si el agente está en pausa, nada más importa.
  if (input.config.paused) {
    return {
      decision: 'DENY',
      reasons: [
        {
          ruleId: 'P-08',
          effect: 'DENY',
          message: 'El agente está en pausa. Reactívalo para poder operar.',
        },
      ],
      evaluatedAt: now.toISOString(),
    };
  }

  // ── P-09 · Expiración ─────────────────────────────────────────────
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= now.getTime()) {
    return {
      decision: 'DENY',
      reasons: [
        {
          ruleId: 'P-09',
          effect: 'DENY',
          message: 'La propuesta caducó. Pídele al agente que la vuelva a generar.',
        },
      ],
      evaluatedAt: now.toISOString(),
    };
  }

  // ── P-05 · Operaciones por hora ───────────────────────────────────
  const operationsLastHour = input.operationsLastHour ?? 0;
  if (operationsLastHour + input.actions.length > input.config.maxOperationsPerHour) {
    reasons.push({
      ruleId: 'P-05',
      effect: 'REQUIRE_USER',
      message:
        `Esta propuesta superaría el máximo de ${input.config.maxOperationsPerHour} ` +
        `operaciones por hora (llevas ${operationsLastHour}).`,
    });
  }

  // Totales acumulados por activo, para P-02 y P-06.
  const totalByAsset = new Map<AssetCode, string>();

  input.actions.forEach((action, actionIndex) => {
    evaluateAction({
      action,
      actionIndex,
      input,
      reasons,
      destinationsById,
      knownCounterparties,
    });

    const previous = totalByAsset.get(action.asset) ?? '0';
    totalByAsset.set(action.asset, addAmounts(previous, action.amount));
  });

  // ── P-02 · Límite diario acumulado ────────────────────────────────
  for (const [asset, total] of totalByAsset) {
    const alreadySpent = input.dailySpentByAsset?.[asset] ?? '0';
    const projected = addAmounts(alreadySpent, total);
    if (isGreaterThan(projected, input.config.maxDailyAmount)) {
      reasons.push({
        ruleId: 'P-02',
        effect: 'REQUIRE_USER',
        message:
          `Con esto llegarías a ${formatAmount(projected)} ${asset} en 24 h y ` +
          `tu límite diario es ${formatAmount(input.config.maxDailyAmount)}.`,
      });
    }
  }

  // ── P-06 · Reserva mínima y fondos suficientes ────────────────────
  for (const [asset, total] of totalByAsset) {
    const balance = balanceByAsset.get(asset);

    if (!balance) {
      reasons.push({
        ruleId: 'P-06',
        effect: 'DENY',
        message: `No tienes saldo de ${asset}.`,
      });
      continue;
    }

    if (isGreaterThan(total, balance.available)) {
      reasons.push({
        ruleId: 'P-06',
        effect: 'DENY',
        message:
          `Fondos insuficientes: la propuesta suma ${formatAmount(total)} ${asset} ` +
          `y tu saldo disponible es ${formatAmount(balance.available)}.`,
      });
      continue;
    }

    const remaining = subtractAmounts(balance.available, total);
    if (isLessThan(remaining, input.config.minimumReserve)) {
      reasons.push({
        ruleId: 'P-06',
        effect: 'DENY',
        message:
          `Te quedarían ${formatAmount(remaining)} ${asset} y tu reserva mínima ` +
          `intocable es ${formatAmount(input.config.minimumReserve)}.`,
      });
    }
  }

  // ── P-07 · Modo de operación ──────────────────────────────────────
  // En modo MANUAL nada se ejecuta solo, aunque cumpla todas las demás reglas.
  if (input.config.mode === 'MANUAL') {
    reasons.push({
      ruleId: 'P-07',
      effect: 'REQUIRE_USER',
      message: 'El agente está en modo manual: todas las operaciones necesitan tu confirmación.',
    });
  }

  const decision = reasons.reduce<PolicyDecisionKind>(
    (worst, reason) =>
      DECISION_PRECEDENCE[reason.effect] > DECISION_PRECEDENCE[worst] ? reason.effect : worst,
    'AUTO_APPROVE',
  );

  if (decision === 'AUTO_APPROVE' && reasons.length === 0) {
    reasons.push({
      ruleId: 'P-07',
      effect: 'AUTO_APPROVE',
      message: 'La propuesta cabe dentro de los límites que configuraste.',
    });
  }

  return { decision, reasons, evaluatedAt: now.toISOString() };
}

interface ActionEvaluationArgs {
  action: ProposedAction;
  actionIndex: number;
  input: PolicyEvaluationInput;
  reasons: PolicyReason[];
  destinationsById: Map<string, Destination>;
  knownCounterparties: Set<string>;
}

function evaluateAction({
  action,
  actionIndex,
  input,
  reasons,
  destinationsById,
  knownCounterparties,
}: ActionEvaluationArgs): void {
  // ── P-04 · Activos permitidos ─────────────────────────────────────
  if (!input.config.allowedAssets.includes(action.asset)) {
    reasons.push({
      ruleId: 'P-04',
      effect: 'DENY',
      actionIndex,
      message: `El activo ${action.asset} no está en tu lista de activos permitidos.`,
    });
  }

  // ── P-01 · Monto máximo por operación ─────────────────────────────
  if (compareAmounts(action.amount, input.config.maxAmountPerOperation) === 1) {
    reasons.push({
      ruleId: 'P-01',
      effect: 'REQUIRE_USER',
      actionIndex,
      message:
        `"${action.label}" es de ${formatAmount(action.amount)} ${action.asset} y ` +
        `tu límite por operación es ${formatAmount(input.config.maxAmountPerOperation)}.`,
    });
  }

  // ── P-03 · Destino registrado, no bloqueado y con historial ───────
  const destination = destinationsById.get(action.destinationId);

  if (!destination) {
    // Esto no debería ocurrir nunca: el agente solo puede usar IDs existentes.
    // Si pasa, es un fallo grave (bug o inyección) y se corta en seco.
    reasons.push({
      ruleId: 'P-03',
      effect: 'DENY',
      actionIndex,
      message: 'La propuesta apunta a un destino que no está registrado.',
    });
    return;
  }

  if (destination.blocked) {
    reasons.push({
      ruleId: 'P-03',
      effect: 'DENY',
      actionIndex,
      message: `"${destination.label}" está en tu lista de bloqueo.`,
    });
    return;
  }

  // Un destino recién registrado desde la UI todavía no tiene historial en la
  // cadena, así que sigue contando como nuevo aunque exista en la base de datos.
  const isNewDestination = !knownCounterparties.has(destination.address);
  if (isNewDestination && input.config.requireConfirmationForNewDestination) {
    reasons.push({
      ruleId: 'P-03',
      effect: 'REQUIRE_USER',
      actionIndex,
      message: `Nunca has enviado nada a "${destination.label}". Los destinos nuevos necesitan tu confirmación.`,
    });
  }
}
