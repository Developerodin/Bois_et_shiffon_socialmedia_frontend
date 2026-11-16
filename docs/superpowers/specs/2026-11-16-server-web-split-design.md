# Split the Server from the Web Frontend

Date: 2026-11-16. Status: design, waiting for the owner's approval.

## Why

The owner wants to **deploy and scale the server and the website separately**. Today `apps/web` is one Next.js app that
is both: 98 API routes plus `server/` (agents, jobs, database, rendering) and the website (`app/` pages, `components/`).
One build, one Vercel project, one scaling unit. Production moves to **AWS EC2** (owner's decision), not Vercel.

## What we end up with

Three apps, each its own build and deployment, with clear names:

| Folder | Name (package `name`, README title) | What it is | Deploys as |
|---|---|---|---|
| `apps/server` | `server`, "Server" | Next.js app with **only** API routes (`/api/v1/*`, `/api/auth/*`), `server/`, Prisma, jobs, scripts; plus a **worker** process from the same image | Its own Docker image; API and worker scale as separate EC2 groups |
| `apps/web` | `web-frontend`, "Web Frontend" | Next.js app with **only** pages and components; no database, no server secrets | Its own Docker image and EC2 group |
| `apps/mobile` | `mobile-app`, "Mobile App" | Expo app, unchanged apart from its package name | Store builds, as now |
| `packages/shared` | `@espanda/shared` | Pure TypeScript shared by the apps: API types and helpers with no server imports | Not deployed; imported |

Folders stay short on purpose: the Android build already hit the Windows path-length limit once, so `apps/mobile`
is not renamed. `apps/brandpilot-ai` is unrelated and untouched.

## Goals

- The Web Frontend reaches the Server **only over HTTP**. It imports nothing from the Server app, has no Prisma client,
  no `DATABASE_URL`, no provider keys, no `AUTH_SECRET`.
- The Server has **no pages**. Every route it serves is an API route (`/api/v1/*`, `/api/auth/*`, the integration
  callbacks and webhooks it already has).
- Each app builds, type-checks, tests and deploys on its own, from its own folder.
- The website works exactly as today for people: same pages, same sign-in (email/password and Google), same cookies,
  same URLs.
- The phone keeps working with no change to its API calls.

## Non-goals

- Rewriting the API in another framework (Fastify, Hono). The Server stays Next.js route handlers.
- Changing any API behaviour or response the phone uses.
- Moving the phone's hand-written types onto `@espanda/shared`. Possible later; not in this split.
- Custom domains. The owner sets those up; this design works with or without them.
- Infrastructure as code (Terraform, CDK) for the AWS account. This split ships the apps ready to deploy (Docker images,
  a `docker-compose.yml` that runs website, Server api and worker on one EC2 box) and a written EC2 guide (load balancer
  rules, timeouts, env vars, how to scale each group). The owner's AWS setup is built from that guide. (Builder's call,
  open to the owner.)

## Anti-goals (a failure even if it "works")

- Sign-in breaking, sessions lost on deploy, or Google sign-in needing a new OAuth client.
- Any server secret or the Prisma client ending up in the Web Frontend's bundle or environment.
- The phone breaking, or a charge, refund or job behaving differently.
- A half-split left in place where some pages still read the database "temporarily".

## Approaches considered

- **A. One public address; `/api/*` goes to the Server, everything else to the website (chosen).** In production the
  load balancer in front of both does this by path (an AWS Application Load Balancer rule, or nginx on a single box).
  In local dev the website's `next.config` rewrites `/api/:path*` to the Server. The browser sees one origin, so the
  Auth.js cookie, OAuth callbacks and the workspace cookies keep working as today, with no CORS.
- B. The website calls the Server on its own subdomain (`api.` + `app.`). Needs a parent-domain cookie and CORS with
  credentials everywhere. The owner first picked this, then came back to A.
- C. Rewrite the Server outside Next.js. Rewrites 98 routes for no gain towards deploying separately. Dropped.

## How it works

### Traffic

```
browser ──▶ load balancer ──┬─ /api/*  ──▶ Server (API containers)
                            └─ /*      ──▶ Web Frontend (website containers)
phone ────▶ load balancer /api/* ──▶ Server        (same public address, EXPO_PUBLIC_API_URL)
Server worker containers: run due jobs on a loop, plus the daily sweep (replaces the Vercel cron)
Web Frontend server-side rendering ──▶ Server over the private network (SERVER_URL)
```

- Web Frontend env: `SERVER_URL` (the Server's private address inside the VPC, used only for server-side rendering
  calls). Nothing else secret.
