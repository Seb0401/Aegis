'use client';

/**
 * El último recurso: un fallo en el propio layout raíz.
 *
 * Esta pantalla sustituye a todo, incluido el `<html>`, así que no puede dar
 * por hecho que los proveedores, el tema o las fuentes hayan llegado a
 * cargar. Por eso va con estilos en línea y sin un solo import de la
 * aplicación: si lo que se rompió fue precisamente eso, una pantalla que
 * dependa de ello se rompe con ella.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
          background: '#0a1430',
          color: '#eaf0ff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <img src="/jupi/triste.png" alt="" width={140} height={110} style={{ height: 'auto' }} />

        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Aegis no ha podido arrancar</h1>

        <p style={{ maxWidth: '28rem', color: '#8fa3c8', fontSize: '0.875rem', margin: 0 }}>
          No se ha movido dinero: esto es un fallo de la interfaz, y las operaciones las decide el
          backend y necesitan tu firma.
        </p>

        {error.digest ? (
          <p style={{ color: '#8fa3c8', fontSize: '0.75rem', margin: 0 }}>
            Identificador del error: <code>{error.digest}</code>
          </p>
        ) : null}

        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            borderRadius: '0.75rem',
            background: '#2563eb',
            color: '#fff',
            padding: '0.625rem 1rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
