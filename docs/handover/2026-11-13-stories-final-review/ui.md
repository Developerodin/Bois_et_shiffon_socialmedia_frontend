# Final branch review: phone UI, i18n and web stories UI (702b5d0..HEAD)

Lens: how the stories screens behave together on the phone (P07 `posts/stories.tsx`, story detail `posts/story/[id].tsx`, P08 `posts/edit-story.tsx`, `ui/stories/*`, Today, schedule), i18n, and the web stories UI (`content-panels.tsx`, `release-panel.tsx`, `workspace.tsx`, `draft-editor.tsx`). Items already in `progress.md` or `task-*-review.md` are left out.

**Verdict: Ready once the Important items are fixed.** There are no Critical findings, 4 Important ones and 13 Minor ones.

## Checks run

- `npx tsc --noEmit` in apps/mobile: clean.
- **Every static i18n key the story screens use exists in en.** A script checked each `t("…")` call in the story screens, `ui/stories/*`, decision-card, page-loading, schedule, Today, `posts/[id]`, reels/review and photoshoot/[id] against en. I also checked each dynamic key by hand:
  - `editStory.tools.*` and `stories.editor.{label,headline,body,cta}`, which `textFits` returns.
  - `stories.{drafts,scheduled,posted}_one/_other` and `brief.goals.*`.
  - `posts:stories.errors.*`, which carries a `defaultValue`.
- **The fallback works.** In `i18n/index.ts`, `fallbackLng` goes from the regional locale to its language, then to en, and `returnNull: false` is set.
  - In en, the branch only adds keys. No existing key changed its text, so no stale translation now shows the wrong meaning.
  - The only keys removed are `comingSoon*`, `captionTitle` and `languageCode`, and they are gone from all 24 locales. The unused `captionTitle` and `languageCode` strings were already deferred.
  - No screen can render a raw key. In the other 23 locales the new screens mix English (new keys) with translated text (older keys) until translation, as documented.
- **The web app has no i18n.** It is English-only, which matches the rest of the web app.

## Critical

None.

## Important

### I1. A Planner story with no draft is a dead end, and its copy points the wrong way

Files: `apps/mobile/src/app/posts/story/[id].tsx:259-262` and `:281`, `apps/mobile/src/app/posts/edit-story.tsx:152-157`, `apps/mobile/src/ui/stories/card.tsx:83`.

**What happens.** The Planner creates stories as PLANNED with no version (stories are planned Wednesday and Saturday). On the phone:
1. P07 shows the card as "Add photos".
2. The detail shows "No frames yet. Edit the story to add photos." and an **Edit story** button, because PLANNED is in `editable` and isn't `working`.
3. The editor then shows only "The writer hasn't drafted this story yet." It offers no action and no way to add photos.

So the person is told twice to add photos, then can't.

**Fix.** For a story without a version:
- Hide Edit story on the detail.
- Make the detail and the card say what happens next ("The agent writes this story on <day>"), or offer a Write it now action (prepaid, like Fix it).
- In the editor, the noDraft state needs at least a way back to the story.

### I2. The story card's "…" menu can't be reached with VoiceOver

File: `apps/mobile/src/ui/stories/card.tsx:71-97`.

**What happens.** The "…" Pressable (Duplicate, Delete) is nested inside the card's Pressable. A Pressable is `accessible` by default, and on iOS an accessible element hides its children from VoiceOver. VoiceOver users therefore get only "title, status, button", and Duplicate and Delete can't be reached at all. The card offers no `accessibilityActions` either. TalkBack usually reaches nested clickables, so this is iOS only.

**Fix.** Either:
- add `accessibilityActions` (duplicate, delete) with `onAccessibilityAction` on the card, or
- make the "…" button a sibling of the card Pressable, not a child.

### I3. Most story refusal codes have no app string

Files: `apps/mobile/src/ui/stories/errors.ts:15-19`, and `stories.errors` in `apps/mobile/src/i18n/locales/en/posts.json`.

**What happens.** The spec (line 306-307) says server refusals return codes that the app maps to its own strings. The server emits about 47 `story.*` codes, and en has strings for 16. Codes that people reach on the phone and that only show the server's English include:
- **Saving or rendering a frame:** `story.textFit`, `story.clipWindow`, `story.renderFailed` (detail and editor, through `storyCodeText`), `story.source` and `story.rights`.
- **Upload checks:** `story.videoUnreadable`, `story.videoShape`, `story.videoFps`, `story.videoStreams`, `story.videoLarge`, `story.uploadSize` and `story.uploadCheck`.
- **Publishing and by hand:** `story.framesNotReady`, `story.notApproved`, `story.businessOnly`, `story.cancelScheduledFirst`, `story.linkInvalid`, `story.linkAccount` and `story.settleFrame`.

The fallback works, so nothing renders a raw key. Once the locales are translated, though, these stay English inside a translated screen. Some server messages also carry English frame prefixes ("Frame 2: the headline doesn't fit.") that the app can't localise.

