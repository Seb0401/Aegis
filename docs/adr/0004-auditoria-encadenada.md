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

- Límite conocido: la lectura del último evento y la inserción ocurren en una
  transacción pero **sin bloqueo explícito**. Con escrituras concurrentes del
  mismo usuario, dos eventos podrían encadenarse al mismo padre. Aceptable
  mientras un usuario no opere en paralelo consigo mismo; si aparece una cola de
  trabajos (`BE2-Q2`) habrá que añadir `SELECT … FOR UPDATE`.
- Los `payload` pasan por un filtro que redacta cualquier clave que suene a
  secreto antes de persistirse.
