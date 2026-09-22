'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/** Navegación horizontal para móvil. En escritorio manda la barra lateral. */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones" className="flex items-center gap-1 overflow-x-auto">
      {NAV_LINKS.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors',
              active
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