**Fix.** Add en strings for the reachable codes, with `{{n}}` for the frame where the server sends it. Have the server pass the frame index as data instead of baking it into the message.

### I4. The editor hides a failed story read

File: `apps/mobile/src/app/posts/edit-story.tsx:143`. The line is `stories.get(id).then(setRelease, () => undefined)`.

**What happens.** When the read fails (offline or a server error), the editor opens with the cached text but no frame pictures and no source previews. It shows no message and no retry. Because `release` is null:
- `rendering` reads false, so a story whose frames are still being prepared opens editable instead of read-only "Preparing frames".
- `approved` is false, so an approved, unchanged story offers Save and check instead of Schedule story.

Nothing polls either, so the screen never recovers on its own. The story detail handles the same failure with a message and Try again (`story/[id].tsx:142-147`).

**Fix.** Keep the error, show it in the status line with a Try again, and keep the editor read-only until the read succeeds.

## Minor

1. **The detail's frame label breaks on an empty headline** (`story/[id].tsx:300`). It builds `stories.detail.frameLabel` directly, so a frame with no headline reads "Frame 1 of 3: ". The editor and strip use the `frameLabel` helper (`ui/stories/frame-strip.tsx:72`), which handles this. Use the helper on the detail too.
2. **Errors aren't announced the same way on every screen.** The editor and picker use `accessibilityLiveRegion` (`edit-story.tsx:458`, `picker.tsx:171`), and the New story sheet uses `role="alert"` (`stories.tsx:213`). These error lines are silent to screen readers:
   - the detail's action error (`story/[id].tsx:265`);
   - Unfinished (`card.tsx:152`, `:182`);
   - ByHand (`by-hand.tsx:96`);
   - the schedule screen's story errors (`schedule.tsx:334`).
3. **Swiping between frames on the detail has no button alternative** (`story/[id].tsx:288-314`). The page counter is hidden from accessibility (`:309`). `page` only moves on `onMomentumScrollEnd`, which a screen reader's scroll may not fire, so the playing clip and the counter can go stale. The spec says every gesture has a button alternative. Add Previous and Next buttons, or adjustable actions.
4. **A stuck render in the editor offers no way out but Back.** It shows "slow" text with no Try again (`edit-story.tsx:332-336`). The detail offers Try again for the same state (`story/[id].tsx:201-205`).
5. **The editor's load-failed and not-found state has no Retry** (`edit-story.tsx:156`). The detail has one (`story/[id].tsx:88`).
6. **The stale warning claims a failed save that didn't happen.** It reuses `stories.errors.stale` ("…Your changes weren't saved.") before any save was tried (`edit-story.tsx:331`). Use wording like "Someone else changed this story. Saving will be refused."
7. **The "no tappable link" note doesn't follow the spec.** The spec puts "No tappable link when scheduled" in the bottom box when the story is set to Schedule. Today the note always shows in the CTA panel (`edit-story.tsx:443`), and the bottom box never shows it (`:452-455`).
8. **The New story sheet's catalogue failure leaves a blank area with no retry** (`stories.tsx:143`, `:174-175`). The only way out is to close and reopen the sheet.
9. **Approve shows before the frames have loaded, or when they failed to load** (`story/[id].tsx:207`). `working` depends on `release?.rendering`, so an approver can approve frames they never saw. Gate the DecisionCard on `release` being loaded.
10. **Server English shows as UI and accessibility text.** This is the same pattern posts already use, but it is new surface:
    - check name and note as `${r.check}: ${r.note}` (`story/[id].tsx:187`);
    - product issue messages (`decision-card.tsx:76`);
    - library tile titles "Photo" and "Photoshoot" (`web/server/stories/sources.ts:140-141`), which the picker reads as its accessibility label (`picker.tsx:181`);
    - the album fallback name "Espanda - story" (`ui/stories/package.ts:21`).
11. **The new iOS and Android permission prompts are English only** (`apps/mobile/app.json:40-52`), with no localized InfoPlist strings. The existing plugins are the same.
12. **Web: the content list shows the by-hand time without a day** (`content-panels.tsx:415`). It reads "Post by hand · 10:00" even for next week. The release panel's `when()` and the phone's `relativeSlot` both include the date.
13. **Web: the by-hand time field accepts a past time** (`release-panel.tsx:528`). PublishForm's datetime field sets `min` (`:461`), and this one doesn't.

## Checked and fine

- **Safe areas.** The editor header uses `insets.top`. The tool panel and the bottom box use `insets.bottom`. The other screens go through `PostsScreen`.
- **Navigation.** Edit story leads to the detail through `dismissTo`. Schedule goes back. Today's due card goes to P07 Scheduled. "I posted it" goes to P07 Posted. The Generate trip returns to the editor for its own story id.
- **Gesture alternatives.** The frame menu has Move and Remove, crop has Fit and Fill, and Trim has adjustable actions.
- **Web.** The read-only frames are shown with a Retry on failure. `role=status` and `role=alert` are used. "Edit on the phone" replaces the editor. The partly-posted, settle-frame and zip actions are present, and the due card is gated on `publish.execute`.
