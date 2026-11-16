# Split design review: deployment and operations (EC2)

Design reviewed: `docs/superpowers/specs/2026-11-16-server-web-split-design.md`, checked against the code on `desktop-shell` (c17339d).
Paths below are today's (`apps/web/...`); after the split most of them live under `apps/server/`.

**Verdict:** The split can work, but the design is not ready to deploy as written. The worker can't run from a standalone image. Several things it takes for granted (XFF rate limiting, a single private `SERVER_URL`, health checks, migrations, unknown job types during a rollout) fail on EC2 the way it describes them. These are fixes to the design, not reasons to rethink it.

Counts: Critical 2, Important 9, Minor 6.

---

## Critical

### C1. The worker role can't run from the image the design describes
- **Where:** design "Running on EC2" (bullets 1 and 2). `apps/web/scripts/worker-dev.ts`, `apps/web/package.json` (`worker:dev` uses `tsx`, and `tsx` is a devDependency).
- **What goes wrong:** the Server image is built from `output: "standalone"`. Standalone holds only `server.js` and the files traced from the Next routes. It has no `scripts/`, no TypeScript sources, no `tsx`, and no `@/` path resolution. A "production version of `scripts/worker-dev.ts`" has nothing to run in that image. The worker also needs files found through `process.cwd()`: `assets/fonts/*` plus `fonts.conf` (`server/stories/render.ts:14,20`) and `server/email/assets/espanda-logo.png` (`server/email/sign-in-code.ts:6`). It also needs the `ffmpeg-static`/`ffprobe-static` binaries resolved from their own `__dirname`. The Next tracing in `next.config.ts` (`outputFileTracingIncludes`) covers only the `/api/v1/**` routes, not a separate entry point.
- **Scenario:** the image builds and `api` starts. `worker` is started with `node scripts/worker.js` or `npx tsx scripts/worker.ts` and exits with "module not found". After that, scheduled posts, emails, renders and the daily sweep run only when a user happens to hit a route that calls `kickRunner()`/`kickIfDue()`. Nothing runs while nobody is using the app.
- **Fix to put in the design:** name how the worker is built. Either:
  - (a) bundle `scripts/worker.ts` at image build time with esbuild/tsup into one JS file. Mark `next`, `@prisma/client`, `sharp`, `ffmpeg-static` and `ffprobe-static` as external, and put it in the standalone folder next to `server.js` (same `node_modules`, same `cwd`). Or:
  - (b) ship a non-standalone Server image with full sources, production `node_modules` and `tsx` moved to dependencies.

  Either way, the worker's `WORKDIR` must be the app folder that holds `assets/fonts` and `server/email/assets`. Add a smoke step to the guide: run `worker` once and render a story frame and send an email.

### C2. During a rolling deploy, an old worker dead-letters job types it doesn't know
- **Where:** design "Running on EC2" ("API and worker scale as separate EC2 groups"), `apps/web/server/jobs/runner.ts:73` and `:81`.
- **What goes wrong:** when a claimed job has no handler, the runner throws `No handler for job type X` and calls `failJob(job, error, retryable && Boolean(handler))`. That is `retryable = false`, so the job goes straight to `DEAD_LETTER`. On Vercel the whole app switched at once. Here the API group and the worker group roll separately, so for minutes both versions run side by side.
- **Scenario:** a release adds a job type (as `story.render` and `voice.delete` were added recently). New API containers enqueue it, an old worker container claims it first, and the job is dead-lettered with no `onFailure`. The user's story or render sits "Preparing" forever. The same thing happens when a payload shape changes and an old handler parses it.
- **Fix to put in the design:** (1) In the runner, a job with no handler goes back to `PENDING` with a short delay, its `attempts` are not counted against it, and its lease is released. Only a known handler can dead-letter. (2) Write the deploy order into the guide: migrations, then the worker group, then the API group. Also state the rule that job payloads only ever gain optional fields.

---

## Important

