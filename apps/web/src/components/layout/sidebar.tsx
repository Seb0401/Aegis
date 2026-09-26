'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark } from '@/components/brand/logo';
import { useAuth } from '@/lib/auth/auth-context';
import { NAV_GROUPS } from '@/lib/navigation';
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
    <aside
      aria-label="Navegación principal"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-sidebar p-4 lg:flex"
    >
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1.5">
        <LogoMark size={36} />
        <span className="text-lg font-semibold tracking-tight">Aegis</span>
      </Link>

      {/*
        Un `nav` por bloque, cada uno con su propio nombre accesible. Con un
        solo `nav` y encabezados sueltos por dentro, un lector de pantalla
        anuncia «navegación, siete elementos» y los títulos de los bloques se
        quedan en decoración visual: quien no ve la pantalla pierde justo la
        agrupación que hace la lista manejable.
      */}
      <div className="flex flex-col gap-5">
        {NAV_GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title} className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
              {group.title}
            </h2>

            {group.links.map((link) => {
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
                      ? 'bg-primary font-medium text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="size-4.5 shrink-0" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        ))}
      </div>

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
          <Link
            href="/configuracion"
            aria-label="Configuración de la cuenta"
            className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-accent"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {session.user.address.slice(1, 3)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-xs" title={session.user.address}>
                {shortAddress(session.user.address)}
              </span>
              <span className="block text-[11px] text-muted-foreground">Testnet</span>
            </span>
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
