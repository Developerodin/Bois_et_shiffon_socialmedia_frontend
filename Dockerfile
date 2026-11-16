# Web Frontend image. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t espanda-web .
# No env is baked in. At run time it needs only SERVER_URL (server-side rendering calls the Server there).
# SERVER_URL is also read by `next build` for the dev-only /api rewrite; in production the load balancer or nginx
# sends /api/* to the Server, so the website never proxies.
FROM --platform=linux/amd64 node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w web-frontend -w @espanda/shared

FROM deps AS build
COPY apps/web apps/web
COPY packages/shared packages/shared
RUN npm run build -w web-frontend

FROM base AS runtime
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public apps/web/public
WORKDIR /app/apps/web
USER node
EXPOSE 3100
CMD ["node", "server.js"]
