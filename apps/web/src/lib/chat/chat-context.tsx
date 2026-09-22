'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSendMessage } from '../api/hooks';

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

interface ChatContextValue {
  turns: ChatTurn[];
  send: (message: string) => void;
  isPending: boolean;
  error: unknown;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const sendMessage = useSendMessage();

  const send = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text || sendMessage.isPending) return;

      setTurns((prev) => [...prev, { id: prev.length, role: 'user', text }]);

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

  const value = useMemo<ChatContextValue>(
    () => ({ turns, send, isPending: sendMessage.isPending, error: sendMessage.error }),
    [turns, send, sendMessage.isPending, sendMessage.error],
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
