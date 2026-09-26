import type { Metadata } from 'next';
import { ObjetivosView } from './objetivos-view';

export const metadata: Metadata = {
  title: 'Objetivos',
  description: 'Cuánto llevas de cada meta que te pusiste.',
};

export default function ObjetivosPage() {
  return <ObjetivosView />;
}
