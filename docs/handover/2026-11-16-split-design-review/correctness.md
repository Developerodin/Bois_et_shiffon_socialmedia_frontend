# Split design review: correctness and behaviour

Design: `docs/superpowers/specs/2026-11-16-server-web-split-design.md`. Code read on `desktop-shell` at c17339d.
Paths below are under `apps/web/` unless they say otherwise.

**Verdict: the approach is sound (one origin, Auth.js on the Server, cookies unchanged), but if it is built exactly as written, Google sign-in disappears from the website, and several smaller gaps change how sign-in, switching and admin pages behave. Fix 1 Critical and 7 Important points in the design before building.**

Counts: Critical 1, Important 7, Minor 9.

---

## Critical

### C1. The Google button disappears from the login page, so new people can't sign up
- **Where:** design "Goals" (no provider keys in the Web Frontend), "Sign-in"; `app/login/page.tsx:22`.
- **What breaks:** the login page decides whether to show "Continue with Google" with
  `Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)`. The design keeps the Web Frontend free of
  provider keys, so this is `false` on the website. The button and the "or with email" divider go, and the subtitle
  switches to "Use the email and password from your invitation."
- **Scenario:** a new customer opens `/login`. The page says "New here? Continue with Google" only when Google is enabled,
  and Google is the only way to create an account on the web (`google-signup.ts`). With no button, they have no way to sign up.
