import type { Metadata } from 'next';
import { DestinosView } from './destinos-view';

/*
  Los metadatos van aquí, en un componente de servidor: el título de la
  pestaña lo pone Next al navegar, y escribirlo a mano desde un efecto del
  cliente perdía la carrera contra él.
*/
export const metadata: Metadata = {
  title: 'Objetivos y contactos',
  description: 'Las únicas direcciones a las que el agente puede enviar dinero.',
};

export default function DestinosPage() {
  return <DestinosView />;
}
