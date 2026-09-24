# @aegis/api

**Dueño: BE2** — orquestador, auth, persistencia y auditoría.

Esta aplicación no toma decisiones de riesgo ni de autorización por su cuenta:
las delega en `@aegis/policy-engine` y `@aegis/guardian`, que son funciones
puras. La API se encarga de la máquina de estados, de traer los datos que esos
motores necesitan y de dejar rastro de todo.

## Puesta en marcha

```bash
cp ../../.env.example ../../.env    # y rellena JWT_SECRET
pnpm db:up && pnpm db:migrate && pnpm db:seed   # desde la raíz
pnpm dev                                        # aquí
```

Documentación interactiva: http://localhost:3001/docs

## El pipeline de una propuesta

```
DRAFT
  └─ resolución de destinos (id → dirección real)
POLICY_CHECK
  └─ evaluatePolicy(config, acciones, destinos, saldos, gasto 24 h, ops/hora)
     ├─ DENY → DENIED (fin)
     └─ sigue
GUARDIAN_REVIEW
  └─ assessRisk(...) + buildTemplateExplanation(...)
     ├─ AUTO_APPROVE y riesgo LOW → AUTO_APPROVED → firma el agente
     └─ resto → PENDING_USER (se prepara el XDR sin firmar)
SIGNED → SUBMITTED → CONFIRMED
```

Cada flecha pasa por `transition()`, que valida el salto contra
`ALLOWED_TRANSITIONS` del contrato **y** exige que el estado en la base de datos
siga siendo el esperado. Eso hace la transición atómica: dos peticiones
simultáneas no pueden aprobar la misma propuesta dos veces.

Cada paso escribe en la bitácora antes de continuar.

## Mapa del código

