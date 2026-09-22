'use client';

import { StellarAddressSchema } from '@aegis/contracts';
import { Check, Copy, KeyRound, Loader2, PenLine, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { describeError } from '@/lib/api/errors';
import { usePrepareDelegation } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth/auth-context';
import { WalletError } from '@/lib/auth/wallet';

/**
 * Delegación del signer del agente (FE-04).
 *
 * Es la operación más delicada de toda la aplicación: añade una segunda llave
 * a **tu** cuenta de Stellar. Por eso el texto no la adorna, y dice la
 * limitación de §7 del PLAN tal cual: los límites de Aegis se aplican fuera de
 * la cadena, así que la red por sí sola no impediría que esa llave firmara un
 * pago mayor.
 *
 * Lo que la API permite hoy llega hasta la firma: `POST
 * /account/delegation/prepare` construye el XDR y la wallet lo firma. **No hay
 * endpoint para enviarlo a la red** (tarea BE1-05), así que el último paso es
 * copiar el XDR firmado. Se dice en pantalla en vez de simular que terminó.
 */
export function DelegationCard() {
  const { wallet, session } = useAuth();
  const prepare = usePrepareDelegation();

  const [agentKey, setAgentKey] = useState('');
  const [signedXdr, setSignedXdr] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [walletError, setWalletError] = useState<WalletError | null>(null);
  const [copied, setCopied] = useState(false);

  const cleanKey = agentKey.trim().toUpperCase();
  const keyValid = StellarAddressSchema.safeParse(cleanKey).success;
  const prepared = prepare.data;

  async function onSign() {
    if (!prepared) return;
    setWalletError(null);
    setSigning(true);
    try {
      const xdr = await wallet.signXdr(prepared.xdr, session?.user.address ?? '');
      setSignedXdr(xdr);
    } catch (cause) {
      setWalletError(
        cause instanceof WalletError
          ? cause
          : new WalletError('FAILED', 'No se pudo firmar con la wallet.'),
      );
    } finally {
      setSigning(false);
    }
  }

  async function onCopy() {
    if (!signedXdr) return;
    try {
      await navigator.clipboard.writeText(signedXdr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delegar el signer del agente</CardTitle>
        <CardDescription>
          Añade una segunda llave a tu cuenta para que el agente pueda firmar dentro de tus límites.
          Tu llave principal sigue mandando: solo ella puede cambiar los signers.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-xl border border-risk-medium/40 bg-risk-medium/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-risk-medium" />
          <p>
            Stellar limita por <em>tipo</em> de operación, no por monto ni por destinatario. Los
            límites de Aegis los aplica el backend antes de firmar. Si esa llave se filtrara, en la
            red podría firmar pagos por cualquier importe: por eso el MVP es solo testnet.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Clave pública del agente</span>
          <Input
            value={agentKey}
            onChange={(event) => {
              setAgentKey(event.target.value.toUpperCase());
              setSignedXdr(null);
            }}
            placeholder="G…"
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs"
            aria-invalid={agentKey.length > 0 && !keyValid}
          />
          {agentKey.length > 0 && !keyValid ? (
            <span className="text-xs text-destructive">
              No parece una clave pública de Stellar: 56 caracteres que empiezan por G.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              La da el backend. Va en el cuerpo de la petición porque `BE1-Q3` sigue abierta: está
              sin decidir si el signer es uno por usuario o uno global del servicio.
            </span>
          )}
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!keyValid || prepare.isPending}
            onClick={() => {
              setSignedXdr(null);
              prepare.mutate(cleanKey);
            }}
          >
            {prepare.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Preparar delegación
          </Button>

          {prepared ? (
            <Button variant="secondary" disabled={signing} onClick={() => void onSign()}>
              {signing ? <Loader2 className="animate-spin" /> : <PenLine />}
              {signing ? 'Firma en la wallet…' : 'Firmar con la wallet'}
            </Button>
          ) : null}
        </div>

        {prepare.error ? (
          <p role="alert" className="text-sm text-destructive">
            {describeError(prepare.error)}
          </p>
        ) : null}

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
                  Instalar {wallet.name}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {prepared && !signedXdr ? (
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium">Transacción lista para firmar</p>
            <p className="text-xs text-muted-foreground">
              Añade <code className="rounded bg-muted px-1">{prepared.agentPublicKey}</code> como
              signer de tu cuenta.
            </p>
          </div>
        ) : null}

        {signedXdr ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Check className="size-4 text-risk-low" />
              Firmado
            </p>
            <p className="text-xs text-muted-foreground">
              Falta enviarlo a la red, y eso todavía no lo hace Aegis: la API solo expone{' '}
              <code className="rounded bg-muted px-1">/account/delegation/prepare</code>, no el
              envío (tarea BE1-05). Mientras tanto, copia el XDR firmado y envíalo desde el Stellar
              Laboratory.
            </p>
            <textarea
              readOnly
              rows={3}
              value={signedXdr}
              aria-label="XDR firmado"
              className="w-full resize-none rounded-lg border border-input bg-transparent p-2 font-mono text-[11px]"
            />
            <div>
              <Button size="sm" variant="outline" onClick={() => void onCopy()}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copiado' : 'Copiar XDR firmado'}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
