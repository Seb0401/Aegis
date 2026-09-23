import type { Metadata } from 'next';
import { HistorialView } from './historial-view';

/*
  Los metadatos van aquí, en un componente de servidor: el título de la
  pestaña lo pone Next al navegar, y escribirlo a mano desde un efecto del
  cliente perdía la carrera contra él.
*/
export const metadata: Metadata = {
  title: 'Historial',
  description: 'Lo que se ejecutó en la red y la bitácora encadenada de todo lo que pasó.',
};

export default function HistorialPage() {
  return <HistorialView />;
}
