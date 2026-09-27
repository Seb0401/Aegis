import {
  splitAmount,
  type Destination,
  type ProposedActionInput,
  type StellarReader,
  type TxSummary,
} from '@aegis/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { processedIncomes, users } from '../db/schema.js';
import type { DestinationStore } from './destination-store.js';
import type { PolicyStore } from './policy-store.js';
import type { ProposalService } from './proposal-service.js';
import type { SplitRuleStore } from './split-store.js';

/**
 * Vigila los ingresos y reparte (BE2-13).
 *
 * Es la promesa del producto hecha código: cuando entra dinero, Aegis actúa
 * sin que nadie se lo pida. Lo que construye es una propuesta normal y
 * corriente, que pasa por los mismos límites, el mismo Guardian y el mismo
 * modo que cualquier otra. El reparto automático decide **cuándo** proponer,
 * nunca qué se puede autorizar.
 *
 * Tres reglas que no se negocian, porque aquí un fallo cuesta dinero de
 * verdad:
 *
 *  1. **Un ingreso se reparte una vez.** La garantía está en la clave
 *     primaria de `processed_incomes`, no en un `if`: da igual cuántas veces
 *     corra esto ni que dos procesos coincidan.
 *  2. **Se marca antes de proponer.** Si marcar funciona y proponer falla, ese
 *     ingreso se queda sin repartir para siempre. Es lo correcto: al revés, un
 *     fallo entre las dos operaciones repartiría dos veces el mismo dinero, y
 *     entre perder un reparto y pagar dos veces no hay duda.
 *  3. **Nada anterior a encender la regla.** `watchingSince` marca la
 *     frontera; sin ella, activarla dispararía un reparto por cada ingreso del
 *     historial.
 */
export interface IncomeWatcherDeps {
  db: Database;
  reader: StellarReader;
  splits: SplitRuleStore;
  policies: PolicyStore;
  destinations: DestinationStore;
  proposals: ProposalService;
  /** Para avisar de lo que pasa sin acoplarse a un logger concreto. */
  onEvent?: (evento: string, datos: Record<string, unknown>) => void;
}

export interface WatchResult {
  /** Usuarios con regla encendida que se han revisado. */
  checked: number;
  /** Ingresos nuevos que han generado un reparto. */
  split: number;
}

/** Cuántos movimientos se miran por vuelta. */
const HISTORY_LIMIT = 25;

