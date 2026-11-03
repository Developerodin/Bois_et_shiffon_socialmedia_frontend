# Handover: Phases 2 + 4, mobile posts, business, plans, onboarding, marketing

Status: DONE. Implemented, 4-lens reviewed (no critical), review fixes in `9a51628`, emulator-checked (all checks pass).
Branch `audit-fixes`. Commits: `6f298ac`, `9a51628`.

Review fixes applied: `/plans/activated` no longer blank when the plan read fails (spinner + close, redirect after a
failure or 10 s); Billing plan card shows loading and "Couldn't load your plan" with retry (`usePlan` returns `failed`
and `reload`); session-expired sign-out resets the stack; plan blurb no longer claims a monthly renewal; Calendar and
Planner retries show progress and a second failure. i18next falls back to English. Plan: `docs/superpowers/plans/2026-11-03-audit-fixes.md`, Phase 2 items 6-10
(non-reels) and 12, Phase 4 items 3, 5 (non-reels copy) and 6.

## What changed (apps/mobile/src)

- Post schedule: a failed release read shows "couldn't check where this post can go" with Try again (no endless spinner).
- Post detail re-reads the release on every focus, so "Cancel schedule" appears after scheduling.
- Out of credits: no more dead "Manage credits" → Plans; the screen says credits are added by the Espanda team for now
  and to ask for a top-up. (Owner to confirm the wording.)
- Back stack: `ui/reset-stack.ts` `resetTo(href)` (`dismissAll` then `replace`, checked against expo-router 58) after
  onboarding (connect, verify, password) and on sign-out (account screen and drawer).
- Dead buttons: Account Help/Terms/Privacy/Restore show "Coming soon" and are disabled (`NavRow soon`); Plans footer
  links removed; Marketing "Today's cue" opens Photos; Stories is a "Coming soon" page (no sample data) and edit-story
  redirects to it.
- Planner-made reel posts: the "made in the Reels studio" line opens the reel in the studio.
- Calendar and Planner show "couldn't load" with retry instead of empty-as-real data.
- Copy: Billing shows the real plan ("{plan} plan", "Testing workspace", or "No plan yet" only when there is none);
  `/plans/activated` redirects when there's no plan; sign-out note no longer mentions a subscription; Bois & Chiffons
  removed from the photoshoot and onboarding a11y labels; "Source website → View photos"; Brand preferences "Colors and tone".
- Onboarding Connect shows "Instagram connected"/"Facebook connected" and disables that button; Preparing with no brand
  offers "Start over".

## Known limits / follow-ups

- Planner "Generate calendar" still shows no outcome after starting.
- "French prompt" in `photoshoot/product.tsx:119`; `photos.table` sample fallbacks outside reels.
- New strings are English only; other locales still hold old text (e.g. `lowCredits.manage`). Re-run translations.
