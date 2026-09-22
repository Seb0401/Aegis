'use client';

import { ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { NAV_LINKS } from '@/lib/navigation';
import { cn, shortAddress } from '@/lib/utils';

/**
 * Barra lateral del mockup.
 *
 * Las cuatro secciones son las mismas que ya existían en la cabecera; aquí
 * solo cambian de sitio. Por debajo de `lg` desaparece y la navegación baja a
 * la barra inferior (`MobileTabBar`), donde el pulgar llega sin estirarse.
 */

export function Sidebar() {
  const pathname = usePathname();
  const { session } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-sidebar p-4 lg:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Aegis</span>
      </Link>

      <nav aria-label="Secciones" className="flex flex-col gap-1">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="size-4.5 shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="size-5" />
          </span>
          <p className="mt-3 text-sm leading-snug font-medium">
            Tu dinero,
            <br />
            con inteligencia.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Agente + Guardian
            <br />= Control total
          </p>
        </div>

        {session ? (
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {session.user.address.slice(1, 3)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-xs" title={session.user.address}>
                {shortAddress(session.user.address)}
              </span>
              <span className="block text-[11px] text-muted-foreground">Testnet</span>
            </span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