### I1. Login and SMS rate limits are bypassable behind an ALB or nginx
- **Where:** design "Running on EC2" ("the load balancer sets `x-forwarded-for`; login rate limiting keeps working from it") and "Pages that read the database" (`serverFetch` forwards `x-forwarded-for`). `apps/web/server/auth/rate-limit.ts:33`.
- **What goes wrong:** `clientIp()` takes the **first** XFF entry. Vercel overwrites XFF with the real client IP. AWS ALB **appends** the client IP to whatever the client sent (`spoofed, real`), and nginx's usual `$proxy_add_x_forwarded_for` does the same. The first entry is then attacker-chosen. `serverFetch` forwards the same header, so SSR calls carry it too.
- **Scenario:** a script sends `X-Forwarded-For: <random>` on every request. The per-IP limits (`LOGIN_LIMITS.perIp`, `perEmail` per IP, and the mobile `mobile-sms:ip` / `mobile-code:ip` limits in `server/services/mobile-auth.ts`) never trip. Password guessing is capped only by `perEmailAnyIp`, and Twilio SMS can be pumped up to the per-phone limits, which costs real money.
- **Fix to put in the design:** decide the trusted hop count and read from the right. Behind one ALB, use the **last** XFF entry. The website's `serverFetch` must send the IP it trusts, the last entry it received, as a fresh single-value header. The Server must accept that header only from the website, for example through a shared header secret or by checking the source subnet. With nginx on one box, use `proxy_set_header X-Forwarded-For $remote_addr` (overwrite, not append).

### I2. `SERVER_URL` "the Server's private address" doesn't exist once the Server is a scaled group
- **Where:** design "Traffic" (`SERVER_URL`), "What we end up with" (API as its own EC2 group).
- **What goes wrong:** an Auto Scaling group of Server instances has no single private address. SSR from the website needs something that load-balances across healthy Server instances and drains them on deploy.
- **Scenario:** the guide says to set `SERVER_URL=http://10.0.1.23:3101`. That instance is replaced on the next deploy or scale-in, and every server-rendered page on every website replica returns 500 until someone edits the env and restarts.
- **Fix to put in the design:** pick one. (a) An **internal ALB** in front of the Server group, with `SERVER_URL` set to its DNS name. This costs one more ALB. (b) Point `SERVER_URL` at the public ALB (`https://<site>/api`), which is simplest but leaves the VPC and needs I1's header handling. Write the choice and its timeout settings into the guide. On the one-box compose setup it is the service name (`http://server-api:3101`).

### I3. The website health check fails because the middleware redirects `/healthz`
- **Where:** design "Running on EC2" (health checks), "Sign-in" (website middleware does a cookie-presence check). Today's matcher is at `apps/web/middleware.ts:8`.
- **What goes wrong:** the middleware covers every path except `api/auth`, `_next/static`, `_next/image`, `favicon.ico`, `icon.png` and `brand/`. A new `/healthz` page goes through it. The ALB health checker sends no cookie, gets a 307 to `/login`, and the ALB default success code is 200.
- **Scenario:** every website target is marked unhealthy. If the ASG uses ELB health checks, it keeps replacing healthy instances.
- **Fix to put in the design:** add `healthz` to the middleware matcher's exclusions, or make it a route handler under a path the matcher skips. The guide should say the health check expects 200 from `/healthz` with no cookie.

### I4. A Server health check that touches the database will mass-replace instances and keep Neon awake
- **Where:** design "Running on EC2" (`GET /api/v1/health` "database reachable"). No such route exists today (`apps/web/app/api/v1/` has no `health`).
- **What goes wrong:** ALB checks every target every few seconds. If the check queries Neon, then (1) Neon never scales to zero, even with the worker poll interval set long, which defeats the cost lever the design adds for the worker. (2) A Neon blip or cold start fails every target at once. With ASG ELB health checks, all API instances are then terminated and replaced together, which turns a database hiccup into a full outage plus a cold boot.
- **Fix to put in the design:** split the endpoints. `GET /api/v1/health` is liveness only (process up, no DB) and is the one the ALB and ASG use. A separate readiness or diagnostic endpoint (`/api/v1/health/db`) is for humans and for monitoring alerts. State how often it may hit Neon.

