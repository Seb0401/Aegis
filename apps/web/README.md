# apps/web

**Dueño: FE** (ver `.github/CODEOWNERS`).

Frontend de Aegis: chat con el agente, tarjetas de propuesta, panel del Guardian,
límites y kill switch.

## Stack y por qué

| Pieza      | Elección                                  | Nota                                                                                   |
| ---------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Framework  | **Next.js 16** (App Router, Turbopack)    | Lo propuesto en §3 del PLAN. Todo es cliente: la API usa Bearer, no cookies            |
| Estilos    | **Tailwind v4** + tokens estilo shadcn/ui | El tema vive entero en `src/app/globals.css`; `components.json` deja usar `shadcn add` |
| Datos      | **TanStack Query v5**                     | Caché, reintentos e invalidación tras aprobar, rechazar o pausar                       |
| Wallet     | **Freighter** tras `WalletAdapter`        | `FE-Q2` sigue abierta: añadir xBull o Albedo es escribir otro adaptador                |
| Validación | **Zod**, vía `@aegis/contracts`           | Entrada y salida se validan con los mismos esquemas que usa la API                     |
| Identidad  | Mockup + mascota **Jupi** (`images/`)     | Tema oscuro en variables CSS; sin `next/font` para que `pnpm build` funcione sin red   |

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

> **No compiles con el `.env` de la API cargado en la terminal.** Mientras
> `apps/api` no lea su propio `.env`, el apaño es exportar esas variables en la
> sesión — y una de ellas es `NODE_ENV=development`, que `next build` hereda.
> Con eso el build falla al prerenderizar `/_global-error` con un
> `Cannot read properties of null (reading 'useContext')` que no tiene nada que
> ver con el código; el único aviso es una línea de Next sobre un «non-standard
> NODE_ENV». Compila en otra terminal, o quita la variable antes:
>
> ```powershell
> Remove-Item env:NODE_ENV; pnpm build
> ```

## Mapa del código

```
src/
├── app/
│   ├── layout.tsx          Providers y tema
│   ├── page.tsx            Conexión de wallet
│   ├── providers.tsx       React Query + AuthProvider
│   ├── dashboard/          Pendientes, saldos, límites, chat lateral
│   ├── limites/            Formulario de límites y modo (FE-09)
│   ├── destinos/           Alta y gestión de destinos (FE-10)
│   └── historial/          Movimientos y bitácora (FE-11)
├── components/
│   ├── auth/               Panel de conexión y guarda de ruta
│   ├── chat/               Chat con el agente (base de FE-05)
│   ├── dashboard/          Tarjeta de Jupi, estadísticas y listas del panel
│   ├── destinations/       Formulario en dos pasos y lista
│   ├── history/            Movimientos y bitácora encadenada
│   ├── jupi/               La mascota
│   ├── layout/             Barra lateral, cabecera y kill switch
│   ├── policy/             Formulario de límites
│   ├── proposals/          Tarjeta de propuesta y panel del Guardian
│   └── ui/                 Primitivas estilo shadcn (button, card, badge…)
├── lib/
│   ├── api/                client.ts (tipado), errors.ts, hooks.ts
│   ├── auth/               wallet.ts, session.ts, auth-context.tsx
│   ├── jupi.ts             Qué cara pone la mascota en cada estado
│   ├── navigation.ts       Las cuatro secciones, compartidas por las dos navegaciones
│   ├── proposals.ts        Estados, totales y confirmación del monto
│   ├── env.ts              Solo variables NEXT_PUBLIC_*
│   └── utils.ts            cn(), formatos de monto, dirección y fecha
└── public/
    ├── fonts/              Las dos tipografías, subconjunto latino
    └── jupi/               Los 12 sprites recortados del sheet
```

### Tipografía

Dos familias, las dos con licencia OFL y **autoalojadas** en `public/fonts/`
(subconjunto latino, variables: 49 KB las dos). Se sirven desde el propio
dominio a propósito — nada de pedirle fuentes a Google en cada visita — y así
`pnpm build` tampoco necesita red.

| Familia               | Dónde              | Por qué                                                                                                                              |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Plus Jakarta Sans** | Toda la interfaz   | Geométrica y cálida, del mismo aire redondeado que Jupi, pero seria a tamaños pequeños. Da carácter sin gritar                       |
| **Space Grotesk**     | Cifras y titulares | Sus números tienen personalidad y ancho fijo: cuando un saldo cambia en pantalla, el resto del número no baila. Clase `font-display` |

