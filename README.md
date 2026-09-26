<p align="center">
  <img src="docs/images/logo.png" alt="Aegis" width="560">
</p>

<p align="center">
  <strong>Un agente de IA que reparte tu dinero en Stellar dentro de los límites que tú le pones, y un Guardian que analiza y explica cada operación antes de ejecutarla.</strong>
</p>

<p align="center">
  <a href="https://stellar.expert/explorer/testnet/tx/d379a163e28c801977da80e683286624507cadfc8354435e88d199fbd0b2e146">Transacción en testnet</a> ·
  <a href="docs/guion-presentacion.md">Guion de la demo</a> ·
  <a href="PLAN.md">Plan</a> ·
  <a href="docs/adr/README.md">Decisiones</a>
</p>

---

**Cobras cuando cobras, y nunca sabes cuánto apartar.**

Quien trabaja por su cuenta en Perú —desarrolladores freelance, comerciantes,
talleres— tiene ingresos irregulares. Cuando entra dinero hay que decidir en
caliente cuánto va a cada cosa, y el fondo de emergencia siempre es lo último.
No es falta de disciplina: es que decidir cansa, y se decide justo en el peor
momento para hacerlo.

Aegis reparte cada ingreso por ti sobre **Stellar**, dentro de límites que
pusiste antes y con una reserva mínima que no se toca. Un **Guardian** analiza
cada operación antes de ejecutarla y te explica en lenguaje normal qué va a
pasar.

Repartir un ingreso en cuatro pagos cuesta fracciones de céntimo, liquida en
segundos y no hace falta cuenta bancaria. En una red cara, el reparto se comería
el ahorro.

```
Usuario ─┐
         ├→ Agente (propone) → Policy Engine (límites) → Guardian (riesgo + explicación)
Otro     ┘                   → Usuario autoriza (o autonomía dentro de límites)
agente                       → Stellar ejecuta
vía MCP
```

Cualquier agente de IA puede conectarse por **MCP** y proponer pagos. Ninguno
puede enviar dinero: heredan tus límites, tu Guardian y tu auditoría.

El plan completo está en [`PLAN.md`](PLAN.md). Las decisiones tomadas desde
entonces están en [`docs/adr/`](docs/adr/README.md), lo que falta para mainnet
en [`docs/roadmap-mainnet.md`](docs/roadmap-mainnet.md), y cómo enseñarlo en
tres minutos en [`docs/guion-presentacion.md`](docs/guion-presentacion.md).

> **Solo testnet.** Mainnet queda fuera del MVP (§15 del PLAN). La API se niega
> a arrancar en producción con `STELLAR_NETWORK=mainnet`.

---

## Evidencia on-chain · Stellar testnet

Todo lo que sigue ocurrió de verdad en la red, ejecutado por Aegis con
`USE_FAKE_STELLAR=false`. Cualquiera puede comprobarlo sin pedirnos nada.

**Pago ejecutado por el agente, de punta a punta:**

