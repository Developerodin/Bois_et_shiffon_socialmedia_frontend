# Web platform (`apps/web`)

Next.js **15** App Router — main multi-brand AI CMO UI and API.

## Prisma / database

- Schema: `prisma/schema.prisma` (Postgres on Neon — DEC-025)
- Migrations: `prisma/migrations/` via `npm run db:migrate`
- Seed: `npm run db:seed` (fixture `prisma/seeds/bc-brand.json`)
- Media: `server/storage/media.ts` (Neon Object Storage, private bucket `media`)

Local env: see [`docs/ENV_SETUP.md`](../../docs/ENV_SETUP.md).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (AT-001 / AT-019 harness) |
| `npm run test:e2e` | Playwright |
| `npm run db:migrate` | `prisma migrate dev` (direct URL) |
| `npm run db:deploy` | `prisma migrate deploy` (CI / hosted) |
| `npm run smoke:neon` | Live Postgres + Object Storage check |

From repo root: `npm run dev:web`, `npm run db:migrate`, etc.
