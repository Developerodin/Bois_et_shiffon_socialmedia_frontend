# Instagram Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `INSTAGRAM_STORY` (3–5 photo or clip frames) end to end: data, uploads, rendering, the agent writer, checks, approval, scheduled and by-hand publishing, the web views and phone P07/P08.

**Architecture:** A new `server/stories/` module owns everything story-specific. Shared code gets small story branches (`publishing.ts`, `publishers.ts`, `quality.ts`, `creator.ts`, `planner.ts`, `brief.ts`, `automations.ts`). Every story version is created by one function, `createStoryVersion`, after its frames are rendered. Story-specific checks replace (not extend) the post rules for stories.

**Tech Stack:** Next.js route handlers, Prisma/Postgres, vitest, sharp (text via its Pango `text` input with `fontfile`, fonts limited by a bundled fontconfig), ffmpeg-static + `ffprobe-static` (new, JSON probe), S3 presigned PUT (`@aws-sdk/s3-request-presigner`), Expo SDK 58 (Expo Router, `expo-file-system` `File.createUploadTask`, `expo-media-library` class API, `expo-clipboard` new, `expo-video`), `fflate` (new, web zip).

**Spec:** `docs/superpowers/specs/2026-11-13-instagram-stories-design.md` (approved 2026-11-13). Read it first.

**Revision:** second draft, after a four-lens review of the first (correctness/money, security, phone/i18n, spec fit). Changes: story checks replace post rules; Post the rest cancels its PARTIAL attempt atomically; renders re-check editability; charge before create with an idempotency key; download-once upload verification; JSON probe; tenant-scoping tests per action; server error codes; phone native setup first; Tasks 12 and 14 split; writer before charge.

## Global Constraints

