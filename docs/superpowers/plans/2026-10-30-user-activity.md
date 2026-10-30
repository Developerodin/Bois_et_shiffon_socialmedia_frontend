# User Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Platform admins see, per person and workspace, page visits (web + mobile), actions, agent tasks and spend, on Logs filters and a new Activity page.

**Architecture:** One new ledger table (`PageView`) plus a nullable `userId` on `AiWorkflowRun`. Recording is one POST route fed by a tiny web client component and the mobile root layout. Reading is plain Prisma queries in a new `server/services/activity.ts`, rendered by server components in the existing console style.

**Tech Stack:** Next.js 15 (app router, server components), Prisma + Neon Postgres, Vitest (prisma mocked with `vi.mock`), Expo Router (mobile).

**Spec:** `docs/superpowers/specs/2026-10-29-user-activity-design.md` (approved 2026-10-30)

All paths are relative to `apps/web` unless they start with `apps/mobile`.

## Global Constraints

- Platform admins only: every page calls `requirePlatformAdminPage()`.
- Chat text, prompts and answers are never stored or shown.
- `PageView` and the new columns have no foreign keys (ledger rule).
- Page visits are kept forever; no retention job.
- Page-view route always answers `204`; failures are logged with `console.error`, never surfaced.
- Rate limit: `hitRateLimit(\`pv:${userId}\`, 120, 60_000)`; over the limit is dropped silently.
- Paths: start with `/`, ≤ 300 chars after `?`/`#` is stripped; `/admin`, `/api`, `/invite` (and anything under them) not recorded.
- Lists and timelines: 50 per page (`PAGE` from `server/services/platform-admin.ts`), newest first, plain-`<a>` Newer/Older (`Pager`).
- Money via `Money` with `usdInrRate()`; tables via `Table`; filters as plain GET links/forms (`withQuery`).
- Commit messages: describe the change and why. No co-author, session URL or test mentions (CLAUDE.md §0).

## Decisions this plan adds to the spec

- **Indexes lead with the person, not the workspace.** The list's five all-time `GROUP BY`s scan whole tables whatever the index, so the spec's `[workspaceId, userId]` indexes buy little. What needs an index is the per-person timeline and spend: `AiWorkflowRun [userId, createdAt]`, `ApiCall [userId, createdAt]`, `AgentRun [triggeredByUserId, createdAt]`, plus the spec's two `PageView` indexes.
- **Person picker** lists the chosen workspace's current members, plus the selected person if they've left (so the filter still reads right). `ponytail:` add everyone with rows in that workspace if admins ask for it.
- **Workspace picker** lists every workspace by name. `ponytail:` a `<select>` of all workspaces is fine into the low thousands; switch to the `SearchBox` pattern past that.
- **Pickers are one GET `<form>`** with two `<select>`s and a Show button: no JavaScript, every view has its own URL.
- Engine passes `run.triggeredByUserId` (the same value as `input.userId`, already loaded where the AI context is built).

## Review Focus

