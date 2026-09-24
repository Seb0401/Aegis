# @aegis/mcp

**Dueño: BE2.**

Servidor [MCP](https://modelcontextprotocol.io) que deja a **cualquier** agente
de IA operar sobre Stellar a través de Aegis.

## La idea

Un servidor MCP de Stellar normal expone `send_payment`: le das un destino y un
monto, y el dinero se va. El agente tiene control total.

Este no. Aegis expone **`aegis_propose_payment`**, y ninguna herramienta que
envíe dinero.

```
Claude Desktop · Cursor · tu agente
              │
              │  MCP (stdio)
              ▼
        @aegis/mcp
              │  HTTP
              ▼
   ┌──────── Aegis ────────┐
   │  Policy Engine        │  ¿cabe en los límites del usuario?
   │  Guardian             │  ¿qué riesgo tiene? explícalo
   │  Auditoría            │  queda registrado y encadenado
   └───────────┬───────────┘
               │  solo si la persona aprueba
               ▼
            Stellar
```

Cualquier agente que se conecte hereda los límites, el análisis de riesgo y la
auditoría del usuario **sin tener que implementarlos**. El agente de fuera
propone; quien decide sigue siendo la persona.

## Herramientas

| Herramienta                | Qué hace                                         |
| -------------------------- | ------------------------------------------------ |
| `aegis_get_balances`       | Saldos de la cuenta. Solo lectura                |
| `aegis_list_destinations`  | Objetivos y contactos registrados, con su id     |
| `aegis_get_policy_summary` | Límites del usuario y si el agente está en pausa |
| `aegis_get_prices`         | Precio en dólares, con fuente y antigüedad       |
| `aegis_propose_payment`    | **Crea una propuesta.** No envía nada            |
| `aegis_get_proposal`       | Estado, riesgo, explicación y hash si se ejecutó |

Dos límites que no son negociables y que los tests vigilan:

1. **No existe ninguna herramienta que envíe, firme o apruebe.** Hay un test que
   falla si alguien añade una que se llame `send`, `execute`, `submit`, `sign`,
   `approve` o `transfer`.
2. **Los destinos se referencian por id**, nunca por dirección. Un agente no
   puede inventarse una cuenta de destino porque no hay ningún campo donde
   escribirla.

## Ponerlo en marcha

```bash
# 1. Aegis tiene que estar corriendo
pnpm dev:api

# 2. Consigue un token (en desarrollo, sin wallet)
curl -s localhost:3001/auth/dev-login -H 'content-type: application/json' \
  -d '{"address":"GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP"}'

# 3. Compila el servidor
pnpm --filter @aegis/mcp build
```

### En Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aegis": {
      "command": "node",
      "args": ["RUTA_ABSOLUTA_AL_REPO/apps/mcp/dist/index.js"],
      "env": {
        "AEGIS_API_URL": "http://localhost:3001",
        "AEGIS_API_TOKEN": "el-token-del-paso-2"
      }
    }
  }
}
```

Después, en la conversación: _"mira mis objetivos en Aegis y propón repartir 30
dólares entre ellos"_. El agente llamará a `aegis_list_destinations` y a
`aegis_propose_payment`, y la propuesta aparecerá en la interfaz de Aegis
esperando tu aprobación.

## Variables

| Variable          | Qué es                                                              |
| ----------------- | ------------------------------------------------------------------- |
| `AEGIS_API_URL`   | URL de la API. Por defecto `http://localhost:3001`                  |
| `AEGIS_API_TOKEN` | Token de sesión. Identifica de quién son los límites y los destinos |

## Por qué habla HTTP y no con la base de datos

Podría importar los servicios de `apps/api` directamente y ahorrarse la red.
No lo hace a propósito: al pasar por HTTP hereda autenticación, Policy Engine,
Guardian, auditoría y límites de uso. Un atajo por debajo tendría que
reimplementar esas cinco cosas, y la primera que se olvidara sería un agujero.

## Detalle del transporte

MCP por stdio usa la salida estándar para el protocolo. Por eso **nada** escribe
en `stdout` salvo el propio servidor: un `console.log` despistado corrompería la
conversación. Los mensajes van a `stderr`.

## Tests

`pnpm test` — 9 casos, sin red. Los que importan son los que vigilan la
frontera: que no aparezca nunca una herramienta que mueva dinero.
