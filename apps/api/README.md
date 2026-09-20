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

| Archivo                            | Qué hay dentro                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/env.ts`                       | Validación de la configuración. Cierra el login de desarrollo y el cliente falso en producción |
| `src/container.ts`                 | Todo el cableado de dependencias, en un solo sitio                                             |
| `src/server.ts`                    | Plugins, manejador de errores, OpenAPI, registro de rutas                                      |
| `src/db/schema.ts`                 | Tablas. Montos como `text`, estructuras ricas en `jsonb`                                       |
| `src/services/proposal-service.ts` | La máquina de estados. El archivo más importante                                               |
| `src/services/policy-store.ts`     | Configuración por usuario y ventanas de 24 h / 1 h                                             |
| `src/services/audit.ts`            | Bitácora append-only con hash encadenado                                                       |
| `src/services/agent-tools.ts`      | `AgentTools` atadas a un usuario concreto                                                      |
| `src/services/auth-service.ts`     | Login por reto firmado con la wallet                                                           |
| `src/routes/`                      | Una ruta por endpoint de §5.2 del PLAN                                                         |

## Desarrollo sin Stellar ni wallet

Con `USE_FAKE_STELLAR=true` la API usa `FakeStellarReader` y
`FakeStellarExecutor` de `@aegis/stellar/testing`: no hay red, no hay claves y
el flujo completo (incluido `CONFIRMED`) funciona.

Con `ALLOW_DEV_LOGIN=true` se puede iniciar sesión con
`POST /auth/dev-login { address }` sin firmar nada. Las dos banderas son
imposibles de activar en producción: `loadEnv` lo rechaza.

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
- [ ] BE2-10 · Confirmación de la transacción contra la red (hoy el fake
      confirma al instante; la confirmación real depende de BE1-09)
- [ ] BE2-11 · Tests de integración con Postgres, observabilidad (`BE2-Q5`)
- [ ] Respuestas en streaming con SSE para `/agent/messages` (pendiente de `FE-Q4`)

## Preguntas abiertas

`BE2-Q2` (¿hace falta cola de trabajos?), `BE2-Q3` (valores por defecto y
umbrales), `BE2-Q5` (nivel de observabilidad). Ver §14.3 del `PLAN.md`.
