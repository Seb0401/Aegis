'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth/auth-context';

/**
 * Guarda de ruta en cliente.
 *
 * No sustituye a la autorización: quien decide es la API, que exige el Bearer
 * en cada endpoint. Esto solo evita enseñar una pantalla vacía a quien no
 * tiene sesión.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
