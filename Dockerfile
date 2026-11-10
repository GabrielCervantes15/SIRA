# ============================================================================
# SIRA CRM - Dockerfile para el Backend (Monolito Modular)
# ============================================================================

# 1. Base compartida
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache tzdata
ENV TZ=America/Hermosillo

# Copiar manifiesto de dependencias
COPY package.json ./

# 2. Etapa de Desarrollo (incluye herramientas de desarrollo y watch mode)
FROM base AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. Etapa de Pruebas (ejecuta suite de tests y linter en entorno aislado)
FROM base AS test
ENV NODE_ENV=test
COPY . .
RUN npm run lint
RUN npm test

# 4. Etapa de Producción (imagen mínima, segura y con usuario no privilegiado)
FROM base AS production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copiar código fuente
COPY --chown=node:node src/ ./src
COPY --chown=node:node scripts/ ./scripts
COPY --chown=node:node datos-semilla/ ./datos-semilla
COPY --chown=node:node docs/ ./docs
COPY --chown=node:node README.md* ./

# Asignar usuario sin privilegios por seguridad
USER node

EXPOSE 3000

# Health check nativo utilizando el cliente HTTP fetch incorporado en Node.js
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/index.js"]
