# Server / Web Frontend Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `apps/web` into `apps/server` (API + worker, Docker on EC2) and `apps/web` (pages only, no secrets), joined by one public address where `/api/*` goes to the Server.

**Architecture:** First make the website talk to its own API over HTTP while it is still one app (tasks 1–5), so each change is checked against the running app. Then move files into two apps (task 6), then add the production pieces (tasks 7–8), then document and review (task 9).

**Tech Stack:** Next.js 15 (App Router, route handlers), Auth.js v5 (`next-auth`, `next-auth/react`), Prisma 6 on Neon Postgres, vitest, Playwright, npm workspaces, Docker, nginx / AWS ALB.

**Spec:** `docs/superpowers/specs/2026-11-16-server-web-split-design.md`. Review evidence: `docs/handover/2026-11-16-split-design-review/` (the separation review's appendix lists every file that crosses the boundary).

## Global Constraints

- Branch `server-web-split` from `desktop-shell` **after** the state-machine fixes are committed there. One commit per task step group; nothing pushed.
- Commit messages: what changed and why. No Co-Authored-By, no session URL, no "Generated with", no mention of tests.
- Package names: `server` (apps/server), `web-frontend` (apps/web), `mobile-app` (apps/mobile), `@espanda/shared` (packages/shared). `apps/mobile` folder is not renamed.
- Dev ports: website **3100**, Server **3101**. Dev `AUTH_URL` stays `http://localhost:3100`.
- `packages/shared`: no `dependencies`; no `@prisma/client`, `zod`, `node:*`, `process.env`.
- The phone's API calls and responses do not change. `GET /api/v1/me` is not changed.
- Error message wording on the login page stays exactly as in today's `ERRORS` map (`apps/web/app/login/page.tsx:11-21`).
- Session cookie names: `authjs.session-token`, `__Secure-authjs.session-token`, and chunked `<name>.0`.
- Shell cookies: `bp_active_workspace_id`, `bp_active_brand_id`, max age 180 days, `httpOnly`, `sameSite: "lax"`, `path: "/"`, plus `secure` in production.
- After every task: `npm test` (all vitest), `npm run typecheck`, and from task 6 on `npm run build:web` and `npm run build:server`, all green.

## Review Focus

1. **Signed-in user with a stale/invalid session cookie** opens a page → website sees a cookie, `/me/shell` answers 401 → must land on `/login?next=…&expired=1`, not loop. Test in task 3 (`serverFetch` 401 mapping) and e2e in task 6.
2. **Platform-admin URL opened by a non-admin** → 404 page, never a 403 page or data. Test in task 4.
3. **Switching workspace to one the person isn't a member of** (forged POST to `/me/context`) → 403/404, cookies unchanged. Test in task 3.
4. **Login with too many attempts / database down** → exact "Too many sign-in attempts…" / "We couldn't check your sign-in…" messages, not "Email or password is incorrect." Test in task 5.
5. **Deploy while a job is running or a newer job type is queued** → job finishes or returns to PENDING, never DEAD_LETTER. Test in task 7.

---

### Task 1: Shared package and boundary rules (still one app)

**Files:**
- Create: `packages/shared/package.json` (`{"name":"@espanda/shared","private":true,"version":"0.0.0","main":"src/index.ts","types":"src/index.ts"}`), `packages/shared/src/index.ts`, `packages/shared/src/website.ts`, `packages/shared/src/shell-cookies.ts`, `packages/shared/src/by-hand-steps.ts`, `packages/shared/src/content-limits.ts`, `packages/shared/src/offers.ts`, `packages/shared/src/products.ts`, `packages/shared/tsconfig.json`
- Modify: root `package.json` (workspaces `["apps/*","packages/*"]`), `apps/web/package.json` (dep `"@espanda/shared": "*"`), `apps/web/next.config.ts` (`transpilePackages: ["@espanda/shared"]`), `apps/web/eslint.config.mjs`
- Move contents: `apps/web/lib/website.ts` → shared `website.ts`; `apps/web/lib/shell-cookies.ts` → shared; `apps/web/server/stories/by-hand-steps.ts` → shared; caption/hashtag limits from `server/content/rules.ts` (and the copy in `components/workspace/draft-editor.tsx`) → `content-limits.ts`; `zoneCity`, `offerPercents` from `server/content/offer-checks.ts` → `offers.ts`; `productName`, `REMOVED_PRODUCT_NAME`, `groupKey`, `byExternalId` from `server/content/product-checks.ts` → `products.ts` with structural param types (e.g. `{ id: string; source: string; url: string | null }`). Old files re-import from `@espanda/shared`; delete `lib/website.ts`, `lib/shell-cookies.ts`, `server/stories/by-hand-steps.ts` and update all importers.
- Test: existing `tests/website.test.ts`, `tests/product-checks.test.ts`, `tests/competitor-helpers.test.ts` keep passing with updated imports.

**Interfaces:**
- Produces: `@espanda/shared` exports `normalizeWebsite, safeHttpUrl, domainOf, brandNameFromWebsite, SHELL_COOKIE_WORKSPACE, SHELL_COOKIE_BRAND, SHELL_COOKIE_MAX_AGE, BY_HAND_STEPS, stepsText, CAPTION_LIMITS (same shape as today's rules), zoneCity, offerPercents, productName, REMOVED_PRODUCT_NAME, groupKey, byExternalId` with today's signatures (types made structural).

- [ ] **Step 1:** Create the package and move the symbols as listed; update importers (grep `@/lib/website`, `@/lib/shell-cookies`, `by-hand-steps`, the six helper names).
- [ ] **Step 2:** Add `no-restricted-imports` to `apps/web/eslint.config.mjs` for files under `app/**` except `app/api/**`, `components/**`, `lib/**`: ban `@/server/*`, `@/auth*`, `@prisma/client`, `prisma`, `next-auth` (allow `next-auth/react`), `@auth/*`, `@ai-sdk/openai`, `nodemailer`, `bcryptjs`, `@aws-sdk/*`, `sharp`, `ffmpeg-static`, `ffprobe-static`, `jose`. Add a shared-package rule banning `@prisma/client`, `zod`, `node:*` and the `process` global.
- [ ] **Step 2b:** `npm i server-only -w web`; add `import "server-only";` to `server/db/prisma.ts`, `auth.ts`, `server/auth/access.ts` and `server/services/credits.ts` (a client import of any of them then fails the build). The four e2e specs import cookie names from `@espanda/shared`.
- [ ] **Step 3:** Run `npm run lint`. Expected: errors only in the files tasks 3–5 convert (the 38 listed in the separation appendix). Record that list in the commit; mark those files with an `// eslint-disable-next-line no-restricted-imports -- converted in task N` per import so lint is green.
- [ ] **Step 4:** `npm test && npm run typecheck` → green. Commit.

### Task 2: Client IP from the right-most forwarded entry

**Files:**
- Modify: `apps/web/server/auth/rate-limit.ts:31-35`
- Test: `apps/web/tests/client-ip.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { clientIp } from "@/server/auth/rate-limit";
const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
it("takes the entry our load balancer appended", () => {
  expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
});
it("single entry", () => expect(clientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9"));
it("falls back to x-real-ip then unknown", () => {
  expect(clientIp(req({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
  expect(clientIp(req({}))).toBe("unknown");
});
```

- [ ] **Step 2:** Run `npx vitest run tests/client-ip.test.ts -w web` → first test FAILS (`6.6.6.6`).
- [ ] **Step 3:** Take the last non-empty comma entry; update the doc comment ("one trusted proxy hop: our ALB or nginx, which overwrites").
- [ ] **Step 4:** Test passes; full suite green. Commit.

### Task 3: `/me/shell`, `/me/context`, `serverFetch`, shell pages switched

**Files:**
- Create: `apps/web/app/api/v1/me/shell/route.ts`, `apps/web/app/api/v1/me/context/route.ts`, `apps/web/lib/server-fetch.ts`, `packages/shared/src/api/shell.ts`
- Modify: `app/(shell)/layout.tsx`, `page.tsx`, `agents/page.tsx`, `connections/page.tsx`, `context/page.tsx`, `performance/page.tsx`, `products/page.tsx`, `settings/page.tsx`, `app/welcome/page.tsx`, `components/shell/brand-switcher.tsx`, `new-brand-dialog.tsx`, `workspace-switcher.tsx`, `components/welcome/welcome-flow.tsx`
- Delete: `app/(shell)/actions/shell-context.ts`
- Test: `apps/web/tests/me-shell.test.ts`, `apps/web/tests/me-context.test.ts`, `apps/web/tests/server-fetch.test.ts`

**Interfaces:**
- Produces (`@espanda/shared`):

```ts
export type ShellResponse = {
  user: { id: string; name: string | null; email: string; image: string | null };
  workspaces: { id: string; name: string; role: string }[];   // copy today's listUserWorkspaces fields the pages use
  brands: { id: string; displayName: string; websiteUrl: string | null; archivedAt: string | null }[]; // likewise
  activeWorkspaceId: string | null;
  activeBrandId: string | null;
  roleLabel: string | null;
  workspacePermissions: string[];
  brandPermissions: string[];
  isPlatformAdmin: boolean;
};
export type ContextRequest = { workspaceId: string; brandId?: string };
```

  (Field lists: take exactly what the converted pages read today; add nothing else.)
- Produces (`apps/web/lib/server-fetch.ts`): `serverFetch<T>(path: string, init?: RequestInit): Promise<T>` and `getShell: () => Promise<ShellResponse>` wrapped in React `cache`. `path` is built only with a tagged helper `api\`/api/v1/admin/people/${id}\`` that `encodeURIComponent`s each interpolation. Base URL: `process.env.SERVER_URL ?? "http://localhost:3100"` (one-app phase calls itself). Forwards `cookie`; `cache: "no-store"`. Maps: 401 → `redirect("/login?expired=1&next=" + current path)`; 403/404 → `notFound()`; other non-2xx → `throw new Error("server <status>")` (error page).

- [ ] **Step 1: Failing tests.** `me-shell.test.ts`: 401 with no session; returns `activeWorkspaceId` from the cookie when a member, falls back as `loadShellContext` does otherwise; `brandPermissions` empty when no active brand. `me-context.test.ts`: non-JSON body → 415; `Origin` other than `AUTH_URL`'s origin → 403; workspace the user isn't a member of → 404 and no `set-cookie`; valid → both cookies set with the flags in Global Constraints and brand cookie deleted when only `workspaceId` given. `server-fetch.test.ts`: `api` helper encodes `../x` to `..%2Fx`; 401 calls `redirect` with `expired=1`; 404 calls `notFound`. (Mock `next/navigation`, `@/auth`, `next/headers` in the style of `tests/agent-run-refund.test.ts`.)
- [ ] **Step 2:** Run them → FAIL (routes missing).
- [ ] **Step 3:** Implement `GET /me/shell` from `loadShellContext`, `loadRoleLabel`, `effectivePermissions` (workspace and active brand), `isPlatformAdmin`; return `Response.json(body satisfies ShellResponse)`. Implement `POST /me/context` with the checks from `shell-context.ts` (`requireWorkspaceMember`, `requireBrandAccess(..., { allowArchived: true })`).
- [ ] **Step 4:** Implement `serverFetch`, `api`, `getShell`.
- [ ] **Step 5:** Convert the 9 shell pages to `getShell()`; the five switch callers to `fetch("/api/v1/me/context", { method: "POST", headers: {"content-type":"application/json"}, body })` then `router.refresh()` (welcome: `router.push("/")`; its "Open <workspace>" becomes a client button). Remove their eslint-disable lines.
- [ ] **Step 6:** Tests pass, suite + typecheck green. Browser check on `:3100`: home, switch workspace, switch brand, welcome. Commit.

### Task 4: Platform-admin endpoints

**Files:**
- Create: `apps/web/app/api/v1/admin/` routes: `overview`, `logs`, `spend`, `activity`, `activity/[userId]`, `people`, `people/[userId]`, `people/[userId]/visit`, `workspaces`, `workspaces/[workspaceId]`, `workspaces/[workspaceId]/header`, `workspaces/[workspaceId]/visit` (each `route.ts`); `packages/shared/src/api/admin.ts`
- Modify: the 17 files under `app/(shell)/admin/`, `components/admin/{logs-view,spend-view,activity-pickers,access,log-table,spend-tables}.tsx`
- Test: `apps/web/tests/admin-api.test.ts`

**Interfaces:**
- Consumes: `serverFetch`, `api`, `getShell` (task 3).
- Produces: JSON-shape types in `@espanda/shared` (`AdminOverview`, `AdminLogsResponse`, `AdminSpend`, `AdminActivityList`, `AdminPersonTimeline`, `AdminPeople`, `AdminPerson`, `AdminWorkspaces`, `AdminWorkspaceDetail`, `AdminWorkspaceHeader`, `MemberPermissions`, `LogKind`, `ActivitySort`, `WorkspaceSort`, `NO_WORKSPACE`), dates as ISO strings. Every list response carries `page`, `pages`, `next` (cursor string or null) and its filter options; spend-bearing responses carry `usdInr: number`. Each route: guard with the existing platform-admin check, answer **404** to non-admins, pass `searchParams` to the service unchanged, `Response.json(body satisfies T)`.

- [ ] **Step 1: Failing tests:** non-admin → 404 on two representative routes; admin → 200 with `pages` and `usdInr`; `workspaces/[id]` GET does **not** call `recordWorkspaceView`; `workspaces/[id]/visit` POST calls it once.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the routes from `server/services/platform-admin.ts` and `activity.ts`.
- [ ] **Step 4:** Convert pages and components: admin layout guard = `getShell().isPlatformAdmin || notFound()`; drop per-page `requirePlatformAdminPage`; `logs-view`/`spend-view` take data via `serverFetch`; workspace layout calls `header` and `visit` once; person page calls `visit`. Remove eslint-disable lines.
- [ ] **Step 5:** Tests pass; suite + typecheck green; browser-check each admin page as a platform admin on `:3100`. Commit.

### Task 5: Login on `next-auth/react`; middleware split by path

**Files:**
- Modify: `app/login/page.tsx` (server wrapper keeps static text) + create `components/auth/login-form.tsx` (client); `middleware.ts`; `auth.config.ts` only if needed for the matcher
- Test: `apps/web/tests/login-errors.test.ts`, `apps/web/tests/middleware.test.ts`

**Interfaces:**
- Produces: `loginMessage(result: { error?: string | null; code?: string | null }): string | null` in `components/auth/login-form.tsx` (exported for the test), mapping Auth.js results to the existing `ERRORS` keys. Credentials `authorize` must throw `CredentialsSignin` subclasses whose `code` is `invalid` / `rate_limited` / `unavailable` / `disabled` (check `auth.ts`; keep codes as they are).
- Produces: `hasSessionCookie(cookies: { name: string }[]): boolean` in `middleware.ts`.

- [ ] **Step 1: Failing tests:** `loginMessage({ error: "CredentialsSignin", code: "rate_limited" })` → "Too many sign-in attempts. Wait 15 minutes and try again."; `code: "unavailable"` → "We couldn't check your sign-in just now. Try again in a moment."; `{ error: "CredentialsSignin" }` with no code → incorrect-password text; `{ error: "Configuration" }` with code `unavailable` → unavailable text. `hasSessionCookie` true for each of the four names, false for `bp_active_workspace_id` only.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Login form: `signIn("credentials", { email, password, redirect: false })`, own `pending` state, email kept in state, success → `router.replace(next)`; Google button shown when `getProviders()` includes `google`, `signIn("google", { redirectTo: next })`; already signed in (`useSession` / `getSession`) and not `expired` → `router.replace(next)`. Keep `safeNext` and all copy. Remove the `login_email` cookie code.
- [ ] **Step 4:** `middleware.ts`: for `/api/v1/*` run `NextAuth(authConfig).auth` (rolling session) as today; for pages, public paths (`/login`, `/invite/`, `/forgot-password`, `/reset-password`, `/healthz`) pass, else `hasSessionCookie` or redirect to `/login?next=<path>`. Matcher excludes `api/auth`, `_next/*`, `favicon.ico`, `icon.png`, `brand/`. This file is split in task 6.
- [ ] **Step 5:** Tests pass; browser: wrong password, 6 wrong attempts, Google button visible, sign out, signed-in visit to `/login` redirects. Commit.

### Task 6: Physical split

**Files:**
- `git mv apps/web apps/server`; then `git mv` into a new `apps/web`: `app/` (everything except `app/api`), `components/`, `lib/` (less what moved to shared), `public/`, `postcss.config.mjs`, `components.json`, `playwright.config.ts`, `e2e/`, the five website-only tests (`nav`, `page-view-tracker`, `panel-layout`, `welcome-reading-state`, `no-hsl-var`), `scripts/check-net.ts`, `scripts/audit-ui.ts`
- Create: `apps/web/package.json` (`web-frontend`; scripts `dev` = `next dev --turbopack -p 3100`, `build`, `start -p 3100`, `lint`, `typecheck`, `test`, `test:e2e`, `check:net`, `audit:ui`), `apps/web/next.config.ts` (rewrite `/api/:path*` → `${process.env.SERVER_URL ?? "http://localhost:3101"}/api/:path*`, `experimental.proxyTimeout: 330_000`, `transpilePackages`, `output: "standalone"`), `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`, `apps/web/eslint.config.mjs`, `apps/web/middleware.ts` (page half of task 5), `apps/web/app/healthz/route.ts` (`GET` → `200 "ok"`), `apps/web/.env.example` (`SERVER_URL=http://localhost:3101` only), `apps/web/README.md` ("Web Frontend"), `apps/server/README.md` ("Server"; note `apps/server/server/` keeps its name)
- Modify: `apps/server/package.json` (`name: "server"`, ports 3101, add `seed:story`), `apps/server/middleware.ts` (API half only, matcher `/api/v1/:path*`), `apps/server/next.config.ts` (`output: "standalone"`, keep tracing includes and dev CORS), `apps/server/eslint.config.mjs` (mirror rule: ban `@/components/*` and any import out of `apps/server`), root `package.json` scripts (`dev:server`, `dev:web`, `build:server`, `build:web`, `test` both, `typecheck` three apps, `lint` both, `test:e2e`, `db:*` → server), `apps/web/playwright.config.ts` (two `webServer` entries: server `:3101`, web `:3100`), `e2e/stories.spec.ts` (seed via `npm run seed:story -w server -- …`), split mixed tests `website.test.ts` / `product-checks.test.ts` per the separation review M8 and move the `stockLabel` assertion out of `scripts/check-catalog.ts`, `apps/mobile/.env.local` and the fallback URL in `apps/mobile/src/api/client.ts` → `:3101`, every `-w web` that means the Server (38 files incl. `app/(shell)/admin/page.tsx:70`, `components/settings/ai-models-tab.tsx:21,97`, script headers, `docs/ENV_SETUP.md`, `docs/HANDOVER.md`) → `-w server`; `apps/mobile/package.json` name `mobile-app`
- Create: `scripts/check-web-bundle.mjs` (root): fails if `apps/web/.next` contains `PrismaClient` or any of `DATABASE_URL AUTH_SECRET GOOGLE_CLIENT_SECRET OPENAI_API_KEY STORAGE_SECRET_ACCESS_KEY CRON_SECRET` (read names from `apps/server/.env.example`); root script `check:web-bundle`.

- [ ] **Step 1:** Do the moves (two `git mv` commits so history follows), then the configs.
- [ ] **Step 2:** `npm install`; `npm run typecheck`, `npm test`, `npm run lint` → green.
- [ ] **Step 3:** Build the website with an empty env (`env -i PATH="$PATH" npm run build:web`) then `npm run check:web-bundle` → passes. Temporarily add `import "@prisma/client"` to a component → lint fails; revert.
- [ ] **Step 4:** Run both dev servers; browser walk: login (password + Google button), shell, switch, admin, chat streaming > 30 s, upload; phone emulator against `:3101` (sign in, Posts, story editor).
- [ ] **Step 5:** `npm run test:e2e` → green. Commit.

### Task 7: Server production behaviour

**Files:**
- Create: `apps/server/app/api/v1/health/route.ts` (`GET` → `{ ok: true }`, no DB), `apps/server/worker/main.ts`, `apps/server/instrumentation.ts` (or start-up check where config is read: in production, throw if `AUTH_URL` is not `https://…`)
- Modify: `apps/server/server/jobs/runner.ts` (`kickRunner` no-ops when `process.env.RUN_JOBS_IN_API === "false"`; unknown job type → back to PENDING without counting the attempt, via a new `releaseJob(job)` in `server/jobs/queue.ts`), `apps/server/server/storage/media.ts` (+ wherever `AWS_*` storage vars are read: rename to `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET` and pass `credentials` explicitly to the S3 client), `apps/server/.env.example`, `apps/server/package.json` (`build:worker` = `esbuild worker/main.ts --bundle --platform=node --target=node20 --outfile=dist/worker.js --external:@prisma/client --external:ffmpeg-static --external:ffprobe-static --external:sharp --alias:@=.`; `esbuild` dev dep)
- Delete: `apps/server/vercel.json`, `apps/server/scripts/worker-dev.ts` (dev uses `worker/main.ts` via `tsx`, script `worker:dev`)
- Test: `apps/server/tests/runner-unknown-type.test.ts`, `apps/server/tests/worker-loop.test.ts`

**Interfaces:**
- Produces: `worker/main.ts` exports `runWorker(opts: { intervalMs: number; signal: AbortSignal; now?: () => Date }): Promise<void>`: loop `runDueJobs({ budgetMs: 30_000 })`; once per UTC day at/after 05:00 calls `enqueueDailySweep()` (already idempotent); on abort stops claiming, awaits the in-flight `runDueJobs`, returns. Entry: `WORKER_INTERVAL_MS` (default 15000), SIGTERM/SIGINT → abort.
- Produces: `releaseJob(job: { id: string; leaseId: string }): Promise<void>` sets `status: PENDING`, `runAt: now + 60s`, clears the lease, `attempts: { decrement: 1 }`, guarded by the lease in `where`.

- [ ] **Step 1: Failing tests:** a job whose type has no handler ends PENDING with attempts unchanged and no `onFailure` call; `runWorker` with a fake clock at 05:01 UTC calls `enqueueDailySweep` once per day across many loops and not at 04:59; aborting while `runDueJobs` is pending resolves only after it settles; `kickRunner` doesn't call `after` when `RUN_JOBS_IN_API=false`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement as above.
- [ ] **Step 4:** Tests green; `npm run build:worker -w server` then `node apps/server/dist/worker.js` against dev DB processes a queued job and exits cleanly on Ctrl+C. Commit.

### Task 8: Images, compose, proxy, EC2 guide

**Files:**
- Create: root `.dockerignore` (`**/.env*`, `**/node_modules`, `**/.next`, `.git`, `apps/mobile`, `apps/brandpilot-ai`, `**/test-results`), `apps/server/Dockerfile` (base `node:20-bookworm-slim`, `linux/amd64`; stages: deps (`npm ci -w server -w @espanda/shared --include-workspace-root`, install scripts on), build (`next build`, `build:worker`), targets `api` (`node server.js` from standalone, port 3101), `worker` (`node dist/worker.js`, same cwd so `assets/fonts` and `server/email/assets` resolve), `migrate` (Prisma CLI + `prisma/` → `npx prisma migrate deploy`)), `apps/web/Dockerfile` (standalone, port 3100, no env baked), root `docker-compose.yml` replacing the Mongo one (services `migrate` (run-once), `worker` (`stop_grace_period: 360s`), `server-api` (`expose: ["3101"]`, no `ports`), `web` (`expose`, env `SERVER_URL=http://server-api:3101`), `nginx` (`ports: 80, 443`)), `deploy/nginx.conf` (`/api/` → server-api, `/` → web; `proxy_set_header X-Forwarded-For $remote_addr`; `proxy_read_timeout 330s`; `client_max_body_size 5m`; `proxy_buffering off` on `/api/`; 80 → 301 https; access log format without `$args`), `docs/DEPLOY_EC2.md`
- Modify: `apps/server/prisma/schema.prisma` generator `binaryTargets = ["native", "debian-openssl-3.0.x"]`, `docs/ENV_SETUP.md` (env per app and per role: api, worker, migrate, web; remove the external-cron advice and the 12 unread names from ARCHITECTURE §7)
- `docs/DEPLOY_EC2.md` covers: public ALB (listener 443, rule `/api/*` → server-api target group, default → web; idle timeout 330 s; 80 → 443 redirect; access logs without query strings), internal ALB for `SERVER_URL`, target group health checks `/api/v1/health` and `/healthz`, deregistration delay 330 s on API, security groups (Server reachable only from the two ALBs), ASG lifecycle hook ≥ 360 s for workers, x86_64 instances only, deploy order migrate → worker → api → web, one-release-compatible schema changes, NAT cost note, `RUN_JOBS_IN_API=false`, `CRON_SECRET` unset, `AUTH_URL` = public https URL, `NODE_ENV=production` on api and worker.

- [ ] **Step 1:** Write the files.
- [ ] **Step 2:** `docker compose build` → all images build. `docker run --rm --env-file /dev/null <web image> env` shows no secret names; `docker run --rm <web image> sh -c 'ls -a /app | grep -c env'` → 0.
- [ ] **Step 3:** `docker compose up` with dev env files (TLS: self-signed or skip the 443 server block locally) → login, a page, a story render processed by the worker container, `docker compose stop worker` waits for the job. Commit.

### Task 9: Docs and four-lens review

- [ ] **Step 1:** Fresh subagent updates `docs/ARCHITECTURE.md` from **[Planned]** to what was built (routes now served by `apps/server`, new endpoints, env per app/role, paths).
- [ ] **Step 2:** Four fresh subagents, one per lens in the spec's "Four-lens review", given the branch diff (`git diff desktop-shell...server-web-split`) and the spec; reports to `docs/handover/<date>-server-web-split-review/{security,correctness,operations,separation}.md`.
- [ ] **Step 3:** Fix every Critical and Important finding (one commit each), re-run Task 6 step 2–5 checks. Update `docs/HANDOVER.md`. Commit.
