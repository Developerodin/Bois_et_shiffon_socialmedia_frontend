# Split design review: separation and simplicity

Design reviewed: `docs/superpowers/specs/2026-11-16-server-web-split-design.md`, checked against `apps/web` on
`desktop-shell` (c17339d).

**Verdict:** the split is the right shape and the size is about right. But the list of what crosses the boundary is
incomplete in both directions: the Server imports website code today, the shared-package list misses helpers and
types the website needs, and some web-side tests and scripts have no home. These gaps have to be closed in the design
before step 1, or the builder will fill them in their own way.

Counts: Critical 0, Important 8, Minor 9.

---

## Important

### I1. The Server imports website `lib/` code today, and the design moves `lib/` to the website

- Where: "Repo layout and tooling" (Web Frontend gets `lib/` (browser-safe)); "Shared code" list.
- Problem: the dependency runs from Server to website too, and the design covers only half of it.
  - `lib/website.ts` (`normalizeWebsite`, `safeHttpUrl`, `domainOf`, `brandNameFromWebsite`) is imported by
    `server/services/publishing.ts:8`, `server/agents/definitions/scout.ts:8`, `server/agents/definitions/competitors.ts:6`,
    `app/api/v1/workspaces/[workspaceId]/brands/[brandId]/competitors/route.ts:6`, and on the website by
    `app/welcome/page.tsx:10`, `components/welcome/welcome-flow.tsx`, `components/workspace/{competitors-panel,content-panels,release-panel,workspace}.tsx`.
    The shared list doesn't mention it.
  - `lib/shell-cookies.ts` is imported by `server/shell/load-shell-context.ts:5` and
    `app/api/v1/auth/invitations/accept/route.ts:3`. The design covers this one ("the shell cookie names").
- Fix: add `lib/website.ts` to `packages/shared` by name. Say outright that the Server imports nothing from
  `lib/` or `components/`. Give the Server the same boundary lint rule as the website (see I3).

### I2. Several shared helpers live in files that import Prisma, and the design doesn't say to extract them

- Where: "Shared code" (`zoneCity`/`offerPercents`, the product-name helpers).
- Problem: these helpers live in `server/content/offer-checks.ts` and `server/content/product-checks.ts`. Both
  files import `@prisma/client` types and `zod` (`offer-checks.ts:1-3`, `product-checks.ts:1-2`). The helpers'
  own signatures use Prisma-derived types: `groupKey(row: Pick<ProductRow, …>)` and `byExternalId` take
  `ProductRow = Pick<Product, …>`. Moving the files, or re-exporting from them, would bring Prisma into the shared
  package. Two other modules are clean and can move whole: `server/stories/by-hand-steps.ts` (its header already
  says "No server imports") and `server/auth/permissions.catalog.ts`.
- Fix: list the exact symbols to extract: `zoneCity`, `offerPercents`, `productName`, `REMOVED_PRODUCT_NAME`,
  `groupKey`, `byExternalId`. In shared, write their parameter types structurally, e.g.
  `{ id: string; source: string; url: string | null }`, never through Prisma. The server files then import them
  from shared. Add a rule: `packages/shared/package.json` has no dependencies, and `@prisma/client`, `zod`,
  `node:*` and `process.env` are banned there by lint.

### I3. The boundary lint rule as worded lets server packages into the website

