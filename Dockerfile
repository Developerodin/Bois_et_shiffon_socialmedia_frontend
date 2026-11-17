# Web Frontend image. Build from this repo's root:
#   docker build -t espanda-web .
# No env is baked in. At run time it needs only SERVER_URL (server-side rendering calls the Server there).
# SERVER_URL is also read by `next build` for the dev-only /api rewrite; in production the load balancer or nginx
# sends /api/* to the Server, so the website never proxies.
FROM --platform=linux/amd64 node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runtime
# KEEP_ALIVE_TIMEOUT (read by the standalone server.js) above the ALB's 330 s idle timeout: with Node's 5 s default
# the ALB reuses a connection the target has closed and the caller gets a 502.
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0 KEEP_ALIVE_TIMEOUT=335000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static .next/static
COPY --from=build --chown=node:node /app/public public
USER node
EXPOSE 3100
CMD ["node", "server.js"]
