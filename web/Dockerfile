# =============================================================
# Fio — canal web (template vercel/ai-chatbot adaptado)
# Multi-stage em node:20-alpine. Sem servicos Vercel: nao precisa de
# BLOB_READ_WRITE_TOKEN, REDIS_URL nem AI_GATEWAY_API_KEY.
# =============================================================

# ---- deps: instala node_modules com o lockfile ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps: next-auth v5 beta ainda nao declara peer do Next 16.
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# ---- builder: roda o next build ----
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# O script "build" roda `tsx lib/db/migrate` antes do `next build`; sem
# POSTGRES_URL no build as migrations fazem skip gracioso (rodam no boot).
RUN npm run build

# ---- runner: imagem final ----
# Decisao documentada: NAO usamos output:'standalone'. O boot precisa rodar
# as migrations do drizzle (tsx lib/db/migrate.ts) antes de subir o Next, e o
# standalone nao inclui tsx/devDeps. Em troca de uma imagem um pouco maior,
# levamos o node_modules completo e garantimos schema sempre aplicado.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app ./
USER nextjs
EXPOSE 3000
# 1) aplica as migrations do drizzle no database fio_web (idempotente);
# 2) sobe o Next com `next start`.
CMD ["sh", "-c", "npx tsx lib/db/migrate.ts && npm run start"]
