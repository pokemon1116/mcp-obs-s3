# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:22.22.0-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Runtime ───────────────────────────────────────────
FROM node:22.22.0-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist/ ./dist/

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"]