- Where: "Shared code", last sentence ("forbids importing anything but `@espanda/shared`, its own code and npm
  packages").
- Problem: npm workspaces hoist dependencies to the root `node_modules`. `@prisma/client`, `next-auth`,
  `nodemailer` and the others are all there today. So the website can import them and they resolve, even if
  `apps/web/package.json` doesn't list them, and the rule as written allows it because they are "npm packages". The
  website also legitimately keeps `next-auth` for `next-auth/react` (`components/workspace/sign-out-item.tsx:5`,
  plus the planned client `signIn`). The bare `next-auth` entry, though, is the server half.
- Fix: write the rule as `no-restricted-imports` in `apps/web/eslint.config.mjs`. It bans `@/server/*`, `@/auth*`,
  `@prisma/client`, `prisma`, `next-auth` (allowing `next-auth/react`), `@auth/*`, `@ai-sdk/openai`, `nodemailer`,
  `bcryptjs`, `@aws-sdk/*`, `sharp`, `ffmpeg-static`, `ffprobe-static` and `jose`. Add the mirror rule in
  `apps/server`, which bans `@/components/*` and website `lib/`. Also build the website once with an empty env (no
  `DATABASE_URL`, no `AUTH_SECRET`) as the proof.

### I4. The design names no way to write the response types or keep them in sync, and the obvious one fails

- Where: "Shared code" ("response types for the endpoints the website calls").
- Problem: the website imports five server types today. Three are inferred from functions that run Prisma:
  `SpendBreakdown = Awaited<ReturnType<typeof spendBreakdown>>` (`server/services/platform-admin.ts:332`),
  `LogRow` (`:425`) and `PickerOptions` (`:446`). The other two are `MemberPermissions` (`:144`) and `CatalogSync`
  (`server/catalog/sync.ts:22`, whose file imports Prisma and the job queue). The inferred types can't move to
  shared as they are. They also carry `Date` fields (e.g. `Cursor.at`, `lastCall`), which arrive as strings over
  HTTP. The design also leaves "the endpoints the website calls" open. The website already calls about 16 v1 paths
  and hand-writes 33 types for them in `components/{agents,context,products,settings}/api.ts`.
- Fix: limit shared response types to the new endpoints (`/me/shell`, `/me/context`, `/admin/*`) plus `CatalogSync`.
  Leave the existing hand-written client types where they are, the same rule the design already uses for the phone.
  Write each shared type as its JSON shape (dates as ISO strings). Keep them in sync on the Server: each new route
  returns `Response.json(body satisfies AdminLogsResponse)`, so a change in the service breaks the Server's
  typecheck, not the website at runtime.

### I5. The admin pages need pure helpers and constants the design doesn't place

- Where: "Pages that read the database today" (Platform admin); "Shared code".
- Problem: the admin pages and components import more than the services. They also import query helpers and
  constants from Prisma-importing files:
  - `PAGE`, `pageNumber`, `pageCount`, `parseCursor`, `LOG_FILTERS`, `LogKind` and `WorkspaceSort` from
    `server/services/platform-admin.ts`. Used by `admin/activity/page.tsx:6`, `admin/activity/[userId]/page.tsx:7`,
    `admin/people/page.tsx:4`, `admin/workspaces/page.tsx:5` and `components/admin/logs-view.tsx:4`.
  - `NO_WORKSPACE` and `ActivitySort` from `server/services/activity.ts:107`, which imports Prisma. Used by
    `admin/activity/page.tsx:5`, `admin/activity/[userId]/page.tsx:6` and `components/admin/activity-pickers.tsx:3`.

  None of these is on the shared list.
- Fix: the pages pass their raw `searchParams` (`page`, `before`, `sort`, `log`, `status`, `days`, `ws`, `who`)
  through to the admin endpoints. The Server already parses and validates them. Each response carries what the page
  needs to render: `page`, `pages`, `next` cursor string, and the filter list. Only the sentinel `NO_WORKSPACE` and
  the `LogKind`/`ActivitySort`/`WorkspaceSort` unions go to shared, as part of the admin response and query types.

### I6. The login page needs the Google secret to decide whether to show the Google button

- Where: "Sign-in"; Goals ("no provider keys").
- Problem: `app/login/page.tsx:22` has
  `const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)`. The design
  doesn't say where this comes from once the website has no provider keys. A builder will either put the secret in
  the website env (an anti-goal) or drop the button. The same page also calls `auth()` (`:56`) for the "already
  signed in" redirect.
- Fix: the login page reads Auth.js's own `GET /api/auth/providers` through `serverFetch` (Google is listed only
  when it is configured). It reads `GET /api/auth/session` for the signed-in redirect. Both need no new endpoint and
  no secret.

### I7. The e2e specs moved to the website would run a Server script against the database

