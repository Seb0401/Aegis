'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ConnectPanel } from '@/components/auth/connect-panel';
import { useAuth } from '@/lib/auth/auth-context';

export default function HomePage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <header className="flex max-w-md flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Aegis</h1>
        <p className="text-sm text-muted-foreground">
          Un agente que mueve dinero en Stellar por ti, siempre con límites, y un Guardian que
          revisa cada operación antes de ejecutarla.
        </p>
      </header>

      <ConnectPanel />

      <p className="text-xs text-muted-foreground">Solo testnet. Nada de mainnet en el MVP.</p>
    </main>
  );
}
