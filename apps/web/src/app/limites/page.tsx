import type { Metadata } from 'next';
import { LimitesView } from './limites-view';

/*
  Los metadatos van aquí, en un componente de servidor: el título de la
  pestaña lo pone Next al navegar, y escribirlo a mano desde un efecto del
  cliente perdía la carrera contra él.
*/
export const metadata: Metadata = {
  title: 'Límites y modo',
  description: 'Los topes que el agente no puede pasar y quién confirma cada operación.',
};

export default function LimitesPage() {
  return <LimitesView />;
}
