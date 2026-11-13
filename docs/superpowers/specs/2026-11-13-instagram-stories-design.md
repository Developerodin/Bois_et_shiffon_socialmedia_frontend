# Instagram stories (phone P07 Stories, P08 Edit story, and the web)

Date: 2026-11-13. Branch: `desktop-shell`. Status: second draft, after a builder check and a four-lens review
(correctness and money, security, phone UI and i18n, brief fit and simplicity). For the owner's approval.

## Why

The B&C brief lists stories as an Instagram format (p. 4: "reels, carousels and stories"), asks story briefs to set
"the composition and message hierarchy" (p. 4), names stories among the linked variants of one idea (p. 5), and puts
every format through the same checks, version-bound approval and publishing (pp. 6, 10). Today nothing on the server
knows a story: `ContentChannel` has no story value, and the phone's Stories and Edit story screens say "coming soon".
The gap audit (`docs/handover/2026-11-05-brief-gap-audit.md`, A6) lists "No story channel".

Stories are **in the brief**, not an addition.

## Owner's decisions (2026-11-13)

1. A story is a **sequence of 3–5 frames**, shown as one story on Instagram.
2. Each frame is **one photo or one video clip**, 9:16, with a little text on it.
3. Frame media comes from **four sources**: the phone (gallery or camera); the brand's catalogue product photos; the
   brand's earlier work (photo library, post photos, photoshoot results, finished reels); **Generate**: Photoshoot for
   a photo, the **full Reels studio** for a clip (its finished reel is then picked as a frame).
4. Clips longer than 15 s: the person **picks a 15-second window** with a slider.
5. **Sound on/off switch per video frame** (default on).
6. **Both ways out:** Schedule (we publish through the API; no tappable link) and Post by hand (a package, then the
   person posts from Instagram with a link sticker).
7. **In-app reminder** at the Post-by-hand time, seen by **everyone who can publish** for the brand.
8. **One tap "We own or may use this"** for every photo or clip uploaded from the phone (brief p. 6, asset
   permissions); recorded and shown to the approver.
9. Stories on **both web and phone**. Frames are made and edited on the phone; the web shows them read-only.
10. The agent writing a story from the app costs **5 credits per story** (more than a post, which is free in the app;
    the owner chose this knowing that). Stories the Planner proposes are covered by the Planner's own charge.

## Facts about Instagram stories that shape this (checked 2026-11-13)

- Same Content Publishing API as posts: `POST /{ig-id}/media` with `media_type=STORIES` and `image_url` or
  `video_url`, wait until the container is `FINISHED`, then `POST /{ig-id}/media_publish`. **One container per
  frame**; a 4-frame story is 4 publishes.
- Business accounts only.
- No interactive stickers (link, poll, question, product) through the API, and no caption. Text must be in the
  picture.
- Photos must be JPEG. Video size: third parties report about 8 MB per story video; Meta's pages don't say. Measured
  on the first live run (see "Open").
- Stories count toward the account's API publishing limit per 24 h (read it with
  `GET /{ig-id}/content_publishing_limit`).
- Stories expire after 24 h; their permalinks stop working. We keep the media ids.

