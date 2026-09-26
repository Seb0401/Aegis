'use client';

import type { Proposal } from '@aegis/contracts';
import { ArrowUpRight, Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Jupi } from '@/components/jupi/jupi';
import { Amount } from '@/components/ui/amount';
import { Button } from '@/components/ui/button';
import { riseDelay } from '@/lib/motion';
import { totalsByAsset } from '@/lib/proposals';
import { explorerTxUrl } from '@/lib/stellar-links';
import { shortAddress } from '@/lib/utils';

/**
 * El momento del pago.
 *
 * Aegis mueve dinero de verdad en Stellar y hasta ahora la interfaz lo trataba
 * como un cambio de etiqueta en una lista. Esto es lo único de toda la
 * aplicación que interrumpe a propósito: ha pasado algo irreversible y con
 * consecuencias, y merece un segundo de atención.
 *
 * Lo que enseña no es confeti: es **la prueba**. Cada pago con su destino, el
 * total, y el hash de la transacción enlazado al explorador para que cualquiera
 * —incluido un jurado— compruebe en la cadena que ocurrió. Celebrar sin la
 * prueba sería justo el tipo de interfaz que este proyecto intenta no ser.
 *
 * Se cierra con Escape, con el botón o pulsando fuera. No se cierra sola: hay
 * un enlace dentro que alguien puede querer pulsar.
 */
export function ExecutionMoment({
  proposal,
  onClose,
}: {
  proposal: Proposal;
  onClose: () => void;
}) {
  const dialogo = useRef<HTMLDivElement>(null);
  const devolverFocoA = useRef<Element | null>(null);

  useEffect(() => {
    devolverFocoA.current = document.activeElement;
    // Se enfoca el diálogo entero, no el botón de cerrar: así el lector de
    // pantalla lee primero de qué va esto y no «cerrar» a secas.
    dialogo.current?.focus();

    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', alPulsarTecla);
    return () => {
      document.removeEventListener('keydown', alPulsarTecla);
      // Quien llegó hasta aquí con el teclado vuelve donde estaba, no al
      // principio del documento.
      if (devolverFocoA.current instanceof HTMLElement) devolverFocoA.current.focus();
    };
  }, [onClose]);

  const totales = totalsByAsset(proposal.actions);
  const enlace = proposal.txHash ? explorerTxUrl(proposal.txHash) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="momento-titulo"
        tabIndex={-1}
        className="rise-in flex w-full max-w-md flex-col gap-5 rounded-[var(--radius)] border border-primary/30 bg-card p-6 shadow-2xl outline-none"
      >
        <div className="flex items-start gap-4">
          <Jupi mood="alegre" size={64} />
          <div className="min-w-0 flex-1">
            <h2 id="momento-titulo" className="font-display text-xl font-semibold">
              Hecho, y está en la cadena
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{proposal.summary}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mt-1 -mr-2 shrink-0"
          >
            <X />
          </Button>
        </div>

        {/* Cada pago aparece uno tras otro: se lee como que van saliendo. */}
        <ul className="flex flex-col gap-2">
          {proposal.actions.map((accion, indice) => (
            <li
              key={`${accion.destinationId}-${indice}`}
              className="rise-in flex items-center gap-2.5 text-sm"
              style={riseDelay(indice, 90)}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-risk-low/15 text-risk-low">
                <Check className="size-3" />
              </span>
              <span className="min-w-0 flex-1 truncate">{accion.label}</span>
              <Amount value={accion.amount} asset={accion.asset} className="shrink-0 font-medium" />
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Total movido</span>
          <span className="text-right">
            {totales.map(([asset, amount]) => (
              <Amount
                key={asset}
                value={amount}
                asset={asset}
                className="font-display block text-xl font-semibold"
                assetClassName="text-sm font-normal text-muted-foreground"
              />
            ))}
          </span>
        </div>

        {enlace ? (
          <a
            href={enlace}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-accent"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground">Compruébalo en Stellar</span>
              <code className="truncate text-xs">{shortAddress(proposal.txHash!)}</code>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
