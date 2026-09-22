'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiClient } from '../api/client';
import { clearSession, readSession, writeSession, type Session } from './session';
import { freighterAdapter, type WalletAdapter } from './wallet';

/**
 * Sesión de la aplicación (FE-03).
 *
 * El flujo de login con wallet es el clásico de reto y firma:
 *
 *   1. La wallet dice qué dirección es.
 *   2. La API emite un reto con nonce y caducidad.
 *   3. La wallet lo firma; una firma capturada no sirve dos veces.
 *   4. La API verifica la firma y devuelve el JWT de sesión.
 */

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  /** Cliente de la API con el token de la sesión actual ya puesto. */
  client: ApiClient;
  wallet: WalletAdapter;
  /** Login con wallet: reto, firma y verificación. */
  connectWallet: () => Promise<Session>;
  /** Atajo de desarrollo, sin wallet. Solo si la API lo permite. */
  devLogin: (address: string) => Promise<Session>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const queryClient = useQueryClient();

  // El token vive en una ref además de en el estado: así el cliente de la API
  // se construye una sola vez y aun así siempre lee el token vigente.
  const tokenRef = useRef<string | null>(null);

  const applySession = useCallback((next: Session) => {
    tokenRef.current = next.token;
    writeSession(next);
    setSession(next);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(() => {
    tokenRef.current = null;
    clearSession();
    setSession(null);
    setStatus('anonymous');
    // Los datos en caché son del usuario que se acaba de ir.
    queryClient.clear();
  }, [queryClient]);

  const client = useMemo(
    () =>
      new ApiClient({
        getToken: () => tokenRef.current,
        // Un 401 significa que el token caducó o dejó de ser válido: no tiene
        // sentido mantener la sesión en pantalla.
        onUnauthorized: () => {
          if (tokenRef.current !== null) logout();
        },
      }),
    [logout],
  );

  useEffect(() => {
    const stored = readSession();
    if (stored) {
      tokenRef.current = stored.token;
      setSession(stored);
      setStatus('authenticated');
    } else {
      setStatus('anonymous');
    }
  }, []);

  const connectWallet = useCallback(async () => {
    const account = await freighterAdapter.connect();
    const challenge = await client.requestChallenge(account.address);
    const signature = await freighterAdapter.signChallenge(challenge.challenge, account.address);
    const verified = await client.verifyChallenge(challenge.challengeId, signature);

    applySession(verified);
    return verified;
  }, [applySession, client]);

  const devLogin = useCallback(
    async (address: string) => {
      const verified = await client.devLogin(address);
      applySession(verified);
      return verified;
    },
    [applySession, client],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      client,
      wallet: freighterAdapter,
      connectWallet,
      devLogin,
      logout,
    }),
    [status, session, client, connectWallet, devLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth() tiene que usarse dentro de <AuthProvider>.');
  }
  return context;
}

/** Atajo para los hooks de datos: el cliente ya autenticado. */
export function useApiClient(): ApiClient {
  return useAuth().client;
}
