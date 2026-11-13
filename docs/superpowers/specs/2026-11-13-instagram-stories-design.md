# Instagram stories (phone P07 Stories, P08 Edit story, and the web)

Date: 2026-11-13. Branch: `desktop-shell`. Status: draft for the owner's approval.

## Why

The B&C brief lists stories as an Instagram format (p. 4: "reels, carousels and stories"), asks story briefs to set
"the composition and message hierarchy" (p. 4), names stories among the linked variants of one idea (p. 5), and puts
every format through the same checks, version-bound approval and publishing (pp. 6, 10). Today nothing on the server
knows a story: `ContentChannel` has no story value, and the phone's Stories and Edit story screens say "coming soon".
The gap audit (`docs/handover/2026-11-05-brief-gap-audit.md`, A6) lists "No story channel".

So stories are **in the brief**, not an addition.

## What a story is (owner's decisions)

- A story is a **sequence of 3–5 frames**, shown as one story on Instagram (owner, 2026-11-13).
- Each frame is **one photo or one short video clip**, 9:16, with a little text on it (owner: "one pic … one small
  video or multi stack").
- Frame media can come from **all four sources** (owner):
  1. the phone's gallery or camera,
  2. the brand's catalogue product photos,
  3. the brand's earlier work: post photos, photo library, photoshoot results, finished reels,
  4. new AI generation via Photoshoot (image) or Reels (clip), paid with those features' existing credits.
- **Both ways of going out** (owner: "keep option for both"):
  - **Schedule:** we publish the frames in order through Instagram's API at the chosen time. The CTA is printed on the
    last frame; there is no tappable link (the API has no link stickers).
  - **Post by hand:** we prepare a package (the frames, the link, the caption text to copy) and remind the person at
    the chosen time; they post from Instagram with a real link sticker and paste the story's link back.
- Clips longer than 15 s are **trimmed: the person picks a 15-second window** with a slider (owner, after the
  builder check). This applies to phone clips and finished reels alike.
- **Generate for a video frame opens the full Reels studio** (owner). The finished reel can then be picked as a frame.
  Generate for a photo frame opens Photoshoot.
- **Post by hand gets an in-app reminder at the chosen time** (owner), on the phone and the web.
- Stories show on **both the web and the phone** (owner): web calendar, content list, content workspace and approval
  like any other format. Making and editing frames happens on the phone only; the web shows the frames read-only.
- The agent writing a story (every frame's text, the caption, the link, the CTA) costs **5 credits, the same as a post**
  (owner): the same Planner → Brief → Creator → Quality chain (`chain: true`).

## Facts about Instagram stories that shape this (checked 2026-11-13)

- Stories publish through the same Content Publishing API as posts: `POST /{ig-id}/media` with `media_type=STORIES`
  and `image_url` or `video_url`, then `media_publish`. **One container per frame**; a 4-frame story is 4 publishes.
- Business accounts only. A creator or personal account can't publish stories through the API.
- No interactive stickers (link, poll, question, product) through the API. No caption on a story either. Text must be in
  the picture.
- Photos must be JPEG. Video frames: third parties report a size cap around 8 MB; Meta's pages don't say. The builder
  checks the real limit on the first live run and sets our cap from it (see Builder's calls).
- Stories count toward the account's API publishing limit per 24 hours (50 or 100 depending on the source; check
  `GET /{ig-id}/content_publishing_limit`).
- A published story's `media_type` reads IMAGE or VIDEO; `media_product_type` says STORY. Stories expire after 24 h;
  their permalink stops working then, so we store the media ids, not only a link.

Sources: [Meta content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/),
[Meta blog: stories publishing](https://developers.facebook.com/blog/post/2023/05/16/introducing-stories-publishing-to-the-content-publishing-api-on-instagram/),
[Ayrshare guide](https://www.ayrshare.com/blog/instagram-stories-api-how-to-post-a-story/).

## Goals

1. A new format, `INSTAGRAM_STORY`, that goes through the existing life of a post: brief → draft → Quality → approval
   bound to the exact version → scheduled or posted by hand → published.
2. Phone P07 Stories: real Drafts and Scheduled lists, "New story", each card opening the editor.
3. Phone P08 Edit story: 3–5 frames, each a photo or a clip with its text, and the story's link/CTA; Save draft;
   then Schedule story or Post by hand.
4. The agent can write a whole story from a product and goal (5 credits) and the Planner can propose a story as one of
   an idea's linked variants.
5. Product, stock and offer checks run on stories exactly as on posts, at approval and again at publishing.
6. A multi-frame publish never posts a frame twice, even when a retry follows a partial failure.

## Non-goals

- Interactive stickers (polls, questions, countdowns, mentions, music). The API can't post them; the manual route can,
  but we don't prepare them.
- Facebook Page stories. The brief only names stories under Instagram.
- Story metrics and learning notes. Those belong to the brief's C1 (metrics), still missing for every format.
- An in-app video editor (filters, cuts inside a clip, speed). The only changes to a clip are the chosen 15-second
  window and fitting it to 9:16.
- AI visual review of the frames (product fidelity, legibility by vision). Quality reads no images for any format
  today; that is a separate gap (brief p. 6 "Visual requirements"). Stories get the deterministic visual checks below,
  and the AI visual row stays "not checked" and visible to the approver, as the brief requires.

## Anti-goals (would make this a failure even if it works)

- A frame posted twice, or a story published with frames missing in the middle without anyone being told.
- The approver approves frames they can't see as they'll appear (text placement, crop), so what's posted differs from
  what was approved.
- A scheduled story that promises a link people can tap.
- Frames with competitor media, or generated frames that misrepresent the product (brief p. 3, p. 5).

## How it works

### The data

- `ContentChannel` gains `INSTAGRAM_STORY`. `publishRequirements` maps it to the `INSTAGRAM` provider; it needs 3–5
  frames instead of images or a video.
- A story's version body (same `ContentVersion.body` JSON, immutable per version) adds:
  ```
  frames: [{
    kind: "photo" | "video",
    mediaKey: string,          // the source photo or clip in our media storage, owned by the brand
    label: string,             // small caps line ("COLLECTION BUNTING"), may be empty
    headline: string,          // the big line, short
    body: string,              // optional second line
    cta: string,               // shown on the last frame only, e.g. "Lien en bio" / "Découvrez la table Bunting"
    crop?: { x, y, scale },    // how the source sits in 9:16
    clip?: { start: number },  // video only: start of the 15-second window, in seconds
    aiMark?: boolean,          // the source is a reel made with an AI presenter or cloned voice (see AI disclosure)
    renderedKey: string        // the finished 1080×1920 JPEG or MP4 with the text burned in (made on save)
  }]
  link: string                 // the destination URL (product page by default); used by the manual route's sticker
  caption: string              // not posted (stories have none); the manual package's copy-paste text and the
                               // writers' summary
  ```
  `hook` is frame 1's headline. `productIds` follow the version body as for posts.
- Approval binds to the version as today (`packageHash` over the body), and the body holds the `renderedKey`s, so the
  approver approves the exact pixels that will be posted. Any change to a frame (media, text, crop, order) is a new
  version and needs approval again (brief: material edits remove approval).

### Making the frames (rendering)

- On every save, the server renders each frame to its final file: the source photo or clip fitted to 1080×1920 with the
  crop, the brand's text on top in the Figma layout (label pill, headline, optional body; CTA on the last frame), and
  the brand mark when the person turned Brand on. Photos with `sharp` (already installed: SVG text composited onto the
  image); clips with `ffmpeg-static` (already installed for reels).
- Text stays inside Instagram's safe area (about 250 px clear at top and bottom of 1920) so the app's own bars don't
  cover it. A headline that doesn't fit at the minimum size is refused at save with a plain message, not shrunk to
  unreadable.
- Fonts: the brand's research fonts if we hold a usable file, otherwise the app's own font. Builder's call on which
  font files ship with the server.
- Rendering is part of save, so Quality and the approver always see rendered frames. If a clip render takes too long
  for a request (builder measures; 15 s clips at 1080×1920 should take seconds), it moves to a job and the draft shows
  "Preparing frames" until done.

### Where frame media comes from

The Image tool on P08 opens one picker with four tabs:

1. **Phone:** gallery or camera, photo or video. Photos go through the existing `POST …/media` upload (JPG/PNG, 4 MB).
   Videos are bigger than the 4.5 MB request cap on Vercel, so the server hands out a short-lived presigned upload URL
   to our media bucket (`server/storage/media.ts` already builds S3 commands); the server then checks the file is a real
   MP4/MOV by its first bytes and under the upload cap (100 MB, at most 3 minutes — builder's call) before it can be
   used. A clip longer than 15 s opens the trim slider: a 15-second window over the clip's timeline with a preview;
   the chosen start is saved in `clip.start` and the renderer cuts that window.
2. **Products:** the brand's catalogue photos (catalogue products' stored images), filtered to the story's product
   first.
3. **Library:** the brand's photo library (`BrandProfile.uploads`), photos already used in its posts, photoshoot
   results, and finished reels (`ReelRender.videoKey`). Only this brand's files (the existing `ownMediaKey` rule,
   extended to video keys).
4. **Generate:** for a photo frame, opens the existing Photoshoot flow with the story's product preset; the result
   comes back into this frame. For a video frame, opens the full Reels studio (owner): the person makes a reel there as
   usual (its own item, cost and checks); once it has rendered, it appears in this picker's Library tab and they pick
   it and its 15-second window. The reel needn't be approved or published on its own to be used here: the story's
   approval covers the frame (builder's call). Both are charged at those features' existing prices, and until
   Higgsfield is topped up they fail with the existing "not enough credits" handling.

**AI disclosure.** A frame cut from a reel made with an AI presenter or a cloned voice (`needsAiDisclosure` true for
that reel) is marked `aiMark`, and the renderer burns the same "Made with AI" corner mark into the frame that reels
carry (`server/reels/render.ts`), whatever window was cut. It can't be turned off. A deterministic check blocks
approval if a marked frame's rendered file lacks it (builder's call, following the reels rule).

Using a photo from Products or Library is free. Every frame's `mediaKey` is checked as the brand's own at save.

### The agent writing a story (5 credits)

- "New story" asks the same things as a new post (product, goal: new arrival, product feature, special offer; optional
  direction), then runs the existing chain with `chain: true`, priced like a post.
- The Creator writes 3–5 frames (label, headline, body, last-frame CTA), the link (the product's page), and the
  caption, in the brand's language. It picks frame photos from the product's catalogue photos and the brand library;
  where it has too few it repeats none and leaves an empty frame marked "Add a photo or clip" rather than reusing a
  picture or inventing one.
- The Planner may propose `INSTAGRAM_STORY` as one of an opportunity's variants (with its `opportunityId`, as for posts).
  A planned story has text but may lack media; it can't be approved until every frame has media (a blocker check).
- "Fix it" and Rewrite work on stories as on posts.

### Checks (Quality and deterministic)

Stories reuse every existing check: brand voice, product accuracy (stock, price, offer dates), editorial quality on the
frame text, CTA clarity, and the product gate at approval and again at publishing. Added for stories, computed without
AI:

- 3–5 frames, each with media and a rendered file — blocker if not.
- Each rendered file 1080×1920, photo ≤ 8 MB JPEG, clip ≤ 15 s and under the size cap — blocker.
- Text within the safe area and at least the minimum size — blocker (the renderer guarantees it; the check makes it
  visible).
- The last frame has a CTA and the story has a link — warning.
- Scheduled route with a CTA that says "tap"/"cliquez sur le lien" or similar: warning "Scheduled stories have no
  tappable link; this CTA promises one" with the fix "Use 'Lien en bio' or post by hand".
- AI visual review of the frames: shown as "not checked" (see Non-goals).

### Approval

Unchanged rules: approval of the exact version, Approve anyway for overridable issues by people with both permissions
(as built on 7ad85a0), self-approval when no other approver exists. The approver sees all frames in order (phone:
swipe through; web: a row of 9:16 thumbnails, each opening full size, clips playing).

### Going out

On an approved story the person picks **Schedule story** (Figma's button) or **Post by hand**.

**Schedule (API):**
- Needs an active Instagram connection on a Business account. If the account isn't Business, Schedule is disabled with
  "Instagram only lets business accounts schedule stories. Post it by hand, or switch the account to Business."
  (Builder checks how to detect this from the connection; if it can't be known before posting, the first refusal says
  the same thing.)
- One `PublicationAttempt` as today; the Instagram publisher learns a story branch that, for each frame in order,
  creates a `STORIES` container (`image_url` or `video_url`, signed link valid for an hour), waits until ready, and
  publishes it.
- **No duplicate frames.** The attempt records each published frame's media id as it goes (in its `target` JSON or a
  new `progress` field — builder's call). The attempt lifecycle shared with posts and reels stays as it is: a refusal
  ends the attempt FAILED (item back to APPROVED), and an unknown outcome (timeout, 5xx) ends it `PENDING_VERIFY` with
  "Frames 1–2 were posted; we couldn't confirm frame 3. Check the account before trying again."
- **Partly posted (builder's call).** When an attempt ends with some frames posted, the story shows "Partly posted
  (2 of 4)" with the reason, never "Published". Two actions:
  - **Post the rest:** a new `PublicationAttempt` (as `schedulePublication` makes today) that carries over the posted
    frames' ids and publishes only the missing ones. It goes through the same seal and product gate as any publish,
    so a version change, a stock change or an ended offer refuses it. For a `PENDING_VERIFY` attempt the person first
    says whether the unconfirmed frame appeared (the existing `posted` / `not-posted` settle actions), which decides
    whether that frame counts as posted.
  - **Mark as done:** the item becomes PUBLISHED, with an audit event recording "n of m frames posted".
- Success stores each frame's media id; the attempt's `externalId` is the first frame's id and `externalUrl` its
  permalink (valid 24 h).

**Post by hand:**
- Uses the existing manual route (`ContentItem.postUrl`, the `posted` / `not-posted` actions and
  `content.publish.manual` audit as for studio reels), extended to stories.
- The package: the rendered frames saved to the phone's gallery in order (phone) or downloaded as numbered files plus a
  text file with the link and the copy (web), and on-screen steps: "Open Instagram → add frames 1–4 as a story → add a
  Link sticker with this link (Copy link)".
- The person picks a time when they choose Post by hand. The item stays APPROVED with `scheduledFor` set and a
  "by hand" flag (builder's call: a field on `ContentItem`, so SCHEDULED keeps meaning "we post it"). P07's Scheduled
  tab and the web calendar show it as "Post by hand · Fri 10:00". The person can change the time or switch to
  Schedule until it's posted.
- **In-app reminder (owner, new).** No notification system exists yet, so this adds the smallest one that serves:
  - a `Reminder` row (workspace, brand, user, content item, due time, seen time) created with the Post-by-hand time;
  - when it's due, the phone shows a banner on open (the same pattern as the existing "reel ready" banner), with
    "Post now" opening the package, and the web shows it at the top of Today with the same action;
  - it goes to the person who chose Post by hand (builder's call); it stays until they post, dismiss it, or the story
    is cancelled; push joins later when push notifications are switched on;
  - one reminder per story: changing the time moves it; posting or switching to Schedule removes it.
- After posting they paste the story's link (instagram.com/stories/<account>/<id>); we accept that form (the manual
  reel route's link check extended to it) and mark the story Published.
- The product gate still runs when they open the package; a refusal (stock, offer ended) shows before they download.

### Phone screens

- **P07 Stories:** Figma as drawn, with real data: Drafts (draft, review, awaiting approval, approved), Scheduled
  (scheduled or reminder set), card = first frame's rendered image with the status label ("Waiting for approval",
  "Approved", "Scheduled for Fri 10:00", "Posted"); "…" menu: Duplicate, Delete (drafts only). "Sample preview" pills go.
- **P08 Edit story:** Figma layout for one frame, plus (our addition) a strip of frame thumbnails at the bottom above
  the caption box: tap to switch, + to add (up to 5), long-press to reorder or remove (at least 3 to approve; drafts may
  have fewer). Side tools: **Text** (label, headline, body; CTA on the last frame), **Image** (the four-tab picker,
  photo or clip, crop by drag/pinch), **Brand** (brand mark on/off for this story), **CTA** (CTA text and the link).
  The bottom box shows the story's link and copy in the brand language. **Save draft** and **Schedule story** as
  drawn; Schedule opens a sheet with the time and the two routes (Schedule / Post by hand), with the no-link warning
  on Schedule. Undo (top right) undoes the last change in the editor before saving.
- Everything new is in the app's i18n; new strings English first, translated after the owner approves the wording (as
  before).

### Web

- `INSTAGRAM_STORY` appears in the calendar, the content list filters, Today's approvals and the content workspace.
- The content workspace shows the frames read-only (thumbnails, full size, clips play), the text, link, checks and
  version history; Approve / Request changes / Approve anyway as for posts; Schedule or Post by hand; the manual
  package download.
- No frame editing on the web: "Edit on the phone" note.

## Constraints

- Existing rules hold: approval bound to a version, product gate at approval and publishing, permissions
  (`content.approve`, `rules.approve`, `publish.execute`), audit events for every transition, tenant scoping on every
  key and query.
- Don't break posts, carousels, reels, or the manual reel route; stories extend them.
- Storage: videos go to the private media bucket and are reached only through signed links, like all media.
- Windows dev quirks from `docs/HANDOVER.md` apply (stop the web server before `prisma generate`; Metro on 8082).

## Builder's calls (decided by Claude, not the owner; check while reading)

- 15-second cap per clip, 1080×1920 output, JPEG for photo frames, MP4 (H.264/AAC) for clips.
- The CTA prints on the last frame only.
- Rendering on save (sync, moving to a job only if measured too slow).
- Video upload by presigned URL to our bucket, checked after upload.
- Per-frame progress stored on the existing `PublicationAttempt`, not a new table.
- The size cap for clips set from the first live run (start at 8 MB, re-encode down if over).
- Frames thumbnail strip as the way to handle 3–5 frames on P08 (not in Figma).
- A story's `caption` is kept for the manual package and the writers, never posted by the API.
- Partly posted: "Post the rest" is a new attempt carrying the posted frame ids and re-running the seal and product
  gate; "Mark as done" publishes with an audit note. The shared attempt lifecycle is unchanged.
- Post by hand keeps the item APPROVED with a "by hand" flag and `scheduledFor`; the reminder goes to the person who
  set it.
- Upload cap for phone clips: 100 MB and 3 minutes before trimming.
- A reel used as a frame needs no approval of its own.
- AI-presenter or cloned-voice reel frames always carry the burned "Made with AI" mark, with a blocker check.

## Open, needs money or access before it can be tried live

- A Business Instagram account connected (A12's real login is still untried) to try scheduled stories.
- Higgsfield credits for the Generate tab.
- Push notifications are switched off (Firebase setup pending), so the manual reminder is in-app only until then.
- A finished reel for Generate → video needs Higgsfield credits; until then video frames come from the phone or
  existing reels (none have rendered live yet).
