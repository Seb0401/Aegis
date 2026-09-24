# Imagen de la API de Aegis.
#
# Se construye desde la RAÍZ del monorepo, no desde esta carpeta:
#   docker build -f apps/api/Dockerfile -t aegis-api .
#
# Son tres etapas a propósito. La imagen final no lleva ni el código fuente, ni
# TypeScript, ni las dependencias de desarrollo: solo lo que hace falta para
# ejecutar. Menos cosas dentro es menos superficie que mantener y auditar.

# ── 1. Dependencias ─────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo

# Primero solo los manifiestos: mientras no cambien, Docker reutiliza la capa
# de instalación aunque haya cambiado el código.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json  packages/contracts/
COPY packages/policy-engine/package.json packages/policy-engine/
COPY packages/guardian/package.json   packages/guardian/
COPY packages/prices/package.json     packages/prices/
COPY packages/stellar/package.json    packages/stellar/
COPY packages/agent/package.json      packages/agent/
COPY apps/api/package.json            apps/api/

RUN pnpm install --frozen-lockfile --filter @aegis/api...

# ── 2. Compilación ──────────────────────────────────────────────────
FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

RUN pnpm -r --filter "@aegis/api..." build

# `pnpm deploy` arma una carpeta autocontenida con la aplicación y solo sus
# dependencias de producción, con los paquetes del workspace ya resueltos.
RUN pnpm deploy --filter @aegis/api --prod /salida

# ── 3. Ejecución ────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# No se ejecuta como root: si algo se escapa del proceso, que se escape con los
# permisos mínimos.
RUN addgroup -S aegis && adduser -S aegis -G aegis

COPY --from=build --chown=aegis:aegis /salida ./

USER aegis

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001
EXPOSE 3001

# La sonda comprueba la base de datos de verdad, no solo que el proceso viva.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
