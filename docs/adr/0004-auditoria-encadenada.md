# 0004 · Auditoría append-only con hash encadenado

- **Fecha:** 2026-09-19
- **Estado:** Aceptada
- **Pregunta:** `BE2-Q4`
- **Decide:** BE2

## Contexto

El principio nº 6 del proyecto es que todo queda auditado. La pregunta era si
basta con una tabla de eventos o si hace falta que sea demostrablemente
inalterable.

## Decisión

Cada evento guarda el hash SHA-256 de su contenido **más el hash del evento
anterior del mismo usuario**. La tabla solo admite inserciones: nada actualiza
ni borra filas de `audit_events`.

`GET /audit` devuelve los eventos junto con el resultado de recalcular la cadena
entera, así que la UI puede mostrar si la bitácora está íntegra.

El hash se calcula sobre una serialización canónica con las claves ordenadas: sin
eso, el mismo evento produciría hashes distintos según cómo se serialice y la
verificación no valdría nada.

## Alternativas

- **Tabla de eventos sin hash.** Más simple, pero no distingue entre "esto pasó"
  y "alguien editó la base de datos". En un sistema que mueve dinero por cuenta
  del usuario, esa diferencia es justo la que importa.
- **Anclar los hashes en la cadena.** Mucho más fuerte, pero cuesta comisiones y
  latencia por cada evento. Candidato para después del MVP.

## Consecuencias

- La lectura del último evento y la inserción ocurren en una transacción y
  **bajo un cerrojo consultivo por usuario** (`pg_advisory_xact_lock`). Sin él,
  dos escrituras simultáneas del mismo usuario leen el mismo padre y la cadena
  se bifurca: a partir de ahí se podría borrar un evento sin que ningún hash
  dejara de cuadrar, que es exactamente lo que esta decisión existe para
  impedir. Medido: ocho escrituras a la vez producían cuatro padres repetidos.
  Se eligió el cerrojo consultivo antes que un `SELECT … FOR UPDATE` sobre la
  fila del usuario porque lo que hay que serializar es la cadena, no el
  usuario, y así no compite con nada más que toque esa fila.
- Se paga con serialización: las escrituras de la bitácora de un mismo usuario
  van en fila. Duran lo que una inserción, y ese usuario no tiene nada que
  ganar escribiendo dos a la vez.
- Los `payload` pasan por un filtro que redacta cualquier clave que suene a
  secreto antes de persistirse.
