# Handover: Phase 3a, web shell, navigation, settings and auth

Status: DONE. Implemented, 4-lens reviewed, review fixes in `357da74`, browser-tested 22/22 after `519850a` (Logs Escape now also works from the Logs button).
Branch `audit-fixes`. Commits: `19b5183`, `357da74`.

Review fixes applied: `/login?next=` open redirect via control characters (made reachable by the new signed-in
redirect) closed, repeated query params no longer 500, assistant drawer closes on Escape from anywhere.
Review findings left open: the settings board doesn't re-sync its tab when the sidebar "Settings" link drops `?tab`;
the `login_email` cookie isn't cleared after a successful sign-in (expires in 120 s) and has no `secure` flag;
role dialog `rememberFocus` can record an element inside the dialog when switching roles. Plan: `docs/superpowers/plans/2026-11-03-audit-fixes.md`, Phase 3 items 2-5, 8
(business switch), 13-15, and four Phase 5 items.

## What changed

- `/settings?tab=` opens any valid tab; picking a tab updates the URL (`replaceState`), so refresh and links keep it.
- Platform admin with no workspace: the sidebar shows a short note and a "Platform admin" link instead of dead business nav.
- Assistant: one panel serves both layouts (column from 1280 px, fixed drawer below), so the conversation, draft and
  in-flight reply survive crossing 1280. Crossing to wide closes the drawer; it no longer reopens itself. Opening focuses
  it; Escape, scrim and a Close button close it and focus returns to the toggle. Hidden drawer is `inert`. No focus trap
  (noted in code). Replaces the Radix Sheet here.
- `/agents/<unknown>`: breadcrumb reads "Page not found" with nothing selected.
- Business switcher shows "Switching to X…" and is disabled while the switch runs.
- Auth: signed-in visit to `/login` redirects to the safe `next` (not when `?expired`); a failed sign-in keeps the typed
  email via a 120 s httpOnly cookie scoped to `/login` (never the password, never in the URL); reset form treats 422 as
  "Link not valid".
- Connections "Connected X" banner waits for the list and becomes an error if X isn't actually connected.
- `/agents` tiles show "Last run failed: <reason>".
- Logs drawer closes on Escape (focus to the Logs button); sidebar logo has `priority`; invite and role dialogs return focus
  (`components/settings/return-focus.ts`); `/admin/people?page=999` says "No results on this page." with a link to page 1.

## Known limits / follow-ups

- Unknown `/agents/<x>` still returns HTTP 200 (the shell layout streams before `notFound()`).
- The assistant drawer has no focus trap.
- `ConfirmDialog` dialogs don't return focus yet.