export class IncomeWatcher {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: IncomeWatcherDeps) {}

  /** Arranca el sondeo. Llamarlo dos veces no crea dos temporizadores. */
  start(intervalMs: number): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.watch().catch((error: unknown) => {
        this.deps.onEvent?.('aegis_income_watch_failed', {
          message: error instanceof Error ? error.message : 'desconocido',
        });
      });
    }, intervalMs);

    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async watch(): Promise<WatchResult> {
    const filas = await this.deps.db.select({ id: users.id, address: users.address }).from(users);

    let checked = 0;
    let split = 0;

    for (const fila of filas) {
      const revisado = await this.watchUser(fila.id, fila.address);
      if (revisado === null) continue;

      checked += 1;
      split += revisado;
    }

    return { checked, split };
  }

  /** Devuelve cuántos repartos ha creado, o `null` si el usuario no aplica. */
  private async watchUser(userId: string, address: string): Promise<number | null> {
    const guardado = await this.deps.splits.get(userId);
    if (!guardado?.rule.enabled) return null;

    // El kill switch para esto también. Si no, con el agente en pausa
    // seguirían apareciendo propuestas denegadas por cada ingreso: ruido que
    // contradice lo que el botón promete.
    const config = await this.deps.policies.getConfig(userId);
    if (config.paused) return null;

    const registrados = await this.deps.destinations.list(userId);
    const { rule, watchingSince } = guardado;

    const historial = await this.deps.reader.getHistory(address, { limit: HISTORY_LIMIT });
    const candidatos = historial
      .filter((tx) => esIngresoRepartible(tx, rule.asset, rule.minimumIncome, watchingSince))
      // Del más antiguo al más nuevo: si llegan dos seguidos, se reparten en
      // el orden en que ocurrieron, que es el que cuadra con la bitácora.
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    let creados = 0;

    for (const ingreso of candidatos) {
      const acciones = this.buildActions(ingreso, rule.shares, registrados);
      if (acciones.length === 0) continue;

      // Marcar primero. Ver la regla 2 de arriba.
      const marcado = await this.claim(userId, ingreso.hash);
      if (!marcado) continue;

      try {
        const propuesta = await this.deps.proposals.create(userId, address, {
          summary: `Reparto automático de ${ingreso.amount} ${ingreso.asset}`,
          actions: acciones,
          requestedTotal: null,
        });

        await this.deps.db
          .update(processedIncomes)
          .set({ proposalId: propuesta.id })
          .where(
            and(eq(processedIncomes.userId, userId), eq(processedIncomes.txHash, ingreso.hash)),
          );

        creados += 1;
        this.deps.onEvent?.('aegis_income_split', {
          userId,
          txHash: ingreso.hash,
          proposalId: propuesta.id,
          actions: acciones.length,
        });
      } catch (error: unknown) {
        // El ingreso queda marcado y no se reintenta, a propósito. Se registra
        // para que quede constancia de que hubo dinero que no se repartió.
        this.deps.onEvent?.('aegis_income_split_failed', {
          userId,
          txHash: ingreso.hash,
          message: error instanceof Error ? error.message : 'desconocido',
        });
      }
    }

    return creados;
  }

  /**
   * Reserva el ingreso. `true` si esta llamada lo consiguió.
   *
   * `onConflictDoNothing` sobre la clave primaria: si otro proceso —u otra
   * vuelta del sondeo— ya lo tenía, esta no hace nada y devuelve `false`. La
   * carrera la resuelve Postgres, no nosotros.
   */
  private async claim(userId: string, txHash: string): Promise<boolean> {
    const insertado = await this.deps.db
      .insert(processedIncomes)
      .values({ userId, txHash })
      .onConflictDoNothing()
      .returning({ txHash: processedIncomes.txHash });

    return insertado.length > 0;
  }

  /**
   * Convierte un ingreso en las acciones del reparto.
   *
   * Los destinos que ya no existen o están bloqueados se caen de la lista y
   * **su parte no se reasigna**: si configuraste un 30% para algo que después
   * bloqueaste, ese 30% se queda en tu cuenta. Repartirlo entre los demás
   * sería tomar por ti una decisión que no tomaste.
   */
  private buildActions(
    ingreso: TxSummary,
    shares: { destinationId: string; basisPoints: number }[],
    registrados: Destination[],
  ): ProposedActionInput[] {
    const porId = new Map(registrados.map((destino) => [destino.id, destino]));

    const validas = shares.filter((share) => {
      const destino = porId.get(share.destinationId);
      return destino !== undefined && !destino.blocked;
    });

    if (validas.length === 0) return [];

    const importes = splitAmount(ingreso.amount, validas);

    return (
      validas
        .map((share, indice) => ({ share, importe: importes[indice]! }))
        // Un pago de cero no es un pago: la red lo rechazaría y ensuciaría la
        // propuesta con una línea que no mueve nada.
        .filter(({ importe }) => Number(importe) > 0)
        .map(({ share, importe }) => ({
          type: 'PAYMENT' as const,
          destinationId: share.destinationId,
          asset: ingreso.asset,
          amount: importe,
          memo: null,
          label: porId.get(share.destinationId)!.label,
        }))
    );
  }
}

/** ¿Este movimiento es un ingreso que toca repartir? */
export function esIngresoRepartible(
  tx: TxSummary,
  asset: string,
  minimo: string,
  desde: Date,
): boolean {
  if (tx.direction !== 'IN' || !tx.successful) return false;
  if (tx.asset !== asset) return false;
  if (Number(tx.amount) < Number(minimo)) return false;

  const cuando = Date.parse(tx.createdAt);
  return Number.isFinite(cuando) && cuando > desde.getTime();
}
