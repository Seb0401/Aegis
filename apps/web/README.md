# apps/web

**Dueño: FE** (ver `.github/CODEOWNERS`).

Esta carpeta está **vacía a propósito**. El scaffold lo hace FE con las
herramientas que elija, porque `FE-Q1` (branding y librería de UI) y `FE-Q3`
(desktop primero o mobile-first) siguen sin responder y no tiene sentido decidir
por otra persona.

## Arranque sugerido (§3 del PLAN)

```bash
cd apps/web
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir
pnpm add @aegis/contracts@workspace:* @stellar/freighter-api
```

Después, desde la raíz del repo: `pnpm install`.

## Lo que ya tienes listo para no esperar a nadie

| Necesitas                   | Está en                 | Cómo                                                |
| --------------------------- | ----------------------- | --------------------------------------------------- |
| Tipos de la API             | `@aegis/contracts`      | `import { ProposalSchema } from '@aegis/contracts'` |
| OpenAPI para el mock server | `docs/api/openapi.json` | `pnpm --filter @aegis/api openapi` lo regenera      |
| Datos de ejemplo            | `@aegis/contracts`      | `FIXTURE_DESTINATIONS`, `FIXTURE_RISK_REPORTS`, …   |
| API real en local           | `apps/api`              | `pnpm dev:api` → http://localhost:3001/docs         |
| Sesión sin wallet           | `POST /auth/dev-login`  | Solo con `ALLOW_DEV_LOGIN=true`                     |

## Pantallas del MVP (backlog FE del PLAN)

1. Conexión de wallet y delegación del signer (FE-03, FE-04)
2. Chat con el agente (FE-05)
3. Tarjeta de propuesta con acciones y montos (FE-06)
4. Aprobar/rechazar y firma con Freighter (FE-07)
5. Panel del Guardian: severidad, advertencias, saldo restante (FE-08)
6. Límites y modo Manual/Autónomo (FE-09)
7. Objetivos y contactos (FE-10)
8. Historial (FE-11) y kill switch bien visible (FE-12)

## Endpoints que quizá no esperabas

| Endpoint                  | Para qué                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /destinations/:id` | Renombrar, marcar como de confianza (`trusted`) o **bloquear** (`blocked`) un destino. Lo necesita FE-10. La dirección no se puede editar |
| `GET /audit`              | Bitácora del usuario y estado de la cadena de hashes (`chain.valid`, `chain.complete`)                                                    |
| `GET /health`             | Sonda con comprobación real de base de datos                                                                                              |

Las etiquetas que envíes se **sanean** en el servidor: se eliminan caracteres de
control, invisibles y marcas bidireccionales. Una etiqueta que quede vacía tras
sanear se rechaza con 400, así que valida también en el formulario para dar un
mensaje mejor.

## Detalle importante del flujo de firma

Cuando una propuesta queda en `PENDING_USER`, la API devuelve `unsignedXdr`
dentro del objeto `Proposal`. Ese XDR es el que se pasa a Freighter, y el
resultado vuelve en `POST /proposals/:id/approve` como `signedXdr`.

Si el riesgo es `HIGH` o `CRITICAL`, además hay que enviar `confirmedTotal` con
el monto total escrito por el usuario; si no coincide, la API responde
`CONFIRMATION_REQUIRED`.
