import { formatAmount as formatStellarAmount } from '@aegis/contracts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases de Tailwind resolviendo conflictos (convención de shadcn/ui). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formatea un monto decimal de Stellar para mostrarlo.
 *
 * El recorte de ceros lo hace `@aegis/contracts`, que es quien define la
 * aritmética sin coma flotante que usa el backend. Duplicar aquí la lógica
 * sería arriesgarse a que la cifra que ve el usuario y la que valida la API
 * dejen de coincidir.
 */
export function formatAmount(amount: string, asset?: string): string {
  const formatted = formatStellarAmount(amount);
  return asset ? `${formatted} ${asset}` : formatted;
}

/** Acorta una dirección Stellar: GA4NUZ…VTAGK3XP. */
export function shortAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

/** Fecha corta en español, tolerante a valores inválidos. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
