import { Horizon, Keypair, NotFoundError } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { HorizonStellarReader } from './horizon-reader.js';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';

const CUENTA = Keypair.random().publicKey();
const ANA = Keypair.random().publicKey();
const CARLOS = Keypair.random().publicKey();

/** Cuenta con saldo nativo y sin trustlines, que es el caso normal en testnet. */
const CUENTA_CON_SALDO = {
  subentry_count: 0,
  balances: [
    {
      asset_type: 'native',
      balance: '100.0000000',
      buying_liabilities: '0.0000000',
      selling_liabilities: '0.0000000',
    },
  ],
};

function pago(overrides: Record<string, unknown> = {}) {
  return {
    type: 'payment',
    transaction_hash: 'a'.repeat(64),
    created_at: '2026-09-20T10:00:00Z',
    from: CUENTA,
    to: ANA,
    asset_type: 'native',
    amount: '10.0000000',
    transaction_successful: true,
    ...overrides,
  };
}

/** Servidor de Horizon con las respuestas que necesite cada test. */
function servidor(
  options: {
    payments?: unknown[];
    account?: object;
    feeP50?: string;
    firstOperationAt?: string;
  } = {},
): Horizon.Server {
  const server = new Horizon.Server(HORIZON_URL);

  vi.spyOn(server, 'payments').mockReturnValue({
    forAccount: () => ({
      order: () => ({
        limit: () => ({ call: async () => ({ records: options.payments ?? [] }) }),
      }),
    }),
  } as unknown as ReturnType<Horizon.Server['payments']>);

  vi.spyOn(server, 'operations').mockReturnValue({
    forAccount: () => ({
      order: () => ({
        limit: () => ({
          call: async () => ({
            records: options.firstOperationAt ? [{ created_at: options.firstOperationAt }] : [],
          }),
        }),
      }),
    }),
  } as unknown as ReturnType<Horizon.Server['operations']>);

  vi.spyOn(server, 'feeStats').mockResolvedValue({
    fee_charged: { p50: options.feeP50 ?? '100' },
    last_ledger_base_fee: '100',
  } as never);

  vi.spyOn(server, 'loadAccount').mockResolvedValue((options.account ?? CUENTA_CON_SALDO) as never);

  vi.spyOn(server, 'ledgers').mockReturnValue({
    order: () => ({
      limit: () => ({ call: async () => ({ records: [{ base_reserve_in_stroops: 5_000_000 }] }) }),
    }),
  } as unknown as ReturnType<Horizon.Server['ledgers']>);

  return server;
}

function lector(options: Parameters<typeof servidor>[0] = {}): HorizonStellarReader {
  return new HorizonStellarReader({ horizonUrl: HORIZON_URL, server: servidor(options) });
}

describe('getHistory', () => {
  it('distingue entradas de salidas según quién es la cuenta', async () => {
    const reader = lector({
      payments: [pago(), pago({ from: CARLOS, to: CUENTA, amount: '5.0000000' })],
    });

    const history = await reader.getHistory(CUENTA);

    expect(history[0]).toMatchObject({ direction: 'OUT', counterparty: ANA });
    expect(history[1]).toMatchObject({ direction: 'IN', counterparty: CARLOS });
  });

  it('descarta operaciones que no son pagos', async () => {
    // El endpoint de pagos devuelve también create_account y account_merge.
    const reader = lector({
      payments: [pago(), { type: 'create_account', created_at: '2026-09-01T00:00:00Z' }],
    });

    expect(await reader.getHistory(CUENTA)).toHaveLength(1);
  });

  it('descarta activos que no soportamos en vez de inventarles un código', async () => {
    const reader = lector({
      payments: [pago({ asset_type: 'credit_alphanum4', asset_code: 'EURC' })],
    });

    expect(await reader.getHistory(CUENTA)).toEqual([]);
  });

  it('reconoce el activo de prueba', async () => {
    const reader = lector({
      payments: [pago({ asset_type: 'credit_alphanum12', asset_code: 'USDC_TEST' })],
    });

    expect((await reader.getHistory(CUENTA))[0]?.asset).toBe('USDC_TEST');
  });
});

