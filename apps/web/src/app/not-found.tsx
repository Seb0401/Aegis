import Link from 'next/link';
import { Jupi } from '@/components/jupi/jupi';

/**
 * 404.
 *
 * No es una página de servidor genérica: mantiene la identidad y, sobre todo,
 * ofrece una salida. Quien llega aquí se equivocó de dirección, no hizo nada
 * malo, así que Jupi pone cara de duda y no de regañina.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Jupi mood="pensativo" size={160} decorative={false} />

      <div className="flex max-w-md flex-col gap-2">
        <p className="font-display text-5xl font-semibold">404</p>
        <h1 className="text-xl font-semibold tracking-tight">Esta página no existe</h1>
        <p className="text-sm text-muted-foreground">
          Puede que el enlace esté mal escrito o que la pantalla ya no esté donde estaba.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Volver al panel
      </Link>
    </main>
  );
}
