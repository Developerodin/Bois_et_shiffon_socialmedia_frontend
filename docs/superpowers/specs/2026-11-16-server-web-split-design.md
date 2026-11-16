# Split the Server from the Web Frontend

Date: 2026-11-16. Status: design, revised after the four-lens design review
(`docs/handover/2026-11-16-split-design-review/`), waiting for the owner's approval.

## Why

The owner wants to **deploy and scale the server and the website separately**. Today `apps/web` is one Next.js app that
is both: 98 API route files (128 method + path pairs, listed in `docs/ARCHITECTURE.md`) plus `server/` (agents, jobs,
database, rendering) and the website (`app/` pages, `components/`). One build, one Vercel project, one scaling unit.
Production moves to **AWS EC2** (owner's decision), not Vercel.

## What we end up with

Three apps, each its own build and deployment, with clear names:

| Folder | Name (package `name`, README title) | What it is | Deploys as |
|---|---|---|---|
| `apps/server` | `server`, "Server" | Next.js app with **only** API routes (`/api/v1/*`, `/api/auth/*`), `server/`, Prisma, jobs, scripts; plus a **worker** process from the same image | Its own Docker image; API and worker scale as separate EC2 groups |
| `apps/web` | `web-frontend`, "Web Frontend" | Next.js app with **only** pages and components; no database, no server secrets | Its own Docker image and EC2 group |
| `apps/mobile` | `mobile-app`, "Mobile App" | Expo app, unchanged apart from its package name and dev URL | Store builds, as now |
| `packages/shared` | `@espanda/shared` | Pure TypeScript with **no dependencies**: response types for the new endpoints and a few helpers both apps use | Not deployed; imported |

Folders stay short on purpose: the Android build already hit the Windows path-length limit once, so `apps/mobile`
is not renamed. `apps/brandpilot-ai` is unrelated and untouched. The folder `apps/web` keeps its short name while its
package becomes `web-frontend`; every `-w web` in scripts, docs and app text (38 files) is updated.

## Goals

- The Web Frontend reaches the Server **only over HTTP**. It imports nothing from the Server app, has no Prisma client,
  no `DATABASE_URL`, no provider keys, no `AUTH_SECRET`, and its build and image contain none of them.
- The Server has **no pages**. Every route it serves is an API route (`/api/v1/*`, `/api/auth/*`, the integration
  callbacks and the Higgsfield webhook).
- Each app builds, type-checks, tests and deploys on its own, from its own folder.
- The website works exactly as today for people: same pages, same sign-in (email/password and Google), same error
  messages, same cookies, same URLs, sessions renewed while people are active.
- The phone keeps working with no change to its API calls.

## Non-goals

- Rewriting the API in another framework (Fastify, Hono). The Server stays Next.js route handlers.
- Changing any API behaviour or response the phone uses.
- Moving the phone's hand-written types onto `@espanda/shared`. Possible later; not in this split.
- Custom domains. The owner sets those up; this design works with or without them.
- Infrastructure as code (Terraform, CDK) for the AWS account. This split ships the apps ready to deploy (Docker images,
  a `docker-compose.yml` that runs website, Server api and worker on one EC2 box) and a written EC2 guide (load balancer
  rules, timeouts, env vars, deploy order, how to scale each group). The owner's AWS setup is built from that guide.
  (Builder's call, open to the owner.)

## Anti-goals (a failure even if it "works")

- Sign-in breaking, the Google button disappearing, sessions lost on deploy or no longer renewed, or Google sign-in
  needing a new OAuth client.
- Any server secret or the Prisma client ending up in the Web Frontend's bundle, image or environment.
- The phone breaking, or a charge, refund or job behaving differently (including jobs lost or dead-lettered by a deploy).
- A half-split left in place where some pages still read the database "temporarily".
- Per-IP limits (sign-in, password reset, phone SMS codes) that a caller can dodge by sending a made-up header.

## Approaches considered

- **A. One public address; `/api/*` goes to the Server, everything else to the website (chosen).** In production the
  load balancer in front of both does this by path (an AWS Application Load Balancer rule, or nginx on a single box).
  In local dev the website's `next.config` rewrites `/api/:path*` to the Server. The browser sees one origin, so the
  Auth.js cookie, OAuth callbacks and the workspace cookies keep working as today, with no CORS.
- B. The website calls the Server on its own subdomain (`api.` + `app.`). Needs a parent-domain cookie and CORS with
  credentials everywhere. The owner first picked this, then came back to A.
- C. Rewrite the Server outside Next.js. Rewrites 98 route files for no gain towards deploying separately. Dropped.

## How it works

### Traffic

```
browser ──▶ public load balancer ──┬─ /api/*  ──▶ Server (API containers)
                                   └─ /*      ──▶ Web Frontend (website containers)
phone ────▶ public load balancer /api/* ──▶ Server       (same public address, EXPO_PUBLIC_API_URL)
Server worker containers: run due jobs on a loop, plus the daily sweep at 05:00 UTC (replaces the Vercel cron)
Web Frontend server-side rendering ──▶ internal load balancer ──▶ Server API   (SERVER_URL, private)
```

- Web Frontend env: `SERVER_URL` only. With a scaled API group it is an **internal** ALB in front of the API group; on
  one box it is the compose service (`http://server-api:3101`). (Builder's call.)
- Server env: everything it has today. `AUTH_URL` stays **the website's public URL** (https), because sign-in pages,
  OAuth callbacks and email links all live on the website's origin (`appUrl()` keeps building links on it). In
  production the Server refuses to start without an `https` `AUTH_URL`, since `trustHost` would otherwise build URLs
  from headers the client controls. The worker needs the same `AUTH_URL` and `NODE_ENV=production`, or emails carry
  `localhost` links and the Higgsfield webhook is skipped.
- Google and the social providers keep their registered callback URLs (`<website>/api/auth/callback/google`,
  `<website>/api/v1/integrations/<provider>/callback`); the load balancer delivers them to the Server. Any
  `<PROVIDER>_REDIRECT_URI` override set in production must point at the same public address.
- Port 80 redirects every path to https (the `__Secure-` and `__Host-` cookies only work over https).

### The visitor's IP

`clientIp` (`server/auth/rate-limit.ts`) reads the **first** `x-forwarded-for` entry today. Behind an ALB that entry is
whatever the client sent, so per-IP limits on sign-in, password reset and phone SMS codes could be dodged and the audit
log would store a made-up IP. Changes:

- `clientIp` takes the **right-most** entry, the one our load balancer added. (One trusted proxy hop: the public ALB or
  nginx. nginx overwrites the header with `$remote_addr` instead of appending.)
- Server-side rendering calls arrive through the internal load balancer, so the Server sees the website's address for
  them. That is fine: no rate-limited route is called from server-side rendering. Audit rows written from those calls
  (the admin "viewed" rows) record the website's address. (Ceiling, named: if those rows need the visitor's IP, add a
  shared internal token that lets the website pass it; not built now.)

### Sign-in

- Auth.js (`auth.ts`, `auth.config.ts`, providers, callbacks) moves to the Server and stays reachable at `/api/auth/*`.
  The session cookie is set on the website's origin, as now.
- **Sessions keep rolling.** Today `middleware.ts` re-issues the 7-day session cookie on each request. The Server keeps
  that middleware on `/api/v1/*` (with the Expo dev CORS block), so every API call from an active person renews it.
- **Login page** becomes a client form on `next-auth/react`:
  - The Google button shows when `/api/auth/providers` lists `google` (no provider secret on the website).
  - Someone already signed in (`/api/auth/session`) is sent on to `next`, as today.
  - `signIn("credentials", { redirect: false })`, then an explicit mapping from the result's `code`/`error` to today's
    exact messages: wrong password, too many attempts, and a service problem shown as such (not as "Google sign-in isn't
    set up correctly"). Google uses `signIn("google")` with redirect.
  - The email is kept in the form's own state after a failed attempt (replaces the `login_email` cookie), and the form
    has its own pending state (`PendingButton` relies on `useFormStatus`, which needs a form action).
- **Website middleware** only checks that a session cookie is present (`authjs.session-token`,
  `__Secure-authjs.session-token`, and their chunked `.0` forms) and sends people to `/login?next=…` if not. Its
  matcher leaves out `/api`, `/healthz` and static files. The real check is the Server's.

### Pages that read the database today

38 website files (28 under `app/`, 17 of those under `admin/`, plus components such as `admin/logs-view.tsx`,
`spend-view.tsx` and `activity-pickers.tsx`) and 4 e2e specs use server code today; the list is the appendix of
`docs/handover/2026-11-16-split-design-review/separation.md`. Each switches to the Server's API:

- **Shell context**: one new `GET /api/v1/me/shell` returns the user (name, email, avatar), workspaces, brands, active
  ids from the shell cookies, role label, workspace permissions, the active brand's permissions, and `isPlatformAdmin`.
  The website reads it once per request (React `cache`). The home page needs nothing more: `brands` already carries the
  brand name and website. `GET /api/v1/me` is **not** changed: the phone uses it for its user and as its connectivity
  check.
- **Workspace and brand switch**: `POST /api/v1/me/context` (JSON only, `Origin` must be the website, same membership
  checks as the server action, cookies set `secure`). The five callers call it and then `router.refresh()` so the screen
  re-renders (the server action's `revalidatePath` did that before). The welcome page's "Open <workspace>" becomes a
  client button.
- **Platform admin**: read endpoints under `/api/v1/admin/*`, sized by the service functions in
  `server/services/platform-admin.ts` and `activity.ts` (about 10, not one per page). Each answers **404** to anyone not
  a platform admin, as the console does today. Pages pass their raw query strings through; responses carry page counts,
  filter options and the USD→INR rate (`usdInrRate` stays on the Server: it reads env, calls an outside API and caches).
  The admin layout has the one admin guard (`isPlatformAdmin` from `/me/shell`, else `notFound()`).
- **"Viewed" audit rows**: today written with `after()` by `admin/workspaces/[workspaceId]/layout.tsx` (once per
  visit, not per tab) and `admin/people/[userId]/page.tsx`. Each gets a small `POST …/visit` endpoint called once from
  the same place, so clicking between a workspace's four tabs doesn't write a row per tab.
- **`serverFetch(path, init)`**: the one helper server components use. It only ever calls `SERVER_URL`, encodes path
  segments (a route param can't carry `../` to another Server route), forces `no-store`, forwards the incoming `cookie`
  header, and maps responses: 401 → `/login?next=…`, 404/403 → `notFound()`, 503 and other errors → the error page.
  Each page handles its own call's result, because a layout and its page render in parallel. Client components keep
  calling relative `/api/...`.

### Shared code

`packages/shared` has **no dependencies** (no Prisma, no zod) and holds only:

- `lib/website.ts` (today used by three `server/` modules and one route as well as the website).
- The shell cookie names, the by-hand story steps, and the caption and hashtag limits (today copied from
  `server/content/rules.ts` into `draft-editor.tsx`).
- `zoneCity`, `offerPercents` and the product-name helpers, extracted from `offer-checks.ts` and `product-checks.ts`
  with signatures on plain types.
- Response types for the **new** endpoints only, written as their JSON shape (dates as strings). The Server checks
  each response against them with `Response.json(body satisfies T)`.

Not shared: `PERMISSIONS` (the website already gets the catalogue from `/api/v1/permissions`), the story limits (the
website doesn't use them), admin paging helpers (responses carry the numbers instead).

### Keeping the boundary

- The website's lint rule bans by name `@prisma/client`, `prisma`, `nodemailer`, `next-auth` (allowing
  `next-auth/react`) and any relative import that leaves `apps/web` (npm hoists those packages to the root
  `node_modules`, so "npm packages are allowed" isn't enough). The Server gets the mirror rule: nothing from
  `apps/web`.
- Server modules that must never reach a bundle import `server-only`.
- One check after each website build: build with an empty env, then search the output for secret env names and
  `PrismaClient`; any match fails.
- Secrets never enter an image: a root `.dockerignore` excludes `**/.env*`, `**/node_modules`, `.git`; env is supplied
  only at runtime; the website gets a fresh env file holding only `SERVER_URL`.

### Repo layout and tooling

- `git mv apps/web apps/server` keeps history for the server code; the pages, components, `lib/`, `public/`, styles and
  e2e tests then move to a new `apps/web` (also with `git mv`).
- Server: `server/`, `prisma/`, `app/api/`, `auth*.ts`, `middleware.ts` (API only), `scripts/`, `tests/` (vitest),
  `types/`. `vercel.json` is removed. Port **3101** in dev. The phone's `.env.local` `EXPO_PUBLIC_API_URL` and the
  fallback in `apps/mobile` `client.ts` move to `:3101`.
- Web Frontend: `app/` pages, `components/`, `lib/` (browser-safe), `public/`, Tailwind/shadcn config, its own vitest
  for the five website-only unit tests (the two mixed ones are split), the three web-side scripts, `e2e/` (Playwright
  starts both apps). Port **3100** in dev, rewriting `/api/*` to `http://localhost:3101` with
  `experimental.proxyTimeout` above 300 s (the dev proxy otherwise cuts requests silent for 30 s: chat, agent runs).
  The website keeps 3100 so dev `AUTH_URL` and every redirect URI registered for `localhost:3100` keep working.
- `e2e/stories.spec.ts` seeds through the Server (`npm -w server run seed:story`), not by running a Prisma script from
  the website's folder.
- Root: workspaces gain `packages/*`; both apps list `@espanda/shared` in `transpilePackages`. Scripts `dev:server`,
  `dev:web` (run both; no new runner dependency), `build:server`, `build:web`, `test`, `typecheck` (all three apps),
  `lint`, `test:e2e`, `db:*` (server). The stale MongoDB `docker-compose.yml` at the root is replaced.
- Docs: `ARCHITECTURE.md`, `ENV_SETUP.md` (each app's and each role's env vars, `SERVER_URL`, load balancer rules and
  timeouts, deploy order; the external-cron advice and env names no code reads are removed) and each app's README.

### Running on EC2

- **Images.** Each app builds a Docker image from Next.js `output: "standalone"`, installing only its own workspace's
  dependencies (not the Expo app's) and keeping install scripts (ffmpeg comes from one). The Server image carries
  Prisma's engine (binary target matching the runtime image's OpenSSL), ffmpeg/ffprobe, the fonts and the email logo,
  placed where `process.cwd()` finds them today. Instances are **x86_64**: `ffprobe-static` has no Linux arm64 binary,
  so Graviton is out until that changes.
- **Worker.** A production version of `scripts/worker-dev.ts` (`runDueJobs` on a loop, plus the daily sweep at
  05:00 UTC), **bundled with esbuild** into one file inside the Server image, because a standalone build has no
  `scripts/`, TypeScript sources, `@/` paths or `tsx`. Job claiming is already lease-based, so several workers are
  safe. The poll interval is an env var: a short one keeps the Neon database awake, which costs money.
- **Heavy work leaves the API.** An env switch (`RUN_JOBS_IN_API`, on in dev, off in production) stops `kickRunner`
  from running the queue in `after()` inside API containers, so renders (ffmpeg, sharp) happen in the worker group.
  Most of the 300 s routes are long only because of that.
- **Unknown job types.** `server/jobs/runner.ts` dead-letters a job with no handler today. It instead puts the job back
  to pending without counting the attempt, so an old worker never kills a job type a newer release added.
- **Deploy order:** migrations, then workers, then API, then website. Schema changes stay compatible with the previous
  release's containers for one release (add first, remove later).
- **Migrations.** A one-off migrate container (Prisma CLI + `prisma/migrations`, from a separate build target) runs
  `prisma migrate deploy` once per release, started by the deploy script before the workers.
- **Graceful shutdown.** The worker handles SIGTERM: stops claiming, finishes its current job, exits. Its stop timeout
  (compose `stop_grace_period`, ASG lifecycle hook) and the API's load balancer deregistration delay are above 300 s.
- **Long and large requests.** 22 route files allow long runs (18 up to 300 s, 2 at 120 s, 2 at 60 s): streaming
  chat, agent runs, audits, uploads. Load balancer idle timeout and nginx `proxy_read_timeout` are above 300 s,
  request bodies are allowed up to 4 MB (image and voice-clone uploads; story media goes straight to storage with a
  presigned URL), and response buffering is off for streaming. The `maxDuration` exports stay (harmless off Vercel).
- **Health checks.** Server `GET /api/v1/health` answers without touching the database (a database query would keep
  Neon awake and let one Neon blip replace every instance at once) and carries no error details. Website `/healthz`,
  outside the middleware.
- **`/api/v1/jobs/run`** stays for a manual trigger. It already refuses every call when `CRON_SECRET` is unset, which is
  how production runs once the worker is live.
- **Storage credentials.** Neon storage reads the standard `AWS_*` names today, which clash with the EC2 instance's own
  role credentials and could send uploads to someone else's bucket named `media`. They are renamed (`STORAGE_*`) and
  passed to the S3 client explicitly.
- **Logs.** Webhook secrets and OAuth codes travel in URLs, so load balancer and nginx access logs leave out query
  strings.
- **Known ceilings, named, not built:** a rolling website deploy can break a tab still open on the old version (it
  reloads); private subnets need a NAT gateway and video traffic pays per GB through it.

### Order of work (each step leaves everything working)

1. `packages/shared` and the boundary rules; web components stop importing runtime server code; `clientIp` fix.
2. Add `/api/v1/me/shell`, `/api/v1/me/context`, `/api/v1/admin/*` and the visit endpoints; switch the 38 files to the
   API, still inside one app, so each change is testable against the running app.
3. Login and welcome on `next-auth/react`; website middleware down to the cookie-presence check, the Server's
   middleware kept on `/api/v1`.
4. Physically split into `apps/server` and `apps/web`; dev rewrite, `serverFetch`, ports, scripts, lint rules.
5. Deployment (worker bundle, runner and env changes, Dockerfiles, compose, EC2 guide), `docs/ARCHITECTURE.md`
   (below) and the other docs.
6. Whole-change four-lens review (below), then fix its findings.

### Architecture document

`docs/ARCHITECTURE.md` was rewritten from the code by a **separate subagent** (owner's request). It documents all
128 API routes (method, path, auth, permission, purpose, who calls it, notes such as streaming or long duration), the
planned endpoints, the website pages, env vars per app, and **every path** a request or a link takes, each marked
**[Today]** or **[Planned]**. After step 5 a fresh subagent updates it to what was built:

- browser → website page (server-rendered, `serverFetch` with forwarded cookies)
- browser → load balancer `/api/*` → Server (client fetches, streaming, uploads)
- browser → `/api/auth/*` sign-in, sign-out, session, providers, Google callback
- phone → Server (Bearer token), including its sign-in endpoints
- social-provider OAuth: start, provider, callback on the website's origin, load balancer, Server, redirect back to a
  page (web) or to `espanda://connect` (phone)
- website (server-side rendering) → internal load balancer → Server (`SERVER_URL`)
- incoming Higgsfield webhook → Server
- Server worker → job queue and the daily sweep; `/api/v1/jobs/run` for a manual trigger (`CRON_SECRET`)
- Server → email links (invites, password reset) built with `AUTH_URL` → website pages
- Server → storage, database and AI providers (outbound)
- both apps → `@espanda/shared` (build time only)

### Four-lens review

After step 5, a whole-change review in four independent lenses, **each run by its own fresh subagent** (owner's
request), given the diff and this document: (1) security and secrets (nothing secret or server-only in the website's
bundle, image or environment, auth and cookies through the load balancer, what the Server trusts from forwarded
headers); (2) correctness and behaviour (every page renders what it did, sign-in flows and messages, session renewal,
OAuth callbacks, workspace switching, admin views, the phone unchanged); (3) deployment and operations (each image
builds and runs alone, env vars complete per role, worker, daily sweep, shutdown, deploy order, timeouts, health checks,
migrations, ports, docs match reality); (4) separation and simplicity (no runtime import across the boundary, shared
package minimal, no leftovers or duplicated code). Findings go in `docs/handover/<date>-server-web-split-review/`,
Important ones fixed before handing over.

## Constraints

- Windows dev machine: keep paths short; the Android build is sensitive to path length.
- Every step goes in its own commits on a new branch from `desktop-shell`; nothing is pushed without the owner.

## Left to the builder

- Exact endpoint names and shapes under `/api/v1/admin/*`, as long as each page gets what it renders today.
- Test layout inside each app, and which Playwright specs run per app.
- The exact base images and the deploy script's form, within the deploy order above.
