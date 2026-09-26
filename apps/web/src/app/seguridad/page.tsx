import type { Metadata } from 'next';
import { SeguridadView } from './seguridad-view';

export const metadata: Metadata = {
  title: 'Seguridad',
  description:
    'La llave que el agente usa para firmar, el kill switch y la integridad de la bitácora.',
};

export default function SeguridadPage() {
  return <SeguridadView />;
}
