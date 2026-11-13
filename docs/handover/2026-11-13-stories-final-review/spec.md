# Final review: spec and simplicity (whole branch 702b5d0..HEAD)

**Verdict: close to the spec, with 3 Important findings and no Critical ones.** The owner's ten decisions are all
built:
- 3 to 5 frames, each a photo or a clip.
- Four sources.
- A 15 s window with a sound switch, on by default.
- Schedule or Post by hand, with the due card on web Today, phone Today and P07.
- One-tap rights confirmation.
- Web and phone, with editing on the phone only.
- 5 credits per app-written story.

The gaps are at the edges: by-hand steps on the web, thumbnails for stories that open with a clip, and two handover
lines. The simplicity findings are all Minor. The deliberate mirrors (text limits, crop maths, credits) are documented
where they live.

## Spec check

| Owner decision / spec item | Built | Where |
|---|---|---|
| 3–5 frames, drafts may have fewer | yes. `Frames` blocker at approval; the input caps at 5 | body.ts:4, checks.ts:19-24 |
| Photo or clip per frame, 9:16, text burned in | yes | render.ts:354, :409 |
| Sources: phone / catalogue / earlier work / Generate | yes. Generate → Photoshoot opens product setup at 9:16 but doesn't preselect the photo (documented, owner to confirm) | sources.ts:23-145, ui/stories/picker.tsx, generate.ts |
| 15 s window and sound per clip, default on | yes | service.ts:116, trim.tsx |
| Schedule via API: two phases, daily limit, business-only message, PARTIAL, Post the rest, Mark done, story settle | yes | publishing.ts:90, :528-646, :751; web release-panel.tsx:640-671; phone card.tsx |
| Post by hand: flag, reminder card for `publish.execute` holders, dismissed per device for a day, package, "I posted it", link optional and stored | yes, **except the steps on the web** (Important 1) | by-hand.ts, manual-post.ts, due/route.ts:9, workspace.tsx:924, due-card.tsx |
| Rights: one tap, recorded, shown to the approver | yes ("Confirmed by <name>" / "Brand's own" in the Asset rights row) | uploads.ts:36,49; checks.ts:43-49 |
| Web read-only plus approval and going out; phone edits | yes ("Edit on the phone", draft-editor.tsx:25) | content-panels.tsx:536-616 |
| 5 credits for an app-written story, refunded on failure, Planner stories covered | yes | credits.ts:9, service.ts:419-499, :269 |
| AI mark on reel frames, crop locked | yes on the phone. The server doesn't strip a crop on a reel frame (documented) | sources.ts, render.ts |
| Story checks, Visual review "not checked", no Alt text rule | yes | checks.ts, quality.ts:91-99 |
| Render rate limits 30 per person and 100 per brand; upload limits; 7-day sweep | yes | service.ts:84-85, uploads.ts:16-25, runner.ts:123 |
| Version history of frames on the web | no (deferred, Task 12) | content-panels.tsx |
| Quality's tap-CTA warning only for **scheduled** stories | the prompt applies it to every story (Minor 6) | quality.ts:113 |

## Findings

### Important

**I1. On the web, nobody sees the by-hand steps. The server's step list is dead code.**
- Where:
  - by-hand.ts:63-69 (`STEPS`)
  - package/route.ts:58 (`link.txt`)
  - release-panel.tsx:482-547 (`StoryByHand`)
- Spec ("Post by hand → The package"): "Web: one zip of numbered frames and a **text file with the link and the
  steps**."
- What was built:
  - The zip writes `link.txt` with only the link (route.ts:58-60). The plan narrowed it this way (plan line 309).
  - The web panel shows Download, a link field and "I posted it", with no steps.
  - The phone ignores `pack.steps` and uses its own i18n `stories.byHandView.step1-5` (ui/stories/by-hand.tsx:57).
- So the steps exist twice, in server English and in phone i18n. The web, which needs them most, shows neither copy.
- The server text also says "Save every picture and clip to your phone", which is wrong for a zip on a computer.
- Fix: write `STEPS` into the zip's text file (call it `steps.txt`, or put it in link.txt), with web wording. Or show the
  steps in `StoryByHand`. If neither, drop `steps` from the JSON and the `StoryPackage` type (endpoints.ts:634).

**I2. A story whose first frame is a clip shows a broken or blank thumbnail on every list.**
- Where: content/route.ts:49 (`firstFrameUrl` = `renderedUrl(frames[0].renderedKey)`, an `.mp4` for a clip). It is
  read as an image in four places:
  - web calendar/list `<img>` (content-panels.tsx:400)
  - P07 card `expo-image` (ui/stories/card.tsx:79)
  - phone Today agenda `coverUrl` (ui/posts/use-posts.ts:76)
  - by-hand.ts:58 `dueByHand`, which also returns `firstFrameUrl`
- Spec P07: "Card = first rendered frame, or a placeholder with 'Add photos'." A browser `<img>` can't show an MP4. On
  the phone it depends on the platform decoder.
- Task 18 deferred this only for the editor strip. It hits every list as well, and any story that opens on a reel (the
  natural "hook" frame) will look broken in the calendar.
- Fix, either of:
  - the cheapest: send `firstFrameKind` and render a video tile or placeholder when it's `video`;
  - the better: the clip renderer also writes a poster JPEG next to the MP4 (the same content-addressed key with
    `.jpg`), and lists use that.

**I3. The HANDOVER "Instagram stories" section misstates the state in three places and misses two go-live steps.**
- Where: docs/HANDOVER.md:35, :46, :11-12, and "Before it can go live" (:32-38).
- :35 "The in-app by-hand reminder relies on push notifications being set up for the release build." This is wrong.
  The in-app reminder is the due card, built and working on web Today, phone Today and P07. Only a **push** reminder
  waits for Firebase (spec "Open"). A reader would think the reminder doesn't work yet.
