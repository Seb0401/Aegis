'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/dashboard', label: 'Panel' },
  { href: '/limites', label: 'Límites' },
  { href: '/destinos', label: 'Destinos' },
  { href: '/historial', label: 'Historial' },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones" className="flex items-center gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors',
              active ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
