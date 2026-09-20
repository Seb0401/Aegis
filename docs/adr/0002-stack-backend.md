# 0002 · Fastify + Drizzle + PostgreSQL

- **Fecha:** 2026-09-19
- **Estado:** Aceptada
- **Pregunta:** `BE2-Q1`
- **Decide:** BE2

## Contexto

El `PLAN.md` proponía "NestJS o Fastify + PostgreSQL + Prisma o Drizzle" y
dejaba la elección al rol BE2.

## Decisión

**Fastify 5 + Drizzle ORM + PostgreSQL 16**, con Zod como única fuente de
validación mediante `fastify-type-provider-zod`.

## Alternativas

- **NestJS + Prisma.** Más estructura, pero también mucho más andamiaje para un
  MVP de seis semanas, y el generador de Prisma añade un paso de build extra.
- **Hono + SQLite.** Lo más ligero, pero la auditoría encadenada y los límites
  por ventana de tiempo se benefician de las transacciones y los índices de
  Postgres, y migrar después cuesta más de lo que ahorra ahora.

## Consecuencias

- Los esquemas de `@aegis/contracts` se usan tal cual para validar y serializar:
  no hay un segundo juego de esquemas JSON que mantener sincronizado.
- El OpenAPI se genera del código (`pnpm --filter @aegis/api openapi`) y la CI
  falla si el publicado se queda atrás.
- Las estructuras ricas (acciones, política, riesgo) se guardan en `jsonb` y se
  validan con Zod al leer, en vez de normalizarlas en tablas. Es un intercambio
  consciente: el contrato cambia más rápido que las migraciones durante el MVP.
