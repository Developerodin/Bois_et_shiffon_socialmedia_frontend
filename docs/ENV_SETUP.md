# Environment setup (Windows / PowerShell)

Phase 1 web app: **`apps/web`** (Next.js 15 + Prisma). Database schema lives in **`apps/web/prisma`** — not at repo root.

**Database + media:** Neon — Postgres (Frankfurt, `aws-eu-central-1`) and Object Storage bucket `media` (private). Declared in root `neon.ts`; schema changes use Prisma Migrate — see DEC-025.

---

## 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.19+ or 24.11+ | [nodejs.org](https://nodejs.org/) or `winget install OpenJS.NodeJS.LTS` |
| Neon account | — | Access to project `cmo-platform` (ask the owner for an invite) |
| Git | any | [git-scm.com](https://git-scm.com/download/win) |

No local database or Docker needed.

---

## 2. Install dependencies

```powershell
cd "C:\Users\INTEL\Desktop\Social Media Agent"
npm install
```

---

## 3. Neon credentials

```powershell
npx neon@latest login
npx neon@latest env pull     # writes DATABASE_URL, DATABASE_URL_UNPOOLED, AWS_* to repo-root .env.local
```

Prisma and Next.js read **`apps/web/.env`**, so copy those variables there (`.env.local` and `.env` are both gitignored).

| Variable | Used for |
|----------|----------|
| `DATABASE_URL` | Pooled connection (`-pooler` host) — app queries |
| `DATABASE_URL_UNPOOLED` | Direct connection — `prisma migrate` (pooler breaks migrations) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` | Neon Object Storage (`apps/web/server/storage/media.ts`) |

Also set in `apps/web/.env`:

| Variable | How |
|----------|-----|
| `AUTH_SECRET` | Random 32+ bytes — e.g. `[Convert]::ToBase64String((1..32 \| ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])` |
| `AUTH_URL` | `http://localhost:3100` |
| `SEED_OWNER_PASSWORD` | Dev-only password for seeded `owner@example.com` |

Paste **later** (Screens 5–11): AI keys, OAuth IDs, `CRON_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`, `WEB_SEARCH_*`. See root `.env.example`.

**Personal dev branch (recommended):** `npx neon@latest checkout dev-<name> --create` gives you an isolated copy of the database *and* bucket (expires after 7 days per `neon.ts`), then `env pull` again. Don't develop against `production`.

---

## 4. Migrate + seed

```powershell
npm run db:migrate    # prisma migrate dev — creates/applies migrations (direct URL)
npm run db:seed
```

Deploy environments run `npm run db:deploy` (`prisma migrate deploy`) instead.

Seed creates workspace + **Bois & Chiffons** brand from `apps/web/prisma/seeds/bc-brand.json` (fixture only — not hard-coded in app logic).

Live check of both Neon services (Postgres round-trip; storage put → presigned GET → delete):

```powershell
npm run smoke:neon -w web
```

---

## 5. Run the web app

```powershell
npm run dev:web
```

Open [http://localhost:3100/login](http://localhost:3100/login) — seeded email `owner@example.com` and `SEED_OWNER_PASSWORD`.

Reddit Devvit app (unchanged): `npm run dev:reddit`

---

## 6. Quality commands

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:e2e   # Playwright, starts dev server
```

---

## 7. Troubleshooting

- **`prepared statement "s0" already exists` during migrate** — migrate is using the pooled URL. Check `DATABASE_URL_UNPOOLED` is set (schema `directUrl`).
- **First request slow after idle** — Neon scales to zero after 5 min; the first query wakes it.
- **`P1001` cannot reach database** — `apps/web/.env` missing Neon vars; re-run `env pull` and copy.
- **Port:** the app runs on **3100** (dev and start) to avoid clashing with other local projects on 3000/3001. Change `-p` in `apps/web/package.json` and `AUTH_URL` together.