### I5. Migrations: no step, no tool in the image, no compatibility rule
- **Where:** design "Running on EC2" ("`prisma migrate deploy` runs once per release, before new Server containers take traffic").
- **What goes wrong:** the standalone image doesn't include the `prisma` CLI or `prisma/migrations/`, because nothing imports them. The design doesn't say who runs the migration, from where, or with which URL. The schema uses `directUrl = env("DATABASE_URL_UNPOOLED")`, which the migrator needs and the API doesn't. Old API and worker containers keep running against the new schema for the length of the rollout. The design has no rule that migrations must be backward compatible.
- **Scenario:** a release renames a column. `migrate deploy` runs, and old worker containers (see C2) start throwing on every job until they are replaced. Or nobody runs the migration because the image can't, and new containers crash on the first query.
- **Fix to put in the design:** a one-shot `migrate` role or stage. Either a separate small image (or Dockerfile target) with the `prisma` CLI, the schema and the migrations, run once with `DATABASE_URL_UNPOOLED` before the worker and API roll, or the same command in the release script. Add the expand/contract rule to the guide: add first, backfill, switch the code, drop in a later release.

### I6. Deploys kill running jobs: no SIGTERM handling in the worker, and grace periods too short
- **Where:** design "Running on EC2" (worker loop), "Architecture document" ("`after()` work runs in the API process"). `apps/web/scripts/worker-dev.ts` (infinite loop, no signal handler); `apps/web/server/jobs/runner.ts:92` (`after(() => runDueJobs())`).
- **What goes wrong:**
  - The worker has no SIGTERM handler, so `docker stop` ends it mid-job.
  - The API side is better: Next 15.5's `next start` closes the server and waits for requests and `after()` work on SIGTERM. But Docker's default stop timeout is 10 s, and ALB deregistration defaults to 300 s, while one job can run for minutes (`holdLease` exists because Research runs take 5+ min).
  - A killed job keeps its lease for `LEASE_MS` (5 min, `server/jobs/queue.ts:9`), then is reclaimed with `attempts + 1`.
- **Scenario:** two deploys in one afternoon each kill the same story render (`maxAttempts: 2`, `server/stories/service.ts:182`), and it dead-letters as "cut off". A publish job (`maxAttempts: 1`) killed mid-post lands in `PENDING_VERIFY`, and the user has to check Instagram by hand. Every deploy delays queued work by up to 5 minutes.
- **Fix to put in the design:** the worker catches SIGTERM, stops claiming, finishes the current job and exits. Set `stop_grace_period` (compose) and the ECS/systemd stop timeout to at least 6 minutes for `worker`. For `api`, keep it at or above the longest request (300 s) plus the `after()` budget, and match the ALB deregistration delay to it. Also see I7.

### I7. Heavy jobs still run inside API containers, so the "scale separately" goal isn't met
- **Where:** design "Architecture document" ("`after()` work runs in the API process"). `kickRunner()` is called from 18 route files and from `server/reels/service.ts:222`. `kickIfDue()` is called from 9 polling routes (`server/jobs/runner.ts:91-109`).
- **What goes wrong:** every user action that enqueues work also drains the queue in that API container: ffmpeg reel joins, sharp/Pango story frames, photoshoots and multi-minute agent runs. The API group then needs worker-sized CPU and memory and long stop grace. Its latency spikes under render load, and scaling the worker group does nothing for it.
- **Fix to put in the design:** once a worker group exists, `kickRunner()` should not run jobs in the API process. Add an env switch (for example `JOBS_IN_API=false` in production): `kickRunner`/`kickIfDue` become no-ops and the worker's short poll picks the job up. Keep today's behaviour for dev and as a fallback. Write the chosen poll interval, and its Neon cost, into the guide.

### I8. Building the images from this monorepo: workspaces, install scripts, native binaries, Prisma engine
- **Where:** design "Running on EC2" bullet 1, "Repo layout and tooling". Root `package.json` (`"workspaces": ["apps/*"]`), `apps/web/next.config.ts`, `apps/web/prisma/schema.prisma` (no `binaryTargets`). There is no `.dockerignore` at the repo root.
- **What goes wrong, item by item:**
  - `packages/shared` isn't a workspace. The root `workspaces` is `["apps/*"]`, so `@espanda/shared` won't resolve. It also needs `transpilePackages: ["@espanda/shared"]` (or a build step) in both Next configs if it ships TypeScript.
  - `npm ci` in either Dockerfile installs every workspace, including `apps/mobile` (Expo/React Native) and `apps/brandpilot-ai`, plus the server's `ffmpeg-static` download and `prisma generate` in the website image. The lockfile also needs every workspace's `package.json` present to validate. Builds get slow and large, and the website image pulls in server-only packages.
  - `ffmpeg-static`'s `install` script downloads the binary from GitHub at install time (`node_modules/ffmpeg-static/package.json`). A hardened `npm ci --ignore-scripts` leaves no ffmpeg, and the build needs outbound internet.
  - With no `.dockerignore`, `COPY . .` from this Windows checkout copies `node_modules` with Windows binaries (`node_modules/ffmpeg-static/ffmpeg.exe`, the Windows Prisma engine) over the Linux install.
  - `ffprobe-static` ships only `linux/ia32` and `linux/x64` (no arm64), and `outputFileTracingIncludes` lists only `linux/x64`. The Server image can't run on Graviton (`t4g`/`c7g`) instances: story uploads fail at `probeVideo`.
  - Prisma generates the engine for the build stage's OS ("native"). A build stage on Debian with a runtime on Alpine or distroless, or a `-slim` runtime without `openssl`, crashes on the first query.
