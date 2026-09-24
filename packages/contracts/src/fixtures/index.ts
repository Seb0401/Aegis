import type { Balance, TxSummary } from '../common.js';
import type { Destination } from '../destination.js';
import type { PriceSnapshot } from '../prices.js';
import type { RiskReport } from '../risk.js';

/**
 * Datos de prueba compartidos.
 *
 * Existen para que FE, AI y BE2 puedan trabajar sin esperar a la integración
 * real con Stellar (§6.2). No se usan en producción.
 */

/**
 * Cuenta de demo. Las direcciones de este archivo son claves públicas válidas
 * (formato y checksum correctos) generadas de forma determinista, pero nadie
 * controla su clave privada: sirven para mocks, no para enviar dinero real.
 */
export const DEMO_USER_ADDRESS = 'GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP';

export const FIXTURE_BALANCES: Balance[] = [
  { asset: 'XLM', total: '100.0000000', available: '95.0000000' },
  { asset: 'USDC_TEST', total: '250.0000000', available: '250.0000000' },
];

export const FIXTURE_DESTINATIONS: Destination[] = [
  {
    id: 'dest_goal_viaje',
    userId: 'user_demo',
    kind: 'GOAL',
    label: 'Viaje',
    address: 'GB7G7EFKMW57EL2C647XFLA7YWM32PVJ4FYWPJQXPHTNZJKIV5RVVZJ4',
    targetAmount: '500.0000000',
    targetAsset: 'USDC_TEST',
    trusted: true,
    blocked: false,
    createdAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'dest_goal_laptop',
    userId: 'user_demo',
    kind: 'GOAL',
    label: 'Laptop',
    address: 'GCWECULR5SPOTSDONAHN4WWRBR62UV4QOZP5DAUOMWISRIITQ4IA5VIS',
    targetAmount: '1200.0000000',
    targetAsset: 'USDC_TEST',
    trusted: true,
    blocked: false,
    createdAt: '2026-09-01T10:01:00.000Z',
  },
  {
    id: 'dest_goal_curso',
    userId: 'user_demo',
    kind: 'GOAL',
    label: 'Curso',
    address: 'GCTKRF7KHNLSUV7C5MKQD5JXEDJKFLD2H7NUPHC7WC4TCTV4BFFVUVDY',
    targetAmount: '300.0000000',
    targetAsset: 'USDC_TEST',
    trusted: true,
    blocked: false,
    createdAt: '2026-09-01T10:02:00.000Z',
  },
  {
    id: 'dest_emergencias',
    userId: 'user_demo',
    kind: 'EMERGENCY_FUND',
    label: 'Emergencias',
    address: 'GDHGYXQQSKAHXJTOT3W43LSO76V3ZCK5IAWH2O7MLYSJ7J3C7BR3W5A4',
    targetAmount: null,
    targetAsset: null,
    trusted: true,
    blocked: false,
    createdAt: '2026-09-01T10:03:00.000Z',
  },
  {
    id: 'dest_contacto_ana',
    userId: 'user_demo',
    kind: 'CONTACT',
    label: 'Ana',
    address: 'GDRX6ATFBUJMFDUBRAD7OV535ZADFSVPF2GRUR6EA37LFEJUQ2KIU66D',
    targetAmount: null,
    targetAsset: null,
    trusted: false,
    blocked: false,
    createdAt: '2026-09-10T18:30:00.000Z',
  },
];

export const FIXTURE_HISTORY: TxSummary[] = [
  {
    hash: 'a1'.repeat(32),
    createdAt: '2026-09-15T12:00:00.000Z',
    direction: 'OUT',
    counterparty: FIXTURE_DESTINATIONS[0]!.address,
    asset: 'USDC_TEST',
    amount: '10.0000000',
    memo: 'Ahorro viaje',
    successful: true,
  },
  {
    hash: 'b2'.repeat(32),
    createdAt: '2026-09-12T09:15:00.000Z',
    direction: 'OUT',
    counterparty: FIXTURE_DESTINATIONS[1]!.address,
    asset: 'USDC_TEST',
    amount: '12.0000000',
    memo: null,
    successful: true,
  },
  {
    hash: 'c3'.repeat(32),
    createdAt: '2026-09-08T20:40:00.000Z',
    direction: 'IN',
    counterparty: 'GCP65WP64YSGDF6IWPIMRROF4OALYFMWX74DVUMF5VE2LRABO5CK6CYU',
    asset: 'USDC_TEST',
    amount: '300.0000000',
    memo: 'Nómina',
    successful: true,
  },
  {
    hash: 'd4'.repeat(32),
    createdAt: '2026-09-05T11:00:00.000Z',
    direction: 'OUT',
    counterparty: FIXTURE_DESTINATIONS[2]!.address,
    asset: 'USDC_TEST',
    amount: '8.0000000',
    memo: null,
    successful: true,
  },
];

