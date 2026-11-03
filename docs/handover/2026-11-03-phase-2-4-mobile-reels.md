# Handover: Phases 2 + 4, mobile reels (and the reels server)

Status: DONE. Implemented, 4-lens reviewed, review fixes in `540be54` and `feb98b7`, emulator-checked (all checks pass).
Branch `audit-fixes`. Commits: `6d5726c`, `540be54`, `feb98b7`.

Review fixes applied: the reel GET no longer starts AI runs (read roles could trigger paid Quality runs); the app calls
the `recheck` POST (`content.create`) once after 90 s and on "Check again", capped at 1 per 15 s per reel and 10 an hour
per brand; render starts Quality with `{itemId, version}` so duplicate runs dedupe; a dropped first chat stream only
adopts a single reel created after the send and missing from the earlier list; cancel treats 409 as done and is hidden
without `publish.execute`; "Already checking" feedback; settling a publication attempt now requires it to belong to the
post in the URL (`settlePublication` `itemId`). Plan: `docs/superpowers/plans/2026-11-03-audit-fixes.md`, Phase 2 items 1-5, 11
and the reels part of 10; Phase 4 items 1, 2, 4 and the reels copy.

## What changed

- "Checking the reel…" forever: server `recheckQuality` (`apps/web/server/reels/service.ts`) re-runs a missed Quality
  check from the reel GET (90 s after the last try, max 3 an hour, never while one runs); new `recheck` POST action
  (`content.create`). The review screen shows a slow-check message after 150 s with "Check again".
- Generating screen: messages for failed polls, no render after 30 s, and a render past 15 min.
- Failed caption save keeps the typed caption (`change()` returns success).
- Publish: date picker = next 7 days × 09:00/12:00/18:00/20:00 (no new dependency); timezone is display-only;
  connections reload on focus; an expired Instagram connection shows "Needs reconnecting" + Reconnect.
- Scheduled reels: "Cancel schedule" (existing `posts.settle` cancel path), then schedule again; Schedule is disabled for
  scheduled/published reels ("View schedule" for scheduled); calendar copy corrected.
- Coming soon: script Record, actor sample voice, templates search/filter/tune.
- Shortcuts (AI actor, templates) clear the open reel; actor Continue goes to chat when none is open.
- Stale screens: `useReel` and the Reels home refetch on focus; results error clears after a good load; a storyboard
  that already has a video shows "View video" instead of charging again.
- Dropped first chat stream: the app finds the reel the server created instead of creating a second one.
- Copy: plan language instead of hard-coded French; "Publishing your reel" / "Reel published" after Publish now;
  "Tap a scene to move it earlier"; neutral placeholders instead of Bois & Chiffons sample photos.

## Known limits / follow-ups

- No reschedule as one step (cancel, then schedule).
- `recheckReel` lives in `ui/reels/use-reel.ts` rather than `src/api/endpoints.ts`.
- English only; other locales keep old keys (`review.captionFrench` removed from en).
- `Intl.DisplayNames` on Hermes unverified; falls back to the upper-case language code.
- Photoshoot and non-reels `photos.table` fallbacks untouched.
