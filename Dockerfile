# syntax=docker/dockerfile:1

# deps sees only the manifests, so editing source reuses the cached `npm ci` layer.
FROM node:24.15.0-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Dev dependencies stay: the build needs TypeScript. They never reach the runner.
RUN npm ci

FROM node:24.15.0-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No key is passed to the build and no ARG carries one: a build argument survives in
# `docker history`. Keys are read when the first request arrives.
RUN npm run build

FROM node:24.15.0-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run sends traffic to $PORT. The standalone server binds localhost unless told
# otherwise, so outside requests would hang.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Standalone output traces only imported modules; the static assets are copied by hand.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 8080
CMD ["node", "server.js"]