/** Caso tranquilo: reparto pequeño entre objetivos conocidos. */
export const FIXTURE_RISK_LOW: RiskReport = {
  score: 12,
  level: 'LOW',
  signals: [
    {
      id: 'G-02',
      severity: 'INFO',
      data: { percentageOfBalance: 20, asset: 'USDC_TEST' },
    },
  ],
  balanceAfter: '200.0000000',
  totalUsd: '50.0000000',
  balanceAfterUsd: '200.0000000',
  evaluatedAt: '2026-09-19T10:00:00.000Z',
};

/** Caso del ejemplo del PLAN §1.4 llevado al extremo: se vacía el saldo. */
export const FIXTURE_RISK_HIGH: RiskReport = {
  score: 74,
  level: 'HIGH',
  signals: [
    {
      id: 'G-02',
      severity: 'HIGH',
      data: { percentageOfBalance: 85, asset: 'USDC_TEST' },
    },
    {
      id: 'G-04',
      severity: 'HIGH',
      data: { balanceAfter: '3.0000000', minimumReserve: '10.0000000' },
    },
    {
      id: 'G-03',
      severity: 'WARN',
      data: { amount: '80.0000000', medianAmount: '10.0000000', ratio: 8 },
      actionIndex: 0,
    },
  ],
  balanceAfter: '3.0000000',
  totalUsd: '247.0000000',
  balanceAfterUsd: '3.0000000',
  evaluatedAt: '2026-09-19T10:05:00.000Z',
};

/** Caso que debe bloquear: dirección nueva y nunca vista, monto grande. */
export const FIXTURE_RISK_CRITICAL: RiskReport = {
  score: 92,
  level: 'CRITICAL',
  signals: [
    {
      id: 'G-01',
      severity: 'HIGH',
      data: { destinationLabel: 'Desconocido', address: 'G…EXAMPLE' },
      actionIndex: 0,
    },
    {
      id: 'G-05',
      severity: 'HIGH',
      data: { exists: false, asset: 'USDC_TEST' },
      actionIndex: 0,
    },
    {
      id: 'G-06',
      severity: 'WARN',
      data: { ageDays: 2 },
      actionIndex: 0,
    },
  ],
  balanceAfter: '0.0000000',
  totalUsd: '250.0000000',
  balanceAfterUsd: '0.0000000',
  evaluatedAt: '2026-09-19T10:10:00.000Z',
};

export const FIXTURE_RISK_REPORTS = {
  low: FIXTURE_RISK_LOW,
  high: FIXTURE_RISK_HIGH,
  critical: FIXTURE_RISK_CRITICAL,
} as const;

/** Caso en el que el oráculo no responde: no se puede valorar en dólares. */
export const FIXTURE_RISK_NO_PRICE: RiskReport = {
  score: 15,
  level: 'LOW',
  signals: [
    {
      id: 'G-10',
      severity: 'WARN',
      data: { assetsWithoutPrice: ['XLM'] },
    },
  ],
  balanceAfter: '80.0000000',
  totalUsd: null,
  balanceAfterUsd: null,
  evaluatedAt: '2026-09-19T10:15:00.000Z',
};

/** Foto de precios de ejemplo para el frontend y los tests. */
export const FIXTURE_PRICE_SNAPSHOT: PriceSnapshot = {
  capturedAt: '2026-09-19T10:00:00.000Z',
  quotes: [
    { asset: 'XLM', usd: '0.1200000', source: 'market', asOf: '2026-09-19T09:59:00.000Z' },
    { asset: 'USDC_TEST', usd: '1.0000000', source: 'fixed', asOf: '2026-09-19T10:00:00.000Z' },
  ],
};
