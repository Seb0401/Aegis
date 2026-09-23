import type { Metadata } from 'next';
import { DashboardView } from './dashboard-view';

/*
  Los metadatos van aquí, en un componente de servidor: el título de la
  pestaña lo pone Next al navegar, y escribirlo a mano desde un efecto del
  cliente perdía la carrera contra él.
*/
export const metadata: Metadata = {
  title: 'Panel',
  description: 'El estado de tu agente, tus límites y lo que espera tu decisión.',
};

export default function DashboardPage() {
  return <DashboardView />;
}