Sources: [Meta content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/),
[Meta blog: stories publishing](https://developers.facebook.com/blog/post/2023/05/16/introducing-stories-publishing-to-the-content-publishing-api-on-instagram/),
[Ayrshare guide](https://www.ayrshare.com/blog/instagram-stories-api-how-to-post-a-story/).

## Goals

1. A new format, `INSTAGRAM_STORY`, through the existing life of a post: brief → draft → checks → approval bound to
   the exact version → scheduled or posted by hand → published.
2. Phone P07 Stories and P08 Edit story with real data, plus a story detail screen for checks and approval.
3. The agent writes a whole story from a product and goal (5 credits); the Planner can propose a story as one of an
   idea's linked variants.
4. Product, stock and offer checks run on stories as on posts, at approval and again at publishing.
5. A multi-frame publish never posts a frame twice, and a story that only partly went out is always shown as such.

## Non-goals

- Interactive stickers, music, mentions. The API can't post them; the manual route could, but we don't prepare them.
- Facebook Page stories (the brief names stories only under Instagram).
- Story metrics and learning notes: the brief's C1, still missing for every format.
- A video editor beyond the 15-second window, the crop and the sound switch.
- AI visual review of frames (product fidelity by vision). Quality reads no images for any format today (brief p. 6
  gap). Stories show that row as "not checked" to the approver.
- Comments and version comparison (brief p. 6): no format has them yet; stories inherit that gap.
- Mirroring the app UI for right-to-left languages (not done anywhere in the app yet). Frame text itself does follow
  the brand language's direction (see Rendering).

## Anti-goals

- A frame posted twice, or a partly posted story shown as "Published".
- The approver approving pixels other than the ones that get posted.
- A scheduled story promising a link people can tap.
- Frames whose rights nobody vouched for, or AI-made frames without their disclosure.

## The data

- `ContentChannel` gains `INSTAGRAM_STORY`. `publishRequirements` maps it to `INSTAGRAM` and to "3–5 frames".
- The story's version body (immutable `ContentVersion.body`):
  ```
  frames: [{
    source?: { kind: "upload" | "library" | "product" | "post" | "photoshoot" | "reel", id: string }
                               // a reference the server resolves; absent = "add a photo or clip"
    label: string,             // small line above the headline, ≤ 30 chars, may be empty
    headline: string,          // ≤ 60 chars
    body: string,              // ≤ 120 chars, optional
    composition?: string,      // the writer's note on what the frame shows and why (brief p. 4), not rendered
    crop?: { x, y, scale },    // photo and phone-clip frames only (reel frames are locked, see AI disclosure)
    clip?: { start: number, sound: boolean },  // video only: start of the 15 s window; sound on/off (default on)
    // set by the server only, never accepted from a client:
    mediaKey?: string,         // resolved from `source`
    renderedKey?: string,      // the finished 1080×1920 file, content-addressed (see Rendering)
    aiMark?: boolean,          // the source reel used an AI presenter or a cloned voice
    rights?: "owned" | "confirmed"  // brand sources = owned; phone uploads = confirmed by the uploader
  }]
  cta: string                  // one per story, printed on the last frame, ≤ 40 chars
  link: string                 // https destination, the product page by default; used for the manual link sticker
  ```
  `hook` = frame 1's headline (derived, for the lists and the writers). No `caption`: a story has none.
- `productIds` follow the version body as for posts.
- New `ContentItem.byHand Boolean @default(false)`: the person chose Post by hand; with `scheduledFor` it is the
  reminder (see Post by hand). `SCHEDULED` keeps meaning "we post it".
- New `PublicationStatus` value `PARTIAL`: some frames posted, the rest not (see Partly posted). It counts as live
  (in `LIVE`), so an ordinary re-schedule is refused while it stands.
- New table `MediaUpload`: id, workspaceId, brandId, key, kind (photo | video), status (PENDING | VERIFIED |
  REJECTED), bytes, durationSec, width, height, hasAudio, rightsConfirmedBy, rightsConfirmedAt, createdBy,
  createdAt. Only VERIFIED rows can be used as a frame source.

## Media sources

The Image tool on P08 opens one picker with four tabs. Every source is resolved by a **database lookup** scoped to the
brand, never by a key pattern:

1. **Phone** (gallery or camera, photo or video). The uploader first answers "We own or may use this" (one tap, owner
   decision 8); without it, the upload doesn't start. Upload flow:
   - The app asks for an upload slot (size and type declared). The server creates a PENDING `MediaUpload`, picks the
     key itself (`<ws>/<brand>/uploads/<uuid>.<ext>`), and returns a presigned PUT signed for that exact
     `Content-Type` and `Content-Length`, valid 10 minutes.
   - The app uploads with progress (cancel, retry; see Phone screens) and calls "done".
   - The server `HeadObject`s the size, probes the file (below), copies it to a fresh final key the client never saw,
     deletes the upload key, and marks the row VERIFIED (or REJECTED with the reason). A later PUT to the old URL
     changes nothing.
   - Limits: photos JPG/PNG ≤ 15 MB; videos MP4/MOV ≤ 100 MB, ≤ 3 min, ≤ 4096 px a side, ≤ 60 fps, one video stream
     and at most one audio stream. 20 upload slots per brand per hour. PENDING and REJECTED rows and VERIFIED rows no
     version uses are swept after 7 days (same daily sweep as reel recordings, `server/reels/recordings.ts`).
2. **Products**: the catalogue images of the story's product first, then others. Catalogue images are external URLs,
   so picking one copies it into our bucket through the existing `safeFetchBytes` (SSRF-safe) as an owned
   `MediaUpload` (rights "owned").
3. **Library**: the brand's photo library (`BrandProfile.uploads`), photos used in its posts, photoshoot results, and
   finished reels (`ReelRender` rows that are DONE with a `videoKey`).
4. **Generate**: Photoshoot (photo) or the Reels studio (clip), at those features' existing prices; see Phone screens
   for how the person gets back. Until Higgsfield is topped up these fail with the existing "not enough credits"
   handling. A reel used as a frame needs no approval of its own: the story's approval covers the frame.

**Accepted limit:** a reel downloaded and re-uploaded through the Phone tab loses its AI flag (we can't recognise it).
The uploader has vouched for its rights; the "Made with AI" mark is already burned into the file itself.

## Rendering

- **One render step for every story version**, whoever makes it: the person's save, the Creator, Fix it, Rewrite.
  The version is created only after all its frames are rendered, so Quality and the approver always see final files.
  A body arriving from a client has its server-only fields stripped; `mediaKey`, `aiMark` and `rights` are resolved
  from `source`, and `renderedKey` is written by the renderer.
- **Content-addressed output.** Each rendered file's key includes a hash of its inputs (source key, text, crop, clip
  window, sound, font, renderer version). Unchanged frames reuse their file; a file is never overwritten. The
  approval seal (`packageHash`) covers the keys, so it covers the pixels.
- **Photos** render in the request (sharp: fit to 1080×1920 with the crop; text as SVG composited on top).
  **Any frame with a clip** renders in the job queue: the save returns "Preparing frames", the version appears when
  the job finishes, and if someone saved a newer version meanwhile, the job ends with "Someone else changed this
  story. Your changes weren't saved" (the same rule as `saveDraft`'s version check).
- **Layout:** the Figma layout (label pill, headline, optional body; CTA on the last frame), a fixed dark gradient
  behind the text so white text always reads on light photos, the brand mark when Brand is on. Text stays inside the
  safe area (about 250 px clear top and bottom). Text that doesn't fit at the minimum size is refused with the
  frame number; the phone uses the same limits to warn while typing (shared limits).
- **Text safety:** full XML escaping of every user string, control characters stripped, the length caps above.
  Bundled fonts only (the app's font plus Noto for other scripts); the brand's own fonts aren't used (we hold only
  their names). Labels are upper-cased with the brand language's rules, and only in scripts that have case. Frame
  text runs right-to-left when the brand language does.
- **Video:** ffmpeg with `-protocol_whitelist file`, an explicit input format, no playlist or concat inputs,
  `-threads 2`, `-ss <start> -t 15`, output MP4 H.264/AAC 1080×1920, audio dropped when sound is off. Probing uses
  ffmpeg's own stream report (ffmpeg-static ships no ffprobe; builder may add `ffprobe-static` instead). Output over
  the Instagram cap is re-encoded at a lower bitrate once, else refused.
- **Rate limits:** saves that render: 30 per person per hour and 100 per brand per hour.

## The agent writing a story (5 credits)

- "New story" asks what "new post" asks (product, goal: new arrival / product feature / special offer, optional
  direction). Like `createPost`, it skips the Brief writer (the person's choices are the brief) and starts the
  Creator only.
- **Charge:** 5 credits through `spendCredits` with `refId` = the story item, so a double tap charges once; refunded
  when the Creator run finally fails or its render fails. It also counts toward the existing daily cap
  (`postAiAllowed`).
- The Creator for stories writes 3–5 frames (label, headline, body, a composition note), the story CTA and the link
  (the product page), in the brand language. It picks each frame's source from the product's catalogue photos and the
  brand library, never the same picture twice; with too few it leaves frames empty ("Add a photo or clip"). Its
  output goes through the one render step; frames without a source are kept unrendered.
- **Planner stories:** the Planner may propose `INSTAGRAM_STORY` for an opportunity (with its `opportunityId`, like
  other variants). Its Brief writer adds, for stories, a frame plan: each frame's purpose and composition (the
  brief's "composition and message hierarchy"). Planner stories are paid by the Planner's charge.
- Fix it and Rewrite work on stories and go through the render step.

## Checks

- **Frame text goes through the existing text checks** (Quality and the spelling check) by feeding the frames'
  label/headline/body and the CTA in as `slides`, so brand voice, editorial quality and CTA clarity apply unchanged.
  Product accuracy and the product gate (stock, price, offer) apply as for posts, at approval and at publishing.
- The posts rule "Alt text" (`server/content/rules.ts`) doesn't apply to stories (the API has no alt text for them).
- Deterministic checks for stories, all **blockers** unless marked:
  - 3–5 frames, every frame with a source and a rendered file.
  - Rendered files 1080×1920; clips ≤ 15 s and within the size cap.
  - Text fits (the renderer guarantees it; the row makes it visible).
  - A link and a CTA (warning).
  - **Asset rights**: every phone-uploaded frame has its confirmation; shown as "Rights: confirmed by <name>" or
    "Brand's own" per frame.
- Quality judges, in the brand's language, whether a **scheduled** story's CTA promises a tap ("swipe up", "click the
  link"…), with the fix "Say 'Link in bio' or post by hand" (warning). Language-aware, not a keyword list.
- "Visual review: not checked" stays visible to the approver (Non-goals).

## AI disclosure

A frame cut from a reel made with an AI presenter or a cloned voice (`needsAiDisclosure` for that reel) gets
`aiMark` from the server. Its crop is locked (reels are already 9:16), and the renderer burns the same "Made with AI"
corner mark that reels carry (`server/reels/render.ts`) onto the cut, so the mark is present whatever window was
chosen. Not switchable. No pixel check: the server guarantees it by construction.

## Approval

Unchanged rules: approval of the exact version, Approve anyway for overridable issues (as on `7ad85a0`), self-approval
when nobody else can approve. Leaving APPROVED in any way (an edit, Request changes) clears `byHand`.

## Going out

On an approved story the person picks a time and **Schedule** or **Post by hand**.

### Schedule (API)

- Needs an active Instagram connection on a Business account. If that can't be known before posting, the first
  refusal says "Instagram only lets business accounts post stories this way. Post it by hand, or switch the account
  to Business."
- One `PublicationAttempt`. Before anything is sent: the seal and product gate as today, and
  `content_publishing_limit` must have room for every frame, else FAILED "Instagram's daily limit leaves room for 2
  of 4 frames. Try after <time>." Nothing is posted.
- **Two phases inside the job:** (1) create every frame's container (signed links valid one hour, made at that moment)
  and wait for all of them together; nothing is public yet, so any failure here is a plain FAILED. (2) publish the
  containers in order. Before each `media_publish` the attempt records "frame i: publishing"; after it, the media id.
  Phase 2 is a few quick calls, so the job's 300 s limit holds even for five clips (phase 1's waits run in parallel,
  up to about 150 s).
- If the job dies or a publish call's outcome is unknown, the attempt goes to `PENDING_VERIFY` with the exact frame:
  "Frames 1–2 were posted; we couldn't confirm frame 3. Check the account."
- **Story settle** (the existing `posted` / `not-posted` actions, story branch): the person says whether that frame
  appeared. It's recorded, and the attempt becomes PUBLISHED if it was the last frame, else PARTIAL. The plain
  settle that marks a whole item published is not used for stories.
- On success: each frame's media id; `externalId` = frame 1's id, `externalUrl` its permalink (good for 24 h).

### Partly posted

- An attempt that ends with some frames out and others refused or unconfirmed-not-posted is **PARTIAL**: the story
  shows "Partly posted (2 of 4)" with the reason, the item stays `SCHEDULED` (not editable), and an ordinary
  re-schedule is refused.
- **Post the rest:** a new attempt that carries the posted frames' ids and publishes only the missing ones, after the
  same seal and product gate (so a stock change or an ended offer stops it). If the earlier frames are over 24 h old
  it first warns "Frames 1–2 have expired. Posting the rest makes a story of 2 frames."
- **Mark as done:** the item becomes PUBLISHED; the audit event records "2 of 4 frames posted".

### Post by hand

- Choosing it sets `byHand` and `scheduledFor`; the item stays APPROVED. The person can change the time, or switch to
  Schedule (which clears `byHand`), until it's posted.
- **Reminder (no new table):** stories with `byHand`, status APPROVED and `scheduledFor` passed are "due". Everyone
  with `publish.execute` on the brand sees them as a card at the top of Today (web and phone) and on P07, until
  someone posts it or cancels Post by hand. Dismissing hides the card on that device for a day. Several due stories
  show as one card with a count. Push joins when push notifications are switched on.
- **The package** requires the current approval to still hold and the product gate to pass (a refusal shows before
  anything is saved). Phone: the frames saved to the gallery in order, in an album named after the story
  (`expo-media-library`, new dependency); if the gallery permission is refused, the share sheet one frame at a time.
  Then steps: "Open Instagram → add frames 1–4 as one story → add a Link sticker" with a Copy link button. Web: one
  zip of numbered frames and a text file with the link and the steps.
- **Afterwards:** "I posted it" marks the story Published. Pasting the story's link is optional; when given it must be
  `https://www.instagram.com/stories/<handle>/<digits>` with `<handle>` the connected account's (when one is
  connected). This extends the shared manual-posting function behind `registerPostLink`
  (`server/reels/service.ts`), which today is reel-only, into one used by reels and stories.

## Permissions

- Upload slots, saving and rendering: `content.create`.
- Package, Post by hand, "I posted it", Post the rest, Mark as done, Schedule: `publish.execute`.
- Approve: unchanged (`content.approve`, plus `rules.approve` for Approve anyway).
- The due-story card is computed on each request from current brand access, so a removed member stops seeing it.
- Every action writes an audit event, as today.

## Phone screens

- **P07 Stories:** Figma as drawn with real data, and three tabs: **Drafts** (draft, review, waiting for approval,
  approved), **Scheduled** (scheduled, or "Post by hand · Fri 10:00"; two lines allowed for long languages),
  **Posted** (posted and partly posted; a partly posted card offers Post the rest / Mark as done; a waiting-for-check
  card asks "Did frame 3 appear?"). Card = first rendered frame, or a placeholder with "Add photos" when it has none.
  "…" menu: Duplicate, Delete (drafts only). The due-story card sits above the tabs.
- **P08 Edit story:** the Figma layout with:
  - a true 9:16 preview, letterboxed on short phones so nothing important hides under the tools, with the safe-area
    guide shown while editing text, and a fit warning while typing;
  - a frame strip (our addition) above the bottom box: tap to switch, + to add (up to 5), each thumbnail's "…" menu:
    Move left, Move right, Remove. Drafts may have fewer than 3 frames;
  - side tools: **Text** (label, headline, body), **Image** (the picker; crop by drag and pinch, only while Image mode
    is open, for photos and phone clips; the trim slider for clips over 15 s; the sound switch for clips),
    **Brand** (mark on/off), **CTA** (the story's CTA and link);
  - the bottom box reads "Link: <url>", and when the story is set to Schedule, "No tappable link when scheduled";
  - **Save draft**; the main button reads **Save and check** until the version is approved, opening the story
    detail screen; on an approved, unchanged story it reads **Schedule story** and opens the scheduling screen;
  - Undo undoes the last change before saving; leaving with unsaved changes asks to discard.
- **Story detail** (new, the story counterpart of `posts/[id].tsx`): the rendered frames to swipe through (clips
  play), the checks with Fix it, Approve / Approve anyway / Request changes, and the way out.
- **Scheduling:** the existing P05 schedule screen (`posts/schedule.tsx`) with a choice of Schedule or Post by hand.
- **Generate → Reels:** before leaving, the story is saved as a draft. The studio opens with the story frame as its
  return point; when the reel is ready, its review screen offers **Use in story**, which returns to that frame with
  the reel picked and the trim slider open. If the person leaves the studio instead, the story stays a draft.
- **Upload states:** progress bar, cancel, retry; offline says so and waits; if the app is backgrounded, the upload is
  retried on return. The whole clip is uploaded (trimming is server-side). While frames are being prepared the editor
  is read-only with "Preparing frames"; a failure shows its reason and Try again.
- **Accessibility:** each frame and thumbnail has a label ("Frame 2 of 4, video: <headline>"); every gesture has a
  button alternative (the "…" menu; crop has Fit and Fill buttons).
- **i18n:** all new strings in the app's i18n, English first, translated after the owner approves the wording. Server
  refusals return codes the app maps to its own strings; the server's English text is the fallback.

## Web

- `INSTAGRAM_STORY` in the calendar, the content list filters, Today's approvals and the content workspace.
- The content workspace shows the rendered frames read-only (thumbnails, full size, clips play), the text, link,
  checks, version history; Approve / Request changes / Approve anyway; Schedule or Post by hand; the zip; the
  partly-posted actions; "Edit on the phone" in place of an editor.
- The due-story card on Today.

## Constraints

- Posts, carousels, reels and the manual reel route keep working as today; stories extend them.
- All media in the private bucket, reached through signed links; tenant scoping on every key and query.
- Windows dev quirks from `docs/HANDOVER.md` apply (stop the web server before `prisma generate`; Metro on 8082).

## Builder's calls (decided by Claude, not the owner; check while reading)

- Output 1080×1920; photos JPEG; clips MP4 H.264/AAC; 15 s per frame.
- Text limits: label 30, headline 60, body 120, CTA 40 characters; a fixed gradient behind text.
- CTA and link are per story; the CTA prints on the last frame.
- Photos render in the request, clips in the job queue; content-addressed rendered files.
- Uploads: presigned PUT with signed size and type, copy-on-verify, limits and sweep as above, 20 slots/brand/hour.
- Render rate limits: 30 per person and 100 per brand per hour.
- `PARTIAL` as a new publication status counted as live; Post the rest is a new attempt carrying posted frame ids.
- Publishing in two phases (all containers, then publishes) with per-frame progress recorded before and after each
  publish.
- Post by hand: a `byHand` flag, no reminder table; dismissal per device for a day.
- Story link paste optional; "I posted it" alone is enough.
- A new story detail screen rather than reusing `posts/[id].tsx` directly (the builder may share its parts).
- `expo-media-library` for saving frames in order (needs a new dev build).
- Brand fonts not used; bundled fonts with Noto fallback.

## Open, needs money or access before it can be tried live

- A Business Instagram account connected (A12's real login is still untried) to try scheduled stories; measure the
  real story video size cap and the publishing limit then.
- Higgsfield credits for Generate (Photoshoot and Reels).
- Push notifications (Firebase pending): the reminder is in-app until then.
- A new phone dev build for `expo-media-library`.
