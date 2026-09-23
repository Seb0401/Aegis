import type { Metadata } from 'next';
import { ConfiguracionView } from './configuracion-view';

/*
  Los metadatos van aquí, en un componente de servidor: el título de la
  pestaña lo pone Next al navegar, y escribirlo a mano desde un efecto del
  cliente perdía la carrera contra él.
*/
export const metadata: Metadata = {
  title: 'Configuración',
  description: 'Tu cuenta y la llave que el agente usa para firmar.',
};

export default function ConfiguracionPage() {
  return <ConfiguracionView />;
}