- Server env: everything it has today. `AUTH_URL` stays **the website's public URL**, because sign-in pages, OAuth
  callbacks and email links all live on the website's origin (`appUrl()` keeps building links on it). Auth.js runs
  with `trustHost` so it accepts requests forwarded by the load balancer.
- Google and the social providers keep their registered callback URLs (`<website>/api/auth/callback/google`,
  `<website>/api/v1/integrations/<provider>/callback`); the load balancer delivers them to the Server.

### Sign-in

- Auth.js (`auth.ts`, `auth.config.ts`, providers, callbacks) moves to the Server and stays reachable at `/api/auth/*`
  through the rewrite. The session cookie is set on the website's origin, as now.
- The login and welcome pages stop using server actions with `signIn()`. The login form calls Auth.js's own endpoints
  through `next-auth/react` (`signIn("credentials")`, `signIn("google")`), which go through `/api/auth/*`. Existing
  error messages (wrong password, too many attempts) keep their wording.
- Page protection on the website: its middleware only checks that a session cookie is present and sends people to
  `/login?next=…` if not. The real check is the Server's: the website's shell layout asks the Server who the user is
  (`/api/v1/me/shell`, below) and redirects to login on a 401. Every API call is still authorised on the Server as
  today.

### Pages that read the database today

28 page, layout and action files under `app/` call server code directly (17 of them under `admin/`). Each switches to calling the Server's API:

- **Shell context** (`app/(shell)/layout.tsx`, `page.tsx`, agents, connections, context, performance, products,
  settings, welcome): `loadShellContext`, `loadRoleLabel`, permissions and the platform-admin flag come from one call,
  a new `GET /api/v1/me/shell` (workspaces, brands, active ids from the shell cookies, role label, permissions,
  isPlatformAdmin). `GET /api/v1/me` is **not** changed: the phone uses it for its user and as its connectivity check.
  The home page's direct Prisma read moves into that or its own endpoint.
