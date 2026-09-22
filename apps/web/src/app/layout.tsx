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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
