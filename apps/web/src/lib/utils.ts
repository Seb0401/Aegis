import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases de Tailwind resolviendo conflictos (convención de shadcn/ui). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formatea un monto decimal de Stellar para mostrarlo.
 *
 * Los montos viajan como string a propósito (7 decimales, los float pierden
 * precisión). Aquí solo se recortan los ceros de cola para leerlos mejor; el
 * valor original nunca se convierte a number para operar con él.
 */
export function formatAmount(amount: string, asset?: string): string {
  const trimmed = amount.includes('.') ? amount.replace(/0+$/, '').replace(/\.$/, '') : amount;
  return asset ? `${trimmed} ${asset}` : trimmed;
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