describe('getHistoryStats', () => {
  it('calcula la mediana solo con los envíos con éxito', async () => {
    const reader = lector({
      payments: [
        pago({ amount: '10.0000000' }),
        pago({ amount: '20.0000000' }),
        pago({ amount: '30.0000000' }),
        // Un envío fallido no describe el comportamiento del usuario.
        pago({ amount: '1000.0000000', transaction_successful: false }),
        // Un ingreso tampoco dice nada sobre lo que él suele enviar.
        pago({ from: CARLOS, to: CUENTA, amount: '999.0000000' }),
      ],
    });

    expect((await reader.getHistoryStats(CUENTA)).medianOutgoingAmount).toBe('20.0000000');
  });

  it('cuenta como conocido a quien te envió dinero, no solo a quien enviaste', async () => {
    // Haber recibido de alguien ya es haber interactuado: G-01 pregunta eso.
    const reader = lector({ payments: [pago({ from: CARLOS, to: CUENTA })] });

    expect((await reader.getHistoryStats(CUENTA)).knownCounterparties).toContain(CARLOS);
  });

  it('devuelve mediana cero sin historial, en vez de fallar', async () => {
    const stats = await lector({ payments: [] }).getHistoryStats(CUENTA);

    expect(stats.medianOutgoingAmount).toBe('0');
    expect(stats.knownCounterparties).toEqual([]);
  });

  it('cuenta las operaciones de la última hora', async () => {
    const haceDiezMinutos = new Date(Date.now() - 10 * 60_000).toISOString();
    const reader = lector({
      payments: [
        pago({ created_at: haceDiezMinutos }),
        pago({ created_at: '2020-01-01T00:00:00Z' }),
      ],
    });

    expect((await reader.getHistoryStats(CUENTA)).outgoingLastHour).toBe(1);
  });
});

describe('getAccountInfo', () => {
  it('añade la antigüedad de la cuenta desde su primera operación', async () => {
    const haceDiezDias = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString();
    const reader = lector({ firstOperationAt: haceDiezDias });

    expect((await reader.getAccountInfo(CUENTA)).ageDays).toBe(10);
  });

  it('omite la antigüedad si no se puede obtener, sin tumbar la lectura', async () => {
    // G-06 simplemente no se dispara; no es motivo para fallar la propuesta.
    const info = await lector({ firstOperationAt: undefined }).getAccountInfo(CUENTA);

    expect(info.exists).toBe(true);
    expect(info.ageDays).toBeUndefined();
  });
});

describe('simulatePayments', () => {
  const accion = (overrides: Record<string, unknown> = {}) => ({
    type: 'PAYMENT' as const,
    destinationId: 'dest_1',
    destinationAddress: ANA,
    destinationLabel: 'Ana',
    asset: 'XLM' as const,
    amount: '10',
    memo: null,
    label: 'Pago',
    ...overrides,
  });

  it('estima la comisión por operación con la mediana de la red', async () => {
    const reader = lector({ feeP50: '200' });

    // 200 stroops × 3 operaciones = 600 stroops.
    const result = await reader.simulatePayments(CUENTA, [accion(), accion(), accion()]);
    expect(result.fee).toBe('0.0000600');
  });

  it('avisa si la cuenta destino no existe', async () => {
    const server = servidor();
    // Solo falla el destino. Que no exista la cuenta ORIGEN es otra cosa: ahí
    // no hay nada que simular y el error sí debe propagarse.
    vi.spyOn(server, 'loadAccount').mockImplementation(async (id: string) => {
      if (id === ANA) throw new NotFoundError('missing', { status: 404 });
      return CUENTA_CON_SALDO as never;
    });
    const reader = new HorizonStellarReader({ horizonUrl: HORIZON_URL, server });

    const result = await reader.simulatePayments(CUENTA, [accion()]);
    expect(result.errors.join(' ')).toContain('no existe');
  });

  it('propaga el fallo si la cuenta origen no existe', async () => {
    const server = servidor();
    vi.spyOn(server, 'loadAccount').mockRejectedValue(
      new NotFoundError('missing', { status: 404 }),
    );
    const reader = new HorizonStellarReader({ horizonUrl: HORIZON_URL, server });

    await expect(reader.simulatePayments(CUENTA, [accion()])).rejects.toThrow();
  });

  it('avisa si falta la trustline del activo', async () => {
    const reader = lector();

    // La cuenta de prueba solo tiene el saldo nativo, sin trustlines.
    const result = await reader.simulatePayments(CUENTA, [accion({ asset: 'USDC_TEST' })]);
    expect(result.errors.join(' ')).toContain('trustline');
  });

  it('no exige trustline para XLM', async () => {
    const result = await lector().simulatePayments(CUENTA, [accion()]);

    expect(result.errors).toEqual([]);
  });

  it('descuenta la comisión del saldo posterior cuando se envía XLM', async () => {
    const reader = lector({ feeP50: '100' });

    // 100 de saldo - 1 de reserva de la red (2 entradas x 0.5) = 99 disponibles.
    // 99 - 10 enviados - 0.00001 de comisión = 88.99999.
    const result = await reader.simulatePayments(CUENTA, [accion({ amount: '10' })]);
    expect(result.balanceAfter).toBe('88.9999900');
  });
});
