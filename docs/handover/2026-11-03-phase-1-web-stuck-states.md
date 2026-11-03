# Handover: Phase 1, web stuck states and lost work

Status: implemented, 4-lens reviewed, review fixes applied. Browser test: in progress.
Branch `audit-fixes` (worktree `.claude/worktrees/audit-fixes`). Commits: `db2b11e`, `ca2316e`.
Plan: `docs/superpowers/plans/2026-11-03-audit-fixes.md`, Phase 1.

## What changed

- Overview (`components/workspace/workspace.tsx`): Context docs, Today, Agents, Agents feed, Analytics reports, Accounts and
  Competitors each show loading (skeleton), error with "Try again", or a real empty state through one `LoadGate`
  (`content-panels.tsx`, next to `LoadFailed`). "Loading your tasks…" is gone. A refresh that fails after data loaded
  shows "Couldn't refresh. Showing the last update." Requests time out after 30 s (`lib/net.ts` `send()`), so a hung
  request no longer freezes the poll. `loadAll()` drives both the first load and Try again.
- Unsaved doc edits (`components/context/unsaved.ts`, `doc-pane.tsx`, `context-board.tsx`, `workspace.tsx`, both
  switchers in `components/shell/`): confirm before discarding on Cancel, doc switch, workspace back, in-app links,
  Back on `/`, business or workspace switch. Tab close and reload use `beforeunload`.
- Doc save conflicts: the base version is captured when editing starts; a newer version gets the existing 409. After a
  409 the next save builds on the newest version, and the label says so.
- Chat: replies get server ids (`generateMessageId` in the chat route); old empty-id rows use an index key.
- Sidebar Overview returns to the home view while a doc/agent/post is open (view sync runs off `useSearchParams`).
- `/context` "retry automatically" really retries (15 s, one load at a time).
- A business with no website can be edited (website optional only when none is stored; the server can't clear one).
- Post "Working on it" clears when the run succeeds and says "The agent finished."
- Welcome reading screen (`components/welcome/welcome-flow.tsx`, `reading-state.ts`): rows settle or say "Still running.
  Check Analytics later." after 10 min; polling stops when settled or after 20 min; a run-id mismatch (two polls in a row)
  shows a clear state with a way forward; three failed polls show "Can't reach the server. Retrying."; a retry resets
  the screen (`key={runId}`).

## Review outcome

Correctness, security, UX-states and simplicity lenses: no critical findings; 17 items fixed in `ca2316e`.
Type check clean, unit tests 277 passing, sloplint 0 FAIL.

## Known limits / follow-ups

- Browser Back on `/context` isn't guarded (Next handles that popstate); tab close and reload still ask.
- A website can't be cleared once set (server `EditBrandInput` has no clear).
- Pre-existing: the chat thread upsert could let two users with the same new thread id overwrite each other; fixed in
  Phase 3 (see that handover).
- Welcome poll still uses `setInterval`; overlapping slow ticks are de-duplicated.
