# Runbook · levantar Aegis en local

Objetivo: de repositorio recién clonado a propuesta evaluada, sin wallet y sin
tocar la red Stellar.

## Requisitos

- Node 20.11 o superior (probado con 24)
- pnpm 9
- Docker (solo para Postgres)

## Pasos

```bash
pnpm install

cp .env.example .env
# Genera el secreto y pégalo en JWT_SECRET del .env:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

pnpm db:up          # Postgres en el puerto 5432
pnpm db:migrate
pnpm db:seed        # imprime la dirección del usuario de demo

pnpm dev:api        # http://localhost:3001/docs
```

Deja `USE_FAKE_STELLAR=true` y `ALLOW_DEV_LOGIN=true` en el `.env`.

## Prueba del flujo completo

```bash
ADDR=GA4NUZKMEFCS7ZDVMAWSUXHK6NJTURAKV2RMA673ZTOOGIE2VTAGK3XP

TOKEN=$(curl -s localhost:3001/auth/dev-login \
  -H 'content-type: application/json' -d "{\"address\":\"$ADDR\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# Saldos
curl -s localhost:3001/account/balances -H "authorization: Bearer $TOKEN"

# Límites actuales
curl -s localhost:3001/policy -H "authorization: Bearer $TOKEN"

# El caso de referencia del PLAN §1.4
curl -s localhost:3001/agent/messages \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"message":"reparte 50 entre mis objetivos y guarda 10 para emergencias"}'
```

La propuesta vuelve en `PENDING_USER` con la decisión de política (supera el
límite de 5 por operación y el diario de 20), el informe de riesgo y la
explicación.

### Aprobarla

```bash
PROP=prop_...   # id de la respuesta anterior

# Con riesgo HIGH o CRITICAL hace falta además confirmedTotal con el monto exacto.
curl -s localhost:3001/proposals/$PROP/approve \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"signedXdr":"<el unsignedXdr firmado por la wallet>","confirmedTotal":"50.0000000"}'
```

Con el ejecutor falso cualquier cadena sirve como `signedXdr`: no se verifica
porque no hay red. Contra Stellar real, ese valor sale de Freighter.

### Ver la bitácora

```bash
curl -s localhost:3001/audit -H "authorization: Bearer $TOKEN"
```

Devuelve los eventos y el resultado de recalcular la cadena de hashes
(`chain.valid`).

## Probar el kill switch

```bash
curl -s -X POST localhost:3001/policy/pause \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"paused":true}'
```

A partir de ahí, cualquier propuesta nueva sale `DENIED` con la razón P-08.

## Problemas frecuentes

| Síntoma                                   | Causa                                             | Solución                                |
| ----------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| `Configuración inválida` al arrancar      | Falta `JWT_SECRET` o tiene menos de 32 caracteres | Genera uno nuevo y ponlo en `.env`      |
| `ECONNREFUSED 5432`                       | Postgres no está levantado                        | `pnpm db:up` y espera al healthcheck    |
| `relation "users" does not exist`         | Faltan migraciones                                | `pnpm db:migrate`                       |
| `NotImplementedError` de `@aegis/stellar` | `USE_FAKE_STELLAR=false` sin integración real     | Ponlo en `true` hasta que BE1 entregue  |
| `DEV_LOGIN_DISABLED`                      | `ALLOW_DEV_LOGIN=false`                           | Actívalo en `.env` (solo en desarrollo) |
| Cambié una ruta y la CI falla             | `docs/api/openapi.json` desactualizado            | `pnpm --filter @aegis/api openapi`      |

## Reiniciar desde cero

```bash
pnpm db:down
docker volume rm infra_aegis-postgres-data
pnpm db:up && pnpm db:migrate && pnpm db:seed
```

## Correr los tests

Los tests de `apps/api` son de integración: crean su **propia base de datos**
dentro del Postgres de `pnpm db:up`, le aplican las migraciones reales y la
destruyen al terminar. No tocan la base de datos de desarrollo.

```bash
pnpm db:up      # tiene que estar levantado
pnpm test       # todo el monorepo

pnpm --filter @aegis/api test          # solo la API
pnpm --filter @aegis/policy-engine test  # solo las reglas (no necesitan Docker)
```

Si tu Postgres no está en el 5432, pon `TEST_DATABASE_URL` en el `.env` de la
raíz apuntando al puerto correcto. Los tests lo cargan solos.

### Qué hacer si fallan

| Mensaje                                     | Qué pasa                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `No se pudo crear la base de datos de test` | Postgres no está levantado, o `TEST_DATABASE_URL` apunta a otro puerto                                                                 |
| `ECONNREFUSED` durante los tests            | Docker se cerró a mitad; `pnpm db:up` otra vez                                                                                         |
| Tests que pasan sueltos y fallan juntos     | Suele ser estado compartido entre tests del mismo fichero: los contadores de P-02 y P-05 acumulan. Usa un usuario propio en ese bloque |

Las bases de datos de test se llaman `aegis_test_<aleatorio>`. Si alguna queda
huérfana porque la suite se cortó a la fuerza:

```bash
docker exec aegis-postgres psql -U aegis -d aegis -c \
  "SELECT datname FROM pg_database WHERE datname LIKE 'aegis_test_%';"
```
