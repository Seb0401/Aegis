'use client';

import type { Destination, Proposal, ProposedAction } from '@aegis/contracts';
import { ArrowRight, Clock, ExternalLink, Loader2, PenLine, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GuardianPanel } from '@/components/proposals/guardian-panel';
import { ImpactPanel } from '@/components/proposals/impact-panel';
import { Amount } from '@/components/ui/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { describeError } from '@/lib/api/errors';
import { useApproveProposal, useDestinations, useRejectProposal } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth/auth-context';
import { riseDelay } from '@/lib/motion';
import { explorerTxUrl } from '@/lib/stellar-links';
import { WalletError } from '@/lib/auth/wallet';
import {
  RISK_LABEL,
  RISK_VARIANT,
  STATUS_ICON,
  RISK_WORD,
  STATUS_LABEL,
  isActionable,
  matchesTotal,
  needsTotalConfirmation,
  proposalTotal,
  shareOfTotal,
  totalsByAsset,
} from '@/lib/proposals';
import { formatAmount, shortAddress } from '@/lib/utils';

/**
 * Tarjeta de propuesta con acciones (FE-06) y aprobación con firma (FE-07).
 *
 * La regla de esta pantalla: **el usuario tiene que poder ver exactamente qué
 * va a pasar antes de firmar**. Por eso se listan las operaciones una a una
 * con su destino real, se muestran los motivos de la política y el análisis
 * del Guardian entero, y el total va en grande.
 */
