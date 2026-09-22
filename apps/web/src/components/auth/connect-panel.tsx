'use client';

import { KeyRound, Loader2, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-context';
import { WalletError } from '@/lib/auth/wallet';
import { ALLOW_DEV_LOGIN, DEV_ADDRESS } from '@/lib/env';

/**
 * Pantalla de conexión (FE-03).
 *
 * Firmar el reto no mueve fondos: eso se dice aquí y también en el propio
 * texto que emite la API. Que el usuario sepa exactamente qué está aprobando
 * es parte del producto, no un detalle de copy.
 */
export function ConnectPanel() {
  const { connectWallet, devLogin, wallet } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<'wallet' | 'dev' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installHint, setInstallHint] = useState(false);

  async function run(kind: 'wallet' | 'dev', action: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    setInstallHint(false);
    try {
      await action();
      router.push('/dashboard');
    } catch (cause) {
      if (cause instanceof WalletError) {
        setInstallHint(cause.code === 'NOT_INSTALLED');
        setError(cause.message);
      } else {
        setError(describeError(cause));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">Conecta tu wallet</CardTitle>
        <CardDescription>
          Aegis usa tu wallet para identificarte y para que firmes cada pago que no entre dentro de
          tus límites.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <Button
          size="lg"
          disabled={busy !== null}
          onClick={() => void run('wallet', connectWallet)}
          className="w-full"
        >
          {busy === 'wallet' ? <Loader2 className="animate-spin" /> : <Wallet />}
          {busy === 'wallet' ? 'Esperando a la wallet…' : `Conectar ${wallet.name}`}
        </Button>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            Solo firmarás un mensaje de verificación. No mueve dinero ni autoriza ningún pago, y
            caduca en pocos minutos.
          </span>
        </p>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex flex-col gap-1">
              <span>{error}</span>
              {installHint ? (
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

        {ALLOW_DEV_LOGIN ? (
          <div className="border-t border-border pt-4">
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run('dev', () => devLogin(DEV_ADDRESS))}
              className="w-full"
            >
              {busy === 'dev' ? <Loader2 className="animate-spin" /> : <KeyRound />}
              Entrar sin wallet (desarrollo)
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Atajo para desarrollar sin Freighter. La API solo lo acepta con{' '}
              <code className="rounded bg-muted px-1">ALLOW_DEV_LOGIN=true</code>.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
