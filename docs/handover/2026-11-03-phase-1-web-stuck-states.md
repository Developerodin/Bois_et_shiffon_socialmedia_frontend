# Handover: Phase 1, web stuck states and lost work

Status: DONE. Implemented, 4-lens reviewed, review fixes applied, browser-tested (10/11 pass, the 11th fixed in
`0264142`), shell e2e 9/9.
Branch `audit-fixes` (worktree `.claude/worktrees/audit-fixes`). Commits: `db2b11e`, `ca2316e`, `0264142`.

## Browser test (2026-11-03)

Passed: Overview loads clean (no duplicate-key errors); 500s show errors with Try again and recover; a hung request
errors at ~35 s; failed refresh shows and clears; Accounts/Competitors never claim "connect"/0 while loading or failed;
unsaved-edit confirm on all seven exits (one prompt each, none when clean or after save); 409 keeps text and updates the
label; sidebar Overview returns home; `/context` retries every 15 s without overlap; no-website business saves; post
spinner clears with "The agent finished."; viewer pages clean.
Fixed after the test (`0264142`): welcome kept polling ~10 min on a brand with no website (silent checks now settle 2 min
after research ends); "Follow the latest reading" now updates `?run=`.
Seen, not fixed: clicking the already-open doc row while editing asks to discard; a hydration attribute mismatch on
`/?post=<id>` (likely a date/locale string; may predate this work); `/context` banner title says "Agent service
unavailable" when only documents failed.
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
