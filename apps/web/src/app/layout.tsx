import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Aegis',
  description:
    'Un agente que mueve dinero en Stellar por ti, con límites y un Guardian que explica cada operación.',
};

/*
  Sin `next/font`: descargaría tipografías de Google en tiempo de compilación y
  el objetivo es que `pnpm build` funcione también sin red. Se usa la pila del
  sistema hasta que FE-Q1 decida la tipografía de marca.
*/
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        {/*
          Primer elemento tabulable de la página: sin él, llegar al contenido
          con teclado obliga a pasar por la barra lateral entera en cada
          pantalla. Solo se ve cuando tiene el foco.
        */}
        <a
          href="#contenido"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[60] focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-primary-foreground"
        >
          Saltar al contenido
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