- **Fix to put in the design:**
  - Add `packages/*` to root workspaces.
  - Each Dockerfile copies the root `package.json` and lockfile, all workspace `package.json` files and its own sources, then runs `npm ci -w apps/<app> --include-workspace-root` with install scripts on.
  - Add a root `.dockerignore` (`**/node_modules`, `**/.next`, `.env*`, `apps/mobile`, `apps/brandpilot-ai`).
  - Pin x86_64 instance types, or add the arm64 ffprobe.
  - Use the same base image for build and runtime (for example `node:22-bookworm-slim` with `openssl` installed), or set `binaryTargets` to match.
  - Copy `public/` and `.next/static` into the standalone folder at `apps/<app>/`.

### I9. The website loses its Google button, and other env each role needs is unstated
- **Where:** design "Traffic" (Web Frontend env is only `SERVER_URL`, "Nothing else secret"), "Server env: everything it has today". `apps/web/app/login/page.tsx:22`, `apps/web/server/reels/render.ts:202-205`, `apps/web/server/auth/tokens.ts:11-17`, `apps/web/server/storage/media.ts:13-19`.
- **What goes wrong:**
  - The login page decides whether to show "Continue with Google" from `GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET`, read at module level. Without those on the website, the button disappears. Giving the website the secret breaks the design's own goal. The page needs a non-secret flag, or has to ask the Server.
  - The **worker** builds Higgsfield webhook URLs from `AUTH_URL` (`render.ts:203`) and email links via `appUrl()`. When `AUTH_URL` is missing and `NODE_ENV` isn't `production`, it silently falls back to `http://localhost:3100` in invite and reset links, and silently drops the webhook so reels fall back to polling. A hand-run worker (`tsx`) doesn't set `NODE_ENV=production`.
  - Storage uses the AWS SDK default credential chain with `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_ENDPOINT_URL_S3`/`AWS_REGION` pointing at **Neon** object storage, bucket name `media`. On EC2 these names collide with the platform's own AWS settings. If an operator drops the keys "because EC2 has an instance role", or omits `AWS_ENDPOINT_URL_S3`, the SDK quietly uses the instance role against real S3 bucket `media`, which belongs to someone else, and every upload fails with AccessDenied.
- **Fix to put in the design:** an env table per role (website, server-api, worker, migrate) in `ENV_SETUP.md`, built from `grep process.env`.
  - The worker gets the full Server set plus `NODE_ENV=production`.
  - The website gets `SERVER_URL` plus a public flag such as `GOOGLE_SIGNIN_ENABLED`, or reads it from a Server endpoint.
  - Rename the Neon storage variables (for example `MEDIA_S3_*`) and pass them to `new S3Client({...})` explicitly, so the instance role can never be picked up.
  - Say how secrets reach the boxes: SSM Parameter Store or Secrets Manager into the container env, not a `.env` file on disk.

---

## Minor

### M1. A website rolling deploy breaks open tabs (chunk version skew)
Vercel keeps old deployments' `/_next/static` files. On EC2 a rolling deploy mixes old and new website containers behind the ALB. A tab loaded from the old build that asks a new container for an old chunk gets a 404 (`ChunkLoadError` on the next client navigation). **Fix:** in the guide, either deploy the website blue/green with a full cutover, or upload `.next/static` for each build to S3 or CloudFront with `assetPrefix` and keep the last few builds. Keep the design's removal of all server actions (`app/(shell)/actions/shell-context.ts`, `app/login/page.tsx`, `app/welcome/page.tsx` are the only `"use server"` files today), so action IDs don't skew as well.