- Where: "Repo layout and tooling" (Web Frontend gets `e2e/`).
- Problem: `e2e/stories.spec.ts:16` runs `npx tsx --env-file=.env scripts/seed-story.ts` with
  `cwd: process.cwd()`. That is a Prisma seeding script, which goes to the Server, and it reads `DATABASE_URL` from
  `.env` in the current folder. From `apps/web` the script doesn't exist and the website's `.env` has no database.
  Four specs also import `../lib/shell-cookies` (`campaigns.spec.ts:3`, `product-gate.spec.ts:3`,
  `products.spec.ts:3`, `stories.spec.ts:4`).
- Fix: the spec calls `npm run seed:story -w <server package> -- …`, a new script in the Server's `package.json`, so
  the script runs in the Server's folder and env. The cookie names come from `@espanda/shared`. Say in the design
  that e2e is the one place allowed to drive both apps.

### I8. Recording an admin's workspace visit could move from once per visit to once per tab

- Where: "Platform admin" ("The 'page viewed' writes that use `after()` in two admin pages move into those
  endpoints").
- Problem: `admin/workspaces/[workspaceId]/layout.tsx:20` records the visit in the layout because moving between
  the workspace's six tabs keeps the layout and doesn't record again (its own comment, `:9-11`). The layout reads
  the workspace header with Prisma (`:14-17`). Four of the tabs call `workspaceDetail` (`page.tsx:7`,
  `people/page.tsx:6`, `projects/page.tsx:5`, `roles/page.tsx:5`). If the write moves into the `workspaceDetail`
  endpoint, every tab click writes an audit row.
- Fix: give the layout its own small endpoint (the header: name, owner email, created, the three counts) and
  record the visit there only. `recordPersonView` (`admin/people/[userId]/page.tsx:18`) goes with the person-detail
  endpoint.

---

## Minor

### M1. Story limits in the shared package: the website doesn't use them

- Where: "Shared code" ("story limits and by-hand steps").
- Problem: nothing under `app/` (outside `api/`), `components/` or `lib/` imports `STORY_LIMITS` or
  `server/stories/body.ts` (which imports `@/server/services/publishing`). Only the Server and the phone use them,
  and the phone is out of scope. Meanwhile `components/workspace/draft-editor.tsx:14-16` keeps a hand-copied
  `CAPTION_MAX`/`HASHTAGS_MAX` with the comment "Mirrors server/content/rules.ts". That is a real web-and-server
  duplicate (`server/content/rules.ts:21` `LIMITS`).
- Fix: drop story limits from the list. If anything is added, add `LIMITS` from `rules.ts`, which the website does
  use.

### M2. `PERMISSIONS` doesn't need to go in the shared package

- Where: "Shared code" (`PERMISSIONS` (the catalogue)).
- Problem: on the website it's used only by `components/admin/access.tsx:3` and
  `admin/workspaces/[workspaceId]/roles/page.tsx:4`, both admin views that will get their data from admin
  endpoints. `GET /api/v1/permissions` already returns the whole catalogue with descriptions
  (`app/api/v1/permissions/route.ts`). Moving the catalogue means rewriting 15 Server importers of
  `permissions.catalog`.
- Fix: the admin endpoints return the permission rows they render, or the pages read `/api/v1/permissions`. Keep the
  catalogue on the Server. (Keeping it in shared isn't wrong. It just costs more and isn't needed.)

### M3. `usdInrRate` is not pure, so settle where it goes now

- Where: "Shared code" ("`usdInrRate` if it is pure").
- Problem: checked: `server/usage/fx.ts` reads `process.env.USD_INR`, calls `open.er-api.com`, and keeps a
  module-level cache.
- Fix: replace the "if" with: the admin spend and logs endpoints return `fx` in their response.

### M4. The home page needs no new endpoint

- Where: "Shell context" and "Left to the builder" (home page's direct read).
- Problem: `app/(shell)/page.tsx:22-25` reads the active brand's `displayName` and `profile.websiteUrl`. Both are
  already in `shell.brands` (`server/services/brands.ts` `listAccessibleBrands` selects `displayName` and
  `profile.websiteUrl`), which `/me/shell` returns.
- Fix: the home page takes the active brand from the `/me/shell` response. Remove this item from "Left to the
  builder".

### M5. Admin guards and `/me/shell` would become extra round trips per page

- Where: "Page protection"; "Platform admin".
- Problem: all 17 admin files call `requirePlatformAdminPage()`. The admin layout's comment says "Each page also
  guards itself" (`admin/layout.tsx:4`). Five pages do nothing else: `models`, `logs`, `spend`,
  `workspaces/[id]/logs` and `workspaces/[id]/spend`. Every shell page also calls `loadShellContext` again after
  the layout already did. Turned one-for-one into HTTP calls, that is two or three Server calls per page view.
- Fix: one web helper, `getShell = cache(() => serverFetch("/api/v1/me/shell"))` (React `cache`), shared by the
  layout and the page within one request. The admin layout redirects non-admins using `isPlatformAdmin` from it.
  The pages drop their own guard, because every admin endpoint returns 403 anyway.

### M6. Two admin components query the database themselves and aren't in the count of 28

- Where: "Pages that read the database today" (28 files); "Order of work" step 1.
- Problem: `components/admin/logs-view.tsx` and `components/admin/spend-view.tsx` are async server components that
  call `platformLogs`, `peopleMatching`, `pickerOptions`, `spendBreakdown` and `usdInrRate` directly. They are
  outside `app/`, so the 28 don't include them. Step 1 ("web components stop importing runtime server code") can't
  convert them, because their endpoints arrive in step 2. They are also shared by the platform pages and the
  workspace pages.
- Fix: name them in step 2. Back them with one `GET /api/v1/admin/logs` and one `GET /api/v1/admin/spend`, each with
  an optional `workspaceId`, not one endpoint per page. In general, size `/admin/*` by service function (overview,
  spend, logs, people list, person, workspaces list, workspace header, workspace detail, activity list,
  person timeline): about ten endpoints, not 17.

### M7. Welcome's server action is the workspace switch, not `signIn()`

- Where: "Sign-in" ("The login and welcome pages stop using server actions with `signIn()`").
- Problem: `app/welcome/page.tsx:14-18` has a server action `openWorkspace` that calls `setActiveWorkspace`. It
  doesn't call `signIn`. Four client components also import the server action directly: `components/shell/brand-switcher.tsx:5`,
  `new-brand-dialog.tsx:6`, `workspace-switcher.tsx:3` and `components/welcome/welcome-flow.tsx:7`.
- Fix: list these five callers under "Workspace switch". Each calls `POST /api/v1/me/context` and then
  `router.refresh()` (or navigates to `/`), which replaces the action's `revalidatePath("/", "layout")`.

### M8. Web-side unit tests and scripts have no home

- Where: "Repo layout and tooling" (Server gets `scripts/`, `tests/ (vitest)`; Web Frontend gets only `e2e/`);
  root `test` (server).
- Problem: some files in `tests/` test website code only: `nav.test.ts` (`lib/nav`), `page-view-tracker.test.ts`,
  `panel-layout.test.ts`, `welcome-reading-state.test.ts` (components) and `no-hsl-var.test.ts` (scans `app/`,
  `components/` and `app/globals.css`). Two are mixed: `website.test.ts` (`lib/website` and `lib/agent-message`) and
  `product-checks.test.ts` (server `product-checks` and web `stockLabel` from `components/products/api`).
  `competitor-helpers.test.ts` tests Server code plus `lib/website`, which will be shared. Two scripts are web-side
  too: `scripts/check-net.ts` (tests `lib/net`) and `scripts/audit-ui.ts` (Playwright against `:3100`).
  `scripts/check-catalog.ts:8` imports `stockLabel` from `components/products/api`.
- Fix: the website gets its own `vitest.config.ts` and a `test` script, and these move there. The mixed files are
  split along the same line. Root `test` runs both apps. `check:net` and `audit:ui` go to the website's
  `package.json`. The `stockLabel` assertion moves from `check-catalog.ts` into the web test.

### M9. Names, scripts and wiring are inconsistent or missing

- Where: "What we end up with" table; "Repo layout and tooling".
- Problems:
  - The package names mix styles and don't match their folders. `server` and `mobile-app` are unscoped, the
    shared package is `@espanda/shared`, and the folder `apps/web` holds the package `web-frontend`, while the root
    scripts are called `dev:web` and `build:web`.
  - 38 files tell people to run `npm run … -w web`, and after the split almost all of those mean the Server. That
    includes on-screen text: `app/(shell)/admin/page.tsx:70` and `components/settings/ai-models-tab.tsx:21,97`,
    plus every `scripts/*.ts` header, `docs/ENV_SETUP.md`, `docs/HANDOVER.md` and the root `package.json`.
  - The root scripts drop today's `lint` and `test:e2e`.
  - The root `package.json` workspaces are `["apps/*"]` only, so `packages/shared` won't resolve. It is consumed as
    TypeScript source, so both `next.config.ts` files need `transpilePackages: ["@espanda/shared"]`, and both Docker
    builds need the package in their context.
  - A `docker-compose.yml` already exists at the root. It is a stale "local MongoDB for apps/web" file, and the
    design's new compose file would collide with it.
  - The Server's code lives at `apps/server/server/…`.
- Fix:
  - Use one scheme: `@espanda/server`, `@espanda/web`, `@espanda/mobile`, `@espanda/shared`, with folders as now and
    README titles "Server", "Web Frontend", "Mobile App".
  - Add a step that rewrites every `-w web` that means the Server.
  - Keep `lint` (both apps) and `test:e2e`.
  - Add `"packages/*"` to the workspaces and `transpilePackages`, with no build step for shared.
  - Say the new compose file replaces the root Mongo one.
  - Leave `apps/server/server/` as it is, because renaming it touches every `@/server/…` import. Say so in the
    Server README.
- Related: the website's middleware cookie-presence check needs Auth.js's cookie names (`authjs.session-token`,
  `__Secure-authjs.session-token`, and their chunked `.0` forms). Name them in the design so the check matches in
  dev (http) and production (https).

---

## Where the config files go (checked; no conflicts beyond those above)

| File | Goes to | Note |
|---|---|---|
| `tsconfig.json` | both | Each keeps `@/*` → `./*`, so a stray `@/server/...` in the website fails to resolve. |
| `eslint.config.mjs` | both | Each gets its own boundary rule (I3). |
| `postcss.config.mjs`, `components.json`, `app/globals.css` | website | `components.json` aliases `@/lib/utils` and `@/components`, which are website-only. |
| `playwright.config.ts`, `e2e/` | website | `webServer` becomes two entries (Server `:3101`, website `:3100`); see I7. |
| `vitest.config.ts`, `tests/` | both | Split per M8. |
| `next.config.ts` | both, different | Server: `outputFileTracingIncludes`, `serverExternalPackages`, dev CORS headers. Website: the `/api/:path*` rewrite and `transpilePackages`. |
| `vercel.json` | removed | The cron moves to the worker. |
| `auth.ts`, `auth.config.ts`, `types/next-auth.d.ts`, `prisma/`, `assets/fonts`, `server/email/assets` | Server | `types/` holds only `next-auth.d.ts`. |
| `middleware.ts` | website, rewritten | Today it imports `next-auth` and `@/auth.config` (`middleware.ts:1-2`). |
| `.agents/`, `.claude/`, `.cursor/`, `.devin/` (Prisma skills) | Server | Moved by the first `git mv`. |
| `.env.example`, `.gitignore`, `README.md` | both | |

---

## Appendix: website-side files that import server-only code today, and where the design sends each dependency

"Design" column: **API** = the design replaces it with a Server endpoint; **Shared** = the design lists it for
`packages/shared`; **Missing** = the design doesn't place it (see the finding).

| Website file | Server-only import(s) | Design sends it to | Note |
|---|---|---|---|
| `app/(shell)/layout.tsx` | `@/auth` `auth`; `effectivePermissions`; `isPlatformAdmin`; `loadRoleLabel`; `loadShellContext` | API `/me/shell` | The response must also carry the user's name, email and image (`:41`). |
| `app/(shell)/page.tsx` | `auth`; `isPlatformAdmin`; `prisma`; `loadShellContext` | API `/me/shell` | The Prisma read is already covered by `shell.brands` (M4). |
| `app/(shell)/agents/page.tsx` | `auth`; `loadShellContext` | API `/me/shell` | |
| `app/(shell)/connections/page.tsx` | `auth`; `effectivePermissions`; `loadShellContext` | API `/me/shell` | |
| `app/(shell)/context/page.tsx` | `auth`; `loadShellContext` | API `/me/shell` | |
| `app/(shell)/performance/page.tsx` | `auth`; `loadShellContext` | API `/me/shell` | |
| `app/(shell)/products/page.tsx` | `auth`; `effectivePermissions`; `loadShellContext` | API `/me/shell` | |
| `app/(shell)/settings/page.tsx` | `auth`; `loadShellContext` | API `/me/shell` | |
| `app/welcome/page.tsx` | `auth`; `effectivePermissions`; `loadShellContext`; server action → `setActiveWorkspace` | API `/me/shell` + `/me/context` | The design describes its action as `signIn` (M7). |
| `app/(shell)/actions/shell-context.ts` | `auth`; `requireWorkspaceMember`, `requireBrandAccess`; `next/headers` cookies | API `POST /me/context` | Callers: 4 components + the welcome page (M7). |
| `app/login/page.tsx` | `auth`, `signIn`; `next-auth` `AuthError`, `CredentialsSignin`; `process.env.GOOGLE_CLIENT_ID/SECRET` | `next-auth/react` | The Google secret check is **Missing** (I6). |
| `middleware.ts` | `next-auth` `NextAuth`; `@/auth.config` | cookie-presence check | Cookie names unnamed (M9). |
| `app/(shell)/admin/layout.tsx` | `requirePlatformAdminPage` | API (guard) | Use `/me/shell` `isPlatformAdmin` (M5). |
| `app/(shell)/admin/page.tsx` | guard; `platformOverview`, `platformLogs`, `spendBreakdown`; `usdInrRate` | API `/admin/*` | fx: M3. |
| `app/(shell)/admin/activity/page.tsx` | guard; `activityList`, `NO_WORKSPACE`, `ActivitySort`; `PAGE`, `pageCount`, `pageNumber`, `peopleMatching`, `pickerOptions`; `usdInrRate` | API `/admin/*` | Constants and helpers **Missing** (I5). |
| `app/(shell)/admin/activity/[userId]/page.tsx` | guard; `NO_WORKSPACE`, `personSummary`, `personTimeline`; `PAGE`, `parseCursor`, `pickerOptions`; `usdInrRate` | API `/admin/*` | Constants and helpers **Missing** (I5). |
| `app/(shell)/admin/logs/page.tsx` | guard (data in `logs-view`) | API `/admin/*` | |
| `app/(shell)/admin/models/page.tsx` | guard only | API (guard) | |
| `app/(shell)/admin/people/page.tsx` | guard; `listPeople`, `pageCount`, `pageNumber` | API `/admin/*` | Helpers **Missing** (I5). |
| `app/(shell)/admin/people/[userId]/page.tsx` | guard; `personDetail`, `platformLogs`, `recordPersonView` (`after()`) | API `/admin/*` | |
| `app/(shell)/admin/spend/page.tsx` | guard (data in `spend-view`) | API `/admin/*` | |
| `app/(shell)/admin/workspaces/page.tsx` | guard; `listWorkspaces`, `pageCount`, `pageNumber`, `WorkspaceSort`; `usdInrRate` | API `/admin/*` | Helpers **Missing** (I5). |
| `app/(shell)/admin/workspaces/[workspaceId]/layout.tsx` | guard; `prisma`; `recordWorkspaceView` (`after()`) | API `/admin/*` | Needs its own header endpoint (I8). |
| `app/(shell)/admin/workspaces/[workspaceId]/page.tsx` | guard; `platformLogs`, `spendBreakdown`, `workspaceDetail`; `usdInrRate` | API `/admin/*` | |
| `app/(shell)/admin/workspaces/[workspaceId]/people/page.tsx` | guard; `workspaceDetail` | API `/admin/*` | |
| `app/(shell)/admin/workspaces/[workspaceId]/projects/page.tsx` | guard; `workspaceDetail` | API `/admin/*` | |
| `app/(shell)/admin/workspaces/[workspaceId]/roles/page.tsx` | guard; `PERMISSIONS`; `workspaceDetail` | API + Shared | `PERMISSIONS` not needed in shared (M2). |
| `app/(shell)/admin/workspaces/[workspaceId]/logs/page.tsx` | guard (data in `logs-view`) | API `/admin/*` | |
| `app/(shell)/admin/workspaces/[workspaceId]/spend/page.tsx` | guard (data in `spend-view`) | API `/admin/*` | |
| `components/admin/logs-view.tsx` | `LOG_FILTERS`, `PAGE`, `parseCursor`, `peopleMatching`, `pickerOptions`, `platformLogs`, `LogKind`; `usdInrRate` | **Missing** (not in the 28) | M6, I5. |
| `components/admin/spend-view.tsx` | `spendBreakdown`; `usdInrRate` | **Missing** (not in the 28) | M6. |
| `components/admin/access.tsx` | `PERMISSIONS`; type `MemberPermissions` | Shared | M2; the type goes into the admin response types (I4). |
| `components/admin/activity-pickers.tsx` | `NO_WORKSPACE` (file imports Prisma); type `PickerOptions` (inferred from Prisma) | **Missing** / Shared (types) | I4, I5. |
| `components/admin/log-table.tsx` | types `LogKind`, `LogRow` (inferred from Prisma) | Shared (types) | Can't move as written (I4). |
| `components/admin/spend-tables.tsx` | type `SpendBreakdown` (inferred from Prisma) | Shared (types) | Can't move as written (I4). |
| `components/products/api.ts` | type `CatalogSync` (file imports Prisma, the job queue, `server/services/connections`) | Shared (types) | Copy the type. Don't re-export it. |
| `components/products/campaigns.tsx` | `offerPercents`, `zoneCity` (offer-checks: Prisma + zod); `byExternalId`, `groupKey`, `productName`, `REMOVED_PRODUCT_NAME` (product-checks: Prisma + zod) | Shared | Extract the symbols, not the files (I2). |
| `components/workspace/release-panel.tsx` | `zoneCity`; `BY_HAND_STEPS` (pure file) | Shared | I2 for `zoneCity`. |
| `components/shell/brand-switcher.tsx`, `new-brand-dialog.tsx`, `workspace-switcher.tsx`, `components/welcome/welcome-flow.tsx` | server action `@/app/(shell)/actions/shell-context` | API `POST /me/context` | Callers not listed in the design (M7). |
| `e2e/{campaigns,product-gate,products,stories}.spec.ts` | `../lib/shell-cookies`; `stories.spec.ts` runs `scripts/seed-story.ts` (Prisma) | Shared (cookie names); script **Missing** | I7. |

Reverse direction (Server code importing website code today; not covered by the design's one-way lint rule):

| Server file | Website import | Should go to |
|---|---|---|
| `server/services/publishing.ts:8`, `server/agents/definitions/scout.ts:8`, `server/agents/definitions/competitors.ts:6`, `app/api/v1/.../competitors/route.ts:6` | `@/lib/website` | Shared (I1) |
| `server/shell/load-shell-context.ts:5`, `app/api/v1/auth/invitations/accept/route.ts:3` | `@/lib/shell-cookies` | Shared (already in the design) |
| `scripts/check-catalog.ts:8` | `@/components/products/api` (`stockLabel`) | Move the assertion to a web test (M8) |
| `scripts/check-net.ts:6` | `@/lib/net` | The website's scripts (M8) |
| `tests/nav`, `page-view-tracker`, `panel-layout`, `welcome-reading-state`, `no-hsl-var`, `website`, `product-checks`, `competitor-helpers` | `@/lib/*`, `@/components/*`, `app/` files | The website's tests, or split (M8) |
