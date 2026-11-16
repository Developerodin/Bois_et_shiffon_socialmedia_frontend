# Server / Web split design: security and secrets review

Reviewed: `docs/superpowers/specs/2026-11-16-server-web-split-design.md` against the code on `desktop-shell` (c17339d).
Versions checked: next 15.5.28, next-auth 5.0.0-beta.32, @auth/core 0.41.3.

**Verdict: the approach is sound (one origin, Auth.js on the Server, every read authorised on the Server), with no
Critical issue. Fix five Important gaps in the design before building. The worst is that login rate limiting stops
working on EC2 as written.**

Counts: Critical 0, Important 5, Minor 8.

---

## Important

### I1. Visitors can spoof `x-forwarded-for` behind an AWS load balancer, so per-IP login limits stop working

- **Where:** design "Running on EC2" ("the load balancer sets `x-forwarded-for`; login rate limiting keeps working
  from it") and "Pages that read the database today" (`serverFetch` forwards the visitor's `x-forwarded-for`).
  Code: `apps/web/server/auth/rate-limit.ts:32-35` (`clientIp` takes the **first** entry of `x-forwarded-for`).
- **What goes wrong:** Vercel overwrites `x-forwarded-for`, so the first entry was safe there. An AWS ALB defaults to
  `append` mode: it keeps whatever the client sent and adds the real IP at the **end**. nginx's usual
  `$proxy_add_x_forwarded_for` appends too. On EC2 the first entry is whatever the attacker typed.
- **Scenario:** an attacker sends `POST /api/auth/callback/credentials` with a new random `X-Forwarded-For: 1.2.3.<n>`
  on every request. `login:ip` (30 per 15 min) and `login:email-ip` (5 per 15 min) see a new IP each time.
  Password spraying across many accounts from one machine goes unthrottled. Only `login:email` (50 per 15 min per
  email) still holds. The same bypass works on `mobile-sms:ip` (`server/services/mobile-auth.ts:186`, so SMS
  pumping is limited only by the 300/hour global cap), `mobile-code:ip`, `mobile-email-step:ip`,
  `mobile-register:ip`, `forgot:ip` (`server/services/accounts.ts:234`). The audit log's `ip`
  (`password-check.ts:45`, `mobile-auth.ts:164,208`) also records the forged value.
- **Fix to put in the design:**
  - Decide one trust rule: the client IP is the **right-most** `x-forwarded-for` entry, which is the one the ALB
    added. Change `clientIp` to take the last entry. On a single box, set nginx to overwrite rather than append
    (`proxy_set_header X-Forwarded-For $remote_addr;`). Drop the `x-real-ip` fallback unless nginx sets it.
  - `serverFetch` forwards exactly one value: the right-most entry the website received. It must not pass the
    raw header through or add the website's own IP.
  - Add a unit test for `clientIp` with `"forged, real"` returning `real`.
  - Remove the "keeps working" sentence. It is false for ALB defaults.

### I2. The Server must be reachable only from the load balancer and the website

- **Where:** design "Running on EC2" and "Non-goals" (a `docker-compose.yml` running website, api and worker on one
  box). Not mentioned anywhere in the design.
- **What goes wrong:** if the Server's port is reachable from the internet, a caller skips the ALB. They can set
  any `x-forwarded-for` (which defeats I1 whatever rule you pick) and talk plain HTTP. Docker's published ports
  (`ports: "3101:3101"`) get past `ufw`/host firewalls because Docker writes its own iptables rules. The existing
  root `docker-compose.yml:7-8` already publishes a database port to `0.0.0.0`, so this is the habit in the repo.
- **Scenario:** the owner follows a compose file that publishes 3101 on the EC2 box and opens it while debugging.
  An attacker scripts sign-in attempts against `http://<ec2-ip>:3101/api/auth/callback/credentials` with forged
  IPs.
- **Fix to put in the design:** the EC2 guide states the security groups: the Server SG accepts its port only from
  the ALB SG and the website SG. The website SG accepts only from the ALB SG. The worker accepts nothing. In
  compose, the Server has `expose:`, not `ports:`, and only nginx publishes 80/443. Make this a checklist item in
  the deployment lens review.

### I3. The login page needs `GOOGLE_CLIENT_SECRET` in the website's environment

- **Where:** `apps/web/app/login/page.tsx:22`
  (`const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)`). The design's
  Sign-in section doesn't cover this.
- **What goes wrong:** once the split is done, the website has no Google secret, so the "Continue with Google"
  button disappears. The obvious quick fix ("add the Google vars to the web env") breaks the main goal and puts an
  OAuth client secret on the public-facing tier.
- **Fix to put in the design:** the login page asks the Server whether Google is enabled. Use `GET /api/auth/providers`
  through `serverFetch` (Auth.js lists only configured providers) or `getProviders()` from `next-auth/react`. Say
  explicitly that no `GOOGLE_*` variable goes in the website's env.

### I4. Secrets reaching the website's image or environment through files, not imports

- **Where:** design "Repo layout and tooling" (`git mv apps/web apps/server`, then a new `apps/web`) and
  "Running on EC2" (Docker images). Code: `apps/web/.env` currently holds every secret (`AUTH_SECRET`,
  `DATABASE_URL`, `AWS_SECRET_ACCESS_KEY`, `CREDENTIALS_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`, `CRON_SECRET`,
  provider secrets, `SMTP_PASS`, `SEED_*_PASSWORD`). The repo root `.env.local` holds `DATABASE_URL` and AWS keys.
  The repo has no `.dockerignore`.
- **What goes wrong:** the `.env` is untracked, so it moves with the directory to `apps/server`. The new `apps/web`
  dev setup then needs an env file, and copying the old one is the easy path. Separately, an npm-workspaces
  monorepo is normally built from the repo root (`COPY . .`). Without a `.dockerignore`, both images, including
  the website's, carry `apps/server/.env` and the root `.env.local` in a layer. Anyone with the image (ECR pull, a
  leaked tarball) has every key.