- **Fix to put in the design:** the login page asks the Server whether Google is on. `GET /api/auth/providers` (Auth.js
  already serves it, and `next-auth/react`'s `signIn` already calls it) lists `google` only when it is configured.
  Alternatively, use a non-secret `NEXT_PUBLIC_GOOGLE_SIGNIN=1` flag on the website. Name the choice in the design.

---

## Important

### I1. The login page's other server-side work has no planned replacement
- **Where:** design "Sign-in"; `app/login/page.tsx:52-58, 117-139`.
- **What breaks:** besides `signIn()`, the page (a) calls `auth()` to send someone who is already signed in straight to
  `next`, and (b) after a failed sign-in, sets an httpOnly `login_email` cookie in a server action so the email field is
  filled in again. The design only replaces `signIn()`.
- **Scenario:** a signed-in person follows a `/login?next=/products` link. Today they land on `/products`. After the
  split, with nothing in place of `auth()`, they see the sign-in form again.
- **Fix:** the login page calls `serverFetch("/api/auth/session")` (or `/api/v1/me`) and redirects when it gets a user.
  Skip this check when `?expired` is set, as today. With a client-side `signIn`, the failed attempt stays on the page,
  so the email field keeps its value; drop the `login_email` cookie and say so.

### I2. The error messages change unless the client maps Auth.js's results by hand
- **Where:** design "Sign-in" ("existing error messages … keep their wording"); `app/login/page.tsx:10-20, 124-133`;
  `node_modules/next-auth/react.js` `signIn`.
- **What breaks:** today the server action catches the error and turns it into `invalid`, `rate_limited` or
  `unavailable`. With `next-auth/react`:
  - With `redirect: true` (the default), a failed credentials sign-in sends the browser to
    `/login?error=CredentialsSignin&code=…`. `ERRORS` has no `CredentialsSignin` key, so "too many attempts" shows as
    "Email or password is incorrect."
  - With `redirect: false`, a database outage inside `authorize` comes back as `error: "Configuration"`, which `ERRORS`
    maps to "Google sign-in isn't set up correctly." That replaces today's "We couldn't check your sign-in just now."
- **Scenario:** someone gets their password wrong six times. Today they see "Too many sign-in attempts. Wait 15
  minutes." After the split they see "Email or password is incorrect." and keep trying.
- **Fix:** specify `signIn("credentials", { redirect: false, … })` and this mapping:
  - `error === "CredentialsSignin"` with `code === "rate_limited"` → `rate_limited`
  - any other `CredentialsSignin` → `invalid`
  - any other error, or a failed request → `unavailable`
  - otherwise go to `next` with `window.location.assign`

  `PendingButton` (`components/auth/pending-button.tsx:13`) uses `useFormStatus`, which only works with form actions.
  The client form needs its own pending state.

### I3. Switching business or workspace stops refreshing the screen
- **Where:** design "Workspace switch"; `app/(shell)/actions/shell-context.ts:34,56` (`revalidatePath("/", "layout")`);
  `components/shell/brand-switcher.tsx:85-89`; `components/shell/workspace-switcher.tsx:24-27`.
- **What breaks:** the brand and workspace switchers call the server action and do nothing else. The re-render comes
  from the action's `revalidatePath`, which refreshes the RSC tree in the same round trip. A `fetch` POST to
  `/api/v1/me/context` sets the cookies but does not re-render anything.
- **Scenario:** someone picks another business from the sidebar. The cookie changes, but the page, sidebar and Espanda
  panel keep showing the old business until a manual reload. Their next action then goes to whichever brand the page
  still holds.
- **Fix:** the design says every caller of the context endpoint calls `router.refresh()` after it succeeds:
  `brand-switcher`, `workspace-switcher`, `new-brand-dialog` (already does), `welcome-flow` (navigates, fine), and the
  welcome page's "Open <workspace>" button. That button is a bound server action ending in `redirect("/")`, so it
  becomes a client button. The endpoint keeps both of today's modes:
  - workspace only: set the workspace cookie and delete the brand cookie, after `requireWorkspaceMember`
  - workspace and brand: set both, after `requireBrandAccess({ allowArchived: true })`

### I4. `/api/v1/me/shell` as listed lacks what the shell renders
- **Where:** design "Shell context"; `app/(shell)/layout.tsx:39-46`, `app/(shell)/page.tsx:36-43`,
  `app/(shell)/connections/page.tsx:40`, `app/(shell)/products/page.tsx:29`.
- **What breaks:**
  1. The sidebar and the home page render the person's name, email and avatar from `session.user`. The design lists
     workspaces, brands, active ids, role label, permissions and `isPlatformAdmin`, but no user.
  2. "Permissions" is two different sets today: workspace-level permissions (`brand.create`, in the layout, welcome and
     connections empty state) and brand-scoped permissions for the active brand (`brand.read` on connections and
     products, `effectivePermissions(ws, user, brandId)`). One undifferentiated list gets one of the gates wrong.
- **Scenario:** a member whose role grants `brand.read` only on some brands opens Products. Workspace permissions say
  yes and the brand says no, or the reverse. They either see a lock screen they shouldn't, or the page loads and its API
  calls return 403.
- **Fix:** define the response as `{ user: {id, name, email, image}, workspaces, brands, activeWorkspaceId,
  activeBrandId, roleLabel, isPlatformAdmin, workspacePermissions, brandPermissions }`, with `brandPermissions` for the
  active brand only. Note the `user` change: today `session.user` comes from the JWT, so a name changed after sign-in
  shows only after the next sign-in. A database read shows it at once, which is fine but is a change.

### I5. Two admin components that read the database are not in the plan
- **Where:** design "Pages that read the database today" (counts only files under `app/`);
  `components/admin/logs-view.tsx:4-5,28-32`, `components/admin/spend-view.tsx:4-5,13`.
- **What breaks:** `LogsView` and `SpendView` are async server components. They call `platformLogs`, `peopleMatching`,
  `pickerOptions`, `spendBreakdown` and `usdInrRate` directly, and four admin pages render them (`admin/logs`,
  `admin/spend`, and the workspace `logs` and `spend` tabs). The design treats `components/` only as "stop importing
  runtime server code" (step 1). These two files are not about shared helpers: their data needs endpoints.
- **Scenario:** the builder switches the 17 admin page files to `/api/v1/admin/*`, but the logs and spend pages still
  import Prisma through these components. The website build then pulls in the Prisma client (anti-goal), or fails the
  lint rule.
- **Fix:** add them to the admin list. Each needs an endpoint (logs: kind, status, tests, days, before, ws, who and
  workspaceId, returning rows, total, next cursor and picker options; spend: days, tests and workspaceId), with the
  INR rate included in the response, because `usdInrRate` reads `USD_INR` and fetches an outside API, so it is not pure.
  `NO_WORKSPACE`, `LOG_FILTERS`, `PAGE` and `parseCursor` are used to render or to read the URL, so they move to
  `@espanda/shared` or into the website.

### I6. Sessions stop rolling: everyone is signed out 7 days after signing in
- **Where:** design "Sign-in" (website middleware becomes a cookie-presence check) and "Repo layout" (Server file
  list does not mention `middleware.ts`); `middleware.ts`, `auth.config.ts:9-11`;
  `node_modules/next-auth/lib/index.js:54-61` (RSC `auth()` never sets cookies).
- **What breaks:** the session is a 7-day rolling JWT. Today the only thing that rolls it is the middleware
  (`NextAuth(authConfig).auth`), which re-issues the cookie on every page and every `/api/v1` request (its matcher
  excludes only `api/auth`). `auth()` in server components and route handlers reads the session but never writes the
  cookie. If the website's middleware only checks the cookie is there, and the Server keeps no middleware, nothing
  rolls the cookie.
- **Scenario:** someone signs in on Monday and uses the app every day. Next Monday, partway through their work, their
  next API call returns 401 and they are sent to `/login?expired=1`. Today they would stay signed in while active.
  This is the anti-goal "sessions lost".
- **Fix:** state that `middleware.ts` stays on the Server with a matcher of `/api/v1/:path*`. Browser API calls pass
  through the load balancer, so the refreshed `Set-Cookie` reaches the website's origin. Note that SSR `serverFetch`
  responses also carry it, and those are dropped, which is harmless. The other option is to have the website
  middleware forward to `/api/auth/session` and relay the `Set-Cookie`, which is heavier.

### I7. Long requests fail after 30 s in local development; client-IP rate limiting is weaker on AWS than the design says
- **Where:** design "Repo layout" (dev rewrite to `:3101`), "Running on EC2" ("login rate limiting keeps working");
  `node_modules/next/dist/server/lib/router-utils/proxy-request.js:37`; `server/auth/rate-limit.ts:32-35`.
- **What breaks:**
  1. **Dev:** Next's rewrite proxy times out after `proxyTimeout || 30000` ms. Every browser call on `:3100` that takes
     longer fails: streaming chat, agent runs, audits, the 30–60 s reel plan and uploads. That includes the
     Playwright e2e run, which uses `:3100`. In production the load balancer handles this instead.
  2. **AWS:** `clientIp` takes the *first* `x-forwarded-for` entry. Vercel overwrote that header with the real client
     IP. An ALB, or nginx with `$proxy_add_x_forwarded_for`, *appends* to whatever the client sent. The first entry is
     then whatever the caller wrote, so per-IP limits (login, `mobile-code:ip`, `mobile-sms:ip`, `mobile-register:ip`)
     can be bypassed by changing a header. The design's claim does not hold.
- **Scenario:** in dev, a 45 s agent run from the website returns a proxy error at 30 s while the Server keeps working.
  On AWS, a script tries passwords for many accounts with a new fake `X-Forwarded-For` on each request and never hits
  the per-IP login limit.
- **Fix:**
  1. Set `experimental: { proxyTimeout: 330_000 }` in the website's `next.config`.
  2. Say how the Server finds the client IP behind the ALB: the rightmost entry, or a configured number of trusted
     hops. On a single box, nginx `set_real_ip_from` plus `real_ip_header`, and nginx overwrites `X-Forwarded-For`.
  3. `serverFetch` forwards one value it trusts.

  The security lens should confirm the second point.

---

## Minor

### M1. The website middleware has to recognise the production cookie names and leave `/api` alone
`auth.config.ts` sets `trustHost` and `AUTH_URL` is https in production, so Auth.js names the cookie
`__Secure-authjs.session-token`. A large JWT is split into `.0`, `.1` and so on. A presence check that looks only for
`authjs.session-token` sends every production visitor to `/login` in a loop.

Also, `/api/*` must be left out of the website middleware's matcher. When middleware runs, Next copies at most 10 MB
of the request body (`middlewareClientMaxBodySize`, `node_modules/next/dist/server/config-shared.js:219`). Uploads that
go through the dev rewrite would then be cut short.

The design should name the four public paths the middleware leaves alone (`/login`, `/invite/`, `/forgot-password`,
`/reset-password`) and the static paths (`brand/`, `icon.png`, `favicon.ico`), as `auth.config.ts:17-19` and the
current matcher do.

### M2. "Redirect to login on a 401" needs the 503 case too
When the database can't verify the session, the Server answers 503 (`server/api/http-error.ts:29-31`). Today pages show
their error page in this case (`auth.ts` `SessionUnverifiedError`), not a page that looks like being signed out. The
same applies when the Server can't be reached at all. `serverFetch` should treat 401 as "go to login" and anything else
non-OK as an error (throw, so `app/error.tsx` shows).

### M3. Admin pages hide themselves with a 404; the new endpoints answer 403
`requirePlatformAdminPage` (`server/auth/platform-admin.ts:31-36`) calls `notFound()` for anyone who is not a platform
admin, so the console's existence isn't revealed. The API guard `platformAdmin()` returns 403 and also says "Only
platform admins can change AI models." The admin pages must turn a 403 into `notFound()`. The new endpoints need a
neutral detail message.

### M4. A workspace's admin "page viewed" is recorded in a layout
The write in `admin/workspaces/[workspaceId]/layout.tsx:20` runs once when the layout renders, not on every tab. If the
builder moves it into each tab's data endpoint, every tab click logs a view, and the activity counts change. Put it in
an endpoint the layout calls, as today. `people/[userId]/page.tsx:18` is a page, so one call per page view.

### M5. The daily sweep should keep its 05:00 UTC slot
The Vercel cron fired at `0 5 * * *` (`vercel.json`). "Once a day" in the worker could run at worker start, or every
24 hours from boot. Both shift when daily agents, plan renewals (`renewDuePlans`) and monthly plans run. The idempotency
key is per UTC day, so nothing runs twice, but the timing customers see changes. Fix: the worker enqueues
`enqueueDailySweep()` on the first poll at or after 05:00 UTC each day.

### M6. A deploy can cut off running jobs
On Vercel, a deploy never stopped an `after()` already running. On EC2, stopping a container ends any job in progress.
The lease expires (`server/jobs/queue.ts:9`, 5 minutes) and the job runs again, which uses up an attempt. A lost publish
becomes `PENDING_VERIFY` (`server/services/publishing.ts:619-627`), which is safe but needs a person to check it.

Fix: on SIGTERM the worker stops claiming jobs and finishes the current one, and the container stop timeout is above
the longest job (over 300 s). The API containers get the same timeout, because `kickRunner`'s `after()` runs jobs
there too.

### M7. The worker is not in a `standalone` image as written
`output: "standalone"` copies only what `next build` traces. `scripts/worker-dev.ts`, `tsx` and the `@/` path aliases
are not in it. Without a separate entry point (compiled with `tsc`/esbuild into the image, or `tsx` and the sources
added), the worker role won't start, and no jobs run except through `after()` and `kickIfDue`. The deployment lens owns
this. It is noted here because the jobs depend on it.

### M8. The design lists webhooks that don't exist
"Incoming webhooks (Higgsfield, ElevenLabs, Shopify and others)": the only webhook route is
`app/api/v1/webhooks/higgsfield/[renderId]`. Its URL is built from `AUTH_URL` (`server/reels/render.ts:202-205`), which
works through the load balancer. Correct the list in the design and `ARCHITECTURE.md`.

### M9. The phone's fallback URL and dev CORS
Moving `apps/mobile/.env.local` to `:3101` is right, because the phone then avoids the 30 s dev proxy limit (I7). But
`apps/mobile/src/api/client.ts:11` still falls back to `http://localhost:3100`, and its comment says "apps/web". On a
machine without `.env.local`, calls go through the website's rewrite and hit the 30 s limit on reel plans and streams.
Update the fallback to `:3101`.

The dev-only CORS block for the Expo web preview (`next.config.ts:15-27`) must stay with the Server's `next.config`. It
does if `next.config.ts` moves with `git mv apps/web apps/server`, and the design should say so.

---

## Checked and fine
- **OAuth callbacks:**
  - `appUrl()` reads `AUTH_URL` (`server/auth/tokens.ts:11-17`). The provider callback redirects with `appUrl`, or to
    `espanda://connect` for the phone (`app/api/v1/integrations/[provider]/callback/route.ts`). No API route builds a
    redirect from `request.url` or the Host header.
  - With `AUTH_URL` set to the website's URL, these work through the load balancer and the dev rewrite.
- **Email links and webhooks:**
  - Invite and reset links (`server/services/accounts.ts:59,242`) and the Higgsfield webhook use `AUTH_URL`.
- **Shell cookies from an API route:**
  - Setting the shell cookies from a route already works today: `app/api/v1/auth/invitations/accept/route.ts:16-20`.
  - `loadShellContext` reads them with `cookies()`, which works on the Server when `serverFetch` forwards the `cookie`
    header.
- **Sign-out:**
  - It already uses `next-auth/react` (`components/workspace/sign-out-item.tsx`), unchanged.
- **The phone:**
  - It calls only `${API_URL}/api/v1…` with a Bearer token, and `/api/v1/me` as its reachability probe. The design
    leaves both alone.
  - Nothing in `apps/mobile/src` builds website URLs from `API_URL`.
- **Jobs:**
  - No job handler calls `kickRunner()`; only routes and `recheckQuality` (called only from a route) do. `after()` is
    therefore never called inside the worker.
  - The worker loop also covers the idle hours that `kickIfDue` couldn't. The `/api/v1/jobs/run` GET also enqueues the
    sweep, so keeping it as a manual trigger is enough.
- **Server code:**
  - Nothing in `server/` depends on Vercel (no `@vercel/*`, `VERCEL_*` or `waitUntil`). Temporary files go to
    `os.tmpdir()`, which works in a container.
- **The design's file count:**
  - The claim of "28 files under `app/`, 17 under `admin/`" matches the code. That count includes `login` and
    `welcome`.