1. **A visit with a workspace the sender isn't in** → stored with no workspace and no project (Task 2 test `drops a workspace the user isn't in`).
2. **A project id from another workspace** → project dropped, workspace kept (Task 2 test `drops a project outside the workspace`).
3. **Paths carrying secrets or search text** (`/chat?q=my plan`, `/invite/abc`, `//evil.com`, 301 chars) → query stripped / not recorded / rejected (Task 2 `cleanPagePath` tests).
4. **Timeline rows with identical timestamps across a page boundary** → none skipped or repeated (Task 6 test `ties across pages`).
5. **Person with activity only outside any workspace** (admin's own audit rows, mobile visits from multi-workspace accounts) → listed with workspace "—", not dropped (Task 5 test `keeps rows with no workspace`).

---

### Task 1: Who caused each AI call

**Files:**
- Modify: `prisma/schema.prisma` (`AiWorkflowRun`, `ApiCall`, `AgentRun`, new `PageView`)
- Create: `prisma/migrations/20261030090000_user_activity/migration.sql` (generated, then edited)
- Modify: `server/ai/provider.ts:14-20` (`AiCallContext`), `:259-295` (`logRun`)
- Modify: `server/agents/engine.ts:186-192`
- Modify: `app/api/v1/workspaces/[workspaceId]/brands/[brandId]/chat/route.ts:95`
- Test: `tests/ai-call-user.test.ts`

**Interfaces:**
- Produces: `AiCallContext.userId?: string`; `AiWorkflowRun.userId String?`; `PageView` model:
  `id String @id @default(cuid())`, `userId String`, `workspaceId String?`, `brandId String?`, `platform String` (`web` | `mobile`), `path String`, `createdAt DateTime @default(now())`, `@@index([workspaceId, userId, createdAt])`, `@@index([userId, createdAt])`.

- [ ] **Step 1: Write the failing test** — mock `@/server/db/prisma` (`aiWorkflowRun.create`) and `@/server/ai/model-config` (`modelConfig` → `{}`), call `logRun({ workspaceId: "w", brandId: "b", workflowId: "chat.turn", promptVersion: "1", userId: "u1" }, "openai", "light", "m", "SUCCEEDED", Date.now())`, and assert `create.mock.calls[0][0].data.userId === "u1"`. A second case without `userId` asserts `data.userId` is `undefined`.
- [ ] **Step 2: Run** `npx vitest run tests/ai-call-user.test.ts` → FAIL (`userId` undefined / type error).
- [ ] **Step 3: Schema.** Add `userId String?` to `AiWorkflowRun` with a `///` comment ("who caused it: the chat user or the agent run's starter; null = system"), the three person-first indexes from Decisions, and the `PageView` model (comment: one row per page opened, web or mobile; no FKs; kept forever).
- [ ] **Step 4: Migration.** `npx prisma migrate dev --create-only --name user_activity`, rename the folder to `20261030090000_user_activity` if the timestamp differs, then append:
  ```sql
  -- Credit agent spend from before this column existed to whoever started the run.
  UPDATE "AiWorkflowRun" w SET "userId" = r."triggeredByUserId"
  FROM "AgentRun" r WHERE r.id = w."agentRunId" AND w."userId" IS NULL;
  ```
  Then `npx prisma migrate dev` (applies it and regenerates the client).
- [ ] **Step 5: Code.** `AiCallContext` gets `userId?: string`; `logRun` writes `userId: ctx.userId`. Engine passes `userId: run.triggeredByUserId ?? undefined`. Chat route's `ctx` gets `userId: scope.userId`.
- [ ] **Step 6: Run** the test → PASS; `npm run typecheck` → clean.
- [ ] **Step 7: Commit** — "Record who caused each AI call, and add the page-visit table".

### Task 2: Recording page visits (server)

**Files:**
- Create: `server/services/activity.ts`
- Create: `app/api/v1/activity/page-views/route.ts`
- Test: `tests/page-views.test.ts`

**Interfaces:**
- Produces:
  - `cleanPagePath(raw: unknown): string | null`
  - `recordPageView(input: { userId: string; platform: "web" | "mobile"; path: string; workspaceId?: string; brandId?: string }): Promise<void>` — resolves workspace/project and writes the row (caller has already cleaned the path and rate-limited).
  - `POST /api/v1/activity/page-views`, body `{ path, platform, workspaceId?, brandId? }` → always `204`.

- [ ] **Step 1: Write the failing tests** (prisma mocked: `workspaceMember.findUnique`, `workspaceMember.findMany`, `brand.findFirst`, `pageView.create`; `@/server/auth/request-user` and `@/server/auth/rate-limit` mocked):
  - `cleanPagePath`: `"/chat?q=secret#x"` → `"/chat"`; `"/admin"`, `"/admin/logs"`, `"/api/v1/me"`, `"/invite/tok"` → `null`; `"/administrators"` → `"/administrators"`; `"chat"`, `"//evil.com"`, `42`, `"/" + "a".repeat(300)` → `null`; `"/" + "a".repeat(299)` → kept.
  - `recordPageView`: member + brand in workspace → `create` data has both ids; `drops a workspace the user isn't in` (findUnique → null) → `workspaceId: null, brandId: null`; `drops a project outside the workspace` (brand.findFirst → null) → workspace kept, `brandId: null`; no workspaceId and exactly one membership → that workspace; two memberships → `workspaceId: null`.
  - Route: no user → 204, no `create`; rate limit `{ allowed: false }` → 204, no `create`; bad JSON body → 204; `platform: "tv"` → 204, no `create`; `create` throwing → still 204.
- [ ] **Step 2: Run** `npx vitest run tests/page-views.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `cleanPagePath` and `recordPageView` in `server/services/activity.ts`. Prefix match is per segment: `p === x || p.startsWith(x + "/")`. Membership via `workspaceMember.findUnique({ where: { workspaceId_userId } })`; project via `brand.findFirst({ where: { id: brandId, workspaceId } })`; with no workspace sent, `workspaceMember.findMany({ where: { userId }, select: { workspaceId: true }, take: 2 })` and use it only if length is 1.
- [ ] **Step 4: Implement the route**: `requestUserId` → `request.json().catch(() => null)` → `cleanPagePath` + platform check → `hitRateLimit` → `recordPageView`; the whole body in `try/catch` logging `console.error("page view", e)`; return `new Response(null, { status: 204 })` on every path.
- [ ] **Step 5: Run** the tests → PASS.
- [ ] **Step 6: Commit** — "Record page visits from the web and mobile apps".

### Task 3: Sending visits from web and mobile

**Files:**
- Create: `components/page-view-tracker.tsx` (client)
- Modify: `app/(shell)/layout.tsx` (render it with `workspaceId={shell.activeWorkspaceId}` `brandId={shell.activeBrandId}`)
- Modify: `apps/mobile/src/api/endpoints.ts` (add `recordPageView`)
- Modify: `apps/mobile/src/app/_layout.tsx`

**Interfaces:**
- Consumes: the Task 2 route.
- Produces: `PageViewTracker({ workspaceId, brandId }: { workspaceId: string | null; brandId: string | null })` → renders `null`; mobile `recordPageView(path: string): Promise<unknown>`.

- [ ] **Step 1: Web.** On `usePathname()` change, skip if equal to a `useRef` of the last sent path, else `navigator.sendBeacon("/api/v1/activity/page-views", new Blob([JSON.stringify({ path, platform: "web", workspaceId, brandId })], { type: "application/json" }))`. Nulls are omitted from the body.
- [ ] **Step 2: Mobile.** `recordPageView = (path) => api("/activity/page-views", { body: { path, platform: "mobile" } })`. In `RootLayout`, `usePathname()` from expo-router, ref-skip repeats, `void recordPageView(path).catch(() => {})` only when `session.token()` resolves to a token (signed-out screens send nothing).
- [ ] **Step 3: Verify** — with the dev server on :3100 signed in, open `/`, `/chat`, `/chat` again via client nav, then `/admin`. Query: `npx prisma studio` or `node -e` with prisma → `PageView` has rows for `/` and `/chat` (one each per navigation), none for `/admin`. On the Expo app, open two screens → two `mobile` rows. `npm run typecheck` in `apps/web` and `npx tsc --noEmit` in `apps/mobile` → clean.
- [ ] **Step 4: Commit** — "Send page visits from the web shell and the mobile app".

### Task 4: Person filter on every Logs tab, and the pickers

**Files:**
- Modify: `server/services/platform-admin.ts` (`platformLogs`, new `pickerOptions`)
- Create: `components/admin/activity-pickers.tsx`
- Modify: `components/admin/logs-view.tsx`, `app/(shell)/admin/logs/page.tsx`
- Test: `tests/platform-logs-filter.test.ts`

**Interfaces:**
- Produces:
  - `platformLogs` honours `actorId` on every kind: audit `actorUserId`; runs `triggeredByUserId`; events `run: { triggeredByUserId }`; calls `userId` (and the calls row's `userId` becomes `c.userId`).
  - `pickerOptions(workspaceId?: string, userId?: string): Promise<{ workspaces: { id: string; name: string }[]; people: { id: string; label: string }[] }>` — people empty without a workspace.
  - `ActivityPickers({ ws, user, options, hidden }: { ws?: string; user?: string; options: Awaited<ReturnType<typeof pickerOptions>>; hidden?: Record<string, string | undefined> })` — GET form, fields `ws` and `user`, the person `<select>` only when `ws` is set; `hidden` carries the other query values (e.g. `log`).
  - `LogsView` query type gains `ws?`, `user?`; when `workspaceId` prop is absent it uses `query.ws` as the workspace and `query.user` as `actorId`, and keeps both in `current`.

- [ ] **Step 1: Write the failing test** — mock the four `findMany`s plus `user/brand/workspace.findMany` → `[]`; for each kind call `platformLogs({ kind, actorId: "u1" })` and assert the `where` passed matches: audit `{ actorUserId: "u1" }`, runs `{ triggeredByUserId: "u1" }`, events `{ run: { triggeredByUserId: "u1" } }`, calls `{ userId: "u1" }` (use `expect.objectContaining`).
- [ ] **Step 2: Run** → FAIL on runs/events/calls.
- [ ] **Step 3: Implement** the filters, `pickerOptions` (selected person who left: fetch by id and label "(left) email"), `ActivityPickers`, and wire `LogsView` + the logs page `searchParams` type.
- [ ] **Step 4: Run** the test → PASS; typecheck clean.
- [ ] **Step 5: Verify** in the browser as a platform admin: `/admin/logs?ws=<id>&user=<id>` filters each of the four tabs, switching tabs keeps both, and the person `<select>` is hidden until a workspace is picked.
- [ ] **Step 6: Commit** — "Filter every admin log by workspace and person".

### Task 5: Activity list page

**Files:**
- Modify: `server/services/activity.ts` (add `activityList`, `mergeActivityCounts`)
- Create: `app/(shell)/admin/activity/page.tsx`
- Modify: `components/admin/admin-nav.tsx` (item `{ href: "/admin/activity", label: "Activity", icon: Activity }` just before Logs)
- Test: `tests/activity-list.test.ts`

**Interfaces:**
- Produces:
  - `type ActivityCount = { userId: string; workspaceId: string | null; last: Date; visits: number; actions: number; tasks: number; usd: number }`
  - `mergeActivityCounts(sources: { visits; actions; tasks; ai; api }): ActivityCount[]` — each source is rows of `{ userId, workspaceId, n?, usd?, last }`; merged by key `${workspaceId ?? ""}|${userId}`, sorted by `last` desc. Pure.
  - `activityList({ workspaceId?, userId?, page }): Promise<{ rows: (ActivityCount & { who: string; workspace: string | null })[]; hasMore: boolean }>` — five `groupBy` calls (`pageView` by `[workspaceId, userId]`, `auditEvent` by `[workspaceId, actorUserId]`, `agentRun` by `[workspaceId, triggeredByUserId]`, `aiWorkflowRun` and `apiCall` by `[workspaceId, userId]` with `_sum.costUsd`), all `_max.createdAt`, null users excluded, optional `workspaceId`/user filter in every `where`; then merge, slice `PAGE` (+1 for `hasMore`), and name people/workspaces like `platformLogs` does.

- [ ] **Step 1: Write the failing tests** for `mergeActivityCounts`: the same (person, workspace) from three sources becomes one row with summed fields and the latest `last`; sort is newest `last` first; `keeps rows with no workspace` (`workspaceId: null` row survives, separate from the same person's workspace row); `ai` + `api` usd are added.
- [ ] **Step 2: Run** `npx vitest run tests/activity-list.test.ts` → FAIL.
- [ ] **Step 3: Implement** `mergeActivityCounts`, `activityList`, the page (`PageHeader` "Activity", `ActivityPickers`, `Table` with columns Person (link to `/admin/activity/[userId]?ws=`), Workspace (`—` when null), Last active (`Ago`), Page visits, Actions, Agent tasks, Spend (`Money`); `Pager`), and the nav item. `ponytail:` comment on `activityList` naming the ceiling from the spec (low millions of visits → daily summary table or retention).
- [ ] **Step 4: Run** tests → PASS; typecheck clean; open `/admin/activity` at 390 px and 1280 px.
- [ ] **Step 5: Commit** — "Add the admin Activity list: what each person does in each workspace".

### Task 6: One person's activity

**Files:**
- Modify: `server/services/activity.ts` (add `mergeTimeline`, `personTimeline`, `personSpend`)
- Create: `app/(shell)/admin/activity/[userId]/page.tsx`
- Modify: `app/(shell)/admin/people/[userId]/page.tsx` (link "See their activity" → `/admin/activity/[userId]`)
- Test: `tests/activity-timeline.test.ts`

**Interfaces:**
- Produces:
  - `type TimelineItem = { kind: "visit" | "action" | "task" | "ai"; id: string; at: Date; workspaceId: string | null; brandId: string | null; [k: string]: unknown }`
  - `mergeTimeline(lists: TimelineItem[][], page: number): { items: TimelineItem[]; hasMore: boolean }` — concat, sort by `at` desc then `${kind}:${id}` desc, return `slice((page-1)*PAGE, page*PAGE)` and `hasMore = total > page*PAGE`. Pure.
  - `personTimeline({ userId, workspaceId?, page })` — reads the newest `page * PAGE + 1` of: `pageView` (path, platform), `auditEvent` by `actorUserId` (action, entityType), `agentRun` by `triggeredByUserId` (agentKey, status, plus `usd` from one `aiWorkflowRun.groupBy({ by: ["agentRunId"], _sum: { costUsd } })` over the page's run ids), `aiWorkflowRun` with `userId` and `agentRunId: null` (workflowId, model, status, costUsd — never any text); merges; names projects/workspaces. `ponytail:` comment from the spec (deep pages read more; switch to a `(createdAt, id)` cursor past ~20).
  - `personSpend({ userId, workspaceId? }): Promise<{ aiUsd: number; apiUsd: number }>` — two `aggregate` `_sum.costUsd`.

- [ ] **Step 1: Write the failing tests** for `mergeTimeline`: newest first across sources; page 2 starts where page 1 ended; `ties across pages` — 120 items with the same `at` from two sources, pages 1–3 together contain each id exactly once; `hasMore` false on the last page.
- [ ] **Step 2: Run** `npx vitest run tests/activity-timeline.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three functions and the page: `requirePlatformAdminPage`, `notFound()` for an unknown user, crumbs Activity → name, header link to `/admin/people/[userId]`, `ActivityPickers` limited to the workspace picker (the person is fixed), two `Stat`s with `Money` (AI, other paid APIs), a `Table` (When, What — label pill "Page visit · web/mobile", "Action", "Agent task", "AI call" — Detail, Workspace/Project, Cost), `Pager`.
- [ ] **Step 4: Run** tests → PASS; typecheck clean; open the page for a person with agent runs and chat turns, check an agent's AI calls appear only folded into its task row, and the People page links both ways.
- [ ] **Step 5: Commit** — "Show one person's activity timeline and spend in the admin console".