Si algún día hay que elegir una sola, Plus Jakarta Sans aguanta las dos
funciones; se pierde el contraste de las cifras, que es justo lo que hace que
el panel se lea como un producto financiero y no como una web más.

### Figuras propias

`components/ui/marks.tsx`, `gauge.tsx` y `sparkline.tsx` están dibujados a mano
en SVG: la mano del saludo, el anillo de Jupi, el anillo de progreso del límite
diario y la línea de tendencia del saldo. **Sin emojis y sin librerías de
gráficos**: un emoji lo dibuja cada sistema operativo a su manera, no hereda el
color del texto y no se alinea con el resto de la iconografía.

### Jupi

La mascota sale de `images/jupi.jpeg`: doce expresiones recortadas a PNG con
fondo transparente en `public/jupi/`. Qué cara pone lo decide `lib/jupi.ts`, y
esa decisión tiene una regla:

> **Jupi nunca contradice al Guardian.** No opina sobre el riesgo: lo refleja.
> Con riesgo alto o crítico no pone cara alegre, y no celebra una operación
> hasta que la red la confirma. Es una mascota, no una segunda opinión.

Su única animación es una flotación lenta, y desaparece con
`prefers-reduced-motion`.

### Reglas que este código respeta

- **Los montos son strings.** Stellar usa 7 decimales y los `number` de JS los
  pierden. `formatAmount` solo recorta ceros para mostrar; nunca se opera con
  ellos como números.
- **El token nunca decide nada.** Quien autoriza es la API; `RequireSession`
  solo evita enseñar una pantalla vacía.
- **Ninguna clave en el frontend.** La privada vive en Freighter; la del signer
  del agente, solo en la API.

## Estado de las tareas

| Tarea     | Estado                                                                               |
| --------- | ------------------------------------------------------------------------------------ |
| **FE-01** | ✅ Scaffold, lint, typecheck, tests y build integrados en la CI del monorepo         |
| **FE-02** | ✅ Cliente tipado con validación Zod, errores por código y hooks de React Query      |
| **FE-03** | ✅ Conexión Freighter (reto → firma → JWT), sesión persistida y `dev-login`          |
| **FE-04** | ✅ Configuración inicial y delegación · el **envío** del XDR firmado espera a BE1-05 |
| FE-05     | Base funcional · falta historial persistido y streaming (la API aún no hace SSE)     |
| **FE-06** | ✅ Tarjeta con operaciones, destinos resueltos, motivos de política y total          |
| **FE-07** | ✅ Aprobar con firma de Freighter, `confirmedTotal` y rechazo con motivo             |
| **FE-08** | ✅ Panel del Guardian: nivel, puntuación, advertencias, señales INFO y saldo final   |
| **FE-09** | ✅ Formulario de límites y modo, enviando solo los campos que cambiaron              |
| **FE-10** | ✅ Alta en dos pasos con confirmación de dirección, confianza y bloqueo              |
| **FE-11** | ✅ Movimientos de la red y bitácora con el estado de la cadena de hashes             |
| **FE-12** | ✅ Kill switch visible en la cabecera                                                |
| FE-13     | Pendiente · accesibilidad, responsive y pulido                                       |

### Tests

| Comando                                | Qué corre                                                    |
| -------------------------------------- | ------------------------------------------------------------ |
| `pnpm --filter @aegis/web test`        | 57 tests: lógica de `lib/` y componentes con Testing Library |
| `pnpm --filter @aegis/web test:e2e`    | 14 E2E con Playwright, contra la API real                    |
| `pnpm --filter @aegis/web test:e2e:ui` | Lo mismo, con el inspector de Playwright                     |

Los de componente se centran en lo que puede costar dinero: que el monto haya
que reescribirlo con riesgo alto, que a la API llegue exactamente lo que firmó
la wallet, y que un fallo de la wallet devuelva el control en vez de dejar la
tarjeta bloqueada.

**Los E2E necesitan la pila levantada** (Postgres, API con
`ALLOW_DEV_LOGIN=true`, y el frontend, que arranca solo). Si falta algo,
`e2e/global-setup.ts` para antes de empezar y dice qué. Usan el **Chrome ya
instalado** (`channel: 'chrome'`) en vez de descargar los navegadores de
Playwright.

Entran **una sola vez** y reutilizan la sesión: `/auth/*` admite 10 peticiones
por minuto y por IP, así que una suite que hiciera login en cada test se
bloquearía sola con 429 a mitad de camino.

