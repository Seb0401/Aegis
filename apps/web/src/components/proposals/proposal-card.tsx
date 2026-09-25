'use client';

import type { Destination, Proposal, ProposedAction } from '@aegis/contracts';
import { ArrowRight, Clock, Loader2, PenLine, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GuardianPanel } from '@/components/proposals/guardian-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { describeError } from '@/lib/api/errors';
import { useApproveProposal, useDestinations, useRejectProposal } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth/auth-context';
import { WalletError } from '@/lib/auth/wallet';
import {
  RISK_LABEL,
  RISK_VARIANT,
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
  const busy = signing || approve.isPending || reject.isPending;

  const byId = new Map((destinations.data?.destinations ?? []).map((d) => [d.id, d]));

  async function onApprove() {
    setWalletError(null);

    if (!proposal.unsignedXdr) {
      setWalletError(
        new WalletError(
          'FAILED',
          'La API no ha generado todavía la transacción a firmar. Recarga en unos segundos.',
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
              <span key={asset} className="font-display block text-xl font-semibold tabular-nums">
                {formatAmount(amount, asset)}
              </span>
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

        {proposal.risk ? (
          <GuardianPanel risk={proposal.risk} explanation={proposal.explanation} />
        ) : null}

        {proposal.failureReason ? (
          <p role="alert" className="text-sm text-destructive">
            {proposal.failureReason}
          </p>
        ) : null}

        {proposal.txHash ? (
          <p className="text-xs text-muted-foreground">
            Transacción{' '}
            <code className="rounded bg-muted px-1">{shortAddress(proposal.txHash)}</code>
          </p>
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
    <ul className="flex flex-col divide-y divide-border">
      {actions.map((action, index) => {
        const destination = destinations.get(action.destinationId);
        return (
          <li key={`${action.destinationId}-${index}`} className="flex items-center gap-3 py-2.5">
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
              <span className="block text-sm font-medium tabular-nums">
                {formatAmount(action.amount, action.asset)}
              </span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {shareOfTotal(action.amount, total).toFixed(1)}%
              </span>
            </span>
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
