import { AuthVerifyResponseSchema } from '@aegis/contracts';
import type { z } from 'zod';

/**
 * Persistencia de la sesión.
 *
 * El token es un JWT de 12 h emitido por la API. Se guarda en `localStorage`
 * para que un F5 no obligue a firmar otra vez; el precio es que un XSS podría
 * leerlo. Es un compromiso consciente y acotado para el MVP en testnet:
 *
 *  - El token no autoriza pagos por sí solo. Todo lo que mueve dinero pasa
 *    además por la política, el Guardian y la firma de la wallet.
 *  - La clave privada nunca está aquí: vive en Freighter (principio nº 3).
 *
 * Si esto llegara a mainnet, lo correcto sería una cookie httpOnly emitida por
 * la API, y entonces solo cambia este archivo.
 */

const STORAGE_KEY = 'aegis.session';

export const SessionSchema = AuthVerifyResponseSchema;
export type Session = z.infer<typeof SessionSchema>;

export function readSession(): Session | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = SessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      // Formato viejo o manipulado: se descarta en vez de arrastrar basura.
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeSession(session: Session): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