- **Workspace switch** (`app/(shell)/actions/shell-context.ts`, a server action setting the `bp_active_*` cookies): a
  `POST /api/v1/me/context` that sets the same cookies (they land on the website's origin through the rewrite).
- **Platform admin** (17 files under `app/(shell)/admin/`): new read endpoints under `/api/v1/admin/*` backed by the
  existing `server/services/platform-admin.ts` and `server/services/activity.ts` functions, each guarded by the same
  platform-admin check as today. The "page viewed" writes that use `after()` in two admin pages move into those
  endpoints.
- Server components in the website call the Server through one helper, `serverFetch(path, init)`, which prefixes
  `SERVER_URL` and forwards the incoming request's `cookie` header and the visitor's `x-forwarded-for`, so the Server
  sees the same session, shell cookies and IP as a browser call. Client components keep calling relative `/api/...`.

### Shared code

`packages/shared` holds what both the Server and the Web Frontend need, with **no** server imports: response types for
the endpoints the website calls, `PERMISSIONS` (the catalogue), the shell cookie names, story limits and by-hand steps,
`zoneCity`/`offerPercents`, the product-name helpers, and `usdInrRate` if it is pure (otherwise the rate comes from the
admin endpoints). The Server imports these instead of defining them, so each lives once. A lint rule in the Web
Frontend forbids importing anything but `@espanda/shared`, its own code and npm packages.

### Repo layout and tooling

- `git mv apps/web apps/server` keeps history for the server code; the pages, components, `lib/`, `public/`, styles and
  e2e tests then move to a new `apps/web` (also with `git mv`).
- Server: `server/`, `prisma/`, `app/api/`, `auth*.ts`, `scripts/`, `tests/` (vitest), `types/`. `vercel.json` is
  removed. Port **3101** in dev. The phone's `.env.local` `EXPO_PUBLIC_API_URL` moves to `:3101` (one line).
- Web Frontend: `app/` pages, `components/`, `lib/` (browser-safe), `public/`, Tailwind/shadcn config, `e2e/`
  (Playwright, starts both apps). Port **3100** in dev, rewriting to `http://localhost:3101`. The website keeps 3100 so
  dev `AUTH_URL` and every Google and social-provider redirect URI registered for `localhost:3100` keep working.
- Root scripts: `dev` (both), `dev:server`, `dev:web`, `build:server`, `build:web`, `test` (server), `typecheck`
  (all three apps), `db:*` (server).
- Docs: `ARCHITECTURE.md`, `ENV_SETUP.md` (each app's env vars, `SERVER_URL`, the load balancer rules and timeouts)
  and each app's README.

### Order of work (each step leaves everything working)

1. `packages/shared`; web components stop importing runtime server code.
2. Add `/api/v1/me/shell`, `/api/v1/me/context` and `/api/v1/admin/*`; switch the 28 files to the API, still inside
   one app, so each change is testable against the running app.
3. Login and welcome on `next-auth/react`; middleware down to the cookie-presence check.
4. Physically split into `apps/server` and `apps/web`; dev rewrite, `serverFetch`, ports, scripts, lint rule.
5. Deployment (see "Running on EC2"), `docs/ARCHITECTURE.md` (below) and the other docs.
6. Whole-change four-lens review (below), then fix its findings.

### Running on EC2

- Each app builds a Docker image from Next.js `output: "standalone"`. The Server image carries Prisma's engine,
  ffmpeg/ffprobe and the fonts the story renderer needs (today `outputFileTracingIncludes`).
- The Server image runs two roles: **api** (`next start`) and **worker** (a production version of
  `scripts/worker-dev.ts`: `runDueJobs` on a loop, plus the daily sweep once a day, replacing the Vercel cron).
  Job claiming is already lease-based, so several workers are safe. The poll interval is an env var: a short one keeps
  the Neon database awake, which costs money (the reason the dev worker was dev-only).
- Long requests are ours to allow now: about 15 routes run up to 5 minutes (streaming chat, agent runs, audits,
  uploads). The load balancer's idle timeout and any nginx `proxy_read_timeout` are set above 300 s, request bodies are
  allowed up to the largest upload (voice clone), and response buffering is off for streaming. The `maxDuration`
  exports stay (harmless off Vercel).
- The visitor's IP: the load balancer sets `x-forwarded-for`; login rate limiting keeps working from it.
- Health checks: `GET /api/v1/health` on the Server (database reachable), a small `/healthz` on the website.
- `prisma migrate deploy` runs once per release, before new Server containers take traffic.

### Architecture document

`docs/ARCHITECTURE.md` is rewritten for three apps by a **separate subagent** (owner's request), and documents **every
API route** (method, path, which app serves it, auth, permission, request and response in short, who calls it: website,
phone or both, notes such as streaming or long duration) and **every path** a request or a link takes, each with who
starts it, which app serves it, how it is authenticated, and the env var or registration it depends on. A first version
is written from the code before the split; after step 5 a fresh subagent updates it to what was built:

- browser → website page (server-rendered, `serverFetch` with forwarded cookies)
- browser → load balancer `/api/*` → Server (client fetches, streaming, uploads)
- browser → `/api/auth/*` sign-in, sign-out, session, Google callback
- phone → Server (Bearer token), including its sign-in endpoints
- social-provider OAuth: start, provider, callback on the website's origin, rewrite, Server, redirect back to a page
  (web) or to `espanda://connect` (phone)
- website (server-side rendering) → Server over the private network (`SERVER_URL`)
- incoming webhooks (Higgsfield, ElevenLabs, Shopify and others) → Server
- Server worker → job queue and the daily sweep; `after()` work runs in the API process; `/api/v1/jobs/run` stays
  for a manual or external trigger (`CRON_SECRET`)
- Server → email links (invites, password reset) built with `AUTH_URL` → website pages
- Server → storage, database and AI providers (outbound)
- both apps → `@espanda/shared` (build time only)

### Four-lens review

After step 5, a whole-change review in four independent lenses, **each run by its own fresh subagent** (owner's
request), given the diff and this document: (1) security and secrets (nothing secret or server-only in the website's bundle or environment, auth and
cookies through the load balancer, what the Server trusts from forwarded headers); (2) correctness and behaviour (every page renders what it did,
sign-in flows, OAuth callbacks, workspace switching, admin views, the phone unchanged); (3) deployment and operations
(each image builds and runs alone, env vars complete, worker and daily sweep, timeouts, health checks, migrations,
ports, docs match reality); (4) separation and simplicity
(no runtime import across the boundary, shared package minimal, no leftovers or duplicated code). Findings go in
`docs/handover/<date>-server-web-split-review/`, Important ones fixed before handing over.

## Constraints

- Windows dev machine: keep paths short; the Android build is sensitive to path length.
- Every step goes in its own commits on a new branch from `desktop-shell`; nothing is pushed without the owner.

## Left to the builder

- Exact endpoint names and shapes under `/api/v1/admin/*`, as long as each page gets what it renders today.
- Whether the home page's direct read joins `/api/v1/me` or gets its own endpoint.
- Test layout inside each app, and which Playwright specs run per app.
