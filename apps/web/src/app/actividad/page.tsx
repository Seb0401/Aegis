import type { Metadata } from 'next';
import { ActividadView } from './actividad-view';

export const metadata: Metadata = {
  title: 'Actividad',
  description: 'Lo que de verdad ocurrió en Stellar, con enlace al explorador.',
};

export default function ActividadPage() {
  return <ActividadView />;
}
