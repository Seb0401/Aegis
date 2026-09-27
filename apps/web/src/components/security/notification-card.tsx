'use client';

import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNotificationPermission } from '@/lib/notifications';

/**
 * Permiso para avisar.
 *
 * Vive en Seguridad porque de eso va: una propuesta caduca en minutos y, si
 * no te enteras, caduca sin que hayas decidido nada. Eso no es un fallo, pero
 * tampoco es lo que quieres de algo que administra tu dinero.
 *
 * El permiso se pide con un botón y nunca al cargar la página. Un navegador
 * que pregunta nada más entrar recibe un «no» reflejo, y ese «no» es difícil
 * de deshacer: hay que ir a los ajustes del sitio.
 */
export function NotificationCard() {
  const { permiso, pedir } = useNotificationPermission();

  if (permiso === 'unsupported') return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {permiso === 'granted' ? (
            <BellRing className="size-4 text-risk-low" />
          ) : (
            <Bell className="size-4 text-primary" />
          )}
          Avisos del navegador
        </CardTitle>
        <CardDescription>
          Para enterarte de que hay algo esperando tu firma aunque no tengas Aegis abierto.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {permiso === 'granted' ? (
          <p className="text-sm text-muted-foreground">
            Activados. Solo avisamos de propuestas nuevas, y solo si no estás mirando la pestaña.
          </p>
        ) : permiso === 'denied' ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <BellOff className="mt-0.5 size-4 shrink-0" />
            Los bloqueaste para este sitio. Se vuelven a permitir desde los ajustes del navegador,
            en el candado de la barra de direcciones.
          </p>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Una propuesta caduca en minutos. Si no te enteras, caduca sin que hayas decidido.
            </p>
            <Button size="sm" onClick={() => void pedir()}>
              <Bell />
              Permitir avisos
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