Queda un test marcado como `fixme`: **aprobar firmando con Freighter**. Una
extensión de navegador no se conduce desde Playwright sin montarla en el perfil
y desbloquearla a mano. Los pasos están escritos para completarlo cuando BE1
cierre el flujo y haya una cuenta de pruebas.

### Accesibilidad (FE-13)

Lo que cubre la pasada, para que nadie lo confunda con una auditoría AA
certificada:

- Enlace **«Saltar al contenido»** como primer elemento tabulable.
- **Un título de documento por pantalla** (`Límites · Aegis`), que también es
  lo primero que anuncia un lector de pantalla al navegar.
- El **kill switch** dice en su nombre accesible qué hace _y_ qué implica, no
  solo una de las dos cosas.
- La hoja del chat en móvil es un `dialog` real: se cierra con Escape, el foco
  entra al abrirla y vuelve al botón al cerrarla.
- Contraste comprobado del texto atenuado sobre las tarjetas: 6,6:1 (AA pide
  4,5:1).
- La única animación, la flotación de Jupi, desaparece con
  `prefers-reduced-motion`.
- Todas las pantallas probadas a 390 px.

Queda sin hacer: una revisión con lector de pantalla real y una trampa de foco
completa en la hoja (hoy el foco entra y vuelve, pero no está encerrado).

## Despliegue (`Q-09`)

Sin desplegar todavía. Lo que hace falta cuando toque, con Vercel:

| Ajuste          | Valor                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Root Directory  | `apps/web`                                                                             |
| Install Command | `pnpm install --frozen-lockfile` (desde la raíz del repo)                              |
| Build Command   | `cd ../.. && pnpm -r --filter "./packages/**" build && pnpm --filter @aegis/web build` |
| Node            | 22                                                                                     |

Variables (todas `NEXT_PUBLIC_*`, así que **acaban en el navegador**; ninguna
es un secreto):

- `NEXT_PUBLIC_API_URL` — la API desplegada, no `localhost`.
- `NEXT_PUBLIC_SITE_URL` — la URL pública, para las imágenes sociales.
- `NEXT_PUBLIC_ALLOW_DEV_LOGIN` — **`false`** fuera de local. Si se queda en
  `true`, cualquiera entra a cualquier cuenta escribiendo una dirección.

Y en la API, `WEB_ORIGIN` tiene que incluir el dominio del despliegue o CORS
lo rechaza todo.

## Lo que queda esperando al backend

Está todo montado hasta donde la API llega. Cuando esas piezas existan, es
poco más que enchufarlas:

| Falta                                     | Quién   | Dónde se engancha                                                                                                                                                                        |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enviar a la red el XDR de delegación      | BE1-05  | `components/setup/delegation-card.tsx` — hoy firma y ofrece copiar el XDR. Con el endpoint: un método en `lib/api/client.ts`, su hook y sustituir el bloque de «copiar» por el resultado |
| Saber si la cuenta **ya** tiene el signer | BE1/BE2 | `components/setup/setup-checklist.tsx` — la delegación no sale en la lista porque no hay forma de consultarlo. Con un campo en `/account/balances` o similar, pasa a ser un paso más     |
| Respuestas en streaming (SSE)             | BE2     | `lib/chat/chat-context.tsx` — hoy una petición y una respuesta. El turno del agente tendría que ir creciendo en vez de aparecer entero                                                   |
| Estados de propuesta en vivo              | BE2     | `lib/api/hooks.ts` → `useProposals(..., { poll: true })`. Hoy sondea cada 5 s; con un canal en vivo se cambia ahí y en ningún sitio más                                                  |
| Aprobar firmando de verdad                | BE1     | `e2e/flujo.spec.ts` → el test marcado `fixme`, con los pasos escritos                                                                                                                    |
| Que el agente entienda más de dos frases  | AI      | Nada que tocar: el chat manda texto libre y pinta lo que vuelva                                                                                                                          |

## Decisiones que siguen sin respuesta

- **`FE-Q2`** · ¿solo Freighter? El `WalletAdapter` de `lib/auth/wallet.ts`
  está pensado para más de uno: añadir xBull o Albedo es escribir otro
  adaptador, sin tocar ninguna pantalla.
- **`FE-Q5`** · ¿i18n? Ahora los textos están en español dentro de los
  componentes. Sacarlos a un diccionario hoy cuesta poco; dentro de un mes,
  bastante más.

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
