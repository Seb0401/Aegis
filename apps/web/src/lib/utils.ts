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

/**
 * Fecha en lenguaje de persona: «hace 5 min» en vez de la hora exacta.
 *
 * Lo reciente se lee mejor en relativo —«hace 5 min» se entiende sin calcular
 * nada— y lo antiguo en absoluto, porque «hace 23 días» obliga a hacer la
 * cuenta para saber de qué día hablamos. La frontera está en una semana.
 *
 * Nunca dice «en el futuro»: un reloj mal puesto o una diferencia de husos
 * darían fechas por delante, y «dentro de 2 horas» junto a un pago ya hecho
 * asustaría sin motivo.
 */
export function formatRelativeTime(iso: string, ahora = new Date()): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;

  const segundos = Math.max(0, Math.round((ahora.getTime() - fecha.getTime()) / 1000));

  if (segundos < 45) return 'hace un momento';
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`;
  if (segundos < 86_400) {
    const horas = Math.round(segundos / 3600);
    return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
  }

  const dias = Math.round(segundos / 86_400);
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;

  return formatDateTime(iso);
}