- **Fix to put in the design:**
  - A root `.dockerignore` with `**/.env*` and `!**/.env.example`, plus `**/node_modules` and `**/.next`.
  - Production images take secrets only from the runtime environment (SSM Parameter Store or Secrets Manager into
    the container env), never baked in.
  - The new `apps/web/.env.example` lists only `SERVER_URL`. The step that creates `apps/web` writes a fresh
    `.env.local` with only that, and does not copy anything.
  - The Server image runs `next start` from the standalone output. Note that the Server's `.env` must not be
    copied into the standalone folder either.

### I5. The "nothing from the Server in the website" guarantee rests on a lint rule only

- **Where:** design "Shared code" ("A lint rule in the Web Frontend forbids importing anything but
  `@espanda/shared`…"). Code: `apps/web/next.config.ts:9` sets `turbopack.root` to the monorepo root. No module in
  `server/` uses `import "server-only"` (checked: zero hits).
- **What goes wrong:** with the Turbopack root at the monorepo root, a relative import such as
  `../../server/server/db/prisma` from `apps/web` compiles and gets bundled. The lint rule catches it only if lint
  runs and the rule matches relative paths. Today, client components already import from server modules
  (`components/products/campaigns.tsx:11-12`, `components/workspace/release-panel.tsx:13-14`, which are `"use client"`).
  Server components under `components/admin/` (`logs-view.tsx:4-5`, `spend-view.tsx:4-5`) call `platformLogs`,
  `spendBreakdown` and `usdInrRate` directly. These are **not** in the design's "28 files under `app/`" count. They
  need `/api/v1/admin/*` endpoints too.
- **Fix to put in the design:**
  - `apps/web/package.json` does not depend on `@prisma/client`, `@auth/prisma-adapter`, `bcryptjs` or `next-auth`'s
    server side. Only `next-auth/react` is used.
  - `import "server-only"` goes at the top of `apps/server/server/db/prisma.ts`, `auth.ts`, `server/auth/tokens.ts`
    and the credentials and crypto modules. Then an accidental client import fails the build.
  - The lint rule also bans relative paths that leave `apps/web` (`no-restricted-imports` with a `../../*` pattern),
    and `next build` must not set `eslint.ignoreDuringBuilds`.
  - A CI step after `build:web` greps `apps/web/.next` for `PrismaClient`, `DATABASE_URL`, `AUTH_SECRET` and the
    provider secret names, and fails if any is found.
  - Add `components/admin/logs-view.tsx` and `spend-view.tsx` (and `activity-pickers.tsx`, which imports
    `NO_WORKSPACE` from the Prisma-importing `server/services/activity.ts`) to the list of files that switch to the API.

---

## Minor

### M1. Forged cookie: what it gets, and the admin console stops being hidden

- **Where:** design "Sign-in" (middleware only checks the cookie is present; the shell layout redirects on 401).
  Code: `server/auth/platform-admin.ts:30-35` (`requirePlatformAdminPage` gives non-admins a 404 "so the console's
  existence isn't revealed") and `platform-admin.ts:13-21` (`platformAdmin()` returns a 403 whose text is
  "Only platform admins can change AI models.").
- **What goes wrong:** anyone can set a cookie named `__Secure-authjs.session-token=x`. That gets past the website
  middleware, but every data read is still checked on the Server, so they get 401s and no data. I checked this:
  nothing in the design lets a forged cookie read data. Two smaller things do change:
  1. Next renders a layout and its page **in parallel**. The layout's redirect on 401 does not stop the page's own
     `serverFetch` calls or its static markup. Each page must treat a 401 as "go to login" itself and must not
     render partial content. The existing code says the same at `platform-admin.ts:27`: "a layout alone doesn't
     guard the page's own data loading".
  2. If the new `/api/v1/admin/*` endpoints reuse `platformAdmin()`, a non-admin gets a 403 with a wording about AI
     models. The website must map 403 from any admin endpoint to `notFound()`, and the endpoints should return a
     generic 404. (The admin client chunks are already public under `/_next/static`, so this is about behaviour
     staying as today, not real secrecy.)
- **Fix:** state both rules in the design: every page handles 401 and 403 from its own `serverFetch` call, and
  admin endpoints answer 404 to anyone who is not a platform admin.

### M2. `POST /api/v1/me/context`: keep the membership check, and replace the CSRF check that server actions gave

- **Where:** design "Workspace switch". Code: `app/(shell)/actions/shell-context.ts:22-56`.
- **What goes wrong:** the server action checks `requireWorkspaceMember` / `requireBrandAccess` before setting the
  cookies. Server actions also get Next's built-in Origin vs Host check. A route handler gets neither for free, and
  no `/api/v1` route checks Origin today (grep for `origin|csrf|sec-fetch` in `server/api`, `server/auth` and
  `app/api` finds nothing). The impact is small. `loadShellContext` (`server/shell/load-shell-context.ts:23,42`)
  ignores cookie ids the user can't access, and `SameSite=Lax` on the session cookie blocks cross-site POSTs. A
  same-site page (any future sibling subdomain) could still switch a victim's workspace.
- **Fix:** the design says the endpoint calls the same two access checks, accepts only `POST` with
  `Content-Type: application/json`, and rejects a request whose `Origin` header doesn't match `AUTH_URL`'s origin.
  It sets the cookies with `secure: true` in production. The current cookies (`shell-context.ts:28-33`,
  `app/api/v1/auth/invitations/accept/route.ts:17`) have no `secure` flag. Fix both while moving them.

### M3. `serverFetch`: path parameters, caching, destination

- **Where:** design "Pages that read the database today" (`serverFetch(path, init)`).
- **What goes wrong:** pages build paths from route params such as `/admin/workspaces/[workspaceId]`. Next decodes
  params, so a link like `/admin/workspaces/..%2F..%2Fintegrations%2Fmeta%2Fcallback%3Fx=` produces a path with
  `../`. `new URL()` normalises that, and the website then makes a GET to a different Server route **with the
  victim's cookies** (a confused deputy). Separately, if anyone ever adds `cache: "force-cache"` or
  `next: { revalidate }` to a call that forwards cookies, one user's response could be cached for another.
- **Fix:** `serverFetch` takes the path as a template where every dynamic segment goes through
  `encodeURIComponent`. It rejects any path that isn't `/api/v1/...` after normalising. It always sets
  `cache: "no-store"` and only ever sends to `SERVER_URL`.

### M4. `AUTH_URL` must be required on the Server

- **Where:** design "Traffic" (Server env). Code: `auth.config.ts:41` (`trustHost: true`) and @auth/core
  `lib/utils/env.js:66-87`.
- **What goes wrong:** when `AUTH_URL` is set, Auth.js rewrites every request URL to it. That keeps cookie names
  (`__Secure-…`, chosen from the URL's protocol) the same for ALB calls and for `serverFetch` calls over plain HTTP
  inside the VPC. If it is missing, Auth.js falls back to `x-forwarded-host` / `x-forwarded-proto`, which the client
  controls. Then `serverFetch` calls, which have no `x-forwarded-proto`, look for `authjs.session-token` and treat
  everyone as signed out, and callback URLs are built from a host header an attacker chose. `appUrl()`
  (`server/auth/tokens.ts:11-18`) already throws without it, but only on first use.
- **Fix:** the Server checks at startup that `AUTH_URL` is set and starts with `https://` in production, and
  refuses to start otherwise. `serverFetch` does not forward `x-forwarded-host` / `x-forwarded-proto`.

### M5. HTTPS everywhere at the load balancer

- **Where:** design "Running on EC2".
- **What goes wrong:** with an `https` `AUTH_URL`, the session, PKCE, state and nonce cookies are `__Secure-`, and
  the CSRF cookie is `__Host-` (`@auth/core/lib/utils/cookie.js:45-69`). Browsers don't set or send these over
  HTTP. If the port 80 listener forwards `/api/*` instead of redirecting, sign-in fails in confusing ways, and
  anything sent there goes in clear.
- **Fix:** the EC2 guide says the port 80 listener has a single rule that redirects to HTTPS for every path. Only
  the 443 listener holds the `/api/*` and default rules.

### M6. `/api/v1/jobs/run` and the health check are public through `/api/*`

- **Where:** design "Running on EC2" and "Architecture document" (`/api/v1/jobs/run` "stays … (`CRON_SECRET`)").
  Code: `app/api/v1/jobs/run/route.ts:7-13`, which uses a constant-time compare and refuses when unset (good).
- **What goes wrong:** the worker replaces the cron, so a shared secret now guards a public endpoint that nothing
  needs. The new `GET /api/v1/health` "database reachable" is also public. If it echoes the Prisma error, it leaks
  the database host.
- **Fix:** leave `CRON_SECRET` unset in production unless an external trigger is really used (the route then
  always answers 401). Alternatively, add an ALB rule that blocks `/api/v1/jobs/*` from outside. The health
  endpoint returns only `200 {ok:true}` or `503` with no detail.

### M7. Secrets in URLs end up in load balancer and nginx access logs

- **Where:** design "Running on EC2" (nothing about logs). Code: `server/reels/render.ts:204` (Higgsfield webhook
  carries its secret as `?s=`) and OAuth callbacks (`?code=&state=`).
- **What goes wrong:** Vercel handled logging before. If ALB access logs (to S3) or nginx access logs are turned
  on, they now store per-render webhook secrets and single-use OAuth codes in full.
- **Fix:** the EC2 guide says that access logs, if enabled, live in a bucket with restricted access and a short
  retention, or nginx logs `$uri` without the query string for `/api/v1/webhooks/*` and
  `/api/v1/integrations/*/callback`.

### M8. Design facts to correct so the deployment guide isn't built on them

- The design lists "incoming webhooks (Higgsfield, ElevenLabs, Shopify and others)". Only
  `app/api/v1/webhooks/higgsfield/[renderId]` exists. Document the routes that actually exist, so nobody opens
  ALB rules or security notes for routes that aren't there.
- Not security, but found on the way: today the Auth.js middleware re-issues the rolling session cookie on every
  page load (`next-auth/lib/index.js:182-184`). Once middleware only checks that a cookie is present, nothing rolls
  it, so active users are signed out 7 days after sign-in (`auth.config.ts:9`). Passing this to the correctness
  lens.
