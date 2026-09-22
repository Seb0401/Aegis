# apps/web

**Dueño: FE** (ver `.github/CODEOWNERS`).

Frontend de Aegis: chat con el agente, tarjetas de propuesta, panel del Guardian,
límites y kill switch.

## Stack y por qué

| Pieza              | Elección                                  | Nota                                                                                   |
| ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Framework          | **Next.js 16** (App Router, Turbopack)    | Lo propuesto en §3 del PLAN. Todo es cliente: la API usa Bearer, no cookies            |
| Estilos            | **Tailwind v4** + tokens estilo shadcn/ui | El tema vive entero en `src/app/globals.css`; `components.json` deja usar `shadcn add` |
| Datos              | **TanStack Query v5**                     | Caché, reintentos e invalidación tras aprobar, rechazar o pausar                       |
| Wallet             | **Freighter** tras `WalletAdapter`        | `FE-Q2` sigue abierta: añadir xBull o Albedo es escribir otro adaptador                |
| Validación         | **Zod**, vía `@aegis/contracts`           | Entrada y salida se validan con los mismos esquemas que usa la API                     |
| Tipografía / marca | Pila del sistema                          | `FE-Q1` sin responder; sin `next/font` para que `pnpm build` funcione también sin red  |

## Arranque

```bash
# En la raíz del repo, una sola vez:
pnpm install
pnpm -r --filter "./packages/**" build    # el cliente consume los tipos de dist/

cd apps/web
cp .env.local.example .env.local
pnpm dev                                   # http://localhost:3000
```

Necesitas la API levantada en el 3001 (`pnpm dev:api` desde la raíz, con
Postgres en marcha). Sin wallet: el botón **Entrar sin wallet** usa
`POST /auth/dev-login` y solo aparece con `NEXT_PUBLIC_ALLOW_DEV_LOGIN=true`.

## Mapa del código

```
src/
├── app/
│   ├── layout.tsx          Providers y tema
│   ├── page.tsx            Conexión de wallet
│   ├── providers.tsx       React Query + AuthProvider
│   └── dashboard/page.tsx  Armazón: dashboard + chat lateral
├── components/
│   ├── auth/               Panel de conexión y guarda de ruta
│   ├── chat/               Chat con el agente (base de FE-05)
│   ├── dashboard/          Saldos, límites, propuestas, destinos
│   ├── layout/             Cabecera y kill switch
│   └── ui/                 Primitivas estilo shadcn (button, card, badge…)
└── lib/
    ├── api/                client.ts (tipado), errors.ts, hooks.ts
    ├── auth/               wallet.ts, session.ts, auth-context.tsx
    ├── env.ts              Solo variables NEXT_PUBLIC_*
    └── utils.ts            cn(), formatos de monto, dirección y fecha
```

### Reglas que este código respeta

- **Los montos son strings.** Stellar usa 7 decimales y los `number` de JS los
  pierden. `formatAmount` solo recorta ceros para mostrar; nunca se opera con
  ellos como números.
- **El token nunca decide nada.** Quien autoriza es la API; `RequireSession`
  solo evita enseñar una pantalla vacía.
- **Ninguna clave en el frontend.** La privada vive en Freighter; la del signer
  del agente, solo en la API.

## Estado de las tareas

| Tarea     | Estado                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| **FE-01** | ✅ Scaffold, lint, typecheck, tests y build integrados en la CI del monorepo     |
| **FE-02** | ✅ Cliente tipado con validación Zod, errores por código y hooks de React Query  |
| **FE-03** | ✅ Conexión Freighter (reto → firma → JWT), sesión persistida y `dev-login`      |
| FE-04     | Pendiente · delegación del signer (`POST /account/delegation/prepare` ya existe) |
| FE-05     | Base funcional · falta historial persistido y streaming (la API aún no hace SSE) |
| FE-06/07  | Pendiente · tarjeta de propuesta con acciones, firma del XDR y `confirmedTotal`  |
| FE-08     | Pendiente · panel del Guardian con señales G-01…G-09                             |
| FE-09     | Solo lectura · falta el formulario de límites y el cambio de modo                |
| FE-10     | Solo lectura · falta alta de destinos con confirmación de dirección              |
| FE-11     | Pendiente · historial y estados en vivo                                          |
| **FE-12** | ✅ Kill switch visible en la cabecera                                            |
| FE-13     | Pendiente · accesibilidad, responsive y pulido                                   |

## Detalles del contrato que conviene no olvidar

- Una propuesta en `PENDING_USER` trae `unsignedXdr`. Se pasa a Freighter y el
  resultado vuelve como `signedXdr` en `POST /proposals/:id/approve`.
- Con riesgo `HIGH` o `CRITICAL` hay que mandar además `confirmedTotal` con el
  monto total **escrito por el usuario**. Si no coincide: `CONFIRMATION_REQUIRED`.
- Las etiquetas se sanean en el servidor; una que quede vacía devuelve 400.
  Valida también en el formulario para dar un mensaje mejor.
- Los estados de propuesta no llegan solos: `useProposals(..., { poll: true })`
  sondea cada 5 s. Cuando la API publique SSE, se cambia en `lib/api/hooks.ts`.

## Preguntas abiertas

`FE-Q1` (branding y tipografía), `FE-Q2` (¿solo Freighter?), `FE-Q5` (¿i18n
desde el principio? ahora los textos están en español dentro de los
componentes) y si el chat debe ir en streaming (`FE-Q4`, requiere SSE en la API).