| Archivo                            | Qué hay dentro                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/env.ts`                       | Validación de la configuración. Cierra el login de desarrollo y el cliente falso en producción                                 |
| `src/container.ts`                 | Todo el cableado de dependencias, en un solo sitio                                                                             |
| `src/server.ts`                    | Plugins, manejador de errores, OpenAPI, registro de rutas                                                                      |
| `src/db/schema.ts`                 | Tablas. Montos como `text`, estructuras ricas en `jsonb`                                                                       |
| `src/services/proposal-service.ts` | La máquina de estados. El archivo más importante                                                                               |
| `src/services/policy-store.ts`     | Configuración por usuario y ventanas de 24 h / 1 h                                                                             |
| `src/services/audit.ts`            | Bitácora append-only con hash encadenado                                                                                       |
| `src/services/agent-tools.ts`      | `AgentTools` atadas a un usuario concreto                                                                                      |
| `src/services/auth-service.ts`     | Login por reto firmado con la wallet                                                                                           |
| `src/routes/`                      | Una ruta por endpoint de §5.2 del PLAN                                                                                         |
| `POST /proposals`                  | Crea una propuesta con acciones concretas. Es por donde entra el servidor MCP; recorre el mismo pipeline que el agente interno |
| `src/services/sweeper.ts`          | Barrido de caducidad y rescate de propuestas colgadas                                                                          |
| `src/lib/rate-limit.ts`            | Límites por ruta: por IP en `/auth`, por usuario en el resto                                                                   |
| `src/test/`                        | Andamiaje de tests: base de datos efímera, app lista y agente guionizado                                                       |

## Conexión con Stellar (M2)

| `USE_FAKE_STELLAR` | Qué usa                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `true`             | `FakeStellarReader` y `FakeStellarExecutor`. Sin red, determinista                                                                                      |
| `false`            | `HorizonStellarReader` y `HorizonStellarExecutor`. Saldos, historial, antigüedad de cuentas y simulación reales; firma y envía transacciones en testnet |

Con `false`, `loadEnv` **exige** `STELLAR_AGENT_SIGNER_SECRET` y
`STELLAR_DEMO_ACCOUNT_ADDRESS`. Falla al arrancar y no en la primera propuesta:
descubrir que falta una credencial cuando alguien ya está esperando su pago es
la peor forma de enterarse.

El ejecutor solo firma para `STELLAR_DEMO_ACCOUNT_ADDRESS`. Aunque alguien
manipulara el origen de una transacción, no podría firmarla.

## Desarrollo sin Stellar ni wallet

Con `USE_FAKE_STELLAR=true` la API usa `FakeStellarReader` y
`FakeStellarExecutor` de `@aegis/stellar/testing`: no hay red, no hay claves y
el flujo completo (incluido `CONFIRMED`) funciona.

Con `ALLOW_DEV_LOGIN=true` se puede iniciar sesión con
`POST /auth/dev-login { address }` sin firmar nada. Las dos banderas son
imposibles de activar en producción: `loadEnv` lo rechaza.

## Tests

```bash
pnpm db:up   # Docker tiene que estar levantado
pnpm test
```

Casi todos son **de integración**: cada fichero crea su propia base de datos
dentro del Postgres local, le aplica las migraciones reales y la destruye al
acabar. Se usa `app.inject()` en vez de levantar un puerto, así que ejercitan los
mismos plugins, validadores y manejador de errores que en producción.

| Fichero                                | Qué fija                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `routes/proposals.integration.test.ts` | El pipeline entero, la degradación por riesgo, la confirmación reforzada y el aislamiento entre usuarios |
| `routes/auth.routes.test.ts`           | Firmas Ed25519 reales, retos de un solo uso, caducidad                                                   |
| `routes/destinations.routes.test.ts`   | Saneado del texto libre, duplicados, bloqueo                                                             |
| `services/audit.test.ts`               | Que **manipular la bitácora se nota**                                                                    |
| `services/sweeper.test.ts`             | Caducidad real y que `SIGNED`/`SUBMITTED` no se toquen                                                   |
| `services/proposal-service.test.ts`    | Las funciones puras, sin base de datos                                                                   |

Dos cosas que conviene saber antes de añadir tests:

1. Los contadores de P-02 (límite diario) y P-05 (operaciones por hora) acumulan
   dentro del mismo fichero. Si tu test depende de empezar en cero, **usa un
   usuario propio**.
2. Para controlar las acciones exactas de una propuesta se inyecta
   `createScriptedAgent()` por `overrides.agent`. No es una puerta trasera: entra
   por el mismo `/agent/messages` y recorre el pipeline completo.

## Precios en dólares

Antes de evaluar, el orquestador pide el precio de todos los activos que toca la
propuesta **y** de los que el usuario tiene en cartera: la reserva mínima en
dólares se mide sobre el patrimonio entero, no solo sobre lo que se mueve.

La foto se guarda en la columna `prices` de la propuesta y sus cotizaciones
quedan en el evento `POLICY_EVALUATED`. Para explicar dentro de un mes por qué
algo se aprobó hace falta el precio de entonces, no el de hoy.

Si el oráculo no responde, **no se deniega**: salta P-10, el Guardian añade G-10
y la propuesta pasa a `PENDING_USER`. Ver
[ADR 0011](../../docs/adr/0011-precios-en-dolares.md).

En los tests, `PRICE_SOURCE=fixed` evita salir a la red. Para probar la caída del
oráculo se inyecta un proveedor vacío con `overrides.prices`.

## Límites de uso

| Ruta                                 | Límite  | Clave                 |
| ------------------------------------ | ------- | --------------------- |
| Todo                                 | 120/min | IP (red de seguridad) |
| `/auth/*`                            | 10/min  | IP                    |
| `/agent/messages`                    | 20/min  | **usuario**           |
| `/proposals/:id/approve` y `/reject` | 30/min  | **usuario**           |

Los límites por usuario van en `preHandler` y no en `onRequest` a propósito: el
plugin de rate limit corre antes que la autenticación, así que en `onRequest`
`request.user` todavía no existe y la clave sería siempre la IP.

En los tests los límites se desactivan (`NODE_ENV=test`).

## Lo que falta (backlog BE2 del PLAN)

- [x] BE2-01 · Scaffold, BD, migraciones, `docker-compose`
- [x] BE2-02 · Auth con wallet (reto/firma)
- [x] BE2-03 · Policy Engine v0 con tests
- [x] BE2-04 · Endpoints y máquina de estados
- [x] BE2-05 · Registro de destinos
- [x] BE2-06 · Auditoría append-only
- [x] BE2-07 / BE2-08 · Señales G-01…G-09 + score
- [x] BE2-09 · Integración de Policy + Guardian en el pipeline
- [x] BE2-10 · Degradación por riesgo y kill switch
- [x] BE2-11 · Tests de integración con Postgres (59 tests)
- [x] BE2-11 · Rate limiting por ruta y por usuario
- [x] Caducidad real de propuestas y rescate de estados colgados (ADR 0008)
- [x] Saneado del texto libre y edición de destinos (ADR 0007)
- [x] **M2** · Cableado con Horizon real: lector, ejecutor y validación de
      credenciales al arrancar
- [ ] **BE1-09** · Reconciliación de `SIGNED`/`SUBMITTED` consultando la red.
      El envío ya es real, pero la confirmación se da por buena al enviar
- [ ] **BE1-Q3** · `/account/delegation/prepare` recibe hoy la clave pública del
      agente en el cuerpo. El cliente no debería decidir con qué clave firma
- [ ] **Pendiente de `FE-Q4`** · Respuestas en streaming con SSE
- [ ] `BE2-Q5` · Nivel de observabilidad. Hoy hay id por petición, logs con
      cabeceras redactadas y `/health` con sonda real de base de datos. Falta
      decidir si hacen falta métricas y trazas

## Preguntas abiertas

`BE2-Q2` (¿hace falta cola de trabajos?), `BE2-Q3` (valores por defecto y
umbrales), `BE2-Q5` (nivel de observabilidad). Ver §14.3 del `PLAN.md`.
