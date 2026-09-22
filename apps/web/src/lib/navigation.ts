import { Clock, LayoutDashboard, Send, Shield, type LucideIcon } from 'lucide-react';

/**
 * Las cuatro secciones de la aplicación, en un solo sitio.
 *
 * La barra lateral (escritorio) y la horizontal (móvil) pintan exactamente la
 * misma lista: si vivieran por separado, tarde o temprano una tendría una
 * sección que la otra no.
 */
export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { href: '/limites', label: 'Límites', icon: Shield },
  { href: '/destinos', label: 'Destinos', icon: Send },
  { href: '/historial', label: 'Historial', icon: Clock },
];
