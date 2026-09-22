'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';
import { AuthProvider } from '@/lib/auth/auth-context';

/**
 * Proveedores del cliente.
 *
 * `AuthProvider` va dentro de `QueryClientProvider` porque al cerrar sesión
 * limpia la caché: los datos que hay en pantalla son del usuario que se va.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            // Reintentar un 4xx no arregla nada: el 401 ya cerró la sesión y el
            // 400 seguirá estando mal. Solo se reintentan fallos de red y 5xx.
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
