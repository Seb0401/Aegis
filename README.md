# Aegis

Un agente de IA que puede mover dinero en **Stellar** por ti, pero siempre con
límites, y un **Guardian** que analiza cada operación antes de ejecutarla y te
explica en lenguaje normal qué va a pasar.

```
Usuario → Agente (propone) → Policy Engine (límites) → Guardian (riesgo + explicación)
        → Usuario autoriza (o autonomía dentro de límites) → Stellar ejecuta
```

El plan completo está en [`PLAN.md`](PLAN.md). Las decisiones tomadas desde
entonces están en [`docs/adr/`](docs/adr/README.md).

> **Solo testnet.** Mainnet queda fuera del MVP (§15 del PLAN). La API se niega
> a arrancar en producción con `STELLAR_NETWORK=mainnet`.

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
```

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
│   └── api/                API + orquestación                       → BE2
├── packages/
│   ├── contracts/          Zod, tipos, puertos, fixtures            → compartido
│   ├── stellar/            Cliente Stellar + fakes                  → BE1
│   ├── policy-engine/      Reglas P-01…P-09                         → BE2
│   ├── guardian/           Señales G-01…G-09, score, explicación    → BE2
│   └── agent/              Agente y explicador                      → AI
├── docs/{adr,api,runbooks}
└── infra/                  docker-compose (Postgres)
```

Cada paquete tiene su propio README con lo que hace y lo que le falta.

---

## Estado por área

| Área                     | Dueño      | Estado                                                                                                     |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/contracts`     | Compartido | **v0 listo.** Entidades, endpoints, puertos y fixtures. Contract freeze al final de S2                     |
| `packages/policy-engine` | BE2        | **Funcional.** P-01…P-09 con 22 tests                                                                      |
| `packages/guardian`      | BE2        | **Funcional.** G-01…G-09, score y explicación de respaldo, con 22 tests                                    |
| `apps/api`               | BE2        | **Funcional.** Auth, destinos, propuestas con máquina de estados, política, Guardian, auditoría encadenada |
| `packages/stellar`       | BE1        | **Andamiaje.** Interfaces, `FakeStellarReader` y `FakeStellarExecutor`. Falta la integración real          |
| `packages/agent`         | AI         | **Andamiaje.** Agente de reglas sin LLM, suficiente para la demo end-to-end                                |
| `apps/web`               | FE         | **Vacío a propósito.** Scaffold pendiente de `FE-Q1` y `FE-Q3`                                             |

Nadie está bloqueado: cada consumidor tiene un mock del que depende
(§6.2 del PLAN).

---

## Comandos

| Comando                            | Qué hace                              |
| ---------------------------------- | ------------------------------------- |
| `pnpm build`                       | Compila paquetes y aplicaciones       |
| `pnpm typecheck`                   | TypeScript en todo el monorepo        |
| `pnpm test`                        | Todos los tests                       |
| `pnpm lint` / `pnpm format`        | ESLint / Prettier                     |
| `pnpm dev:api`                     | API en modo watch                     |
| `pnpm db:up` / `db:down`           | Postgres en Docker                    |
| `pnpm db:generate`                 | Genera una migración desde el esquema |
| `pnpm db:migrate` / `db:seed`      | Aplica migraciones / datos de demo    |
| `pnpm --filter @aegis/api openapi` | Regenera `docs/api/openapi.json`      |

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
5. **Todo queda auditado** en una bitácora append-only con hash encadenado.
6. **Testnet.** Nada de mainnet en el MVP.

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
