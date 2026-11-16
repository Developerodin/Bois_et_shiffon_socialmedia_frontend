# Web Frontend (`apps/web`, package `web-frontend`)

Next.js **15** app with **only** pages and components. It has no database, no Prisma client and no server secrets:
server components read data from the Server (`apps/server`) over HTTP with `serverFetch` (`lib/server-fetch.ts`),
and browser code calls `/api/*`, which reaches the Server (in dev through the rewrite in `next.config.ts`; in
production through the load balancer).

- Dev port **3100**; the Server runs on 3101. Start both: `npm run dev:server` and `npm run dev:web` from the repo root.
- Env: `SERVER_URL` only (`.env.example`).
- `middleware.ts` only checks that a session cookie is present and sends people to `/login?next=…` if not; the
  Server checks the session itself.
- `GET /healthz` answers `ok` for the load balancer.
- The lint rules ban server-only packages and any import that leaves `apps/web`; shared code comes from
  `@espanda/shared`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (Turbopack), port 3100 |
| `npm run build` | Production build (`output: "standalone"`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (website-only unit tests) |
| `npm run test:e2e` | Playwright; starts the Server and the website |
| `npm run check:net` | Checks `lib/net` with fetch faked |
| `npm run audit:ui` | Accessibility and layout audit against a running website |

From the repo root: `npm run <script> -w web-frontend`.
