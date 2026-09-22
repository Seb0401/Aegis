'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { useSendMessage } from '../api/hooks';
import { useAuth } from '../auth/auth-context';

/**
 * La conversación con el agente, fuera del componente que la pinta.
 *
 * Hace falta porque el chat se ve en dos sitios: la columna del panel en
 * escritorio y la hoja que abre el botón central en móvil. Si cada uno tuviera
 * su propio estado, al cambiar de tamaño de pantalla —o al abrir la hoja— la
 * conversación empezaría de cero.
 */

export interface ChatTurn {
  id: number;
  role: 'user' | 'agent';
  text: string;
  proposals?: number;
}

const StoredChatSchema = z.object({
  conversationId: z.string().nullable(),
  turns: z.array(
    z.object({
      id: z.number(),
      role: z.enum(['user', 'agent']),
      text: z.string(),
      proposals: z.number().optional(),
    }),
  ),
});

/**
 * El hilo sobrevive a un F5, pero no al cierre de la pestaña.
 *
 * `sessionStorage` y no `localStorage` a propósito: aquí se habla de dinero, y
 * dejar la conversación escrita en el disco de forma indefinida es más de lo
 * que hace falta para que recargar no duela. Al cerrar sesión se borra.
 */
const STORAGE_KEY = 'aegis.chat';

function readStored(): { turns: ChatTurn[]; conversationId: string | null } {
  if (typeof window === 'undefined') return { turns: [], conversationId: null };

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { turns: [], conversationId: null };

    const parsed = StoredChatSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return { turns: [], conversationId: null };
    }
    return parsed.data;
  } catch {
    return { turns: [], conversationId: null };
  }
}

interface ChatContextValue {
  turns: ChatTurn[];
  send: (message: string) => void;
  /** Reenvía el último mensaje que falló. */
  retry: () => void;
  isPending: boolean;
  error: unknown;
  /** Hay un mensaje tuyo sin respuesta porque la petición falló. */
  canRetry: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const sendMessage = useSendMessage();
  const { status } = useAuth();

  // La lectura va en un efecto y no en el estado inicial: en el servidor no
  // hay `sessionStorage`, y sembrar el estado con algo distinto a lo que se
  // renderiza en cliente rompería la hidratación.
  useEffect(() => {
    const stored = readStored();
    setTurns(stored.turns);
    setConversationId(stored.conversationId);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ turns, conversationId }));
  }, [turns, conversationId, hydrated]);

  // Al cerrar sesión, la conversación se va con ella.
  useEffect(() => {
    if (status !== 'anonymous' || !hydrated) return;
    setTurns([]);
    setConversationId(null);
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
  }, [status, hydrated]);

  const post = useCallback(
    (text: string) => {
      sendMessage.mutate(
        { message: text, conversationId },
        {
          onSuccess: (response) => {
            setConversationId(response.conversationId);
            setTurns((prev) => [
              ...prev,
              {
                id: prev.length,
                role: 'agent',
                text: response.reply,
                proposals: response.proposals.length,
              },
            ]);
          },
        },
      );
    },
    [conversationId, sendMessage],
  );

  const send = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text || sendMessage.isPending) return;

      setTurns((prev) => [...prev, { id: prev.length, role: 'user', text }]);
      post(text);
    },
    [post, sendMessage.isPending],
  );

  const last = turns[turns.length - 1];
  const canRetry = Boolean(sendMessage.error) && last?.role === 'user';

  const retry = useCallback(() => {
    if (!canRetry || !last || sendMessage.isPending) return;
    post(last.text);
  }, [canRetry, last, post, sendMessage.isPending]);

  const value = useMemo<ChatContextValue>(
    () => ({
      turns,
      send,
      retry,
      isPending: sendMessage.isPending,
      error: sendMessage.error,
      canRetry,
    }),
    [turns, send, retry, sendMessage.isPending, sendMessage.error, canRetry],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat() tiene que usarse dentro de <ChatProvider>.');
  }
  return context;
}