> [`d379a163e28c801977da80e683286624507cadfc8354435e88d199fbd0b2e146`](https://stellar.expert/explorer/testnet/tx/d379a163e28c801977da80e683286624507cadfc8354435e88d199fbd0b2e146)

Esa transacción es el flujo completo: el agente propuso, el Policy Engine la
aprobó por la regla **P-07** (cabe en los límites), el Guardian la puntuó con
**riesgo bajo (15/100)** y el signer delegado la firmó y la envió. Ledger
4 871 403. Comisión: **0,00001 XLM**.

| Qué                   | Enlace                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Pago del agente       | [d379a163…b2e146](https://stellar.expert/explorer/testnet/tx/d379a163e28c801977da80e683286624507cadfc8354435e88d199fbd0b2e146) |
| Delegación del signer | [63fcef48…bd0b0c](https://stellar.expert/explorer/testnet/tx/63fcef48bc625bb6269da67311ccb98d7773458ca278eedc612aacfdb2bd0b0c) |
| Cuenta demo           | [GAU3RPMY…TIKF5](https://stellar.expert/explorer/testnet/account/GAU3RPMY62XGDYDEYJ75XTXZXXVFFCRDT5AUQHC72XLR3GUM7RVTIKF5)     |

La **delegación** es la que explica el modelo de custodia: con `setOptions`, la
cuenta del usuario añade al agente como firmante con peso limitado y sube el
umbral alto por encima de ese peso. El agente puede pagar; no puede cambiar
quién firma, ni vaciar la cuenta, ni quitarse a sí mismo el límite. Y el usuario
lo revoca cuando quiera sin pedir permiso a nadie.

**Y los límites atan.** La misma cuenta, la misma sesión, pidiendo 8 XLM con el
tope por operación en 5:

```json
{
  "estado": "PENDING_USER",
  "politica": "REQUIRE_USER",
  "motivos": ["P-01: \"Objetivo: Viaje\" es de 8 XLM y tu límite por operación es 5."],
  "hash": null
}
```

Sin hash, porque no se envió nada: se quedó esperando la firma del usuario. Es
la diferencia entre un agente con límites y un agente al que se le piden
límites por favor.

---

## Así se ve

<p align="center">
  <img src="docs/images/propuesta.png" alt="El agente propone un reparto y el Guardian lo analiza antes de que el usuario apruebe">
</p>

Le hablas en lenguaje normal y responde con una propuesta que todavía no ha
hecho nada: el reparto, el valor en dólares, el riesgo y la explicación. Nada se
mueve hasta que tú lo apruebas —o, en modo autónomo, hasta que cabe en tus
límites **y** el Guardian ve riesgo bajo.

<table>
  <tr>
    <td width="50%"><img src="docs/images/limites.png" alt="Pantalla de límites"><br><sub><b>Límites.</b> Por operación, por día y reserva mínima, en el activo o en dólares.</sub></td>
    <td width="50%"><img src="docs/images/historial.png" alt="Historial y bitácora encadenada"><br><sub><b>Historial.</b> Cada operación con su bitácora encadenada por hashes y su verificación.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/destinos.png" alt="Destinos registrados"><br><sub><b>Destinos.</b> El agente no escribe direcciones: solo referencia las que registraste.</sub></td>
    <td align="center"><img src="docs/images/movil.png" alt="Aegis en móvil" width="300"><br><sub><b>Móvil.</b> La misma aplicación, con el kill switch a un toque.</sub></td>
  </tr>
</table>

Las capturas se rehacen con `node apps/web/scripts/capturas.mjs`, para que no
envejezcan en silencio.

---

## Requisitos previos

Esto es lo que hay que tener instalado **antes** de clonar. Aplica a los cuatro
roles: aunque solo vayas a tocar el frontend, los tipos y el OpenAPI salen de
compilar el backend.

| Software    | Versión                          | Para qué                                      | Cómo se instala                                                   |
| ----------- | -------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| **Node.js** | ≥ 20.11 · recomendado **22 LTS** | Todo el monorepo                              | [nodejs.org](https://nodejs.org) o `nvm install 22`               |
| **pnpm**    | **9.x**                          | Gestor de paquetes del monorepo               | `corepack enable && corepack prepare pnpm@9.15.9 --activate`      |
| **Docker**  | cualquiera reciente              | Postgres en local **y para correr los tests** | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **Git**     | ≥ 2.40                           | Obvio                                         | [git-scm.com](https://git-scm.com)                                |

La CI usa Node 22 y pnpm 9.15.9. Si en local usas otra versión mayor de Node y
algo se comporta distinto, esa es la primera sospecha.

> **No instales pnpm con `npm i -g pnpm`.** Usa `corepack`: la versión está
> fijada en `packageManager` del `package.json` y así todos usamos la misma.

**Comprobación rápida** (los cuatro números deben salir):

```bash
node -v      # v20.11+ (probado con v22 y v24)
pnpm -v      # 9.x
docker -v    # cualquiera
git --version
```

### Adicionales según el rol

| Rol     | Qué más necesitas                                                 | Nota                                                                              |
| ------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **FE**  | Extensión [Freighter](https://www.freighter.app/) en el navegador | Para firmar de verdad. Mientras tanto, `POST /auth/dev-login` funciona sin wallet |
| **BE1** | Nada extra                                                        | Testnet y Friendbot son servicios web; no hay que instalar nada                   |
| **BE2** | Nada extra                                                        | Docker cubre Postgres                                                             |
| **AI**  | Clave de API del proveedor LLM                                    | Va en `.env` como `ANTHROPIC_API_KEY`, nunca en el repositorio (`Q-10`)           |

Opcional pero recomendado: la [CLI de GitHub](https://cli.github.com/) (`gh`)
para PRs e issues, y en VS Code las extensiones **ESLint** y **Prettier** para
que el formato se arregle al guardar en vez de fallar en la CI.

### Si el puerto 5432 ya está ocupado

Es frecuente tener otro Postgres corriendo. El `docker-compose` lee
`POSTGRES_PORT`, así que basta con cambiarlo en tu `.env`:

```bash
POSTGRES_PORT=5433
DATABASE_URL=postgresql://aegis:aegis@localhost:5433/aegis
TEST_DATABASE_URL=postgresql://aegis:aegis@localhost:5433/aegis
```

---

## Arranque rápido

```bash
# 1. Dependencias
pnpm install

# 2. Configuración
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # → JWT_SECRET

# 3. Base de datos
pnpm db:up          # Postgres en Docker
pnpm db:migrate     # aplica las migraciones
pnpm db:seed        # usuario de demo con 3 objetivos + fondo de emergencia

# 4. API
pnpm dev:api        # http://localhost:3001 · documentación en /docs

# 5. Frontend, en otra terminal
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev:web        # http://localhost:3000
```

> Los tests de integración **necesitan Docker levantado**: crean su propia base
> de datos dentro del Postgres de `pnpm db:up`. Si `pnpm test` falla nada más
> empezar, casi siempre es eso.

Comprobación en 30 segundos, sin wallet y sin red Stellar (con
`ALLOW_DEV_LOGIN=true` y `USE_FAKE_STELLAR=true`):

```bash
TOKEN=$(curl -s localhost:3001/auth/dev-login \
  -H 'content-type: application/json' \
  -d '{"address":"GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s localhost:3001/agent/messages \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"message":"reparte 50 entre mis objetivos y guarda 10 para emergencias"}'
```

La respuesta trae la propuesta ya evaluada: decisión de política, informe de
riesgo y explicación.

---

## Estructura

```
aegis/
├── apps/
│   ├── web/                Frontend (Next.js)                       → FE
│   ├── api/                API + orquestación                       → BE2
│   └── mcp/                Servidor MCP para agentes externos       → BE2
├── packages/
│   ├── contracts/          Zod, tipos, puertos, fixtures            → compartido
│   ├── stellar/            Cliente Stellar + fakes                  → BE1
│   ├── policy-engine/      Reglas P-01…P-10                         → BE2
│   ├── guardian/           Señales G-01…G-10, score, explicación    → BE2
│   ├── prices/             Precio en dólares de los activos         → BE2
│   └── agent/              Agente y explicador                      → AI
├── docs/{adr,api,runbooks}
├── images/                 Mockup y sprites de Jupi (fuente de diseño)      → FE
└── infra/                  docker-compose (Postgres)
```

Cada paquete tiene su propio README con lo que hace y lo que le falta.

---

## Estado por área

| Área                     | Dueño      | Estado                                                                                                                                                                                                     |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts`     | Compartido | **v0 listo.** Entidades, endpoints, puertos y fixtures. Contract freeze al final de S2                                                                                                                     |
| `packages/policy-engine` | BE2        | **Funcional.** P-01…P-10, incluidos los topes en dólares. 30 tests                                                                                                                                         |
| `packages/guardian`      | BE2        | **Funcional.** G-01…G-10, score y explicación de respaldo. 29 tests                                                                                                                                        |
| `packages/prices`        | BE2        | **Funcional.** Precio en dólares con caché y respaldo fijo. 19 tests                                                                                                                                       |
| `apps/api`               | BE2        | **Funcional.** Auth, destinos, propuestas con máquina de estados, política, Guardian, auditoría encadenada y barrido de caducidad. 81 tests, casi todos de integración contra Postgres real                |
| `apps/mcp`               | BE2        | **Funcional.** Servidor MCP con 6 herramientas; ninguna envía dinero. 9 tests                                                                                                                              |
| `packages/stellar`       | BE1        | **Funcional.** Horizon real: saldos, historial, estadísticas, antigüedad de cuentas, simulación, firma y envío en testnet, pagos en lote y reconciliación. 56 tests                                        |
| `packages/agent`         | AI         | **Andamiaje.** Agente de reglas sin LLM, suficiente para la demo end-to-end                                                                                                                                |
| `apps/web`               | FE         | **Completo (FE-01…FE-13).** Sesión con cualquier wallet de Stellar, propuestas con firma, panel del Guardian, límites, destinos, historial, configuración y delegación. Interfaz según `images/mockup.png` |

Nadie está bloqueado: cada consumidor tiene un mock del que depende
(§6.2 del PLAN).

---

## Comandos

| Comando                            | Qué hace                                                   |
| ---------------------------------- | ---------------------------------------------------------- |
| `pnpm build`                       | Compila paquetes y aplicaciones                            |
| `pnpm typecheck`                   | TypeScript en todo el monorepo                             |
| `pnpm test`                        | Todos los tests (los de la API necesitan Docker levantado) |
| `pnpm lint` / `pnpm format`        | ESLint / Prettier                                          |
| `pnpm dev:api`                     | API en modo watch                                          |
| `pnpm build:mcp`                   | Compila el servidor MCP para conectarlo a Claude Desktop   |
| `pnpm db:up` / `db:down`           | Postgres en Docker                                         |
| `pnpm db:generate`                 | Genera una migración desde el esquema                      |
| `pnpm db:migrate` / `db:seed`      | Aplica migraciones / datos de demo                         |
| `pnpm --filter @aegis/api openapi` | Regenera `docs/api/openapi.json`                           |

---

## Reglas que no se negocian

1. **El LLM propone y explica; el código determinista decide.** Ni el Policy
   Engine ni el Guardian llaman a un modelo.
2. **El agente nunca escribe direcciones Stellar.** Solo referencia ids de
   destinos registrados. Una dirección nueva entra únicamente por la UI.
3. **Nunca hay claves en el frontend ni en el LLM.** El único paquete que
   importa `@stellar/stellar-sdk` es `@aegis/stellar`.
4. **El Guardian corre siempre**, también en modo autónomo. Riesgo `MEDIUM` o
   superior devuelve el control al usuario.
5. **Si no se sabe el precio, decide la persona.** Los límites en dólares no se
   aplican nunca con una conversión inventada: se escala al usuario (P-10).
6. **Todo queda auditado** en una bitácora append-only con hash encadenado.
7. **Testnet.** Nada de mainnet en el MVP.

### Límite importante y honesto

Stellar aplica _thresholds_ por **tipo de operación**, no por monto ni por
destinatario. Los límites ("máx. $5", "nunca a una dirección nueva") se aplican
**fuera de la cadena**, en el backend. Si la clave del signer del agente se
filtrara, en la red podría firmar pagos por cualquier monto. Mitigaciones: solo
testnet, rotación de signer, kill switch y el spike `SP-1` (§4.4 del PLAN).

---

## Cómo trabajamos

- `main` protegida; se entra por PR con CI en verde.
- Ramas `feat/<area>-<descripcion>`, PR pequeños (<400 líneas), 1 aprobación
  (2 en `packages/contracts`).
- [Conventional Commits](https://www.conventionalcommits.org/): `feat(api): …`.
- Secretos jamás en el repo. La CI busca claves secretas de Stellar en el diff.
- **Ante la duda, se pregunta antes de asumir** (§14 del PLAN). Eso vale también
  para los asistentes de IA que trabajen en este repositorio.

## Licencia

MIT — ver [LICENSE](LICENSE).
