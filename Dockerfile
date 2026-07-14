# ── deps: instala dependencias con lockfile ─────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── build: compila y poda a dependencias de producción ──────────────
FROM node:22-alpine AS build
RUN corepack enable pnpm
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm prune --prod

# ── runner: imagen final mínima, usuario no-root ────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# El logger escribe combined.log / error.log en ./logs (montar volumen si se
# quiere persistencia fuera del contenedor).
RUN mkdir logs && chown node:node logs
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
