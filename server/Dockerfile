# syntax=docker/dockerfile:1
# Dockerfile do server Fio (Express + migrations).
#
# DECISAO DE BUILD CONTEXT: o contexto de build e a RAIZ do repo
# (compose: `build: { context: ., dockerfile: server/Dockerfile }`),
# e nao ./server. Motivo: o runner de migrations (server/src/db/migrate.ts)
# le os arquivos de `db/migrations` RELATIVO AO CWD, e as migrations vivem
# na raiz do repo (db/migrations), fora do diretorio server/. Com contexto
# ./server o COPY seria impossivel. O WORKDIR final e /app, entao as
# migrations ficam em /app/db/migrations — exatamente onde o migrate procura.

# ---- Stage 1: build (TypeScript -> dist) ----
FROM node:20-alpine AS build
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---- Stage 2: runtime (somente deps de producao) ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Migrations lidas pelo `npm run migrate` a partir do cwd (/app).
COPY db/migrations ./db/migrations
# Sobe o HTTP somente depois de aplicar as migrations.
CMD ["sh", "-c", "npm run migrate && node dist/index.js"]
