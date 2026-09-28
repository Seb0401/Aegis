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
 *
 * **Su alcance se dice en pantalla.** Sin un service worker, un aviso solo
 * sale si Aegis está abierto en alguna pestaña, aunque esté de fondo; con el
 * navegador cerrado no llega nada. Prometer lo contrario sería la clase de
 * verdad a medias que este proyecto no se puede permitir en una pantalla que
 * se llama Seguridad.
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
          Para enterarte de que hay algo esperando tu firma sin tener que mirar la pestaña.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {permiso === 'granted' ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Activados. Solo avisamos de propuestas nuevas, y solo si no estás mirando.</p>
            <p>
              Hace falta tener Aegis abierto en alguna pestaña, aunque esté de fondo: para que
              lleguen con el navegador cerrado haría falta un servicio de notificaciones push, que
              todavía no tenemos.
            </p>
          </div>
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