- :46 "Deferred review minors are listed in the build ledger summary". The ledger
  (`.superpowers/sdd/.../progress.md`) is git-ignored (.gitignore:44), so the next person on another machine has no
  list. Copy the main deferred items into the handover, or into a tracked file.
- :11-12 "Each task had its own review and fix round". Tasks 1, 2, 3 and 9 passed review with no fix round, so this is
  slightly inaccurate. It also says the four-lens review "has not been run yet", which needs updating once this review
  lands.
- Missing from "Before it can go live" (both open in progress.md, Task 20):
  - **`next build` trace not checked.** It is still unverified that `ffprobe-static` and `assets/fonts` reach the
    deployed function (next.config.ts:6; Task 4 and Task 5(d) carry-overs). If the trace misses them, production
    refuses every clip upload and renders text with fallback fonts.
  - **A new phone dev build** is needed for `expo-media-library`, `expo-clipboard` and the new `app.json` plugins (spec
    "Open"). The handover mentions only a *release* build, for background retry.

### Minor (simplification, dead code, small drift)

1. **Steps defined twice.** See I1. by-hand.ts:63 duplicates en/posts.json `stories.byHandView.step1-5`.
2. **Mirrors on the phone.** Each is documented. A server-supplied value would remove the risk of drift.
   - `STORY_CREDITS = 5` (posts/stories.tsx:26) mirrors `CREDIT_COSTS.storyWrite`. The credits endpoint or the story
     list could return the price.
   - `EDITABLE` (posts/edit-story.tsx:43) mirrors publishing.ts `EDITABLE`. `storyView` could return `editable`.
   - The text-fit maths (ui/stories/limits.ts) and the crop maths (ui/stories/crop.tsx:17-46) mirror render.ts. These
     are intentional (live warnings, WYSIWYG crop), each has a pointer comment, and they were checked line for line in
     Tasks 16 and 18. Keep them.
3. **The same constant in two server modules.**
   - `MIN_CLIP_SECONDS` is in service.ts:26 and render.ts:33.
   - `LOGO_MAX_BYTES` is in service.ts:24 and render.ts:29.
   - The 8 MB clip cap is `CLIP_MAX_BYTES` (render.ts:31) and also `MAX_FILE_BYTES` (checks.ts:9).
   - The 15 s window is `STORY_LIMITS.clipSeconds` (body.ts:4), `MAX_CLIP_SECONDS` 15.5 (checks.ts:10) and
     `CLIP_SECONDS` (mobile trim.tsx).

   Export each one once.
4. **Exports with no user outside their file (and no test):**
   - `FrameState` (publish.ts:6), `RENDERER_VERSION` and `RenderDeps` (render.ts:23, :77)
   - `StoryActor` (service.ts:31), `Resolved` (sources.ts:9)
   - `StoryShared` and `storyDraftProblems` (writer.ts:29, :47)
   - phone: `StoryReturn` (generate.ts), `FitField` (limits.ts), `fitScale` (crop.tsx), `StripFrame` (frame-strip.tsx),
     `CLIP_SECONDS` (trim.tsx)

   `STORY_LINK`, `parseProbeJson`, `escapeMarkup`, `renderInputsHash`, `renderedKeyFor`, `clipArgs` and
   `storyRenderState` are exported for tests only, which is fine. Drop `export` on the first group.
5. **Stale comment.** by-hand.ts:14 says "Nothing keeps the link today", but manual-post.ts:32 now stores it as
   `postUrl`.
6. **The tap-CTA warning is not limited to scheduled stories.** quality.ts:113 adds the note for every story, by-hand
   ones included, where a link sticker *is* tappable. The prompt's wording ("when scheduled") leaves it to the model.
   Pass the item's `byHand`/SCHEDULED state, or add the hint only when not `byHand`.
7. **Story detection by body shape and by channel.**
   - quality.ts:91 picks the story rules with `isStoryBody(body)`, which is shallow (Task 2 deferral). The rest of the
     server branches on `channel === "INSTAGRAM_STORY"`.
   - A story version whose body somehow fails the shape check would get post rules (alt text, caption) and pass
     silently.
   - Branch on the channel and parse the body.
8. **No per-version frame history on the web** (spec "Web": "version history"). This is deferred from Task 12 and
   listed in the handover. Noted only for completeness.
9. **Files that could be smaller.**
   - service.ts (499 lines) holds save/render, view, duplicate/delete and create/charge. The create-and-charge block
     (:397-499) is a natural `stories/create.ts`.
   - publishing.ts grew by about 390 lines of story branch. The story publish job (:528-646) could sit beside
     `stories/publish.ts`.
   - Neither change is required. Both would make the next review cheaper.
10. **Small doc and route drift.**
    - package/route.ts:14 says "frames and link.txt", which is consistent with the code but not with the spec. See I1.
    - The ledger's Task 20 lists unused `editStory.captionTitle/languageCode` strings in 24 locales. HEAD e033d6b
      removed two editor strings; confirm they are the same ones.

## Reuse done well (no action)
- `registerManualPost` is now shared by reels and stories, as the spec asked (manual-post.ts).
- `decision-card.tsx` was lifted out of `posts/[id].tsx` rather than copied into the story detail.
- The picker, menus and discard prompt reuse `Sheet` and `Button`.
- `waitForServer` reuses the existing connection probe.
- The publish gate, approval sealing, `productGate` and `currentApproval` are reused unchanged by schedule, package,
  by-hand and post-the-rest.
