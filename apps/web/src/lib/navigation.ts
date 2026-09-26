import {
  Activity,
  Clock,
  KeyRound,
  LayoutDashboard,
  Send,
  Shield,
  Target,
  type LucideIcon,
} from 'lucide-react';

/**
 * Las secciones de la aplicación, en un solo sitio.
 *
 * La barra lateral (escritorio) y la horizontal (móvil) pintan esta misma
 * lista: si vivieran por separado, tarde o temprano una tendría una sección
 * que la otra no.
 *
 * Van **agrupadas por intención**, y el motivo es que siete entradas seguidas
 * se leen como una lista larga que hay que recorrer entera. Partidas en tres
 * bloques cortos con su encabezado, se buscan por dónde encaja lo que quieres
 * hacer: si vengo a ver cuánto llevo ahorrado no leo «El agente», y si vengo a
 * comprobar qué hizo no leo «Tu dinero».
 */
export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** Encabezado del bloque. Corto: es una etiqueta, no una frase. */
  title: string;
  links: NavLink[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Tu dinero',
    links: [
      { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
      { href: '/objetivos', label: 'Objetivos', icon: Target },
      { href: '/destinos', label: 'Destinos', icon: Send },
    ],
  },
  {
    title: 'El agente',
    links: [
      { href: '/limites', label: 'Límites', icon: Shield },
      { href: '/seguridad', label: 'Seguridad', icon: KeyRound },
    ],
  },
  {
    title: 'Lo que pasó',
    links: [
      { href: '/actividad', label: 'Actividad', icon: Activity },
      { href: '/historial', label: 'Historial', icon: Clock },
    ],
  },
];

/** Todas, en orden, para quien solo necesite la lista plana. */
export const NAV_LINKS: NavLink[] = NAV_GROUPS.flatMap((group) => group.links);

/**
 * Las que caben en la barra del móvil.
 *
 * Son tres porque la barra tiene cinco huecos: dos a cada lado del botón del
 * agente, y uno de ellos lo ocupa «Más». Meter las siete a la fuerza daría
 * objetivos de pulsación de menos de treinta píxeles, que en un teléfono no se
 * aciertan.
 *
 * El criterio para elegirlas es la frecuencia, no la importancia: Seguridad
 * importa muchísimo y casi nunca se visita.
 */
export const MOBILE_PRIMARY_HREFS = ['/dashboard', '/objetivos', '/actividad'] as const;

export const MOBILE_PRIMARY: NavLink[] = MOBILE_PRIMARY_HREFS.map((href) =>
  NAV_LINKS.find((link) => link.href === href)!,
);

/** El resto, que en móvil vive detrás de «Más». */
export const MOBILE_SECONDARY: NavLink[] = NAV_LINKS.filter(
  (link) => !MOBILE_PRIMARY_HREFS.includes(link.href as (typeof MOBILE_PRIMARY_HREFS)[number]),
);
