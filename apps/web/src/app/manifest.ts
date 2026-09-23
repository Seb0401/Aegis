import type { MetadataRoute } from 'next';

/**
 * Manifiesto de aplicación instalable (`FE-Q3` preguntaba por PWA).
 *
 * Instalable sí; **sin service worker** a propósito. Cachear una pantalla que
 * muestra saldos y propuestas significa arriesgarse a enseñar un saldo viejo
 * como si fuera el de ahora, y eso en una aplicación que autoriza pagos es
 * peor que no funcionar sin conexión.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aegis · agente financiero en Stellar',
    short_name: 'Aegis',
    description:
      'Un agente que mueve dinero en Stellar por ti, siempre con límites, y un Guardian que revisa cada operación.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0a1430',
    theme_color: '#0a1430',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