export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const { wallet, session } = useAuth();
  const destinations = useDestinations();
  const approve = useApproveProposal();
  const reject = useRejectProposal();

  const [typedTotal, setTypedTotal] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [signing, setSigning] = useState(false);
  const [walletError, setWalletError] = useState<WalletError | null>(null);

  const total = proposalTotal(proposal.actions);
  const requiresConfirmation = needsTotalConfirmation(proposal);
  const confirmed = !requiresConfirmation || matchesTotal(typedTotal, total);
  const actionable = isActionable(proposal);
  const StatusIcon = STATUS_ICON[proposal.status];
  const busy = signing || approve.isPending || reject.isPending;

  const byId = new Map((destinations.data?.destinations ?? []).map((d) => [d.id, d]));

  async function onApprove() {
    setWalletError(null);

    if (!proposal.unsignedXdr) {
      setWalletError(
        new WalletError(
          'FAILED',
          'Todavía se está preparando la operación que tienes que firmar. Espera unos segundos y vuelve a intentarlo.',
        ),
      );
      return;
    }

    let signedXdr: string;
    try {
      setSigning(true);
      signedXdr = await wallet.signXdr(proposal.unsignedXdr, session?.user.address ?? '');
    } catch (cause) {
      setWalletError(
        cause instanceof WalletError
          ? cause
          : new WalletError('FAILED', 'No se pudo firmar con la wallet.'),
      );
      return;
    } finally {
      setSigning(false);
    }

    approve.mutate({
      id: proposal.id,
      body: {
        signedXdr,
        ...(requiresConfirmation ? { confirmedTotal: typedTotal.trim() } : {}),
      },
    });
  }

  return (
    <Card className={actionable ? 'border-primary/40' : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={actionable ? 'default' : 'outline'}>
            <StatusIcon className="size-3.5" />
            {STATUS_LABEL[proposal.status]}
          </Badge>
          {proposal.risk ? (
            <Badge variant={RISK_VARIANT[proposal.risk.level]}>
              {RISK_LABEL[proposal.risk.level]}
            </Badge>
          ) : null}
          {actionable ? <Expiry expiresAt={proposal.expiresAt} /> : null}
        </div>
        <CardTitle className="text-base font-medium">{proposal.summary}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <ActionList actions={proposal.actions} destinations={byId} total={total} />

        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-right">
            {totalsByAsset(proposal.actions).map(([asset, amount]) => (
              <Amount
                key={asset}
                value={amount}
                asset={asset}
                className="font-display block text-2xl font-semibold"
                assetClassName="text-sm font-normal text-muted-foreground"
              />
            ))}
          </span>
        </div>

        {proposal.policy && proposal.policy.reasons.length > 0 ? (
          <section aria-label="Decisión de la política" className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tus límites
            </h4>
            <ul className="flex flex-col gap-1">
              {proposal.policy.reasons.map((item, index) => (
                <li key={`${item.ruleId}-${index}`} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {item.ruleId}
                  </span>
                  <span>{item.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {proposal.risk && actionable ? (
          <ImpactPanel
            risk={proposal.risk}
            total={total}
            asset={totalsByAsset(proposal.actions)[0]?.[0] ?? 'XLM'}
          />
        ) : null}

        {proposal.risk ? (
          <GuardianPanel risk={proposal.risk} explanation={proposal.explanation} />
        ) : null}

        {proposal.failureReason ? (
          <p role="alert" className="text-sm text-destructive">
            {proposal.failureReason}
          </p>
        ) : null}

        {/*
          El comprobante, enlazado. Antes se enseñaba el identificador y ahí
          se quedaba: para comprobarlo había que copiarlo y buscarlo a mano en
          un explorador, que es pedirle trabajo a quien solo quiere ver que su
          pago existe.
        */}
        {proposal.txHash ? (
          <a
            href={explorerTxUrl(proposal.txHash)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 self-start rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:bg-accent"
          >
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
            <span>
              Ver el pago en Stellar
              <code className="ml-1.5 text-muted-foreground">{shortAddress(proposal.txHash)}</code>
            </span>
          </a>
        ) : null}

        {actionable ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {requiresConfirmation ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">
                  Escribe el total para confirmar: {formatAmount(total)}
                </span>
                <Input
                  value={typedTotal}
                  onChange={(event) => setTypedTotal(event.target.value)}
                  placeholder={formatAmount(total)}
                  inputMode="decimal"
                  aria-invalid={typedTotal.length > 0 && !confirmed}
                  disabled={busy}
                />
                <span className="text-xs text-muted-foreground">
                  El riesgo es {RISK_WORD[proposal.risk?.level ?? 'HIGH']}. La API rechaza la
                  aprobación si el monto no coincide exactamente.
                </span>
              </label>
            ) : null}

            {rejecting ? (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span>Motivo (opcional)</span>
                  <Input
                    value={reason}
                    maxLength={280}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Por qué la rechazas"
                    disabled={busy}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      reject.mutate({
                        id: proposal.id,
                        ...(reason.trim() ? { reason: reason.trim() } : {}),
                      })
                    }
                  >
                    {reject.isPending ? <Loader2 className="animate-spin" /> : <X />}
                    Confirmar rechazo
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !confirmed} onClick={() => void onApprove()}>
                  {signing || approve.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <PenLine />
                  )}
                  {signing ? 'Firma en la wallet…' : 'Aprobar y firmar'}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    // El error de un intento de firma anterior no pinta nada
                    // en el formulario de rechazo.
                    setWalletError(null);
                    setRejecting(true);
                  }}
                >
                  <X />
                  Rechazar
                </Button>
              </div>
            )}

            {walletError ? (
              <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span>{walletError.message}</span>
                  {walletError.code === 'NOT_INSTALLED' ? (
                    <a
                      className="underline underline-offset-2"
                      href={wallet.installUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {wallet.installLabel}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {approve.error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {describeError(approve.error)}
              </p>
            ) : null}

            {reject.error ? (
              <p role="alert" className="text-sm text-destructive">
                {describeError(reject.error)}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Una fila por operación.
 *
 * El destino se resuelve contra la lista registrada: el agente solo envía
 * `destinationId`, y enseñar ese id al usuario no le dice nada. Si el destino
 * no está en la lista todavía cargada, se degrada al id en vez de mentir.
 */
function ActionList({
  actions,
  destinations,
  total,
}: {
  actions: ProposedAction[];
  destinations: Map<string, Destination>;
  total: string;
}) {
  return (
    <ul className="flex flex-col gap-3.5">
      {actions.map((action, index) => {
        const destination = destinations.get(action.destinationId);
        const share = shareOfTotal(action.amount, total);

        return (
          <li key={`${action.destinationId}-${index}`} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{action.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {destination
                    ? `${destination.label} · ${shortAddress(destination.address)}`
                    : action.destinationId}
                  {action.memo ? ` · memo: ${action.memo}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-right">
                <Amount
                  value={action.amount}
                  asset={action.asset}
                  className="block text-sm font-medium"
                />
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {share.toFixed(1)}%
                </span>
              </span>
            </div>

            {/*
              La barra va a escala del total, no del pago más grande: es la
              misma escala que el porcentaje de al lado, y si no coincidieran
              el ojo creería a la barra y la cifra parecería un error.
              Decorativa, porque el dato ya está escrito dos veces encima.
            */}
            <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="reveal-x h-full rounded-r-[4px] bg-primary"
                style={{ width: `${Math.min(100, share).toFixed(2)}%`, ...riseDelay(index, 70) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Cuenta atrás hasta la caducidad (regla P-09).
 *
 * Una propuesta caducada no se puede aprobar, así que el usuario tiene derecho
 * a saber cuánto le queda antes de ponerse a leer el análisis de riesgo.
 */
function Expiry({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => msUntil(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => setRemaining(msUntil(expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (remaining <= 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <Clock className="size-3.5" />
        Caducada
      </span>
    );
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
      <Clock className="size-3.5" />
      caduca en {minutes}:{String(seconds).padStart(2, '0')}
    </span>
  );
}

function msUntil(iso: string): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  return target - Date.now();
}
