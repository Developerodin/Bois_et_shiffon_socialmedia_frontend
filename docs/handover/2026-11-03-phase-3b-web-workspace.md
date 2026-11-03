# Handover: Phase 3b + 5, web workspace content and polish

Status: DONE. Implemented, 4-lens reviewed (no critical), chat create race fixed in `357da74`, browser-tested; the one failure (viewer saw write buttons on /context) fixed in `519850a` and re-checked.
Branch `audit-fixes`. Commits: `5a93f94`, `357da74`.

Review findings left open: Owner-only buttons pop in after `/my-permissions` loads (perms null → hidden); `usePerms`
fetches once per panel; IdeasPanel re-fetches the agents list the Workspace already has; "Re-read it now" starts a paid
Research run with no confirm; coming-soon agent rows lost their per-agent icons (all use a lock). Plan: `docs/superpowers/plans/2026-11-03-audit-fixes.md`, Phase 3 items 1, 6-12,
the chat thread race, and the Phase 5 workspace items.

## What changed

- Wave/Drift stay selected: `?panel=` is kept in the URL; the panel is focused once per value.
- Agent views end with a next step: Planner/Brief/Creator/Quality → calendar or posts, SEO/GEO → `/performance`,
  Competitors → competitors panel.
- `/performance` polls the agents list every 6 s and reloads reports when an SEO/GEO run changes.
- Pending states: Shortlist, Dismiss, Remove from shortlist, Undo dismiss, "Marking…", "Adding…" (competitor).
- "Plan posts" is disabled while the Planner's latest run is queued/running (from the agents list), so a reload can't
  start a second run.
- Banners: "Posts planned" and "Website saved" can be dismissed and clear on the next action; "Re-read it now" starts
  the re-read.
- Today suggests "Plan your shortlisted ideas into posts" when ideas are shortlisted.
- Role gating (`usePerms`): doc Edit / Mark reviewed (`context.edit` / `context.confirm`), brand Edit, Re-read, agent
  Run, Agents-feed Run, Get/Find ideas, Competitors Find, Today "Get ideas" (`agents.run`); Scout auto-run only with
  `agents.run`.
- Chat thread save: `updateMany` where id + userId + brandId match, else `create`; no more upsert on id alone.
- Polish: Coming-soon agents come from the sidebar's `NAV` (five, no invented ones); "Welcome." fallback for missing or
  role-like names; ~9 px invisible hit area on column dividers; unknown `?doc=`/`?agent=` drop the bad param; brief
  double period fixed; log lines from other days show the date.

## Known limits / follow-ups

- Agents feed "Done" has no outcome text: the agents API returns no run summary (needs a `summary` on `lastRun` in
  `app/api/.../agents/route.ts` and `components/agents/api.ts`).
- Viewers still get panel focus from Menu → Content (Menu code untouched).