### M2. Dev rewrite drops long silent requests after 30 s
Next's external rewrite proxy has `proxyTimeout` defaulting to 30 000 ms (`node_modules/next/dist/server/lib/router-utils/proxy-request.js:37`). In local dev, every browser call goes 3100 → 3101 through it, so any route that stays silent for more than 30 s before sending bytes fails with "Failed to proxy" in dev only. Examples are the non-streaming `reels` create/plan (`maxDuration = 120`) and a chat tool step. **Fix:** set `experimental.proxyTimeout` to 310 000 in the website's `next.config`. Keep the rewrite dev-only: rewrite destinations are written into the build at `next build`, so a `SERVER_URL` read there would be baked into the image.

### M3. The daily sweep's time and trigger aren't specified
Vercel ran it at 05:00 UTC (`apps/web/vercel.json`). The idempotency key is the UTC date (`runner.ts:168`), so several workers are safe. But "once a day" from a worker loop runs it right after 00:00 UTC, or at whatever time a worker last booted, depending on how it's written. That moves when scheduled agents start and tokens refresh. **Fix:** the worker calls `enqueueDailySweep()` on each loop only when the UTC hour is 5 or later (the key dedups), and the design states that time.

### M4. Long-request numbers in the design don't match the code
The design says "about 15 routes" with up to 5 minutes. There are 22 routes exporting `maxDuration` (18 at 300 s, 2 at 120 s, 2 at 60 s). Off Vercel, `maxDuration` is no longer a cap, so nothing stops a hung request except the load balancer idle timeout, and `runDueJobs`'s "headroom under maxDuration" comment no longer holds. Uploads that go through the API are up to 4 MB (`voices/clones` `MAX_CLONE_BYTES` and `media/route.ts` `MAX_BYTES`), and nginx's default `client_max_body_size` is 1 MB. **Fix:** put the real list and numbers in the guide: ALB idle timeout 310 s, nginx `proxy_read_timeout 310s`, `client_max_body_size 6m`, `proxy_buffering off` on `/api/`.

### M5. Root `docker-compose.yml` is a stale MongoDB file, and root `dev` can't run two servers
The repo-root `docker-compose.yml` starts `mongo:7` "for apps/web (Prisma)", but the app uses Neon Postgres. The design's new compose file has to replace it, not sit beside it. Root `dev` "(both)" needs a parallel runner: `npm run dev --workspaces` runs serially, so the first `next dev` blocks the second. No `concurrently` or `npm-run-all` is installed. **Fix:** say the compose file is replaced. Add one dev dependency for parallel scripts, and decide whether `dev` also starts the worker.

### M6. Private subnets need NAT, and video traffic pays for it
Every role talks to the outside: Neon DB and storage, OpenAI, ElevenLabs, Higgsfield, social APIs, Twilio, and `open.er-api.com` (`server/usage/fx.ts`). Containers in private subnets, which the design implies with "private network", need a NAT gateway. Reel and story renders pull and push video through it at per-GB NAT charges. **Fix:** say this in the guide, and size the cost for the one-box setup versus the scaled one.

---

## Checked and fine
- Job claiming (`server/jobs/queue.ts:41-60`) uses `FOR UPDATE SKIP LOCKED` with owner-checked complete and fail, so several worker replicas are safe. The daily sweep is deduplicated by `idempotencyKey`, and scheduled agents are skipped if already started today.
- No sticky sessions needed: rate limits live in Postgres (`RateLimitBucket`). The in-memory caches (`model-config.ts` 60 s TTL, `lastDueCheck`, `mediaKnown`, the voice library cache, `fx.ts`) are per-process and safe to have per replica.
- Auth.js behind the proxy: `createActionURL` prefers `AUTH_URL`, so the Server picks the `__Secure-` cookie name even on plain-HTTP SSR calls, as long as `AUTH_URL` is the https website URL on **every** Server role.
- Streaming: Next 15.5's `pipe-readable` flushes compressed chunks, so chat and NDJSON stream through `next start`. Only proxy buffering (M4) needs turning off.
- No edge runtime routes, no `VERCEL_*` or `process.env.VERCEL` reads. The only `NEXT_PHASE` check (`server/auth/tokens.ts:14`) is build-time safety. No websockets.
