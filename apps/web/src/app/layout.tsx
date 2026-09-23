import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

const DESCRIPTION =
  'Un agente que mueve dinero en Stellar por ti, con límites y un Guardian que explica cada operación.';

/**
 * `metadataBase` sale del entorno porque las URL de las imágenes sociales
 * tienen que ser absolutas, y en desarrollo no son las mismas que en el
 * despliegue. La imagen (`opengraph-image.png`) la recoge Next por convención.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'Aegis', template: '%s · Aegis' },
  description: DESCRIPTION,
  applicationName: 'Aegis',
  openGraph: {
    type: 'website',
    siteName: 'Aegis',
    locale: 'es_ES',
    title: 'Aegis',
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: 'Aegis', description: DESCRIPTION },
  // Solo testnet: que no se indexe como si fuera un producto en producción.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0a1430',
  colorScheme: 'dark',
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
