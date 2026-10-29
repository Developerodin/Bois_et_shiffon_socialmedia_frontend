# User activity for the platform admin

## Why

The platform admin wants to see what each person does in each workspace:
- the pages they open on the web app and the mobile app;
- the actions they take;
- the agent tasks they start;
- what it all costs.

Today the console keeps a separate log for each of these and can't link them. AI call rows don't record the
person, and nobody records page visits.

Chat text is **not** shown or copied anywhere new. The admin sees spend, not conversations.

## Who sees it

Platform admins only (`requirePlatformAdminPage`), like the rest of `/admin`.

## Goals

1. **Each AI call records who caused it.**
   - Add a nullable `userId` to `AiWorkflowRun`, carried on `AiCallContext` (`server/ai/provider.ts`) and
     written by `logRun`.
   - A chat turn passes the signed-in user.
   - Agent calls pass the run's starter (`input.userId` in `server/agents/engine.ts`). Scheduled or automatic
     runs leave it null, and those show as "System".
   - **Backfill in the migration:** a one-off
     `UPDATE "AiWorkflowRun" SET "userId" = r."triggeredByUserId" FROM "AgentRun" r WHERE r.id = "agentRunId"`.
     This credits agent spend from before launch, so no query needs a join to find the person. Old chat turns
     stay null.
2. **Record page visits** on web and mobile (see below). Keep them forever for now.
3. **Logs page (`/admin/logs`).** Add a workspace picker and a person picker, sent as `?ws=` and `?user=`.
   - Both filter every tab. To do it, extend `platformLogs` (it already takes `workspaceId` and `actorId`), so
     each tab honours `actorId`:
     - Audit: `actorUserId`.
     - Agent runs: `triggeredByUserId`.
     - AI calls: the new `userId`.
     - Agent log: rows whose run has that `triggeredByUserId`. The run filter is a relation filter, so this
       needs no new column.
   - The person picker lists the members of the chosen workspace and appears only once a workspace is picked.
4. **New Activity page (`/admin/activity`),** with its own sidebar item next to Logs.
   - **List:**
     - One row per (person, workspace) that has any activity, most recently active first, 50 per page.
     - Columns: person, workspace, last active, page visits, actions, agent tasks, spend.
     - It has the same two pickers.
   - **One person (`/admin/activity/[userId]`, optional `?ws=`):**
     - **The header shows spend**, as `Money` (USD with rupees), split the same way as the Spend page:
       - AI: `AiWorkflowRun.costUsd` by `userId`;
       - other paid APIs: `ApiCall.costUsd` by `userId`.
     - **Below the header comes the timeline:** newest first, 50 per page, with Older and Newer page links.
     - Rows, each with its own label:
       - page visit (web or mobile);
       - action (audit event);
       - agent task (status, plus cost = the sum of its AI calls);
       - AI call that isn't part of an agent run (in practice chat turns: workflow, model, cost, never text).
     - An agent's own AI calls are folded into its task row, so one run can't fill a page.
     - Links both ways with `/admin/people/[userId]`.

## Page visits

- **New table `PageView`:**
  - columns: `id`, `userId`, `workspaceId?`, `brandId?`, `platform` (`web` | `mobile`), `path`, `createdAt`;
  - indexes: `[workspaceId, userId, createdAt]` and `[userId, createdAt]`;
  - no foreign keys, like the other ledgers.
- **One route, `POST /api/v1/activity/page-views`**, body `{ path, platform, workspaceId?, brandId? }`:
  - **User:** comes from `requestUserId(request)`, which handles both the web session and the mobile bearer
    token. With no user, nothing is recorded.
  - **Path:**
    - must start with `/`, at most 300 characters;
    - the server strips any `?` or `#` part. Search boxes put what people typed into `?q=`, and that isn't ours
      to keep;
    - visits to `/admin`, `/api` and `/invite` aren't recorded. Admin visits would land under the wrong
      workspace, and the audit log already has `platform.workspace_viewed` and `platform.person_viewed`.
      `/invite/[token]` has a live token in its path.
  - **Workspace and project:** kept only if the user is a member of that workspace and the project is in it.
    Otherwise the visit is stored with no workspace or project. The client never chooses whose row it writes.
  - **Rate limit:** `hitRateLimit(\`pv:${userId}\`, 120, 60_000)`. Visits over that are dropped without an
    error.
  - It always answers `204`. A failure is logged and never reaches the user.
- **Web:**
  - A small client component in the shell layout (`app/(shell)/layout.tsx`) receives `activeWorkspaceId` and
    `activeBrandId` as props. The layout already works them out, so this costs the route no extra queries.
  - Whenever `usePathname()` changes, it sends `navigator.sendBeacon(url, JSON)`.
  - It keeps the last path it sent in a ref and skips repeats, so React's double effects don't record twice.
    A full reload (the admin console's plain-link filters) is a new visit and is recorded.
- **Mobile:**
  - The root layout (`src/app/_layout.tsx`) watches expo-router's `usePathname()`, skips repeats the same way,
    and sends the request through `api()` (bearer token). It doesn't wait for or retry the request.
  - The mobile app sends no workspace. The server files the visit under the user's workspace.
    - Each person will have one workspace from now on (decided by the product owner, 2026-10-29).
    - If someone still has more than one (older accounts), the visit is stored with no workspace instead of
      guessing.

## Non-goals

- Chat text, prompts or answers.
- Workspace owners seeing their team's activity.
- Deleting old activity.
- Charts, funnels, live updates, exports.
- New audit events for clicks that aren't audited today.

## Anti-goals

- Slower navigation, or an error shown because recording failed.
- A non-admin seeing anyone's activity.
- A row written for another user, or for a workspace the sender isn't in.

## Constraints

- Match the console: server components, `components/admin/ui.tsx`, `Table`, plain-`<a>` pickers and pager,
  and container-query layouts from phone to wide monitor.
- CLAUDE.md commit rules.

## Failure modes and ceiling

- **Lost visits:** a send that fails, or a visit over the rate limit, is gone. That's acceptable, because this
  is a trail, not billing.
- **Cross-site forgery:** a beacon from another site doesn't carry the session cookie, because Auth.js cookies
  are `SameSite=Lax` *(inference, not checked this session)*. Even if it did, it could only add visits to the
  victim's own trail.
- **Timeline paging:** it uses page numbers, like the rest of the console. To show page `n`, read the newest
  `n × 50 + 1` rows from each source, merge them by time and slice. Identical timestamps never skip or repeat
  a row.
  - `ponytail:` deep pages read more. If people page past about 20, switch to a `(createdAt, id)` cursor.
- **List counts:** five `GROUP BY (workspaceId, userId)` queries over all time, one per source, merged in
  memory.
  - Indexes needed: `PageView` (above), `AiWorkflowRun [workspaceId, userId]`, `ApiCall [workspaceId, userId]`,
    `AgentRun [workspaceId, triggeredByUserId]`. `AuditEvent` already has `[actorUserId, createdAt]`.
  - `ponytail:` fine into the low millions of page-visit rows. Past that, roll daily counts into a summary
    table, or add retention.
- **Growth:** about one row per page opened, plus one rate-limit upsert per visit.

## Left to the builder

- Column order, labels, empty states and the picker controls' look, within the console style.
- Whether the person picker also lists people who have left the workspace but still have rows there.
