# Audit fixes: phased plan

Date: 2026-11-03. Branch `audit-fixes` (off `desktop-shell` at 073390c), worked in `.claude/worktrees/audit-fixes`.
Source: the web + mobile flow audit of 2026-11-03 (stuck states, dead ends, state that doesn't update after an action).

Each phase: implement → 4-lens review (correctness, security/permissions, UX states, simplicity) → one fix round →
browser (web) or emulator (mobile) test → handover note in `docs/handover/` → commit → next phase.
Cleanup at the very end: delete the audit's test role "Audit role" and the planned test post "Du copeau à la pièce terminée"
in the Atelier Sorrel test workspace, and the audit scratch files.

Global rules: surgical changes, reuse existing patterns (`useLoad` in `components/settings/shared.tsx`, `LoadFailed`,
`ListSkeleton`, `errorMessage`), no new dependencies, Hallmark floor (sloplint 0 FAIL), no publishing/sending behaviour
changes, desktop and mobile keep their own designs, `docs/HANDOVER.md` untouched.

## Rulings (my calls, reversible)

- Features with no backend yet are labelled "Coming soon" and their dead buttons hidden or disabled, not built
  (Stories, reel Templates search/filter, Record, sample voice, Help/Terms/Privacy/Restore purchases, Website Studio's
  inner buttons). Matches the owner's earlier "keep that on coming soon".
- Out of credits with no pricing available: the copy says how to get credits today instead of sending people to a
  disabled Plans screen.
- Cancelling or rescheduling a scheduled reel is built only if the server already supports cancelling a release for
  reels (as it does for posts); otherwise the misleading copy is corrected, Schedule is disabled for already
  scheduled/published reels, and it's listed as a gap.

## Phase 1: web, stuck states and lost work

1. Overview data never leaves "Loading…": `components/workspace/workspace.tsx` poll (~139-150, `Promise.allSettled`
   ignores failures, no timeout). Docs, agents, Agents feed and Today tasks get loading / error-with-retry / empty states;
   "Loading your tasks…" (~683) must not double as the empty message; `/audit-reports` failure (~137) shows an error, not
   "Not run yet". Requests get a timeout so a hung request can't freeze the poll.
2. Unsaved Business-context edits lost on in-app navigation, Cancel, doc switch, Back: `components/context/doc-pane.tsx`
   (~75-82 beforeunload only), `context-board.tsx`, `workspace.tsx` (~785-815). Confirm before discarding.
3. Doc save can overwrite a newer version: `doc-pane.tsx` `onSave` (~105-112) reads `latest.version` at save time; fix the
   base version when editing starts (as `DraftEditor` does).
4. Chat replies saved with empty ids (duplicate React keys): `app/api/v1/workspaces/[workspaceId]/brands/[brandId]/chat/route.ts`
   (~132) — give `toUIMessageStream` a message id generator; render side `components/workspace/chat-pane.tsx:226` must
   tolerate old empty-id rows.
5. Sidebar Overview does nothing while a doc/agent/post view is open on `/`: `workspace.tsx:99-130` (pushState view,
   Link to "/" fires no popstate).
6. /context "It will retry automatically" never retries: `components/agents/service-unavailable.tsx:17`, `context-board.tsx`.
7. A business with no website can't be edited: `workspace.tsx` BrandEditor (~379-387, website `required`).
8. "Working on it" on a post can spin forever: `components/workspace/content-panels.tsx` NextStep/RunWatch (~395-425) —
   clear on run done too.
9. Welcome "Reading" screen: SEO/GEO rows can stay "Waiting" forever and poll every 2 s forever; resume URL with a
   mismatched run never fails: `components/welcome/welcome-flow.tsx` (~190-230).

## Phase 2: mobile, stuck states and dead ends

1. Reel review "Checking the reel…" forever: `apps/mobile/src/app/reels/review.tsx`; server `apps/web/server/reels/render.ts:268`
   says a missed Quality run is "retried from R07" but nothing retries. Add the retry (or time out to a clear state).
2. Reel generating: no timeout, poll errors ignored, empty `renders` stuck: `reels/generating.tsx`.
3. Reel caption edit lost on failed save: `reels/review.tsx:36` (`change()` swallows the error).
4. Reel publish: date/time/timezone controls do nothing (`reels/publish.tsx:149-152`); connections read once (`:39-41`) so
   connecting doesn't unlock Schedule; expired connection offers Connect not Reconnect.
5. Scheduled reel: no cancel/reschedule, Schedule enabled on scheduled/published reels (`reels/review.tsx` SENDABLE),
   copy "Edit or cancel this post from your calendar" (see ruling).
6. Post schedule screen spins forever when `postRelease` fails (`posts/schedule.tsx:164`).
7. Post detail stale after scheduling (`posts/[id].tsx:37-42` refetch only on version change) — refetch on focus.
8. Out of credits dead end: `recovery/low-credits.tsx` → Plans with Continue disabled (see ruling).
9. Onboarding screens left in the Back stack after finishing (`onboarding/connect.tsx:24`, `verify.tsx:51`,
   `password.tsx:45`, sign-out in `business/account.tsx`).
10. Dead buttons: Account Help/Terms/Privacy/Restore (`business/account.tsx` ~95-98), Plans footer links
    (`plans/index.tsx`), Marketing "Today's cue" card (`marketing/index.tsx`), reels script Record (`reels/script.tsx:127`),
    actor sample voice (`reels/actor.tsx:79`), templates search/filter/tune (`reels/templates.tsx`), Stories tools/menu/
    "Schedule story" (`posts/stories.tsx`, `posts/edit-story.tsx`) — see ruling.
11. Reel AI-actor / template shortcut edits whatever reel was last opened, or shows a blank screen (`reels/actor.tsx:29`,
    `templates.tsx`).
12. Planner-created reel post dead-ends at Schedule ("Reels are made in the Reels studio" with no link) (`posts/schedule.tsx`).

## Phase 3: web, navigation and state after actions

1. Wave/Drift never stay selected: `workspace.tsx:114-120` strips `?panel=`; `components/shell/sidebar.tsx:35-36`.
2. `/settings?tab=` only maps connections; tab not in URL: `app/(shell)/settings/page.tsx:42`, `components/settings/settings-board.tsx:54`.
3. Platform admin with no workspace gets a dead-end workspace sidebar: `app/(shell)/layout.tsx:36-48`, `sidebar.tsx`.
4. Assistant sheet reopens itself after crossing 1280; focus not returned to the toggle: `components/shell/assistant-state.tsx`,
   `assistant-panel.tsx:30-46`. A message sent just before crossing 1280 is lost.
5. `/agents/<unknown>`: breadcrumb "Agent log", status 200: `lib/nav.ts:42-58`, `app/(shell)/agents/[agent]/page.tsx`.
6. Agent views end with no result/next step (Planner → calendar, Brief/Creator/Quality → posts, SEO/GEO → Performance,
   Competitors → competitors panel): `workspace.tsx` AgentView (~860).
7. `/performance` never refreshes after a run: `components/performance/audit-board.tsx` (~95-100).
8. No pending feedback: Shortlist/Dismiss (`content-panels.tsx` IdeasPanel `set()`), Mark reviewed (`doc-pane.tsx`),
   business switch (`components/shell/brand-switcher.tsx:76`).
9. "Plan posts" re-enabled after reload while Planner runs (`content-panels.tsx` ~160-215): derive from agent status.
10. Banners that never clear: "Posts planned…" (IdeasPanel), "Website saved… Re-read it now" (`workspace.tsx` ~430-440);
    "Re-read it now" should start the re-read.
11. Today suggests "Get post ideas" when shortlisted ideas wait to be planned (`workspace.tsx` ~567-580).
12. Viewer sees write controls that fail (doc Edit/Mark reviewed, Re-run research, Get/Find ideas, Plan posts, agent Run,
    brand Edit; Get ideas auto-runs): gate with `usePerms` like `content-panels.tsx`.
13. Auth: signed-in user at /login sees the form (`app/login/page.tsx`); failed sign-in clears email; short reset token
    says "Couldn't reset" not "Link not valid" (`app/reset-password/reset-form.tsx:29`, route returns 422).
14. Connections banner contradicts list (`?connected=`): verify against the loaded list.
15. Failed run reasons: `/agents` tiles show only "Failed" (`components/agents/agent-tile.tsx`).

## Phase 4: mobile, state that doesn't update, and copy

1. Reel screens reached with Back are stale (`use-reel.ts` loads on mount only) → refetch on focus; storyboard "Make video"
   on a finished storyboard charges again.
2. Reels index loads once (`reels/index.tsx:28-32`); results error never cleared (`reels/results.tsx:32`).
3. Calendar/Planner swallow load errors (`posts/calendar.tsx:19`, `posts/planner.tsx:36`); planner "Generate calendar"
   outcome.
4. Chat first message can create duplicate reels on a dropped stream (`use-reel.ts` `chat()`).
5. Copy: Billing "No plan yet" in a planned workspace (`business/billing.tsx:~58`); `/plans/activated` with no plan;
   sign-out note mentions a subscription; hard-coded "French" (`reels/script.tsx:71`, `review.tsx:103`, a11y strings);
   "Reel scheduled" after Publish now (`reels/scheduled.tsx`); Bois & Chiffons sample images/labels in real screens
   (`reels/index.tsx:36,48-51`, `photoshoot/index.tsx`, `photos.table` fallbacks); "Drag to reorder" with no drag
   (`reels/assets.tsx:139`); Connections "Source website → Manage" opens Photos; Brand preferences "Colors, tone, language".
6. Onboarding Connect buttons stay "Connect" after connecting; preparing screen with no brand.

## Phase 5: web polish

Agent counts ("3 coming" vs five Soon), "Welcome, Platform." name fallback, column divider hit area, Logs drawer Escape,
logo `priority`, focus return on settings dialogs, dirty-dialog confirm, unknown `?doc=/?agent=` deep links, Add competitor
pending state, `/admin/people?page=999` copy, double period in brief angle, log line dates, Agents-feed "Done" detail,
one route-shaped skeleton per page type instead of the shared one, a short crossfade for Overview view changes.
Then cleanup.
