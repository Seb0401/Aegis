import {
  addAmounts,
  compareAmounts,
  type AssetCode,
  type Proposal,
  type ProposalStatus,
  type ProposedAction,
  type RiskLevel,
  type RiskSignalId,
} from '@aegis/contracts';

/**
 * Vocabulario del dominio de propuestas, en un solo sitio.
 *
 * Los estados, niveles de riesgo y señales aparecen en varias pantallas. Si
 * cada una escribe su propia traducción, acaban diciendo cosas distintas del
 * mismo estado, que es justo lo que no puede pasar en una pantalla donde se
 * aprueban pagos.
 */

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  DRAFT: 'Borrador',
  POLICY_CHECK: 'Revisando límites',
  GUARDIAN_REVIEW: 'Analizando riesgo',
  PENDING_USER: 'Espera tu firma',
  AUTO_APPROVED: 'Aprobada automáticamente',
  SIGNED: 'Firmada',
  SUBMITTED: 'Enviada a la red',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada por ti',
  DENIED: 'Denegada por la política',
  EXPIRED: 'Caducada',
  FAILED: 'Falló',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  LOW: 'Riesgo bajo',
  MEDIUM: 'Riesgo medio',
  HIGH: 'Riesgo alto',
  CRITICAL: 'Riesgo crítico',
};

export const RISK_VARIANT = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

/** Nombre corto de cada señal del Guardian (§8.2 del PLAN). */
export const SIGNAL_NAME: Record<RiskSignalId, string> = {
  'G-01': 'Dirección nunca vista',
  'G-02': 'Porcentaje del saldo',
  'G-03': 'Monto atípico',
  'G-04': 'Saldo bajo la reserva',
  'G-05': 'Destino sin cuenta o sin trustline',
  'G-06': 'Cuenta destino muy nueva',
  'G-07': 'Activo nunca usado',
  'G-08': 'Velocidad inusual',
  'G-09': 'Destino bloqueado',
};

/**
 * «1 operación» pero «2 operaciones»: el acento desaparece en plural, así que
 * no vale con pegarle una «es» al singular.
 */
export function operationCount(count: number): string {
  return count === 1 ? '1 operación' : `${count} operaciones`;
}

/**
 * Total que la API compara contra `confirmedTotal`.
 *
 * Es la suma plana de todas las acciones, sin separar por activo: así lo hace
 * `totalOf()` en el backend, y el número que escribe el usuario tiene que
 * coincidir con ese. Se usa `addAmounts` de `@aegis/contracts` por lo mismo
 * que allí: sumar dinero con `Number` pierde decimales.
 */
export function proposalTotal(actions: Pick<ProposedAction, 'amount'>[]): string {
  return addAmounts('0', ...actions.map((action) => action.amount));
}

/** Totales desglosados por activo, que es lo que el usuario entiende. */
export function totalsByAsset(actions: ProposedAction[]): Array<[AssetCode, string]> {
  const totals = new Map<AssetCode, string>();
  for (const action of actions) {
    totals.set(action.asset, addAmounts(totals.get(action.asset) ?? '0', action.amount));
  }
  return [...totals.entries()];
}

/** Solo desde `PENDING_USER` se puede aprobar o rechazar (máquina de estados §4.3). */
export function isActionable(proposal: Proposal): boolean {
  return proposal.status === 'PENDING_USER';
}

/** Estados en los que todavía puede cambiar algo: justifican sondear la API. */
export function isLive(proposal: Proposal): boolean {
  const live: ProposalStatus[] = ['PENDING_USER', 'AUTO_APPROVED', 'SIGNED', 'SUBMITTED'];
  return live.includes(proposal.status);
}

/**
 * Con riesgo alto o crítico, la API exige que el usuario reescriba el monto
 * total. No es un obstáculo decorativo: obliga a leer la cifra antes de firmar.
 */
export function needsTotalConfirmation(proposal: Proposal): boolean {
  return proposal.risk?.level === 'HIGH' || proposal.risk?.level === 'CRITICAL';
}

/**
 * ¿Coincide lo que escribió el usuario con el total?
 *
 * `compareAmounts` lanza si el texto no es un monto válido, y mientras se
 * escribe casi nunca lo es. Un texto a medias es "todavía no coincide", no un
 * error que deba romper la pantalla.
 */
export function matchesTotal(typed: string, total: string): boolean {
  try {
    return compareAmounts(typed.trim(), total) === 0;
  } catch {
    return false;
  }
}
