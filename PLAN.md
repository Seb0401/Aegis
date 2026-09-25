# StellarGuard — Agente financiero personal + AI Wallet Guardian

> **Nombre tentativo.** Confirmar en la pregunta `Q-01`.
> **Estado del documento:** borrador v0.1 · **Última actualización:** 2026-09-19

Un agente de IA que puede mover dinero en **Stellar** por el usuario, pero siempre con límites, y un **AI Guardian** que analiza cada operación antes de ejecutarla y la explica en lenguaje normal.

```
Usuario → Agente (propone) → Policy Engine (límites) → Guardian (riesgo + explicación)
        → Usuario autoriza (o autonomía dentro de límites) → Stellar ejecuta
```

---

## 0. Cómo usar este documento (leer primero)

Este es un **documento vivo**. Es el punto de partida, no un contrato cerrado.

**Regla de oro: durante la ejecución se deben hacer preguntas a las 4 personas del equipo antes de asumir.**
Hay decisiones que dependen del conocimiento, la disponibilidad o las preferencias de cada rol (diseño, llaves, modelos LLM, base de datos, etc.). La sección [14. Preguntas abiertas](#14-preguntas-abiertas-y-protocolo-de-preguntas) lista lo que ya sabemos que hay que preguntar y define cómo hacerlo.

Esto aplica a cualquier persona del equipo **y a cualquier asistente de IA** que colabore en el repositorio: si hay una duda que cambia el diseño, se pregunta primero y se documenta la respuesta.

---

## 1. Visión, principios y alcance

### 1.1 Problema

**Cobras cuando cobras, y nunca sabes cuánto apartar.** Quien trabaja por su cuenta —desarrolladores freelance, comerciantes, talleres— tiene ingresos irregulares. Cuando entra dinero hay que decidir en caliente cuánto va a cada cosa, y el fondo de emergencia siempre es lo último. No es falta de disciplina: es que decidir cansa, y se decide justo en el peor momento para hacerlo.

Un agente de IA podría repartirlo automáticamente. Pero delegarle dinero da miedo por buenas razones: puede equivocarse, ser manipulado o gastar de más. Hoy o se le da control total o no se le da ninguno.

Por qué Stellar: repartir un ingreso en cuatro pagos pequeños cuesta fracciones de céntimo —en una red cara, el reparto se comería el ahorro—, liquida en segundos y no exige cuenta bancaria ni monto mínimo.

Ver [ADR 0012](docs/adr/0012-hackathon-track-agentes.md).

### 1.2 Propuesta

**Autonomía controlada**: el agente puede ejecutar acciones financieras pequeñas dentro de reglas que define el usuario, y un guardián independiente revisa cada operación y le explica al usuario qué va a pasar y qué riesgos tiene.

### 1.3 Principios de diseño (no negociables)

1. **El LLM propone y explica; el código determinista decide.** Ninguna decisión de autorización o de riesgo depende de la salida libre de un modelo.
2. **El agente nunca escribe direcciones Stellar.** Solo referencia IDs de destinos ya registrados (objetivos, contactos). Una dirección nueva solo entra por el usuario, desde la UI.
3. **Nunca hay claves en el frontend ni en el LLM.** El modelo no ve secretos y sus salidas se validan contra un esquema.
4. **Contract-first.** Los 4 acuerdan contratos (esquemas y API) al inicio y cada persona trabaja contra mocks. Nadie espera a nadie.
5. **Testnet primero.** Mainnet queda como fase futura documentada (ver §15).
6. **Todo queda auditado.** Cada propuesta, decisión, aprobación y transacción se registra.

### 1.4 Ejemplo de referencia (caso de uso central)

> Usuario: _"Tengo $50. Divide esto entre mis tres objetivos y guarda $10 para emergencias."_

1. El **Agente** consulta el saldo, interpreta la intención y crea una **Propuesta** con 4 pagos (3 objetivos + emergencias) que suman $50 como máximo.
2. El **Policy Engine** evalúa los límites (p. ej. máx. $5 por operación → algunas acciones requerirán confirmación).
3. El **Guardian** calcula señales de riesgo y genera una explicación: _"Vas a enviar $50 en 4 pagos. Después te quedarían $0 disponibles…"_.
4. El **Usuario** autoriza (o el sistema ejecuta solo lo que cae dentro de los límites y el modo autónomo).
5. **Stellar** ejecuta, se confirma y se muestra el resultado.

### 1.5 Alcance del MVP

**Incluido**

- Wallet Stellar (testnet) conectada y cuenta configurada con signer delegado para el agente.
- Chat con el agente: consultar saldos, proponer reparto entre objetivos, proponer pagos.
- Policy Engine con reglas configurables (límites, destinos nuevos, reserva mínima, modo manual/autónomo, kill switch).
- Guardian: señales de riesgo, score, explicación en lenguaje natural y confirmación.
- Ejecución de pagos (clásicos) en Stellar testnet, con estado y historial.
- Registro de auditoría.
- Servidor MCP: otros agentes de IA pueden proponer pagos, nunca ejecutarlos ([ADR 0012](docs/adr/0012-hackathon-track-agentes.md)).

**Fuera del MVP** (ver §15)

- Mainnet, interacción con contratos Soroban, swaps/path payments, pagos recurrentes, notificaciones push, múltiples usuarios a escala, app móvil nativa.

---

## 2. Decisiones ya tomadas

| ID   | Decisión | Valor                                                                                                                                                             |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Plazo    | **4–6 semanas** (se planifica sobre 6 con plan de recorte a 4, ver §9.3)                                                                                          |
| D-02 | Red      | **Testnet ahora**, Mainnet como fase futura                                                                                                                       |
| D-03 | Firma    | **Cuenta delegada con límites**: el agente tiene un _signer_ secundario en la cuenta del usuario; operaciones fuera de los límites requieren la firma del usuario |
| D-04 | Stack    | **Propuesto en §3** y por confirmar con el equipo                                                                                                                 |
| D-05 | Equipo   | 4 personas: 1 Frontend, 2 Backend, 1 AI Agent                                                                                                                     |
| D-06 | Flujo    | Agente → propone → Guardian analiza → usuario autoriza (o autonomía dentro de límites) → Stellar ejecuta                                                          |

---

## 3. Stack propuesto (por confirmar en el kickoff)

| Capa               | Propuesta                                                                                        | Notas                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lenguaje           | TypeScript en todo el monorepo                                                                   | Un solo lenguaje y SDK oficial de Stellar para JS. Si el rol AI prefiere Python, el agente puede correr como servicio aparte detrás del mismo contrato (`AI-Q1`) |
| Monorepo           | pnpm workspaces                                                                                  | Paquetes independientes = menos choques                                                                                                                          |
| Frontend           | Next.js + Tailwind + shadcn/ui                                                                   | `FE-Q1`                                                                                                                                                          |
| Wallet del usuario | Freighter (`@stellar/freighter-api`)                                                             | `FE-Q2`                                                                                                                                                          |
| Backend            | Fastify 5 + PostgreSQL 16 + Drizzle, con Zod como única validación                               | Decidido en [ADR 0002](docs/adr/0002-stack-backend.md)                                                                                                           |
| Stellar            | `@stellar/stellar-sdk` + Horizon o Stellar RPC para lectura                                      | Verificar en la documentación oficial qué API de lectura está vigente (`BE1-Q1`)                                                                                 |
| Agente             | Vercel AI SDK + Groq directo (GPT-OSS) + Laya local temporal; JEv queda pendiente de acceso    | `AI-Q1`, `AI-Q2`                                                                                                                                                 |
| Precios            | API pública con caché, detrás de un puerto                                                       | `packages/prices`. Ver [ADR 0011](docs/adr/0011-precios-en-dolares.md)                                                                                           |
| MCP                | `@modelcontextprotocol/sdk` sobre stdio                                                          | `apps/mcp`. Expone Aegis a otros agentes sin dejarles mover dinero                                                                                               |
| Contratos          | Zod → tipos TS + OpenAPI                                                                         | Fuente única de verdad en `packages/contracts`                                                                                                                   |
| Mocks              | Prism/MSW (API), fixtures (Stellar), LLM fake                                                    | Cada rol desarrolla sin esperar a los demás                                                                                                                      |
| CI                 | GitHub Actions: lint, formato, typecheck, test, build, E2E, imagen Docker y búsqueda de secretos | Obligatorio para hacer merge                                                                                                                                     |

---

## 4. Arquitectura

### 4.1 Vista general

```
┌──────────────┐   HTTPS/SSE   ┌────────────────────────── apps/api ───────────────────────────┐
│  apps/web    │ ────────────► │  Orquestador (proposals, estados, auditoría, auth)            │
│  (Frontend)  │ ◄──────────── │      │             │               │                          │
│  + Freighter │               │      ▼             ▼               ▼                          │
└──────────────┘               │  packages/agent  packages/policy  packages/guardian           │
                               │  (LLM + tools)   (reglas)         (señales + score)           │
                               │      │                                   │                    │
                               │      └──────────────┬────────────────────┘                    │
                               │                     ▼                                         │
                               │              packages/stellar  ──►  Stellar testnet           │
                               │   (balances, historial, build/sign/submit, delegación)        │
                               └───────────────────────────────────────────────────────────────┘
```

### 4.2 Componentes

| Componente                                              | Responsabilidad                                                                                   | ¿Usa LLM?                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Agente** (`packages/agent`)                           | Entender la intención, consultar datos vía _tools_, crear propuestas válidas, conversar           | Sí                             |
| **Policy Engine** (`packages/policy-engine`)            | Decidir `AUTO_APPROVE`, `REQUIRE_USER` o `DENY` según reglas del usuario                          | No                             |
| **Guardian – señales** (`packages/guardian`)            | Calcular señales y score de riesgo a partir de datos reales                                       | No                             |
| **Guardian – explicación** (`packages/agent/explainer`) | Convertir `RiskReport` en lenguaje normal, sin inventar datos                                     | Sí (con plantilla de respaldo) |
| **Stellar Service** (`packages/stellar`)                | Leer cuentas e historial, simular, construir, firmar y enviar transacciones, gestionar delegación | No                             |
| **Orquestador** (`apps/api`)                            | Máquina de estados de propuestas, auth, persistencia, auditoría, endpoints                        | No                             |

### 4.3 Ciclo de vida de una propuesta

```
DRAFT ─► POLICY_CHECK ─► GUARDIAN_REVIEW ─┬─► AUTO_APPROVED ─► SIGNED ─► SUBMITTED ─► CONFIRMED
                              │            ├─► PENDING_USER ──(aprueba)──► SIGNED ...
                              │            │        └──(rechaza)──► REJECTED
                              │            └─► DENIED
                              └──► EXPIRED / FAILED
```

Regla: el Guardian **siempre** corre, incluso en modo autónomo. Si el riesgo es `MEDIUM` o superior, una operación que iba a ser autónoma se degrada a `PENDING_USER`.

### 4.4 Modelo de firma (D-03)

- La cuenta del usuario agrega un **signer secundario** (clave del agente, custodiada por el backend) con peso bajo. La clave maestra del usuario mantiene el peso necesario para operaciones sensibles (`SetOptions`, cambios de signers).
- El backend **solo firma con el signer del agente** si el Policy Engine devolvió `AUTO_APPROVE` y el Guardian no elevó el riesgo.
- Si la operación requiere al usuario, el backend prepara el **XDR sin firmar**; el frontend lo firma con Freighter y lo devuelve.

> ⚠️ **Limitación importante y honesta:** Stellar aplica _thresholds_ por tipo de operación, **no por monto ni por destinatario**. Los límites ("máx. $5", "nunca a una dirección nueva") se aplican **fuera de la cadena**, en el backend. Si la clave del agente se filtrara, en la red podría firmar pagos por cualquier monto. Mitigaciones: solo testnet en el MVP, rotación de signer, kill switch y el spike `SP-1` (ver §9), que evalúa una **cuenta-bolsillo del agente** con presupuesto acotado como alternativa. A futuro: cuenta inteligente en Soroban con políticas on-chain (§15).

---

## 5. Contratos compartidos (`packages/contracts`)

Es lo único que **los 4 comparten**. Se define en la semana 1 y se congela al final de la semana 2. Los tipos se generan desde Zod; el frontend y el agente los consumen.

### 5.1 Entidades

```ts
// Propuesta creada por el agente
Proposal {
  id: string
  userId: string
  status: 'DRAFT'|'POLICY_CHECK'|'GUARDIAN_REVIEW'|'PENDING_USER'|'AUTO_APPROVED'
        |'SIGNED'|'SUBMITTED'|'CONFIRMED'|'REJECTED'|'DENIED'|'EXPIRED'|'FAILED'
  summary: string
  actions: ProposedAction[]        // ver abajo
  policy?: PolicyDecision
  risk?: RiskReport
  explanation?: Explanation
  createdAt: string; expiresAt: string
}

ProposedAction {
  type: 'PAYMENT'
  destinationId: string            // ID de objetivo o contacto registrado (NUNCA una dirección libre)
  asset: 'XLM' | 'USDC_TEST'
  amount: string                   // decimal como string
  memo?: string
  label: string                    // ej. "Objetivo: Viaje"
}

PolicyDecision {
  decision: 'AUTO_APPROVE'|'REQUIRE_USER'|'DENY'
  reasons: { ruleId: string; message: string }[]
}

RiskReport {
  score: number                    // 0–100
  level: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'
  signals: { id: string; severity: 'INFO'|'WARN'|'HIGH'; data: Record<string, unknown> }[]
  balanceAfter: string
}

Explanation {
  summary: string                  // "Estás enviando $850. Después te quedarían $320."
  warnings: { signalId: string; text: string }[]
  generatedBy: 'llm' | 'template'
}
```

### 5.2 Endpoints REST (borrador para OpenAPI)

| Método     | Ruta                               | Propósito                                                 |
| ---------- | ---------------------------------- | --------------------------------------------------------- |
| `POST`     | `/auth/challenge` · `/auth/verify` | Inicio de sesión firmando un reto con la wallet (`Q-07`)  |
| `GET`      | `/account/balances`                | Saldos                                                    |
| `POST`     | `/account/delegation/prepare`      | Devuelve XDR para agregar el signer del agente            |
| `GET/POST` | `/destinations`                    | Objetivos y contactos registrados                         |
| `POST`     | `/agent/messages`                  | Mensaje al agente → respuesta + propuestas (SSE opcional) |
| `GET`      | `/proposals/:id`                   | Estado, política, riesgo y explicación                    |
| `POST`     | `/proposals/:id/approve`           | Aprobar (con XDR firmado si aplica)                       |
| `POST`     | `/proposals/:id/reject`            | Rechazar                                                  |
| `GET/PUT`  | `/policy`                          | Ver / editar reglas y modo                                |
| `POST`     | `/policy/pause`                    | Kill switch                                               |
| `GET`      | `/transactions`                    | Historial                                                 |

### 5.3 Interfaces internas (para que nadie bloquee a nadie)

```ts
// BE1 implementa, BE2 y AI consumen (con mock mientras tanto)
interface StellarReader {
  getBalances(accountId: string): Promise<Balance[]>;
  getHistory(accountId: string, opts?): Promise<TxSummary[]>;
  getAccountInfo(
    address: string,
  ): Promise<{ exists: boolean; ageDays?: number; trustlines: string[] }>;
  simulatePayments(
    actions: ResolvedAction[],
  ): Promise<{ fee: string; balanceAfter: string; errors: string[] }>;
}
interface StellarExecutor {
  buildUnsigned(actions: ResolvedAction[]): Promise<{ xdr: string }>;
  signWithAgent(xdr: string): Promise<{ xdr: string }>;
  submit(xdr: string): Promise<{ hash: string }>;
}

// BE2 implementa, el agente consume
interface AgentTools {
  getBalances(): Promise<Balance[]>;
  listDestinations(): Promise<Destination[]>;
  createProposal(input: ProposalInput): Promise<Proposal>;
  getPolicySummary(): Promise<PolicySummary>;
}
```

### 5.4 Cómo se cambia un contrato

1. Abrir issue `contract-change` con motivo y propuesta.
2. PR a `packages/contracts` con **2 aprobaciones**: productor y consumidor afectados.
3. Cambios **aditivos** libres hasta el _contract freeze_ (fin de la semana 2); después, solo con justificación y aviso al equipo.

---

## 6. Equipo, ownership y cómo evitar dependencias

### 6.1 Roles

| Rol                            | Persona (completar) | Dueño de                                                  | Consume                                      |
| ------------------------------ | ------------------- | --------------------------------------------------------- | -------------------------------------------- |
| **FE** – Frontend              | `@____`             | `apps/web`                                                | API (OpenAPI/mock)                           |
| **BE1** – Backend Stellar      | `@____`             | `packages/stellar`                                        | `contracts`                                  |
| **BE2** – Backend API y reglas | `@____`             | `apps/api`, `packages/policy-engine`, `packages/guardian` | `StellarReader` (mock de BE1)                |
| **AI** – Agente                | `@____`             | `packages/agent` (agente + explicador)                    | `AgentTools` (fake), `RiskReport` (fixtures) |

### 6.2 Matriz de dependencias y cómo se desacoplan

| Quién necesita | De quién                | Se desbloquea con                                                      |
| -------------- | ----------------------- | ---------------------------------------------------------------------- |
| FE             | BE2 (API)               | Servidor mock generado del OpenAPI (Prism/MSW) desde la semana 1       |
| AI             | BE2 (`AgentTools`)      | Implementación _fake_ en memoria dentro de `packages/agent`            |
| AI             | Guardian (`RiskReport`) | Fixtures JSON con casos típicos (`fixtures/risk/*.json`)               |
| BE2            | BE1 (`StellarReader`)   | `FakeStellarReader` con datos de prueba, en `packages/stellar/testing` |
| BE1            | Nadie                   | Solo depende de `contracts`                                            |
| Todos          | `contracts`             | Se define juntos en la semana 1; luego cambios controlados             |

**Reglas de convivencia**

- Cada carpeta tiene un dueño en `CODEOWNERS`. Se puede sugerir cambios en carpetas ajenas por PR, pero el dueño aprueba.
- Se integra **pronto y en pequeño**: mocks → integración real un componente a la vez.
- Si algo te bloquea más de **24 h**, se abre un issue `blocked` y se avisa en el canal; el lead del sprint decide (ver §14).

---

## 7. Estructura del repositorio

```
aegis/
├── apps/
│   ├── web/                  # Frontend (Next.js)                       → FE
│   ├── api/                  # API + orquestación                       → BE2
│   └── mcp/                  # Servidor MCP para agentes externos       → BE2
├── packages/
│   ├── contracts/            # Zod, tipos, OpenAPI, mocks, fixtures     → compartido
│   ├── stellar/              # Cliente Stellar + testing/FakeReader     → BE1
│   ├── policy-engine/        # Reglas de autorización                   → BE2
│   ├── guardian/             # Señales y score de riesgo                → BE2
│   ├── prices/               # Precio en dólares de los activos         → BE2
│   └── agent/                # Agente, tools, explicador, evals         → AI
├── docs/
│   ├── adr/                  # Decisiones de arquitectura (1 archivo por decisión)
│   ├── api/                  # OpenAPI publicado
│   └── runbooks/             # Cómo levantar, demo, troubleshooting
├── infra/                    # docker-compose (Postgres, etc.)
├── .github/
│   ├── CODEOWNERS
│   ├── workflows/            # ci.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/       # feature, bug, question, contract-change
├── .env.example              # NUNCA subir .env real
├── PLAN.md                   # este documento
└── README.md
```

---

## 8. Reglas de política y señales de riesgo (catálogo inicial)

Todos los valores son **configurables** y provisionales. Confirmar con el equipo (`BE2-Q3`).

### 8.1 Policy Engine

| ID   | Regla                                          | Valor por defecto                                                   |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------- |
| P-01 | Monto máximo por operación                     | **$5**                                                              |
| P-02 | Límite diario acumulado                        | $20                                                                 |
| P-03 | Destino nuevo (no registrado o sin historial)  | **Siempre requiere confirmación del usuario**                       |
| P-04 | Activos permitidos                             | `XLM`, `USDC_TEST`                                                  |
| P-05 | Máx. operaciones por hora                      | 10                                                                  |
| P-06 | Reserva mínima intocable (fondo de emergencia) | $10                                                                 |
| P-07 | Modo de operación                              | `MANUAL` (siempre confirmar) o `AUTONOMOUS` (dentro de límites)     |
| P-08 | Kill switch                                    | Pausa inmediata del agente                                          |
| P-09 | Expiración de propuestas                       | 10 minutos                                                          |
| P-10 | Sin precio para convertir a dólares            | Escala al usuario ([ADR 0011](docs/adr/0011-precios-en-dolares.md)) |

Desde el [ADR 0011](docs/adr/0011-precios-en-dolares.md), P-01, P-02 y P-06 se comprueban **dos veces**: contra el límite del propio activo y contra un tope en dólares. Se aplica el más restrictivo, así que añadir precios nunca afloja un límite que ya existía. Cada razón lleva `unit` (`asset` o `usd`) para poder distinguirlas.

### 8.2 Señales del Guardian

| ID   | Señal                                               | Ejemplo de mensaje                                                         |
| ---- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| G-01 | Dirección nunca vista                               | "Vas a enviar 850 USDC a una dirección con la que nunca has interactuado." |
| G-02 | Porcentaje del saldo (≥50% `WARN`, ≥70% `HIGH`)     | "Esta operación representa el 72% de tu saldo."                            |
| G-03 | Monto atípico vs. historial (p. ej. >3× la mediana) | "Es 8 veces más que tu envío habitual."                                    |
| G-04 | Saldo restante bajo la reserva                      | "Después de esto te quedarían $320."                                       |
| G-05 | Destino sin cuenta o sin trustline                  | "La cuenta destino no puede recibir este activo."                          |
| G-06 | Cuenta destino muy nueva o sin actividad            | "Esta cuenta se creó hace 2 días."                                         |
| G-07 | Activo que nunca usaste                             | —                                                                          |
| G-08 | Velocidad inusual de operaciones                    | —                                                                          |
| G-09 | Destino en lista de bloqueo local                   | —                                                                          |
| G-10 | No se pudo valorar la operación en dólares          | "No he podido saber cuánto vale esto en dólares."                          |

**Score:** suma ponderada 0–100 → `LOW` (<30), `MEDIUM` (30–59), `HIGH` (60–84), `CRITICAL` (≥85). `HIGH` y `CRITICAL` exigen confirmación reforzada (p. ej. escribir el monto). Umbrales por afinar con datos reales.

**Explicación:** primero se genera una **plantilla determinista** con los datos; el LLM solo mejora la redacción y **no puede añadir cifras**. Si el LLM falla o su salida no valida, se usa la plantilla (`AI-Q5`).

---

## 9. Cronograma

Fecha de inicio **sugerida**: lunes **2026-09-21** (confirmar en `Q-02`). Cada sprint termina con una demo corta y una retro de 15 minutos.

| Sprint | Fechas sugeridas | Objetivo                           | Hito                      |
| ------ | ---------------- | ---------------------------------- | ------------------------- |
| **S1** | 21–27 sep        | Cimientos y contratos              | **M1** "Hola Stellar"     |
| **S2** | 28 sep–4 oct     | Flujo end-to-end con mocks → real  | **M2** E2E sin Guardian   |
| **S3** | 5–11 oct         | Policy + Guardian                  | **M3** Guardian activo    |
| **S4** | 12–18 oct        | Autonomía controlada e integración | **M4** _Feature complete_ |
| **S5** | 19–25 oct        | Hardening y QA                     | **M5** Release candidate  |
| **S6** | 26 oct–1 nov     | Buffer, demo y documentación       | **M6** MVP v1.0 (testnet) |

### 9.1 Entregables por sprint y rol

**S1 — Cimientos**

| Rol   | Entregables                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Todos | Kickoff, respuestas a preguntas críticas (§14), repo + CI + `CODEOWNERS`, `contracts` v0                                                                  |
| FE    | Scaffold, sistema de diseño base, mock server, conexión con Freighter, wireframes                                                                         |
| BE1   | **Spike `SP-1`**: cuenta testnet (Friendbot), signer delegado, thresholds, pago firmado por el agente. Paquete `stellar` v0 (balances, build/sign/submit) |
| BE2   | Scaffold API, BD, auth, esquema de propuestas, Policy Engine v0 con tests                                                                                 |
| AI    | Spike de _tool calling_, parseo de intenciones con fixtures, prompts v0, arnés de evaluación                                                              |

**S2 — Flujo E2E**

| Rol   | Entregables                                                                                 |
| ----- | ------------------------------------------------------------------------------------------- |
| FE    | Chat, tarjeta de propuesta, aprobar/rechazar, firma con Freighter                           |
| BE1   | Preparación de delegación, `StellarReader` real, pagos en lote (varias operaciones en 1 tx) |
| BE2   | Endpoints reales de propuestas, máquina de estados, Policy integrado, auditoría             |
| AI    | Agente que produce `Proposal` válida para el caso "$50 entre 3 objetivos + $10 emergencia"  |
| Todos | **Contract freeze** al final del sprint                                                     |

**S3 — Policy + Guardian**

| Rol | Entregables                                                                                         |
| --- | --------------------------------------------------------------------------------------------------- |
| FE  | UI del Guardian (advertencias, severidad, saldo restante), pantalla de límites y modo               |
| BE1 | Estadísticas de historial (mediana, direcciones conocidas), simulación de tx, seguimiento de estado |
| BE2 | Señales G-01…G-09, score, integración en el pipeline                                                |
| AI  | Explicador (`RiskReport` → `Explanation`), plantillas de respaldo, evals                            |

**S4 — Autonomía controlada**

| Rol | Entregables                                                                                     |
| --- | ----------------------------------------------------------------------------------------------- |
| FE  | Modo autónomo, historial, kill switch, estados de error/carga                                   |
| BE1 | Firma automática con signer delegado, manejo de errores de red y reintentos                     |
| BE2 | Degradación por riesgo, límites diarios, kill switch, rate limiting                             |
| AI  | Conversación multi-turno, preguntas de aclaración, pruebas adversariales (inyección de prompts) |

**S5 — Hardening** · tests E2E, revisión de seguridad, evals con umbral mínimo, pulido de UX, bugs.
**S6 — Buffer y cierre** · demo grabada, README final, guía de despliegue, hoja de ruta a mainnet, retro final.

### 9.2 Definición de terminado por hito

- **M1:** repo corre en local con un comando; un pago firmado por el signer delegado en testnet; `contracts` v0 aprobado por los 4.
- **M2:** desde el chat se crea una propuesta, se aprueba y se confirma en Stellar testnet.
- **M3:** cada propuesta pasa por Policy y Guardian y muestra explicación.
- **M4:** modo autónomo funcionando dentro de límites, con degradación por riesgo y kill switch.
- **M5:** CI en verde, E2E estables, sin bugs críticos abiertos.
- **M6:** demo reproducible por alguien externo siguiendo el README.

### 9.3 Plan de recorte (si el tiempo real es 4 semanas)

Se recorta en este orden, de lo primero a lo último:

1. Conversación multi-turno avanzada y aclaraciones del agente
2. Señales G-06…G-09
3. Pantalla de historial detallado
4. Límite diario acumulado (P-02) y rate limiting (P-05)
5. Pruebas adversariales extensas (se mantiene un set mínimo)

Nunca se recorta: Policy Engine, señales G-01 a G-05, confirmación del usuario, auditoría y el kill switch.

---

## 10. Backlog inicial por rol

Formato: `ID · tarea · sprint`. Convertir cada línea en un issue de GitHub con la etiqueta `area:*`.

### Frontend (FE)

- [x] FE-01 · Scaffold Next.js, Tailwind, shadcn/ui, lint y CI · S1
- [x] FE-02 · Mock server desde OpenAPI y cliente de API tipado · S1
- [x] FE-03 · Conexión con Freighter y sesión · S1
- [x] FE-04 · Pantalla de configuración inicial y delegación del signer · S2
- [x] FE-05 · Chat con el agente (con estados de carga y errores) · S2
- [x] FE-06 · Tarjeta de propuesta: acciones, montos, destinos · S2
- [x] FE-07 · Aprobar/rechazar y firma de XDR con Freighter · S2
- [x] FE-08 · Panel del Guardian: severidad, advertencias, saldo restante · S3
- [x] FE-09 · Pantalla de límites y modo Manual/Autónomo · S3
- [x] FE-10 · Objetivos y contactos (registro de destinos) · S3
- [x] FE-11 · Historial de transacciones y estados en vivo · S4
- [x] FE-12 · Kill switch visible y accesible · S4
- [x] FE-13 · Accesibilidad, responsive y pulido · S5

### Backend 1 — Stellar (BE1)

- [x] BE1-01 · Spike `SP-1`: cuenta, Friendbot, signer delegado, thresholds, pago · S1
- [x] BE1-02 · Cliente base: balances y cuenta · S1
- [x] BE1-03 · Construcción, firma y envío de transacciones · S1
- [x] BE1-04 · `FakeStellarReader` con fixtures para BE2 y AI · S1
- [x] BE1-05 · Preparación de XDR de delegación · S2 · **XDR listo en M1; falta integración API/UI** · **la clave la deriva el servidor, ya no llega del cliente**
- [x] BE1-06 · Pagos en lote (multi-operación) y manejo de trustlines · S2 · **hecho por BE2, revisar: lote multi-operación y activos de crédito**
- [x] BE1-07 · Historial y estadísticas (mediana, direcciones conocidas, edad de cuenta) · S3 · **hecho por BE2, revisar**
- [x] BE1-08 · Simulación previa (fee, saldo posterior, errores) · S3 · **hecho por BE2, revisar**
- [x] BE1-09 · Seguimiento de confirmación y reintentos · S4 · **parcial: reconcilia SUBMITTED con hash**
- [x] BE1-10 · Custodia y rotación de la clave del signer · S4 · **custodia en el gestor de secretos + `demo:signer verify|rotate` ([ADR 0013](docs/adr/0013-custodia-del-signer.md))**
- [x] BE1-11 · Activo de prueba `USDC_TEST` (emisor y trustlines) · S2 · **comandos `demo:usdc` + [runbook](docs/runbooks/usdc-test.md); falta ejecutarlos en testnet**

### Backend 2 — API, políticas y Guardian (BE2)

- [x] BE2-01 · Scaffold API, BD, migraciones, `docker-compose` · S1 · **Postgres + Drizzle + docker-compose, migraciones aplicadas**
- [x] BE2-02 · Auth con wallet (reto/firma) · S1 · **reto firmado con la wallet, un solo uso**
- [x] BE2-03 · Policy Engine v0 (P-01, P-03, P-04) con tests · S1
- [x] BE2-04 · Endpoints y máquina de estados de propuestas · S2
- [x] BE2-05 · Registro de destinos (objetivos y contactos) · S2
- [x] BE2-06 · Auditoría append-only · S2 · **cadena de hashes verificable**
- [x] BE2-07 · Señales G-01…G-05 + score · S3
- [x] BE2-08 · Señales G-06…G-09 · S3
- [x] BE2-09 · Integración Policy + Guardian en el pipeline · S3
- [x] BE2-10 · Degradación por riesgo, P-02, P-05, P-06, kill switch · S4
- [x] BE2-11 · Rate limiting, validación y manejo de errores · S5 · **límites por ruta y por usuario**

### AI Agent (AI)

- [x] AI-01 · Spike de _tool calling_ y elección de proveedor/modelo · S1
- [x] AI-02 · Definición de tools (`AgentTools`) y `FakeAgentTools` · S1
- [x] AI-03 · Dataset de evaluación (≥30 casos) y arnés de evals · S1
- [x] AI-04 · Intención → `Proposal` (caso "$50 entre 3 objetivos + $10") · S2
- [x] AI-05 · Validaciones: suma de acciones ≤ monto pedido, solo IDs de destinos · S2
- [x] AI-06 · Explicador con plantillas de respaldo · S3
- [x] AI-07 · Evals de explicaciones (sin cifras inventadas) · S3
- [x] AI-08 · Conversación multi-turno y preguntas de aclaración · S4
- [x] AI-09 · Pruebas adversariales: inyección vía memo, nombres de objetivos y texto libre · S4
- [x] AI-10 · Métricas de costo/latencia y _fallbacks_ · S5

### Transversal (todos)

- [ ] ALL-01 · Kickoff y respuesta a preguntas críticas · S1
- [x] ALL-02 · `contracts` v0 y contract freeze · S1–S2 · **contracts v0 publicado; freeze pendiente de acordar**
- [x] ALL-03 · CI, `CODEOWNERS`, plantillas de PR/issues · S1 · **CI con 3 jobs; CODEOWNERS pendiente de repartir**
- [x] ALL-04 · Pruebas E2E del flujo completo · S4–S5 — frontend hecho (`apps/web/e2e`); falta la firma real con wallet
- [ ] ALL-05 · README, guía de demo y roadmap a mainnet · S6 · **runbooks de despliegue y demo hechos; falta el roadmap a mainnet**

---

## 11. Flujo de trabajo del equipo

**Git**

- `main` protegida; solo merge por PR con CI en verde.
- Ramas: `feat/<area>-<descripcion>`, `fix/...`, `docs/...`.
- PR pequeños (idealmente <400 líneas), 1 aprobación (2 en `contracts`).
- Commits con [Conventional Commits](https://www.conventionalcommits.org/): `feat(api): ...`.
- Secretos jamás en el repo: usar `.env.example` y GitHub Secrets. Activar escaneo de secretos.

**Etiquetas de issues**

`area:fe` `area:be1` `area:be2` `area:ai` · `type:feature` `type:bug` `type:spike` · `question` `blocked` `contract-change` · `sprint:S1`…`S6`

**Ceremonias (ligeras)**

- Standup **asíncrono** diario en el canal (ayer / hoy / bloqueos).
- Planning corto al inicio del sprint y demo + retro al final.
- Una sincronización de 30 min a mitad de sprint para revisar integración.

**Definition of Ready** (para tomar un issue): criterio de aceptación claro, contratos involucrados definidos, dependencias con mock disponible.
**Definition of Done:** código revisado, tests, CI verde, documentación mínima, sin secretos, probado contra el mock y contra la integración real cuando exista.

---

## 12. Pruebas y seguridad

**Pruebas**

- Unitarias: Policy Engine y señales del Guardian (tablas de casos), validaciones del agente.
- Contrato: la API respeta el OpenAPI; los mocks y las implementaciones reales pasan los mismos tests.
- Integración: contra Stellar testnet con cuentas de prueba.
- Evals del agente: dataset de prompts con criterios automáticos (suma correcta, solo IDs válidos, sin cifras inventadas).
- E2E: flujo completo desde el chat hasta la confirmación.

**Seguridad**

- La clave del signer del agente nunca se registra en logs ni llega al frontend ni al LLM.
- Todo lo que viene de la cadena o del usuario (memo, nombres de objetivos) se trata como **no confiable** en los prompts.
- La salida del LLM se valida contra esquema; ante cualquier discrepancia se rechaza.
- Idempotencia en el envío de transacciones y expiración de propuestas.
- Revisión de seguridad antes de M5 (lista de verificación en `docs/runbooks/security.md`).

---

## 13. Riesgos

| #   | Riesgo                                            | Impacto | Mitigación                                                                             |
| --- | ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| R1  | Clave del signer del agente comprometida          | Alto    | Solo testnet, custodia segura, rotación, kill switch, evaluar cuenta-bolsillo (`SP-1`) |
| R2  | Límites solo se aplican off-chain                 | Alto    | Documentarlo, mantener presupuesto acotado, ruta a Soroban (§15)                       |
| R3  | Inyección de prompts (memo, nombres, texto libre) | Alto    | LLM sin claves ni poder de decisión, validación de esquema, tests adversariales        |
| R4  | El LLM inventa montos o direcciones               | Alto    | El agente solo referencia IDs; se valida la suma; explicador con plantilla de respaldo |
| R5  | Cambios de contrato rompen el trabajo de otros    | Medio   | Contract-first, freeze en S2, PR con 2 aprobaciones                                    |
| R6  | Inestabilidad de testnet/Friendbot                | Medio   | Fixtures y `FakeStellarReader`, reintentos                                             |
| R7  | Alcance crece                                     | Medio   | Plan de recorte (§9.3), backlog priorizado                                             |
| R8  | Poca disponibilidad de alguna persona             | Medio   | Preguntar disponibilidad en el kickoff (`Q-02`), tareas pequeñas e independientes      |
| R9  | Costo o límites de uso del LLM                    | Bajo    | Métricas, caché, modelo ligero para tareas simples (`Q-10`)                            |

---

## 14. Preguntas abiertas y protocolo de preguntas

### 14.1 Protocolo

1. Toda pregunta se registra como **issue con la etiqueta `question`** (y se avisa en el canal del equipo).
2. Formato: **contexto → opciones → recomendación → quién decide → fecha límite**.
3. Se pregunta **a la persona del rol afectado**, con copia al resto.
4. Si no hay respuesta en **24 h**, se aplica la recomendación por defecto, se marca como _asumida_ y se documenta en `docs/adr/`.
5. Al inicio de cada sprint se revisa: ¿hay preguntas pendientes? ¿algún contrato cambia? ¿algo bloquea?
6. Los asistentes de IA que ayuden en el repo **deben preguntar antes de asumir** en cualquier punto que cambie el diseño.

### 14.2 Preguntas para todo el equipo

| ID       | Pregunta                                                                                                                                                                   | Recomendación por defecto                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Q-01     | ¿Nombre del proyecto, licencia e idioma del código y la documentación?                                                                                                     | Nombre por definir · MIT · docs en español, código en inglés                                                       |
| Q-02     | ¿Fecha real de inicio, fecha límite y horas/semana y zona horaria de cada persona?                                                                                         | Inicio 2026-09-21 · 6 semanas                                                                                      |
| Q-03     | ¿Canal de comunicación y horario de la sincronización semanal?                                                                                                             | Discord o WhatsApp + 1 sync semanal                                                                                |
| ~~Q-04~~ | **Respondida** en [ADR 0012](docs/adr/0012-hackathon-track-agentes.md): hackathon de Stellar, track Agentes. Entregables: URL pública y video de 3 min con demo en testnet | —                                                                                                                  |
| Q-05     | ¿Qué es un "objetivo" en la cadena?                                                                                                                                        | Cuenta Stellar de destino etiquetada, propia del usuario, con meta opcional; "Emergencias" es un objetivo especial |
| Q-06     | ¿Qué activo usamos además de XLM?                                                                                                                                          | `USDC_TEST` con emisor propio de testnet                                                                           |
| Q-07     | ¿Autenticación con wallet o con email? ¿Un solo usuario de demo o varios?                                                                                                  | Inicio de sesión con wallet, demo con pocos usuarios                                                               |
| Q-08     | ¿Idioma del agente?                                                                                                                                                        | Español (con opción a inglés)                                                                                      |
| Q-09     | ¿Dónde se despliega la demo?                                                                                                                                               | Local con Docker + despliegue simple (Vercel/Render)                                                               |
| Q-10     | ¿Presupuesto y claves de API para el LLM? ¿Quién las administra?                                                                                                           | Una clave de equipo con límite de gasto                                                                            |

### 14.3 Preguntas por rol

**Frontend (FE)**

| ID    | Pregunta                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------- |
| FE-Q1 | ¿Hay branding o diseños en Figma? ¿Preferencia de librería de UI?                                    |
| FE-Q2 | ¿Solo Freighter o también xBull/Albedo?                                                              |
| FE-Q3 | ¿Desktop primero o mobile-first? ¿PWA?                                                               |
| FE-Q4 | ¿El chat es la interfaz principal o un panel lateral junto a un dashboard? ¿Respuestas en streaming? |
| FE-Q5 | ¿Hace falta i18n desde el inicio?                                                                    |

**Backend 1 — Stellar (BE1)**

| ID         | Pregunta                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| BE1-Q1     | ¿Horizon o Stellar RPC para lectura de historial? (verificar soporte vigente en la documentación oficial)                      |
| ~~BE1-Q2~~ | **Respondida (asumida)** en [ADR 0013](docs/adr/0013-custodia-del-signer.md): gestor de secretos del proveedor, no KMS todavía |
| ~~BE1-Q3~~ | **Respondida** en [ADR 0013](docs/adr/0013-custodia-del-signer.md): un signer global del servicio, con peso 1                  |
| BE1-Q4     | ¿Quién paga las comisiones? ¿Se usa fee-bump o sponsorship?                                                                    |
| BE1-Q5     | Resultado del spike `SP-1`: ¿signer en la cuenta principal o cuenta-bolsillo del agente?                                       |

**Backend 2 — API y reglas (BE2)**

| ID         | Pregunta                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| ~~BE2-Q1~~ | **Respondida** en [ADR 0002](docs/adr/0002-stack-backend.md): Fastify + Drizzle + Postgres                              |
| BE2-Q2     | ¿Necesitamos cola de trabajos (BullMQ/Redis) o basta con procesamiento síncrono?                                        |
| BE2-Q3     | ¿Valores por defecto de P-01…P-09 y umbrales del score? ¿Configurables por usuario?                                     |
| ~~BE2-Q4~~ | **Respondida** en [ADR 0004](docs/adr/0004-auditoria-encadenada.md): sí, con hash encadenado y verificación por ventana |
| BE2-Q5     | ¿Qué nivel de observabilidad necesitamos (logs, métricas, trazas)?                                                      |

**AI Agent (AI)**

| ID    | Pregunta                                                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-Q1 | ~~¿Proveedor/modelo y TypeScript o Python?~~ Resuelto temporalmente en [ADR-0015](adr/0015-groq-directo-y-evaluacion-laya.md): Groq directo, GPT-OSS 20B/120B, TypeScript.                              |
| AI-Q2 | ~~¿SDK o bucle propio?~~ Resuelto en [ADR-0015](adr/0015-groq-directo-y-evaluacion-laya.md): Vercel AI SDK con el proveedor Groq.                                                                       |
| AI-Q3 | ~~¿Memoria de preferencias/hábitos en el MVP?~~ Resuelto en [ADR-0009](adr/0009-agente-llm-y-evaluaciones.md): sin memoria persistente; se conservan hasta 12 mensajes previos de la conversación activa. |
| AI-Q4 | ~~¿Quién ayuda a construir el dataset (≥30 casos reales)?~~ Resuelto en [ADR-0014](adr/0014-casos-humanos-evaluacion-ai.md): 30 solicitudes humanas anonimizadas en `docs/evals/ai-q4-cases.txt`.         |
| AI-Q5 | ~~¿Explicaciones plantilla primero o generativas puras?~~ Resuelto en [ADR-0009](adr/0009-agente-llm-y-evaluaciones.md): plantilla primero.                                                               |
| AI-Q6 | ~~¿Qué datos se pueden enviar al LLM?~~ Resuelto en [ADR-0009](adr/0009-agente-llm-y-evaluaciones.md): saldos consultados y datos mínimos de destinos, sin direcciones ni historial.                      |

### 14.4 Registro de decisiones

Cada respuesta se guarda como ADR en `docs/adr/NNNN-titulo.md` con: contexto, decisión, alternativas, fecha y quién decidió. Las preguntas cerradas se tachan en esta sección con enlace al ADR.

---

## 15. Después del MVP

1. **Mainnet:** auditoría de seguridad, custodia con KMS/HSM, límites más estrictos, monitoreo y alertas, cumplimiento y términos de uso.
2. **Cuenta inteligente en Soroban** con políticas on-chain (montos, destinos, ventanas de tiempo), para que los límites no dependan solo del backend.
3. **Guardian para contratos Soroban:** análisis de contratos y de interacciones, no solo pagos clásicos.
4. **Pagos recurrentes y programados**, swaps y path payments.
5. **Notificaciones** (push/email) y aprobación desde el móvil.
6. **Memoria y aprendizaje de hábitos** para afinar señales de riesgo.
7. **Multiusuario a escala** y paneles de administración.

---

## Apéndice — Glosario rápido

- **Signer:** clave adicional que puede firmar transacciones de una cuenta Stellar, con un peso asignado.
- **Threshold:** peso total necesario para autorizar operaciones de bajo, medio o alto nivel.
- **XDR:** formato binario de una transacción Stellar.
- **Trustline:** permiso de una cuenta para tener un activo emitido por otra.
- **Friendbot:** servicio que fondea cuentas en testnet.
- **ADR:** _Architecture Decision Record_, registro breve de una decisión técnica.
