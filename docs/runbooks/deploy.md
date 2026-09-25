# Runbook · desplegar Aegis en público

Objetivo: una URL que un jurado pueda abrir y probar sin instalar nada (Fase 06
de la guía del hackathon).

Aegis son **tres piezas**, no una. Por eso no basta con `vercel deploy`:

| Pieza         | Dónde                 | Por qué                                        |
| ------------- | --------------------- | ---------------------------------------------- |
| `apps/web`    | Vercel                | Es Next.js; Vercel lo hace nativamente         |
| `apps/api`    | Render, Railway o Fly | Necesita un proceso vivo y conexión a Postgres |
| Base de datos | Neon                  | Postgres serverless con plan gratuito          |

> Todo lo de aquí lo ejecutas **tú**: hace falta tu sesión y tus secretos.
> Ninguna clave debe pasar por un chat ni acabar en el repositorio.

---

## 1. Base de datos (Neon)

1. Entra en [neon.tech](https://neon.tech) y crea un proyecto.
2. Copia la _connection string_ (empieza por `postgresql://`).
3. Aplica las migraciones desde tu máquina, apuntando a Neon:

```bash
DATABASE_URL="postgresql://...neon.tech/aegis?sslmode=require" \
  pnpm --filter @aegis/api db:migrate
```

4. Crea el usuario de demo y sus objetivos:

```bash
DATABASE_URL="postgresql://...neon.tech/aegis?sslmode=require" \
  pnpm --filter @aegis/api db:seed
```

Apunta la dirección que imprime el `seed`: es con la que entrará el jurado.

---

## 2. Cuenta de Stellar para la demo

1. Crea una cuenta en Freighter, **en testnet**, y fondéala con
   [Friendbot](https://friendbot.stellar.org/).
2. Genera una seed aparte para el signer del agente. **No reutilices la seed de
   la cuenta demo**: el backend solo debe tener la del agente.
3. Delega el signer siguiendo [`stellar-m1.md`](stellar-m1.md) y compruébalo con
   `demo:signer verify` ([signer.md](signer.md)).
4. Emite el activo de prueba siguiendo [`usdc-test.md`](usdc-test.md). Sin esto
   la demo solo puede mover XLM, y el producto habla de dólares.

> ⚠️ **Testnet se reinicia cada ~3 meses.** Verifica la cuenta en
> [Stellar Expert](https://stellar.expert/explorer/testnet) el día antes de
> grabar el video. Si desapareció, repite estos dos pasos.

---

## 3. API

### Variables de entorno

| Variable                       | Valor                                 | Nota                                                                       |
| ------------------------------ | ------------------------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                     | `production`                          |                                                                            |
| `DATABASE_URL`                 | la de Neon                            | con `?sslmode=require`                                                     |
| `JWT_SECRET`                   | 48 bytes aleatorios                   | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `WEB_ORIGIN`                   | la URL de Vercel                      | sin barra final; es el CORS                                                |
| `USE_FAKE_STELLAR`             | `false`                               | **con `true` la API no arranca en producción**                             |
| `STELLAR_NETWORK`              | `testnet`                             | mainnet está bloqueado a propósito                                         |
| `STELLAR_HORIZON_URL`          | `https://horizon-testnet.stellar.org` |                                                                            |
| `STELLAR_DEMO_ACCOUNT_ADDRESS` | la cuenta del paso 2                  | única cuenta que el agente puede firmar                                    |
| `STELLAR_AGENT_SIGNER_SECRET`  | la seed del agente                    | **secreto**; nunca en el repo                                              |
| `ALLOW_DEV_LOGIN`              | `true` o `false`                      | ver más abajo                                                              |
| `PRICE_SOURCE`                 | `fixed`                               | ver más abajo                                                              |
| `PRICE_XLM_USD`                | p. ej. `0.12`                         | solo si `PRICE_SOURCE=fixed`                                               |
| `AI_GATEWAY_API_KEY`           | tu clave                              | sin ella el agente cae al modo de reglas                                   |

**Sobre `ALLOW_DEV_LOGIN`.** Con `true`, cualquiera puede entrar con una
dirección sin firmar nada. Para que un jurado pruebe sin instalar Freighter es
justo lo que quieres; para cualquier otra cosa es una puerta abierta. Decídelo a
conciencia y apágalo cuando acabe el hackathon.

`loadEnv` impide activarlo con `NODE_ENV=production`, así que si lo quieres
para la demo tendrás que desplegar con `NODE_ENV=development`. **Esa es la
decisión que estás tomando**: no es un despiste del código.

**Sobre `PRICE_SOURCE=fixed`.** En `market`, si CoinGecko no responde durante la
demo, todas las propuestas escalarán al usuario con la razón `P-10` en vez de
ejecutarse solas. Es correcto, pero no es lo que quieres enseñar en un video de
tres minutos. Con `fixed` no hay dependencia externa.

### Render

1. _New → Web Service_ y conecta el repositorio.
2. Runtime **Docker**, Dockerfile `apps/api/Dockerfile`, contexto la raíz.
3. Añade las variables de arriba.
4. Health check path: `/health`.

### Railway o Fly

Mismo Dockerfile. En Fly, `fly launch --dockerfile apps/api/Dockerfile` y
después `fly secrets set` para las variables sensibles.

### Comprobación

```bash
curl -s https://TU-API/health
```

Debe devolver `status: "ok"`, `database: "ok"` y `fakeStellar: false`. Si
`fakeStellar` sale `true`, no estás contra Stellar de verdad.

---

## 4. Frontend (Vercel)

1. _Add New → Project_ y conecta el repositorio.
2. **Root Directory: `apps/web`**. Es lo que más se olvida en un monorepo.
3. Vercel leerá `apps/web/vercel.json`, que ya instala y compila desde la raíz.
4. Variable de entorno: la URL pública de la API (mira `apps/web/src/lib/env.ts`
   para el nombre exacto).
5. Cuando termine, vuelve a la API y pon `WEB_ORIGIN` con la URL de Vercel.

---

## 5. Servidor MCP

No se despliega: se ejecuta en la máquina de quien lo usa, apuntando a tu API.
En el video basta con enseñar la configuración de Claude Desktop apuntando a la
URL pública. Ver [`apps/mcp/README.md`](../../apps/mcp/README.md).

---

## 6. Antes de grabar

- [ ] `curl https://TU-API/health` → `ok`, `database: ok`, `fakeStellar: false`
- [ ] La cuenta demo sigue existiendo en Stellar Expert (testnet se reinicia)
- [ ] La cuenta demo tiene saldo suficiente para los pagos del guion
- [ ] Entrar en la web pública y completar el flujo entero una vez
- [ ] Confirmar que la transacción aparece en Stellar Expert
- [ ] El servidor MCP responde desde Claude Desktop

---

## Problemas frecuentes

| Síntoma                                     | Causa                                                                                             | Solución                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| La API no arranca: `Configuración inválida` | Falta `STELLAR_AGENT_SIGNER_SECRET` o `STELLAR_DEMO_ACCOUNT_ADDRESS` con `USE_FAKE_STELLAR=false` | Añádelas. El fallo es a propósito: mejor al arrancar que en la primera propuesta |
| La web no habla con la API                  | `WEB_ORIGIN` no coincide exactamente con la URL de Vercel                                         | Sin barra final, con `https://`                                                  |
| Todo sale `PENDING_USER` con `P-10`         | No hay precios                                                                                    | `PRICE_SOURCE=fixed`                                                             |
| `op_no_trust` al pagar                      | La cuenta destino no tiene trustline del activo                                                   | La simulación previa ya lo avisa; en testnet usa XLM                             |
| La cuenta demo desapareció                  | Reinicio trimestral de testnet                                                                    | Rehaz el paso 2                                                                  |