- 3–5 frames to approve; drafts may have 0–5. Output 1080×1920; photo frames JPEG; clips MP4 H.264/AAC, 15 s window.
- Text caps: label 30, headline 60, body 120, CTA 40 characters. `link` must be `https:`, ≤ 2000 characters.
- Safe area: 250 px clear top and bottom of 1920. Fixed dark gradient behind text.
- Uploads: photos JPG/PNG ≤ 15 MB; videos MP4/MOV ≤ 100 MB, ≤ 180 s, ≤ 4096 px a side, ≤ 60 fps, 1 video stream, ≤ 1 audio stream. Presigned PUT valid 600 s. 20 upload slots per brand per hour. Unused uploads swept after 7 days.
- Render rate limits: 30 per person per hour, 100 per brand per hour (the brand cap counts agent saves too).
- App story writing: 5 credits (`CREDIT_COSTS.storyWrite = 5`), charged before the item exists with `refId` = the client's request id, refunded on final writer failure, on a failed Creator start, and on a failed render of the agent's version. Also counts toward `postAiAllowed`.
- The agent writer uses photo sources only (no clips), so its versions render in the request.
- Server-only body fields (`mediaKey`, `renderedKey`, `aiMark`, `rights`, `file`) are stripped from every client input.
- Every lookup by an id from a client (item, attempt, upload, source) is scoped to `workspaceId` + `brandId`, and an attempt also to its item.
- Permissions: uploads, save, render, sources, duplicate, delete `content.create`; package, by-hand, posted, post-the-rest, mark-done, settle, schedule `publish.execute`; approve unchanged.
- ffmpeg on user files: `-protocol_whitelist file`, explicit `-f mov` input, `-threads 2`, never concat/playlist input. Probing with ffprobe JSON, never by parsing ffmpeg stderr.
- Every user string reaching Pango markup: escape `& < > " '`; strip C0 except `\n`, DEL, C1 (U+0080–009F), bidi controls U+200E, U+200F, U+202A–202E, U+2066–2069, U+2028, U+2029, lone surrogates; trim each line. Fonts only from `apps/web/assets/fonts` (fontconfig file set via `FONTCONFIG_FILE` before sharp loads).
- Every sharp decode of a user or catalogue image sets `limitInputPixels: 40_000_000`.
- `PublishingError` gains an optional `code` (stable string); story refusals always carry one; the problem JSON returns it as `code`.
- Don't change behaviour for posts, carousels, reels or the manual reel route; existing tests keep passing.
- Commit messages: describe the change and why; no co-author, session URL or test mentions (user's CLAUDE.md).
- Windows: stop the web dev server (node process whose command line contains `Social Media Agent`) before `npx prisma generate`/`migrate`; never kill the `Cad` processes. Metro on 8082.
- Phone strings: the existing `stories` block in `apps/mobile/src/i18n/locales/en/posts.json`, English only until the owner approves wording; remove `stories.comingSoon` and `stories.comingSoonBody` from all 24 locales.

## Review Focus

1. **Post the rest tapped twice, or after a failed attempt** must never re-post a frame: Task 10's double-tap and failed-follow-up tests.
2. **A render finishing after the story was approved, scheduled or published** must not create a version: Task 6's editability test.
3. **A file swapped after "done"** must not become VERIFIED: Task 4's swap test.
4. **A reel source whose plan was edited after rendering** must keep its AI mark: Task 3's test.
5. **A by-hand story whose approval lapsed** drops off the due list and refuses the package: Task 11's tests.

---

### Task 1: Schema, error codes and shared format plumbing

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (enum `ContentChannel` + `INSTAGRAM_STORY`; enum `PublicationStatus` + `PARTIAL`; `ContentItem.byHand Boolean @default(false)`; new model `MediaUpload`)
- Create: migration `npx prisma migrate dev --name instagram_stories`
- Modify: `apps/web/server/services/publishing.ts` (`PublishingError(message, status, code?)`; `CHANNEL_PROVIDER`, `IMAGES`, `LIVE` + `"PARTIAL"`, `publishRequirements` adds `frames: [3, 5]` for stories only; export `EDITABLE`)
- Modify: the problem-response helper used by the content routes (`server/api/http-error.ts`) to pass `code`
- Modify: `apps/web/server/services/automations.ts` (autoPublish skips `INSTAGRAM_STORY`)
- Modify: `apps/mobile/src/api/endpoints.ts` (`PostChannel` + `"INSTAGRAM_STORY"`; the API error type exposes `code`)
- Test: `apps/web/tests/stories-requirements.test.ts`

**Interfaces:**
- Produces: `MediaUpload { id, workspaceId, brandId, key (unique), kind "photo"|"video", status "PENDING"|"VERIFIED"|"REJECTED", bytes Int, durationSec Float?, width Int?, height Int?, hasAudio Boolean?, productId String?, rightsConfirmedBy String?, rightsConfirmedAt DateTime?, reason String?, createdBy String, createdAt }`, `@@index([workspaceId, brandId, status, createdAt])`, `@@unique([brandId, productId])`; `new PublishingError(message, status, code?)`; `EDITABLE` exported.

- [ ] **Step 1: Failing tests:** `publishRequirements("INSTAGRAM_STORY")` = `{ provider: "INSTAGRAM", needsImage: false, minImages: 0, maxImages: 0, needsVideo: false, needsBoard: false, frames: [3, 5] }`; `publishRequirements("INSTAGRAM_POST")` has no `frames`; `new PublishingError("x", 400, "story.frames")` has `code === "story.frames"`; the problem response for it contains `"code":"story.frames"`; the autoPublish path returns without scheduling for a story item (mock prisma, call the function that `decide` uses).
- [ ] **Step 2:** `npx vitest run tests/stories-requirements.test.ts` → FAIL.
- [ ] **Step 3:** Schema + migration (dev server stopped), then the code changes; fix every `Record<ContentChannel, …>` the compiler flags with an explicit story entry.
- [ ] **Step 4:** `npx vitest run` and `npx tsc --noEmit` → pass, clean.
- [ ] **Step 5: Commit** "Add the Instagram story format, partly-posted status, by-hand flag, media uploads and error codes".

### Task 2: Story body shape and input parsing

**Files:**
- Create: `apps/web/server/stories/body.ts`
- Test: `apps/web/tests/stories-body.test.ts`

**Interfaces:**
- Produces:
  - `STORY_LIMITS = { frames: [3, 5], maxFrames: 5, label: 30, headline: 60, body: 120, cta: 40, clipSeconds: 15, link: 2000 } as const`
  - `type SourceRef = { kind: "upload" | "library" | "product" | "post" | "photoshoot" | "reel"; id: string }`
  - `type StoryFrameInput = { source?: SourceRef; label: string; headline: string; body: string; composition?: string; crop?: { x: number; y: number; scale: number }; clip?: { start: number; sound: boolean } }`
  - `type FrameFile = { width: number; height: number; bytes: number; durationSec?: number }`
  - `type StoryFrame = StoryFrameInput & { mediaKey?: string; mediaKind?: "photo" | "video"; renderedKey?: string; aiMark?: boolean; rights?: { kind: "owned" } | { kind: "confirmed"; by: string; name: string }; file?: FrameFile }`
  - `type StoryBody = { frames: StoryFrame[]; cta: string; link: string; hook: string; productIds: string[]; brandMark: boolean }`
  - `type StoryInput = { frames: StoryFrameInput[]; cta: string; link: string; brandMark: boolean }`
  - `parseStoryInput(raw: unknown): StoryInput` (zod with `.strip()`; throws `PublishingError(<first issue>, 400, "story.invalid")`)
  - `storySlides(body: Pick<StoryBody, "frames" | "cta">): string[]` (per frame `label\nheadline\nbody` with empties dropped, then the CTA)
  - `isStoryBody(x: unknown): x is StoryBody`

- [ ] **Step 1: Failing tests:** client-sent `mediaKey`, `renderedKey`, `aiMark`, `rights`, `file` are gone after parsing; 6 frames, a 61-char headline, `http://x.fr`, `javascript:alert(1)`, `clip.start: -1` each throw with code `story.invalid`; 0 frames accepted; `storySlides` on `[{label:"COLLECTION",headline:"L'acacia",body:""},{label:"",headline:"Table",body:"Massif"}]` with cta `"Voir"` → `["COLLECTION\nL'acacia", "Table\nMassif", "Voir"]`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Define the story version body and parse story input from clients".

### Task 3: Frame sources and the sources route

**Files:**
- Create: `apps/web/server/stories/sources.ts`
- Create: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/stories/sources/route.ts` (GET `?productIds=…`, `content.create`)
- Modify: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/media/route.ts` (move `imageType` to `server/stories/uploads.ts`… created in Task 4; for now export it from `server/storage/media.ts` and import it back in the route)
- Test: `apps/web/tests/stories-sources.test.ts` (mock `@/server/db/prisma` like the existing tests)

**Interfaces:**
- Consumes: Task 2 types; `needsAiDisclosure` (`server/reels/plan.ts:118`); `safeFetchBytes` (`server/research/crawl.ts:82`); `putMedia`, `mediaKey`, `signedMediaUrl`.
- Produces: `type Resolved = { mediaKey: string; mediaKind: "photo" | "video"; aiMark: boolean; rights: StoryFrame["rights"]; durationSec?: number }`; `resolveSource(scope: { workspaceId: string; brandId: string; userId: string }, ref: SourceRef, opts?: { photosOnly?: boolean }): Promise<Resolved>` (throws `PublishingError("That photo or clip isn't available to this brand.", 400, "story.source")`); `listStorySources(scope, opts: { productIds: string[]; photosOnly?: boolean }): Promise<{ tab: "products" | "library"; items: { ref: SourceRef; title: string; kind: "photo" | "video"; previewUrl: string; durationSec?: number }[] }[]>`.
- Per kind, always filtered by `workspaceId` and `brandId`:
  - `upload` → `MediaUpload` VERIFIED; rights `{ kind: "confirmed", by, name }` (name from the user row) when `rightsConfirmedAt`, else `{ kind: "owned" }` (product copies).
  - `library` → a `BrandProfile.uploads` entry; `post` → a key in the brand's `ContentVersion.body.photoKeys`; `photoshoot` → an output key of a brand `PhotoShoot` (read the model); all rights `owned`.
  - `reel` → `ReelRender` with `step: "DONE"` and that `videoKey`; `aiMark = needsAiDisclosure(<the plan in the version at ReelRender.contentVersionId>)`, never the item's latest version.
  - `product` → the brand's `Product`; reuse `MediaUpload` where `productId` matches; else `safeFetchBytes(imageUrl, "image/jpeg,image/png", 15 MB)`, require status 2xx, `!truncated`, and JPEG/PNG magic bytes (`imageType`), then store VERIFIED with `productId`, rights owned.

- [ ] **Step 1: Failing tests:** each kind resolves for its brand; each kind with another brand's id throws `story.source`; a reel whose rendered version had a presenter but whose latest plan has none → `aiMark: true`; PENDING upload throws; a product fetched twice calls `safeFetchBytes` once; a product URL answering SVG bytes, a 404, or `truncated: true` throws and stores nothing; `photosOnly` refuses a `reel` source; the route returns 403 without `content.create`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Resolve story frame sources from the brand's own records, and list them for the picker".

### Task 4: Phone uploads (slot, verify, sweep)

**Files:**
- Create: `apps/web/server/stories/uploads.ts`, `apps/web/server/stories/probe.ts`
- Create: `…/brands/[brandId]/stories/uploads/route.ts` (POST slot), `…/stories/uploads/[uploadId]/route.ts` (POST done)
- Modify: `apps/web/server/storage/media.ts` (`presignedPut(key, contentType, bytes, seconds)`, `getMediaBytes(key)`; S3 client presigning with `requestChecksumCalculation: "WHEN_REQUIRED"` so no checksum parameters are added)
- Modify: `apps/web/server/jobs/runner.ts:118` (`purgeStaleUploads()` in the daily sweep)
- Add dependency: `npm i ffprobe-static` (+ types if needed)
- Test: `apps/web/tests/stories-uploads.test.ts`, `apps/web/tests/stories-probe.test.ts`, fixtures under `apps/web/tests/fixtures/`

**Interfaces:**
- Produces:
  - `createUploadSlot(scope, input: { kind: "photo" | "video"; contentType: string; bytes: number; rightsConfirmed: true }): Promise<{ uploadId: string; url: string; headers: Record<string, string> }>`: refuses without `rightsConfirmed` (`story.rights`), over size (`story.tooLarge`, 413), bad type (`story.type`), 21st slot/brand/hour (`story.uploadLimit`, 429, `hitRateLimit` key `story-upload:<brandId>`). Key `<ws>/<brand>/uploads/<uuid>.<ext>`.
  - `verifyUpload(scope, uploadId): Promise<{ status: "VERIFIED"; durationSec?: number; previewUrl: string } | { status: "REJECTED"; reason: string; code: string }>`:
    1. claim: `updateMany({ where: { id, workspaceId, brandId, status: "PENDING" }, data: { status: "REJECTED", reason: "checking" } })` must hit 1 row, else 409 `story.uploadState` (two "done" calls can't both work);
    2. `getMediaBytes(uploadKey)` once (≤ declared bytes + 0; a size mismatch rejects);
    3. photos: `imageType` + sharp metadata with `limitInputPixels`; videos: write the bytes to a temp file, `probeVideo`, `videoProblem`;
    4. `putMedia(<ws>/<brand>/<uuid>.<ext>, the same bytes)`, `deleteMedia(uploadKey)`, row VERIFIED with the new key and metadata. On any failure: delete the upload key, keep REJECTED with the reason.
  - `probeVideo(file: string): Promise<VideoMeta>` runs `ffprobe -v error -protocol_whitelist file -f mov -show_streams -show_format -of json <file>` (timeout 20 s); `parseProbeJson(json: string): VideoMeta` (pure); `VideoMeta = { durationSec; width; height; fps; videoStreams; audioStreams }`.
  - `videoProblem(meta): { code: string; message: string } | null` against the Global Constraints limits.
  - `purgeStaleUploads(now = Date.now()): Promise<number>`: PENDING/REJECTED older than 7 days, and VERIFIED without `productId` older than 7 days that no `ContentVersion` of the same brand mentions (`$queryRaw` with the key as a parameter, `%`/`_` escaped); deletes files then rows.

- [ ] **Step 1: Failing tests:**
  - `parseProbeJson` on a real ffprobe JSON fixture of a phone MP4 → 1080×1920, 30 fps, 1 video, 1 audio; on a fixture whose `format.tags.comment` is `"Duration: 00:00:05.00"` it still reports the real duration.
  - `videoProblem` refuses 181 s, 4097 px, 61 fps, 2 video streams, 2 audio streams.
  - slot without `rightsConfirmed` → 400 `story.rights`; 101 MB video → 413; `image/svg+xml` → 400; 21st slot → 429; key under `ws/brand/uploads/`.
  - `presignedPut` URL's `X-Amz-SignedHeaders` includes `content-length` and `content-type` and has no `x-amz-checksum` parameter.
  - **swap test:** `getMediaBytes` is called once and the VERIFIED file's bytes are exactly the probed bytes (a second, different object at the upload key after the read never reaches `putMedia`).
  - a second concurrent `verifyUpload` on the same row → 409 `story.uploadState`.
  - another brand's `uploadId` → 404.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Let the phone upload story photos and clips through checked, single-use upload slots".

### Task 5: The frame renderer

**Files:**
- Create: `apps/web/server/stories/render.ts`
- Create: `apps/web/assets/fonts/` (Inter Regular/SemiBold TTF from the `@expo-google-fonts/inter` package the app already uses, `NotoSans-Regular.ttf`, `NotoSansArabic-Regular.ttf`, `NotoSansDevanagari-Regular.ttf`; all OFL) and `apps/web/assets/fonts/fonts.conf` (only that directory)
- Modify: `apps/web/server/reels/render.ts:396-398` (export the mark as `aiMarkPng(line)`, same output)
- Test: `apps/web/tests/stories-render.test.ts`, fixture `tests/fixtures/photo-2000x1500.jpg`

**Interfaces:**
- Consumes: Task 2 types; `run` (`server/reels/join.ts:14`); `aiMarkPng`, `aiDisclosureLine`; `mediaExists`, `putMedia`.
- Produces:
  - `escapeMarkup(s: string): string` (the Global Constraints rule).
  - `type RenderOpts = { scope: { workspaceId: string; brandId: string }; language: string; isLast: boolean; cta: string; brandMark: boolean; logoKey?: string }`
  - `renderInputsHash(frame: StoryFrame, opts: RenderOpts): string`: sha256 of source key, label, headline, body, crop, clip, `isLast ? cta : ""`, `aiMark`, `brandMark ? logoKey : ""`, language, `RENDERER_VERSION = 1`.
  - `renderedKeyFor(scope, hash, kind: "photo" | "video")` → `<ws>/<brand>/stories/<hash>.jpg|mp4`; existing file reused, never overwritten.
  - `TEXT_BOX` (exported numbers the phone copies) and `textFits(frame, isLast, cta): { fits: true } | { fits: false; field: "label" | "headline" | "body" | "cta" }`.
  - `renderPhotoFrame(frame, opts): Promise<{ key: string; file: FrameFile }>` (sharp with `limitInputPixels`; fit 1080×1920 with crop; gradient; Pango text layers with `fontfile`; label upper-cased with `toLocaleUpperCase(language)` only for cased scripts; `rtl` for `ar|he|fa|ur`; brand mark when on; AI mark when `frame.aiMark`).
  - `clipArgs(input, overlayPng, out, clip: { start: number; sound: boolean }, mark?: string): string[]` (pure).
  - `renderClipFrame(frame, opts): Promise<{ key: string; file: FrameFile }>`: overlay PNG from the same layout, `run(clipArgs(...), 110_000)`, over 8 MB re-encoded once at a lower bitrate else `PublishingError("Frame <n> is too large after compression.", 422, "story.frameTooLarge")`.

- [ ] **Step 1: Failing tests:** `escapeMarkup('<image href="x"/> & \u0007‮abc')` → `'&lt;image href=&quot;x&quot;/&gt; &amp; abc'`; U+2028 and a lone `\uD800` removed; `renderInputsHash` changes when the headline changes, and **when the frame moves from last to not-last** (reorder), and when `aiMark` changes; `clipArgs` contains `-protocol_whitelist file`, `-f mov` before `-i`, `-threads 2`, `-ss 12`, `-t 15`, `-an` iff sound false, no `concat`/`http`; `textFits` false for 60 × "W", true for "L'acacia, tout naturellement."; `renderPhotoFrame` on the 2000×1500 fixture (inject `put`) returns `file: { width: 1080, height: 1920 }` and a JPEG.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Render story frames with their text burned in, safely escaped and content-addressed".

### Task 6: Saving story versions, and the content routes for stories

**Files:**
- Create: `apps/web/server/stories/service.ts`
- Modify: `apps/web/server/jobs/runner.ts` (register `STORY_RENDER_JOB = "story.render"`)
- Modify: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/[contentId]/route.ts`: actions `editStory { version, story }`, `duplicate`, `delete` (all `content.create`; `editStory` joins `startsAi`); `GET` for a story adds `{ rendering, renderError, frames: [{ n, url, kind, headline }] }` with URLs signed 3600 s
- Modify: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/route.ts` GET: stories carry `firstFrameUrl` and `tab: "drafts" | "scheduled" | "posted"` (from `storyTab`)
- Modify: `apps/web/server/services/publishing.ts` `saveDraft`: refuse stories (`PublishingError("Stories are saved with editStory", 400, "story.useEditStory")`)
- Test: `apps/web/tests/stories-save.test.ts`

**Interfaces:**
- Produces:
  - `saveStoryVersion(scope: { workspaceId; brandId; userId }, itemId, baseVersion: number, input: StoryInput, actor: { kind: "person"; userId: string } | { kind: "agent"; runId: string; model?: string; chargeId?: string }, opts?: { photosOnly?: boolean }): Promise<{ status: "saved"; version: number } | { status: "rendering" }>`: rate limits (`story-render:user:<id>` 30/h for people; `story-render:brand:<id>` 100/h for everyone, 429 `story.renderLimit`); item scoped and `INSTAGRAM_STORY` and in `EDITABLE` (409 `story.notEditable`); resolve sources; `textFits` each frame (400 `story.textFit` naming frame and field); photos only → render now → `createStoryVersion`; any clip → enqueue `STORY_RENDER_JOB` `{ workspaceId, brandId, itemId, baseVersion, frames (resolved), cta, link, brandMark, actor, next: 0 }` with `maxAttempts: 2`, return `rendering`.
  - `createStoryVersion(tx, scope, itemId, baseVersion, body: StoryBody, actor)`: under `lock`, re-reads the item **scoped**; item still in `EDITABLE` (else 409 `story.notEditable`) and latest version = `baseVersion` (else 409 `story.stale`, "Someone else changed this story. Your changes weren't saved."); creates the version (server fields, `hook` = frame 1 headline, `productIds` from the previous version or item); status `DRAFT_REVIEW`; `byHand: false`; audit `content.edit`. The caller starts Quality (route for people, as for posts; the job and the writer call `startAgentRun(quality, event)` themselves).
  - `runStoryRender(payload)`: renders **one** clip frame per run (`payload.next`), stores the result in the payload and re-enqueues itself for the next; after the last, renders photo frames (cached by hash) and calls `createStoryVersion`; the job's failure lands in `Job.lastError`; when `actor.kind === "agent"` and `actor.chargeId`, a final failure calls `refundCharge`.
  - `storyRenderState(scope, itemId): Promise<{ rendering: boolean; error?: string }>` (pending/claimed job for this item and brand, else the newest failed job's `lastError` since the last version).
  - `storyTab(item, attempts): "drafts" | "scheduled" | "posted"`: drafts = PLANNED, BRIEF_READY, DRAFT_REVIEW, AWAITING_APPROVAL, REJECTED, BLOCKED, APPROVED without `byHand`; scheduled = SCHEDULED without a PARTIAL/PENDING_VERIFY attempt, APPROVED with `byHand`; posted = PUBLISHED or any PARTIAL/PENDING_VERIFY attempt.
  - `duplicateStory(scope, itemId)` (new item, status PLANNED, copy of the latest body without server render fields re-resolved on next save; `productIds`, `opportunityId` copied); `deleteStory(scope, itemId)` (only drafts tab statuses; cascades).

- [ ] **Step 1: Failing tests:** client `renderedKey` never reaches the version; photo-only save → version, DRAFT_REVIEW, `byHand` false; clip save → job enqueued with `maxAttempts: 2`, no version; **stale base** → 409 `story.stale` and no extra version; **editability:** item approved while the job runs → 409 `story.notEditable`, no version; same for PUBLISHED; 31st person render → 429; agent saves count toward the brand cap; another brand's `itemId` → 404; `saveDraft` on a story → 400; `storyTab` table-driven over the statuses above; `deleteStory` on a SCHEDULED story → 409; an agent render failure with `chargeId` calls `refundCharge` once.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Save every story version through one render step, with clip renders in the job queue".

### Task 7: The agent writes stories (Creator, Brief writer, Planner)

**Files:**
- Create: `apps/web/server/stories/writer.ts`
- Modify: `apps/web/server/agents/definitions/creator.ts` (stories go to `writeStory`; the "blocked drafts to rewrite" selection at line ~70 skips stories whose blocker rows are only `Frames`, `Frame files` or `Asset rights`)
- Modify: `apps/web/server/agents/definitions/brief.ts:14-22` (optional `frames: { purpose: string; composition: string }[]` for stories)
- Modify: `apps/web/server/agents/definitions/planner.ts:13-14` (`CHANNELS` + `"INSTAGRAM_STORY"`, prompt line)
- Modify: `apps/web/server/agents/prompts/content.ts` (story section)
- Test: `apps/web/tests/stories-writer.test.ts`

**Interfaces:**
- Consumes: `saveStoryVersion` with `actor.kind = "agent"` and `opts.photosOnly = true`; `listStorySources` with `photosOnly`; the Creator's `knowledge`, product and campaign lines, `last`, `reviewer`, `report`.
- Produces: `writeStory(ctx, item, shared: { knowledge: string; productsLine: string; campaignLine: string; last?: StoryBody; reviewer?: string; report?: CheckResult[]; chargeId?: string }): Promise<void>`.
  - First write: AI schema `{ frames: { sourceId: string; label: string; headline: string; body: string; composition: string }[]; cta: string }`; `validate`: 3–5 frames, caps, `textFits` per frame (re-ask on failure), `sourceId` "" or in the offered list, no source twice.
  - Rewrite (`last` present): schema `{ frames: { label; headline; body; composition }[]; cta }` with exactly `last.frames.length` frames; sources, crop, clip and `brandMark` are copied from `last`; same `validate` minus sources.
  - `link` is always the linked product's URL (never from the model); a story without a product keeps `last.link` or the brand website.

- [ ] **Step 1: Failing tests** (AI mocked via `mock`): first write → `saveStoryVersion` called with the picked photo sources and the product URL as link; reused source / 2 frames / an over-wide headline fail `validate`; a rewrite of a 4-frame story with a phone clip on frame 2 keeps that clip, its crop and window; the Creator's blocked-draft selection skips a story whose only blocker is `Frames`; Planner schema accepts `INSTAGRAM_STORY`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Let the agents plan and write Instagram stories".

### Task 8: Creating a story and charging for it

**Files:**
- Modify: `apps/web/server/services/credits.ts:9` (`storyWrite: 5`)
- Create: `createStory` in `apps/web/server/stories/service.ts`
- Modify: content collection route POST (`channel: "INSTAGRAM_STORY"` with `{ goal, productId, direction?, requestId }`; `requestId` = uuid from the app)
- Test: `apps/web/tests/stories-create.test.ts`

**Interfaces:**
- Produces: `createStory(scope, input: { goal: "newArrival" | "productFeature" | "specialOffer"; productId: string; direction?: string; requestId: string }): Promise<{ id: string; chargeId: string | null; repeated: boolean }>`:
  1. product must be the brand's (400 `story.product`, nothing charged);
  2. `spendCredits({ amount: 5, reason: "story-write", refId: requestId, userId })` (a repeat `requestId` returns the existing item: look up the item created with that `requestId` in its brief and return `repeated: true`, no new item);
  3. `InsufficientCreditsError` → 402 `story.credits`, no item;
  4. item (`INSTAGRAM_STORY`, BRIEF_READY, brief `{ goal, products: [title], keyMessage, angle: goal, requestId }`, `productIds: [productId]`, `campaignId` via `liveOfferFor` for specialOffer) + audit;
  5. the route starts the Creator with `prepaidChargeId: chargeId`; if `startAgentRun` throws, `refundCharge` and set the item BLOCKED with brief note "Writing didn't start. Try again." (`story.writeStart`).
- "Fix it" / Rewrite on a story are free (as for posts). Rewrite of a story that has no version and whose charge was refunded charges again with `refId = <itemId>:retry:<n>`.

- [ ] **Step 1: Failing tests:** creates the item and charges 5 with `refId` = requestId; same requestId twice → one item, one charge; another brand's product → 400, no charge; no credits → 402, no item; `startAgentRun` throwing → refund called once and item BLOCKED; rewrite after refund → a new charge with the retry refId.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Let the app ask the agent for a story, charged 5 credits once and refunded if writing fails".

### Task 9: Checks for stories

**Files:**
- Create: `apps/web/server/stories/checks.ts`
- Modify: `apps/web/server/agents/definitions/quality.ts:89,98,100` (for stories: `checkStory(body)` **instead of** `checkDraft`; `draftText` and the LanguageTool input from `storySlides(body)`; the AI prompt gets the story line below)
- Test: `apps/web/tests/stories-checks.test.ts`

**Interfaces:**
- Produces: `checkStory(body: StoryBody): CheckResult[]` with exactly these check names:
  - `"Frames"`: blocker unless 3–5 frames, each with `renderedKey` and `file`.
  - `"Frame files"`: blocker unless every `file` is 1080×1920, photos ≤ 8 MB, clips ≤ 15.5 s and ≤ 8 MB.
  - `"Text fits"`: blocker when `textFits` fails for any frame (names the frame).
  - `"Link and CTA"`: warn when either is empty.
  - `"Asset rights"`: pass; note lists per frame "Brand's own" or "Confirmed by <name>"; blocker when a frame has no `rights`.
  - `"Visual review"`: warn, "Not checked: the photos and clips weren't reviewed by AI."
- Product rows, offer rows and the AI review run as for posts on the story's text. AI prompt line for stories: "Stories have no caption and no clickable link when scheduled. A CTA that promises a tap or swipe is a warning: suggest 'Link in bio' or posting by hand."

- [ ] **Step 1: Failing tests:** a real 4-frame `StoryBody` through Quality's rule step returns no `Caption`, `Hashtags`, `First line` or `Alt text` rows and does not throw; 2 frames → `Frames` blocker; a 1080×1350 file → `Frame files` blocker; a frame without rights → `Asset rights` blocker; empty link → warn; `Visual review` always warn; LanguageTool input equals `storySlides(body).join("\n")`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Check stories with their own rules plus the shared text, product and offer checks".

### Task 10: Publishing stories (schedule, partial, settle, post the rest)

**Files:**
- Modify: `apps/web/server/integrations/publishers.ts` (Instagram story branch)
- Create: `apps/web/server/stories/publish.ts`
- Modify: `apps/web/server/services/publishing.ts` (`schedulePublication` story path; `executePublication` story path; `onPublishJobLost` story path; `settlePublication` story branch; `decide` clears `byHand` when leaving APPROVED)
- Modify: content `[contentId]` route (actions `postRest { attemptId, confirm?: boolean }`, `markDone { attemptId }`, `settleFrame { attemptId, frame, appeared }`, all `publish.execute`)
- Test: `apps/web/tests/stories-publish.test.ts`

**Interfaces:**
- Produces (pure, `stories/publish.ts`):
  - `type FrameProgress = { i: number; state: "publishing" | "published" | "not-posted"; mediaId?: string; at?: string }[]` (in `PublicationAttempt.target.progress`; `at` = ISO time published).
  - `nextFramesToPublish(total, progress): number[]` (throws on any `publishing`).
  - `attemptOutcome(total, progress): "PUBLISHED" | "PARTIAL" | "FAILED"` (FAILED only when nothing is published).
  - `settleStoryFrame(progress, frame, appeared): FrameProgress`.
  - `expiredFrames(progress, now): number` (published more than 24 h ago).
  - `publishingLimitRoom(res: { config: { quota_total: number }; quota_usage: number }): number`.
- Publisher story input: `story: { frames: { url: string; kind: "photo" | "video" }[]; skip: number[]; onPublishing(i): Promise<void>; onPublished(i, mediaId): Promise<void> }`; phase 1 creates all non-skipped containers in parallel and waits for all (videos 60 tries); phase 2 publishes in order with the callbacks; returns frame 1's (or the first newly published) id and permalink. URLs signed just before each container is created.
- `executePublication` story path: seal + product gate; `GET /{ig-id}/content_publishing_limit?fields=config,quota_usage`, too little room → FAILED `story.dailyLimit` ("Instagram's daily limit leaves room for <n> of <m> frames. Try after <time>."), publisher not called; phase-1 error → FAILED (nothing posted; account-type errors use the spec's Business-account message, code `story.businessOnly`); an error after ≥ 1 frame published → PARTIAL; unknown outcome or job lost → PENDING_VERIFY "Frames 1–<k> were posted; we couldn't confirm frame <k+1>. Check the account." Item: PUBLISHED on success, SCHEDULED while PARTIAL/PENDING_VERIFY, APPROVED only on FAILED. On success store `externalId` and `externalUrl`.
- Settle story branch: `settleFrame` updates progress with `settleStoryFrame` → attempt PUBLISHED (item PUBLISHED) or PARTIAL; the whole-item `posted` shortcut refuses stories (`story.settleFrame`).
- `postRest(scope, itemId, attemptId, confirm)`: under `lock` in one transaction: attempt scoped to item and brand, `updateMany({ where: { id, status: "PARTIAL" }, data: { status: "CANCELLED" } })` must hit 1 (else 409 `story.alreadyHandled`); if `expiredFrames > 0` and not `confirm` → 409 `story.expiredConfirm` with the count (no change: roll back); create the new attempt with `target.progress` = the old progress's published frames; then `executePublication` runs as usual. A follow-up attempt that fails before posting anything new **ends PARTIAL** (it carries published frames), so the item stays SCHEDULED and the actions stay available.
- `markDone(scope, itemId, attemptId)`: attempt PARTIAL (scoped) → `CANCELLED`, item PUBLISHED, audit `content.publish.partial-done` `{ posted, total }`.

- [ ] **Step 1: Failing tests:**
  - `nextFramesToPublish`, `attemptOutcome`, `settleStoryFrame`, `expiredFrames` table tests.
  - publisher mocked to fail on frame 3 of 4 → attempt PARTIAL, item SCHEDULED, progress 0–1 published.
  - **LIVE pin:** force the item to APPROVED after a PARTIAL attempt, then `schedulePublication` → 409 (only PARTIAL in `LIVE` blocks it).
  - **double tap:** two `postRest` calls on one PARTIAL attempt → one new attempt, the other 409 `story.alreadyHandled`.
  - **failed follow-up:** the new attempt hits the daily limit → it ends PARTIAL, item stays SCHEDULED, a third `postRest` works and skips frames 0–1.
  - `postRest` with frames older than 24 h and no `confirm` → 409 `story.expiredConfirm`, nothing changed.
  - daily limit 2 of 4 → FAILED, publisher never called.
  - `postRest`, `markDone`, `settleFrame` with another brand's or another item's `attemptId` → 404.
  - `decide(CHANGES_REQUESTED)` on an APPROVED by-hand story → `byHand` false.
- [ ] **Step 2–4:** FAIL, implement, PASS; the existing publishing tests pass unchanged.
- [ ] **Step 5: Commit** "Publish stories frame by frame without ever posting a frame twice, and handle partly posted stories".

### Task 11: Post by hand (flag, due list, package, "I posted it")

**Files:**
- Create: `apps/web/server/stories/by-hand.ts`
- Create: `apps/web/server/services/manual-post.ts` (`registerManualPost`, moved out of `server/reels/service.ts:226-238`; reels keep their URL requirement, regex and message)
- Create: `…/brands/[brandId]/stories/[contentId]/package/route.ts` (GET JSON; `?format=zip` streams the zip)
- Create: `…/brands/[brandId]/stories/due/route.ts`
- Modify: content `[contentId]` route (actions `byHand { at: string | null }`, `postedByHand { url?: string }`, `publish.execute`)
- Add dependency: `npm i fflate` in `apps/web`
- Test: `apps/web/tests/stories-by-hand.test.ts`

**Interfaces:**
- Produces:
  - `setByHand(scope, itemId, at: Date | null)`: scoped item, APPROVED with current approval; refuses with a SCHEDULED attempt (`story.cancelScheduledFirst`); sets/clears `byHand` + `scheduledFor`.
  - `dueByHand(scope, now = new Date())`: `byHand`, APPROVED, `scheduledFor <= now`, current approval holds → `{ id, title, scheduledFor, firstFrameUrl }[]`; the route requires `publish.execute` on every request.
  - `storyPackage(scope, itemId)`: current approval + product gate (409 with the gate's message, `story.gate`) → `{ frames: { n, url, kind }[]; link; steps: string[] }`, URLs 3600 s. Route: rate limit 20 per user per hour (`story-package:<userId>`), `Cache-Control: no-store`, audit `content.package.download`; zip uses fflate `Zip` + `ZipPassThrough` (no compression), streamed, `Content-Disposition: attachment; filename="story-<itemId>.zip"`.
  - `STORY_LINK = /^https:\/\/(www\.)?instagram\.com\/stories\/([A-Za-z0-9._]{1,30})\/(\d{5,25})\/?$/` applied to the URL with its query removed; input over 300 characters refused; with an active Instagram connection, group 2 must equal its `displayName` without `@` (case-insensitive) (`story.linkAccount`).
  - `registerManualPost(scope, itemId, url: string | undefined, kind: "reel" | "story")`: stories accept no URL; both write `content.publish.manual`; stories clear `byHand`.
- `byHand` is cleared by `createStoryVersion` (Task 6), `decide` (Task 10), `schedulePublication`'s story path, and `registerManualPost`.

- [ ] **Step 1: Failing tests:** `STORY_LINK` accepts `https://www.instagram.com/stories/boisetchiffons/3361234567890123456/` and the same with `?igsh=x`; refuses `http://`, `/p/…`, a 301-character URL, another account's handle when connected; `dueByHand` lists a due approved story and drops it after a new version and after `byHand` clears; the due route without `publish.execute` → 403; `storyPackage` with an ended offer → 409 `story.gate`; package for another brand's item → 404; `registerManualPost(…, undefined, "story")` → PUBLISHED; a reel without URL → 400 as before; the zip unzips (fflate) to `frame-1.jpg … frame-n` + `link.txt`; the 21st package in an hour → 429.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Let people post a story by hand from a checked package, with a due list for everyone who can publish".

### Task 12: Web A: stories in lists, calendar and the content workspace (read-only + approval)

**Files:**
- Create: `apps/web/scripts/seed-story.ts` (tracked; seeds a 4-frame photo story for the dev Bois & Chiffons brand from library photos, no AI calls; `--status approved|draft`; prints the item id; `--remove <id>`)
- Modify: `apps/web/app/(shell)/calendar/page.tsx` and its components (story label; by-hand slots "Post by hand · <time>")
- Modify: `apps/web/components/workspace/content-panels.tsx` (story panel: 9:16 thumbnails, full size on click, `<video controls>` for clips, checks, version history, Approve / Request changes / Approve anyway, "Edit on the phone")
- Modify: `apps/web/components/workspace/draft-editor.tsx` (no editor for stories)
- Modify: the content list channel filter (find with `grep -rn "INSTAGRAM_CAROUSEL" apps/web/app apps/web/components`)
- Test: `apps/web/e2e/stories.spec.ts` (part 1)

- [ ] **Step 1:** e2e: seed a draft story → open it from the calendar → 4 frames visible → approve → status Approved. Run `PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/stories.spec.ts` → FAIL.
- [ ] **Step 2:** Implement. **Step 3:** run → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 4: Commit** "Show stories on the web: calendar, lists and the content workspace with approval".

### Task 13: Web B: going out on the web

**Files:**
- Modify: `apps/web/components/workspace/content-panels.tsx` (Schedule / Post by hand with time; zip download; "I posted it" with optional link; Partly posted: Post the rest (with the expiry confirm), Mark as done; "Did frame N appear?" Yes / No)
- Modify: `apps/web/app/(shell)/page.tsx` (Today: due card from `/stories/due`, one card with a count, dismiss per browser for 24 h in `localStorage`)
- Test: `apps/web/e2e/stories.spec.ts` (part 2)

- [ ] **Step 1:** e2e: seeded approved story → Post by hand at a past time → Today shows the due card → download zip (response 200, `application/zip`) → I posted it → Published. Run → FAIL.
- [ ] **Step 2:** Implement. **Step 3:** run → PASS.
- [ ] **Step 4: Commit** "Let people schedule, download and post stories by hand from the web".

### Task 14: Phone A: native setup, API client, P07 and Today

**Files:**
- Native: `npx expo install expo-media-library expo-clipboard` in `apps/mobile`; `app.json` plugins: `expo-image-picker` (camera + photos permission strings), `expo-media-library` (save-to-gallery permission string); `npx expo prebuild --platform android --no-install`; re-add `cmake.dir` to `android/local.properties`; rebuild the dev APK (`gradlew.bat app:assembleDebug -PreactNativeArchitectures=x86_64`), `adb install -r`, re-set the dev host to `10.0.2.2:8082` (fresh installs lose it, see `docs/HANDOVER.md`), grant `ACCESS_LOCAL_NETWORK`
- Modify: `apps/mobile/src/api/endpoints.ts` (`stories` group: `list`, `create(requestId…)`, `get`, `editStory`, `duplicate`, `remove`, `sources`, `uploadSlot`, `uploadDone`, `package`, `due`, `byHand`, `postedByHand`, `postRest`, `markDone`, `settleFrame`; types mirroring Task 2)
- Modify: `apps/mobile/src/ui/posts/use-posts.ts` (exclude `INSTAGRAM_STORY` from posts lists; Today/calendar entries for stories route to `/posts/story/[id]`)
- Create: `apps/mobile/src/ui/stories/card.tsx`, `due-card.tsx`, `use-stories.ts`, `errors.ts` (`storyError(e): string` mapping `code` → `t("stories.errors.<code>")`, fallback the server text)
- Modify: `apps/mobile/src/app/posts/stories.tsx`, `apps/mobile/src/app/posts/index.tsx` (due card on Today)
- Modify: `apps/mobile/src/i18n/locales/en/posts.json` (`stories.*`), and remove `stories.comingSoon*` from all locales

**Interfaces:**
- `useStories(): { tabs: Record<"drafts" | "scheduled" | "posted", StoryCard[]>; due: DueStory[]; loading; error; refresh }` using the server's `tab` field (Task 6).
- P07 per Figma: brand chip, title/subtitle, **New story** sheet (product, goal, direction, "5 credits"; button disabled while sending; one `requestId` per sheet open; on success a "Writing…" card in Drafts that refreshes every 5 s until a version exists; `story.credits` → link to Plans; 429 → limit message), three tabs with counts, cards (first frame or "Add photos" placeholder, status label, "…" Duplicate / Delete on drafts), due card above the tabs (dismiss 24 h in SecureStore), Posted cards with Post the rest / Mark as done / "Did frame N appear?"; loading, empty ("No stories yet" + New story) and error (Try again) states.

- [ ] **Step 1:** Native setup + rebuild; app opens on the emulator.
- [ ] **Step 2:** API group, use-posts change, P07, Today card; `npx tsc --noEmit` and `npx expo lint` clean.
- [ ] **Step 3: Emulator:** seed with `scripts/seed-story.ts` (draft and approved by-hand-due); P07 shows each in the right tab; due card on Today and P07; New story → "Writing…" card → a draft appears (one AI call; uses the dev workspace's credits); screenshots via `adb emu screenrecord screenshot <path>`.
- [ ] **Step 4: Commit** "Show real stories on the phone's Stories and Today screens".

### Task 15: Phone B: story detail, scheduling and posting by hand

**Files:**
- Create: `apps/mobile/src/app/posts/story/[id].tsx`
- Modify: `apps/mobile/src/app/posts/schedule.tsx` (story mode: Schedule / Post by hand; change time; cancel by hand)
- Create: `apps/mobile/src/ui/stories/package.ts`
- Modify: `apps/mobile/src/i18n/locales/en/posts.json`

**Interfaces:**
- Detail: swipe through frames (`expo-video` for clips), checks with Fix it, Approve / Approve anyway / Request changes (reuse parts of `posts/[id].tsx`), "Preparing frames" while `rendering`, the render error with Try again, frame-settle prompt, Post the rest (expiry confirm) / Mark as done.
- `saveFramesToGallery(pkg, title): Promise<"saved" | "shared">`: **read https://docs.expo.dev/versions/v58.0.0/sdk/media-library/ first**; download each frame with `File.downloadFileAsync` to cache, then the SDK 58 class API (`Asset.create`, `Album.create("Espanda – <title>", assets)`) in frame order; permission denied → share sheet one frame at a time like `src/ui/reels/download.ts`.
- By-hand view: Save frames, numbered steps, **Copy link** (`expo-clipboard`), **I posted it** with an optional link field.

- [ ] **Step 1:** Implement detail + scheduling; tsc + lint.
- [ ] **Step 2:** Implement package + by-hand view; tsc + lint.
- [ ] **Step 3: Emulator:** seeded draft story → Save and check path → approve → Post by hand now → Save frames (album has frames in order; deny permission once → share sheet) → Copy link → I posted it → Posted tab.
- [ ] **Step 4: Commit** "Let people approve, schedule and post stories by hand from the phone".

### Task 16: Phone C: the editor shell (P08)

**Files:**
- Modify: `apps/mobile/src/app/posts/edit-story.tsx`
- Create: `apps/mobile/src/ui/stories/preview.tsx` (`<StoryPreview frame isLast cta brandMark editing />`: true 9:16, letterboxed, safe-area guide when `editing`), `frame-strip.tsx` (`<FrameStrip frames selected onSelect onAdd onMove(i, dir) onRemove(i) />`, "…" menu per thumbnail, + up to 5), `limits.ts` (copy of `STORY_LIMITS` and `TEXT_BOX`, comment pointing to `server/stories/body.ts` and `render.ts`)
- Modify: `apps/mobile/src/i18n/locales/en/posts.json`

**Interfaces:**
- Tools Text (label, headline, body with live fit warning), Brand (switch), CTA (CTA + link; "No tappable link when scheduled" note); bottom box "Link: …"; **Save draft**; main button **Save and check** (→ `/posts/story/[id]`) or **Schedule story** when approved and unchanged; Undo (last change); discard prompt on leaving with changes; read-only "Preparing frames" while rendering; accessibility labels "Frame 2 of 4, video: <headline>".

- [ ] **Step 1:** Implement; tsc + lint.
- [ ] **Step 2: Emulator:** open the seeded draft, edit frame text past the fit limit (warning), move a frame, remove one, Save draft → new version; Save and check → detail.
- [ ] **Step 3: Commit** "Let people edit a story's frames, text and CTA on the phone".

### Task 17: Phone D: picker and phone uploads

**Files:**
- Create: `apps/mobile/src/ui/stories/picker.tsx` (tabs Phone / Products / Library / Generate; Generate is wired in Task 19, show it disabled until then), `upload.ts`
- Modify: `apps/mobile/src/app/posts/edit-story.tsx` (Image tool)

**Interfaces:**
- Phone tab: rights question first ("We own or may use this"); then `expo-image-picker` (library or camera, images and videos).
- `uploadToSlot(uri, kind, bytes, contentType, onProgress): { promise: Promise<{ uploadId: string; durationSec?: number }>; cancel(): void }` with `File.createUploadTask` (PUT, returned headers, progress); offline → "Offline: we'll try again" and retry when back; backgrounded → retry on return; **every retry requests a new slot** (URLs last 600 s); cancel stops the task and drops the slot; then `uploadDone`; a REJECTED answer shows its mapped reason.

- [ ] **Step 1:** Implement; tsc + lint.
- [ ] **Step 2: Emulator:** push test media (`adb push clip-30s.mp4 /sdcard/Movies/` then `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Movies/clip-30s.mp4`); refuse the rights question → no upload; accept → progress → frame shows the clip; Library and Products tabs fill frames; airplane mode mid-upload → offline message → back online → retried.
- [ ] **Step 3: Commit** "Let people pick or upload a story frame's photo or clip, with a rights confirmation".

### Task 18: Phone E: crop, trim and sound

**Files:**
- Create: `apps/mobile/src/ui/stories/crop.tsx` (drag + pinch only while Image mode is open, Fit / Fill buttons; locked for reel sources), `trim.tsx` (15 s window over the clip, preview plays the window; `react-native-gesture-handler` + `react-native-reanimated`, both installed)
- Modify: `apps/mobile/src/app/posts/edit-story.tsx` (sound switch on clip frames)

- [ ] **Step 1:** Implement; tsc + lint.
- [ ] **Step 2: Emulator:** the 30 s clip opens the trim at 0–15 s; move to 12–27 s; sound off; crop with Fill; Save → "Preparing frames" → rendered frame plays the chosen window without sound (job runner running: the web dev server kicks it).
- [ ] **Step 3: Commit** "Let people crop frames, pick a clip's 15 seconds and switch its sound".

### Task 19: Phone F: Generate and the way back

**Files:**
- Modify: `apps/mobile/src/ui/stories/picker.tsx` (Generate tab enabled)
- Modify: `apps/mobile/src/app/reels/review.tsx` and the Photoshoot result screen (`src/app/photoshoot/…`, find the result route) — with `returnTo=story:<id>:<frame>` they show **Use in story**

**Interfaces:**
- Before leaving for Reels or Photoshoot the editor saves the draft (`editStory`) and passes `returnTo`; **Use in story** returns to `/posts/edit-story?id=<id>&frame=<n>&source=<kind>:<id>` and the editor applies the source (trim open for reels).

- [ ] **Step 1:** Implement; tsc + lint.
- [ ] **Step 2: Emulator** (no Higgsfield credits): open `reels/review` for an existing reel with a `videoKey` from the dev DB (or seed one by copying any MP4 into the bucket and a DONE `ReelRender` row with `scripts/seed-story.ts --reel`) with `returnTo` → Use in story → back in the editor with the reel on that frame and the trim open; Generate → Photoshoot opens with the product preset.
- [ ] **Step 3: Commit** "Let people make a frame with Photoshoot or Reels and bring it back into the story".

### Task 20: Wrap-up

**Files:**
- Modify: `docs/HANDOVER.md` (top section: what was built, how to try it, what needs a Business account / Higgsfield / push / translation; the new dev build)
- Modify: `docs/handover/2026-11-05-brief-gap-audit.md` (A6: story channel present)

- [ ] **Step 1:** `npx vitest run`, `npx tsc --noEmit` (web), `npx tsc --noEmit && npx expo lint` (mobile); report results in the conversation, not in the commit.
- [ ] **Step 2:** Four-lens review of the branch diff (correctness/money, security, phone UI + i18n, spec + simplicity); fix findings.
- [ ] **Step 3: Commit** "Record the stories work in the handover".
