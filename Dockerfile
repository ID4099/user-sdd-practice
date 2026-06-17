# syntax=docker/dockerfile:1

########################
# 1) Build stage
########################
FROM node:20-alpine AS builder

WORKDIR /app

# Copiamos solo manifests primero para aprovechar cache
COPY package*.json ./

# Instala deps completas (incluye dev deps para build)
RUN npm ci

# Copiamos código
COPY . .

# Build NestJS
RUN npm run build

########################
# 2) Runtime stage
########################
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copiamos manifests
COPY package*.json ./

# Instala solo deps de producción
RUN npm ci --omit=dev && npm cache clean --force

# Copiamos build generado
COPY --from=builder /app/dist ./dist

# Opcional: si necesitás assets no TS en runtime, copialos acá
COPY --from=builder /app/src/database/migrations ./src/database/migrations

EXPOSE 3000

# Ejecuta app Nest en producción
CMD ["node", "dist/main.js"]