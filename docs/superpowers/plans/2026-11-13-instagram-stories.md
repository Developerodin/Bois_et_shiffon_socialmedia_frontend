# Instagram Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `INSTAGRAM_STORY` (3–5 photo or clip frames) end to end: data, uploads, rendering, the agent writer, checks, approval, scheduled and by-hand publishing, the web views and phone P07/P08.

**Architecture:** A new `server/stories/` module owns everything story-specific (body shape, sources, uploads, rendering, saving, writing, publishing helpers). Shared code gets small story branches: `publishing.ts` (requirements, executor, settle), `publishers.ts` (Instagram story branch), `rules.ts`, `quality.ts`, `creator.ts`, `planner.ts`, `brief.ts`. Every story version is created by one function, `saveStoryVersion`, which renders first.

**Tech Stack:** Next.js route handlers, Prisma/Postgres, vitest, sharp (text via Pango `text` input with `fontfile`), ffmpeg-static, S3 presigned PUT (`@aws-sdk/s3-request-presigner`, already used by `signedMediaUrl`), Expo Router app, `expo-media-library` (new), `fflate` (new, web zip).

**Spec:** `docs/superpowers/specs/2026-11-13-instagram-stories-design.md` (approved 2026-11-13). Read it first; this plan doesn't repeat its reasoning.

## Global Constraints

- 3–5 frames to approve; drafts may have 0–5. Output 1080×1920; photo frames JPEG; clips MP4 H.264/AAC, 15 s window.
- Text caps: label 30, headline 60, body 120, CTA 40 characters. `link` must be `https:`.
- Safe area: 250 px clear top and bottom of 1920. Fixed dark gradient behind text.
- Uploads: photos JPG/PNG ≤ 15 MB; videos MP4/MOV ≤ 100 MB, ≤ 180 s, ≤ 4096 px a side, ≤ 60 fps, 1 video stream, ≤ 1 audio stream. Presigned PUT valid 600 s. 20 upload slots per brand per hour. Unused uploads swept after 7 days.
- Render rate limits: 30 per person per hour, 100 per brand per hour.
- App story writing: 5 credits (`CREDIT_COSTS.storyWrite = 5`), `refId` = item id, refunded on final failure; also counts toward `postAiAllowed`.
- Server-only body fields (`mediaKey`, `renderedKey`, `aiMark`, `rights`) are stripped from every client input.
- Permissions: uploads/save/render `content.create`; package, by-hand, posted, post-the-rest, mark-done, schedule `publish.execute`; approve unchanged.
- ffmpeg on user files: `-protocol_whitelist file`, explicit `-f mov` input, `-threads 2`, never concat/playlist input.
- Every user string reaching SVG/Pango markup is fully escaped (`& < > " '`) and stripped of control characters.
- Don't change behaviour for posts, carousels, reels or the manual reel route; existing tests must keep passing.
- Commit messages: describe the change and why; no co-author, session URL or test mentions (user's CLAUDE.md).
- Windows: stop the web dev server (node process whose command line contains `Social Media Agent`) before `npx prisma generate`/`migrate`; never kill the `Cad` processes. Metro runs on 8082.
- New phone strings English only in `src/i18n` until the owner approves wording.

## Review Focus

1. **A retry after a partial publish** must never re-post a frame: pinned by the `nextFramesToPublish` and `settleStoryFrame` tests (Task 9).
2. **A client sending `renderedKey`/`aiMark: false`/another brand's key** must be ignored or refused: pinned by `parseStoryInput` and `resolveSource` tests (Tasks 2, 3).
3. **Hostile text** (`<image href=…>`, `&`, control characters, RTL) must render as literal text: pinned by `escapeMarkup` tests (Task 5).
4. **Two people saving the same story while a clip renders** must leave one winner and a clear message for the other: pinned by the stale-base test in Task 6.
5. **A by-hand story whose approval lapsed** (edit or send-back) must drop off the due list and refuse the package: pinned by the `byHand` clearing tests in Task 10.

---

### Task 1: Schema and shared format plumbing

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (enum `ContentChannel`, enum `PublicationStatus`, model `ContentItem`, new model `MediaUpload`, `Brand` relation)
- Create: migration via `npx prisma migrate dev --name instagram_stories`
- Modify: `apps/web/server/services/publishing.ts:36-58` (`CHANNEL_PROVIDER`, `IMAGES`, `TEXT_LIMIT`, `LIVE`, `publishRequirements`)
- Modify: `apps/web/server/content/rules.ts:77` (no alt-text rule for stories)
- Modify: `apps/mobile/src/api/endpoints.ts:472` (`PostChannel` gains `"INSTAGRAM_STORY"`)
- Test: `apps/web/tests/stories-requirements.test.ts`

**Interfaces:**
- Produces: `ContentChannel.INSTAGRAM_STORY`; `PublicationStatus.PARTIAL`; `ContentItem.byHand: boolean`; model `MediaUpload { id, workspaceId, brandId, key, kind ("photo"|"video"), status ("PENDING"|"VERIFIED"|"REJECTED"), bytes Int, durationSec Float?, width Int?, height Int?, hasAudio Boolean?, rightsConfirmedBy String?, rightsConfirmedAt DateTime?, reason String?, createdBy, createdAt }` with `@@index([workspaceId, brandId, status, createdAt])`; `publishRequirements("INSTAGRAM_STORY")` returns `{ provider: "INSTAGRAM", needsImage: false, minImages: 0, maxImages: 0, needsVideo: false, needsBoard: false, frames: [3, 5] }` (other channels get no `frames` key).

- [ ] **Step 1: Write the failing test** — `stories-requirements.test.ts`:
  - `publishRequirements("INSTAGRAM_STORY")` equals the object above.
  - `publishRequirements("INSTAGRAM_POST")` has no `frames` key (unchanged).
  - `checkDraft("INSTAGRAM_STORY", { hook: "x", caption: "", hashtags: [], slides: ["x"], script: [], pinTitle: "", altText: "" })` contains no row with `check === "Alt text"`.
- [ ] **Step 2: Run** `npx vitest run tests/stories-requirements.test.ts` → FAIL (unknown channel).
- [ ] **Step 3: Edit the schema**, stop the dev server, run `npx prisma migrate dev --name instagram_stories`, then add `INSTAGRAM_STORY` to the three maps (`IMAGES: [0, 0]`, no `TEXT_LIMIT`), add `"PARTIAL"` to `LIVE`, add `frames` to `publishRequirements`, skip the alt-text rule when `channel === "INSTAGRAM_STORY"`. Fix every `Record<ContentChannel, …>` the compiler flags (`npx tsc --noEmit`) with the story value, never with a default that changes other channels.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` → all pass, clean.
- [ ] **Step 5: Commit** "Add the Instagram story format, partly-posted status, by-hand flag and media uploads to the schema".

### Task 2: Story body shape, limits and input parsing

**Files:**
- Create: `apps/web/server/stories/body.ts`
- Test: `apps/web/tests/stories-body.test.ts`

**Interfaces:**
- Produces:
  - `STORY_LIMITS = { frames: [3, 5], maxFrames: 5, label: 30, headline: 60, body: 120, cta: 40, clipSeconds: 15 } as const`
  - `type SourceRef = { kind: "upload" | "library" | "product" | "post" | "photoshoot" | "reel"; id: string }`
  - `type StoryFrameInput = { source?: SourceRef; label: string; headline: string; body: string; composition?: string; crop?: { x: number; y: number; scale: number }; clip?: { start: number; sound: boolean } }`
  - `type StoryFrame = StoryFrameInput & { mediaKey?: string; renderedKey?: string; aiMark?: boolean; rights?: "owned" | "confirmed"; mediaKind?: "photo" | "video" }`
  - `type StoryBody = { frames: StoryFrame[]; cta: string; link: string; hook: string; productIds: string[]; brandMark: boolean }`
  - `type StoryInput = { frames: StoryFrameInput[]; cta: string; link: string; brandMark: boolean }`
  - `parseStoryInput(raw: unknown): StoryInput` (zod; throws `PublishingError(400)` with the first issue). Unknown keys stripped, so server-only fields never pass.
  - `storySlides(body: Pick<StoryBody, "frames" | "cta">): string[]`: one string per frame `label\nheadline\nbody` (empties dropped) plus the CTA as the last entry. Used by checks.
  - `isStoryBody(body: unknown): body is StoryBody`

- [ ] **Step 1: Write failing tests**:
  - `parseStoryInput` keeps label/headline/body/crop/clip and drops `mediaKey`, `renderedKey`, `aiMark`, `rights` passed by a client.
  - refuses 6 frames, a 61-character headline, `link: "http://x.fr"`, `link: "javascript:alert(1)"`, `clip.start < 0`.
  - accepts 0 frames (a draft).
  - `storySlides` on two frames with cta "Voir" returns `["COLLECTION\nL'acacia", "Table\nEn chêne\nMassif", "Voir"]` for the matching input.
- [ ] **Step 2: Run** `npx vitest run tests/stories-body.test.ts` → FAIL.
- [ ] **Step 3: Implement** `server/stories/body.ts` with zod (`.strict()` is wrong here: use `.strip()` so extra keys vanish).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** "Define the story version body and parse story input from clients".

### Task 3: Resolving frame sources

**Files:**
- Create: `apps/web/server/stories/sources.ts`
- Test: `apps/web/tests/stories-sources.test.ts` (mock `@/server/db/prisma` as the 29 existing tests do)

**Interfaces:**
- Consumes: `SourceRef`, `StoryFrame` (Task 2); `needsAiDisclosure` (`server/reels/plan.ts:118`); `safeFetchBytes` (`server/research/crawl.ts:82`); `putMedia`, `mediaKey` (`server/storage/media.ts`).
- Produces: `type Resolved = { mediaKey: string; mediaKind: "photo" | "video"; aiMark: boolean; rights: "owned" | "confirmed"; durationSec?: number }`; `resolveSource(scope: { workspaceId: string; brandId: string; userId: string }, ref: SourceRef): Promise<Resolved>` throwing `PublishingError(400, "That photo or clip isn't available to this brand.")`; `listStorySources(scope, opts: { productIds: string[] }): Promise<{ tab: "products" | "library"; items: { ref: SourceRef; title: string; kind: "photo" | "video"; previewUrl: string }[] }[]>`.
- Lookup per kind, always filtered by `workspaceId` and `brandId`:
  - `upload` → `MediaUpload` with `status: "VERIFIED"`; rights `"confirmed"` when `rightsConfirmedAt` is set, else `"owned"`.
  - `library` → an entry of `BrandProfile.uploads` by key.
  - `post` → a key in some `ContentVersion.body.photoKeys` of the brand's items.
  - `photoshoot` → an output key of a brand `PhotoShoot` (read the model for the field name).
  - `reel` → `ReelRender` with `step: "DONE"` and that `videoKey`; `aiMark = needsAiDisclosure(plan of that render's item's latest version)`.
  - `product` → `Product` id: fetch `imageUrl` once with `safeFetchBytes(url, "image/*", 15 MB)`, store as a new VERIFIED `MediaUpload` (rights "owned"), return its key; a second pick of the same product image reuses that row (match on `reason = "product:<productId>"`).

- [ ] **Step 1: Write failing tests**: each kind resolves for the brand; each kind with another brand's id throws; a `reel` source from a presenter plan returns `aiMark: true`, from a plain plan `false`; an `upload` that is PENDING throws; `product` calls `safeFetchBytes` once across two resolves.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** "Resolve story frame sources from the brand's own records".

### Task 4: Phone uploads (presign, verify, sweep)

**Files:**
- Create: `apps/web/server/stories/uploads.ts`, `apps/web/server/stories/probe.ts`
- Create: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/stories/uploads/route.ts` (POST = slot), `…/stories/uploads/[uploadId]/route.ts` (POST = done)
- Modify: `apps/web/server/storage/media.ts` (add `presignedPut(key, contentType, bytes, seconds)`, `headMedia(key)`, `copyMedia(from, to)`)
- Modify: `apps/web/server/jobs/runner.ts:118` (call `purgeStaleUploads()` in the daily sweep)
- Test: `apps/web/tests/stories-uploads.test.ts`, `apps/web/tests/stories-probe.test.ts`

**Interfaces:**
- Produces:
  - `createUploadSlot(scope, input: { kind: "photo" | "video"; contentType: string; bytes: number; rightsConfirmed: true }): Promise<{ uploadId: string; url: string; headers: Record<string, string> }>`; refuses without `rightsConfirmed: true`, over the size caps, a content type outside `image/jpeg|image/png|video/mp4|video/quicktime`, or over 20 slots/brand/hour (`hitRateLimit` from `server/auth/rate-limit`, key `story-upload:<brandId>`, 429).
  - `verifyUpload(scope, uploadId): Promise<{ status: "VERIFIED"; durationSec?: number; previewUrl: string } | { status: "REJECTED"; reason: string }>`: `headMedia` size equals the declared bytes; photos sniffed by first bytes (reuse `imageType` logic from the media route, move it to `uploads.ts` and import it back there); videos probed; on pass `copyMedia` to `mediaKey(scope, "<uuid>.<ext>")`, `deleteMedia(uploadKey)`, row VERIFIED with the new key; on fail delete and REJECTED.
  - `probeVideo(file: string): Promise<VideoMeta>` and pure `parseProbe(stderr: string): VideoMeta` where `VideoMeta = { durationSec: number; width: number; height: number; fps: number; videoStreams: number; audioStreams: number }`; implementation runs `ffmpeg -hide_banner -protocol_whitelist file -f mov -i <file>` and parses stderr.
  - `videoProblem(meta: VideoMeta): string | null` against the Global Constraints limits.
  - `purgeStaleUploads(now = Date.now()): Promise<number>`: deletes files and rows for PENDING/REJECTED older than 7 days and VERIFIED rows older than 7 days whose key appears in no `ContentVersion.body` (search `body::text LIKE '%' || key || '%'` scoped by brand).
  - Upload key: `<ws>/<brand>/uploads/<uuid>.<ext>`; the routes use `content.create`.

- [ ] **Step 1: Write failing tests**:
  - `parseProbe` on a recorded ffmpeg stderr fixture (save a real one from a phone MP4 into `tests/fixtures/ffmpeg-probe-mp4.txt`) returns duration, 1080×1920, fps 30, 1 video, 1 audio.
  - `videoProblem` refuses 181 s, 4097 px, 61 fps, 2 video streams, 2 audio streams; accepts the fixture.
  - `createUploadSlot` without `rightsConfirmed` → 400; 101 MB video → 413; `image/svg+xml` → 400; the 21st slot in an hour → 429; the returned key is under `ws/brand/uploads/`.
  - `verifyUpload` with a size mismatch → REJECTED and `deleteMedia` called; a pass → the row's key changed and the upload key deleted.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** "Let the phone upload story photos and clips through checked, single-use upload slots".

### Task 5: The frame renderer

**Files:**
- Create: `apps/web/server/stories/render.ts`
- Create: `apps/web/assets/fonts/` (the app's font file from `apps/mobile/assets/fonts` plus `NotoSans-Regular.ttf`, `NotoSansArabic-Regular.ttf`, `NotoSansDevanagari-Regular.ttf`; check licences are OFL)
- Modify: `apps/web/server/reels/render.ts:396-398` (export `aiMark` as `aiMarkPng`, unchanged output)
- Test: `apps/web/tests/stories-render.test.ts`

**Interfaces:**
- Consumes: `StoryFrame`, `STORY_LIMITS` (Task 2); `run` (`server/reels/join.ts:14`); `aiMarkPng`, `aiDisclosureLine`.
- Produces:
  - `escapeMarkup(s: string): string` (escape `& < > " '`, strip `\u0000-\u001F\u007F` except none, collapse whitespace).
  - `renderInputsHash(frame: StoryFrame, opts: RenderOpts): string` (sha256 hex of source key, label, headline, body, cta, crop, clip, brandMark, language, `RENDERER_VERSION = 1`).
  - `type RenderOpts = { scope: { workspaceId: string; brandId: string }; language: string; isLast: boolean; cta: string; brandMark: boolean; logoKey?: string }`
  - `renderedKeyFor(scope, hash, kind)`: `<ws>/<brand>/stories/<hash>.jpg|mp4` (content-addressed; if `mediaExists` it's reused, never overwritten).
  - `textFits(frame, isLast, cta): { fits: true } | { fits: false; field: "label" | "headline" | "body" | "cta" }` (pure: line-break estimate at minimum size, shared numbers exported as `TEXT_BOX` for the phone).
  - `renderPhotoFrame(frame: StoryFrame, opts: RenderOpts): Promise<string>` (returns key): sharp fit to 1080×1920 with crop, gradient overlay PNG, text layers via sharp `{ text: { text: pangoMarkup, fontfile, width, rgba: true, align, dpi } }`, upper-case the label with `toLocaleUpperCase(language)` only for scripts with case, `rtl` when language is `ar|he|fa|ur`, brand mark when on, AI mark when `frame.aiMark`.
  - `clipArgs(input: string, overlayPng: string, out: string, clip: { start: number; sound: boolean }, aiMark?: string): string[]` (pure; builds the ffmpeg argv with the Global Constraints flags, `-ss start -t 15`, scale/crop to 1080×1920, overlay, `-an` when sound off).
  - `renderClipFrame(frame, opts): Promise<string>`: overlay PNG (text + gradient + marks, transparent) from the same layout code, then `run(clipArgs(...), 120_000)`; output over 8 MB re-encoded once at a lower bitrate, else throw `PublishingError(422, "Frame <n> is too large after compression.")`.

- [ ] **Step 1: Write failing tests**:
  - `escapeMarkup('<image href="x"/> & \u0007')` returns `'&lt;image href=&quot;x&quot;/&gt; &amp; '` (control character gone).
  - `renderInputsHash` changes when the headline changes and stays equal for equal inputs.
  - `clipArgs(...)` contains `-protocol_whitelist file`, `-f mov` before `-i`, `-threads 2`, `-t 15`, `-ss 12`; contains `-an` iff sound is false; never contains `concat` or `http`.
  - `textFits` is false for a 60-character headline of `W`s (worst-case width) and true for "L'acacia, tout naturellement."
  - Integration (runs sharp for real, no S3: inject a `put` function): `renderPhotoFrame` on a 2000×1500 JPEG fixture produces a 1080×1920 JPEG.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** "Render story frames with their text burned in, safely escaped and content-addressed".

### Task 6: Saving story versions (the one render step)

**Files:**
- Create: `apps/web/server/stories/service.ts`
- Modify: `apps/web/server/jobs/runner.ts` (register `STORY_RENDER_JOB = "story.render"`)
- Modify: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/[contentId]/route.ts` (new action `editStory: { version: number; story: unknown }`, permission `content.create`; `GET` returns `{ rendering: boolean }` for stories)
- Modify: `apps/web/server/services/publishing.ts` `saveDraft` (refuse `INSTAGRAM_STORY` with 400 "Stories are saved with editStory")
- Test: `apps/web/tests/stories-save.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5; `lock`, `TX` (`publishing.ts`).
- Produces:
  - `saveStoryVersion(scope: { workspaceId; brandId; userId }, itemId: string, baseVersion: number, input: StoryInput, actor: { kind: "person"; userId: string } | { kind: "agent"; runId: string; model?: string }): Promise<{ status: "saved"; version: number } | { status: "rendering" }>`
    - rate limits (people only): `story-render:user:<id>` 30/h, `story-render:brand:<id>` 100/h → 429.
    - resolves every source (Task 3), `textFits` every frame (400 naming the frame number and field), item must be in the EDITABLE set and channel `INSTAGRAM_STORY`.
    - all photo frames (or none with media): render in the request, then `createStoryVersion`.
    - any clip frame: enqueue `STORY_RENDER_JOB` with `{ itemId, baseVersion, input, resolved, actor }`, set nothing else, return `{ status: "rendering" }`.
  - `createStoryVersion(tx, item, baseVersion, body: StoryBody, actor)`: under `lock`, the latest version must equal `baseVersion` else throw `PublishingError(409, "Someone else changed this story. Your changes weren't saved.")`; creates the version (body with server fields, `hook` = frame 1 headline, `productIds` from the previous version or item), sets status `DRAFT_REVIEW`, sets `byHand: false`, writes `content.edit` audit, then starts the Quality run (`startAgentRun(..., agentKey: "quality", trigger: "event")`) as `saveDraft` does.
  - `runStoryRender(payload)` job: renders clips (unchanged frames reuse by hash), then `createStoryVersion`; on failure records the error on the item's latest audit (`content.render.failed`) for the app to show; on success nothing more.
  - `storyRenderState(itemId): Promise<{ rendering: boolean; error?: string }>` (pending/claimed job for the item; latest failure since the last version).

- [ ] **Step 1: Write failing tests** (prisma, render and jobs mocked):
  - a body with `renderedKey` from the client never reaches the created version (it holds the renderer's key).
  - photo-only input → version created, status DRAFT_REVIEW, `byHand` false, Quality started.
  - clip input → job enqueued, no version.
  - **stale base:** two saves from base 3, the job for the first finishes after the second created v4 → the first throws 409 with the message above and no v5 exists.
  - 31st render in an hour for one user → 429.
  - `saveDraft` on a story item → 400.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** "Save every story version through one render step, with clip renders in the job queue".

### Task 7: Creating a story and charging for it

**Files:**
- Modify: `apps/web/server/services/credits.ts:9` (`storyWrite: 5`)
- Modify: `apps/web/server/agents/engine.ts` (no change expected: `prepaidChargeId` already refunds on final failure; verify and add a test)
- Create: `createStory` in `apps/web/server/stories/service.ts`
- Modify: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/route.ts` (accept `channel: "INSTAGRAM_STORY"` with `{ goal, productId, direction? }`)
- Test: `apps/web/tests/stories-create.test.ts`

**Interfaces:**
- Produces: `createStory(scope, input: { goal: "newArrival" | "productFeature" | "specialOffer"; productId: string; direction?: string }): Promise<{ id: string; chargeId: string | null }>`:
  - product must be the brand's catalogue product; `campaignId` from `liveOfferFor` for `specialOffer` (as `createPost`);
  - creates the item (`channel: INSTAGRAM_STORY`, status `BRIEF_READY`, brief `{ goal, products: [title], keyMessage: direction ?? "", angle: goal }`, `productIds: [productId]`) and audit in one transaction;
  - charges `spendCredits({ amount: CREDIT_COSTS.storyWrite, reason: "story-write", refId: item.id, userId })` (unlimited-credit workspaces are skipped by `spendCredits` itself; check);
  - the route checks `postAiAllowed` first, then starts the Creator with `prepaidChargeId: chargeId`.
- A repeat call within the same request idempotency is the app's job (button disabled while sending); a second story is a second charge by design.

- [ ] **Step 1: Write failing tests**: creates the item with the brief above; charges 5 with `refId` = item id; another brand's product → 400 and no charge; a Creator run that finally fails with `prepaidChargeId` calls `refundCharge` once (engine test).
- [ ] **Step 2–4:** run FAIL, implement, run PASS.
- [ ] **Step 5: Commit** "Let the app ask the agent for a story, charged 5 credits and refunded if writing fails".

### Task 8: The agent writes stories (Creator, Brief writer, Planner)

**Files:**
- Create: `apps/web/server/stories/writer.ts`
- Modify: `apps/web/server/agents/definitions/creator.ts` (at the top of the per-item loop: `if (item.channel === "INSTAGRAM_STORY") { await writeStory(ctx, item, …); continue; }`)
- Modify: `apps/web/server/agents/definitions/brief.ts:14-22` (optional `frames: { purpose: string; composition: string }[]` for stories)
- Modify: `apps/web/server/agents/definitions/planner.ts:13-14` (`CHANNELS` gains `"INSTAGRAM_STORY"`; prompt line: "a story when the idea suits 3–5 quick visual beats")
- Modify: `apps/web/server/agents/prompts/content.ts` (story section: frames, label/headline/body caps, CTA on last frame, no tap promises when it may be scheduled, brand language)
- Test: `apps/web/tests/stories-writer.test.ts`

**Interfaces:**
- Consumes: `saveStoryVersion` (Task 6) with `actor: { kind: "agent", runId }`; `listStorySources` (Task 3); the same `knowledge`, `productFacts`, campaign facts the Creator already builds (pass them in, don't rebuild).
- Produces: `writeStory(ctx: AgentContext, item: ItemWithVersions, shared: { knowledge: string; productsLine: string; campaignLine: string }): Promise<void>`; AI schema `StoryDraft = { frames: { sourceId: string | ""; label: string; headline: string; body: string; composition: string }[]; cta: string; link: string }` with `validate`: 3–5 frames, caps from `STORY_LIMITS`, `sourceId` in the offered list, no source used twice; empty `sourceId` allowed (frame left without media). `link` defaults to the product URL when the model returns "".
- Fix it / Rewrite / approver notes reach `writeStory` through the same `last`, `reviewer`, `report` values the Creator computes for posts.

- [ ] **Step 1: Write failing tests** (AI mocked through `ctx.ai.generateObject` `mock`): a 4-frame draft becomes a version via `saveStoryVersion` with the picked sources; a draft reusing a source fails `validate`; a draft with 2 frames fails `validate`; Planner output schema accepts `INSTAGRAM_STORY`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Let the agents plan and write Instagram stories".

### Task 9: Checks for stories

**Files:**
- Modify: `apps/web/server/agents/definitions/quality.ts:89,100` (use `storySlides(body)` as slides for stories in both `draftText` and the LanguageTool input; add story rule rows)
- Create: `checkStory` in `apps/web/server/stories/checks.ts`
- Test: `apps/web/tests/stories-checks.test.ts`

**Interfaces:**
- Consumes: `StoryBody`, `STORY_LIMITS`, `storySlides`.
- Produces: `checkStory(body: StoryBody): CheckResult[]` with check names exactly: `"Frames"` (blocker unless 3–5 frames all with `renderedKey`), `"Frame files"` (blocker unless each rendered key ends `.jpg`/`.mp4` under `stories/` — sizes are guaranteed by the renderer), `"Link and CTA"` (warn when either empty), `"Asset rights"` (pass, note lists per frame "Brand's own" / "Confirmed by <name>"; blocker if any phone upload lacks confirmation), `"Visual review"` (warn, "Not checked: the photos and clips weren't reviewed by AI.").
- Quality's AI prompt gains, for stories: "If the story may be scheduled, a CTA that promises a tap or swipe is a warning: suggest 'Link in bio' or posting by hand." (language-aware by the model).

- [ ] **Step 1: Write failing tests**: 2 frames → "Frames" blocker; 4 rendered frames → pass; a frame without rights → "Asset rights" blocker; empty link → warn; "Visual review" always warn; Quality's slides for a story equal `storySlides(body)` (unit-test the helper that picks slides).
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Run the text, product and story checks on stories".

### Task 10: Publishing stories (schedule, partial, settle, post the rest)

**Files:**
- Modify: `apps/web/server/integrations/publishers.ts` (Instagram story branch; publisher input gains `story?: { frames: { url: string; kind: "photo" | "video" }[]; skip: number[]; onPublishing(i): Promise<void>; onPublished(i, mediaId): Promise<void> }`)
- Create: `apps/web/server/stories/publish.ts`
- Modify: `apps/web/server/services/publishing.ts` (`schedulePublication`: story path takes frames from the approved body, no media inputs; `executePublication`: story path; `settlePublication`: story branch; `decide`: clear `byHand` when leaving APPROVED)
- Modify: content `[contentId]` route (actions `postRest: { attemptId }`, `markDone: { attemptId }`, both `publish.execute`)
- Test: `apps/web/tests/stories-publish.test.ts`

**Interfaces:**
- Produces (pure, in `stories/publish.ts`):
  - `type FrameProgress = { i: number; state: "publishing" | "published" | "not-posted"; mediaId?: string }[]` stored in `PublicationAttempt.target.progress`.
  - `nextFramesToPublish(total: number, progress: FrameProgress): number[]` (indexes not `published`; throws if any is `publishing`, which means unknown).
  - `attemptOutcome(total: number, progress: FrameProgress): "PUBLISHED" | "PARTIAL" | "FAILED"`.
  - `settleStoryFrame(progress, frame: number, appeared: boolean): FrameProgress`.
  - `publishingLimitRoom(quota: { config: { quota_total: number }; quota_usage: number }): number`.
- Instagram story branch: phase 1 creates every container in parallel (`media_type: "STORIES"`, `image_url` or `video_url` signed at that moment, 3600 s), `waitForContainer` for all with `Promise.all` (videos 50 tries, photos default); phase 2 publishes in order, calling `onPublishing(i)` before and `onPublished(i, id)` after each `media_publish`; frames in `skip` aren't created at all.
- `executePublication` story path: after the seal and product gate, read `content_publishing_limit` (`GET /{ig-id}/content_publishing_limit?fields=config,quota_usage`); fewer slots than frames → FAILED "Instagram's daily limit leaves room for <n> of <m> frames. Try after <time>." (time = now + 24 h rounded, or the API's reset if returned). Phase 1 error → FAILED (nothing posted). Error after any frame published → refused: `PARTIAL` with `error`; unknown outcome or job lost → `PENDING_VERIFY` with "Frames 1–<k> were posted; we couldn't confirm frame <k+1>. Check the account." Item status: PUBLISHED on full success, SCHEDULED while PARTIAL or PENDING_VERIFY, APPROVED on plain FAILED.
- A phase-1 refusal that says the account can't post stories (Meta error about account type / not a business account) is shown as "Instagram only lets business accounts post stories this way. Post it by hand, or switch the account to Business."
- `onPublishJobLost` story path: same PENDING_VERIFY message from progress.
- Settle story branch (`posted` / `not-posted` with `frame`): `settleStoryFrame`, then `attemptOutcome` → PUBLISHED (item PUBLISHED) or PARTIAL; never the whole-item shortcut.
- `postRest(scope, itemId, attemptId)`: attempt must be PARTIAL; creates a new attempt (same version, `packageHash`, connection) whose `target.progress` copies published frames, runs through the normal `executePublication` (seal and gate again); returns `{ expiredFrames: number }` computed from `publishedAt` of the earlier frames (> 24 h) so the app can show the warning before calling with `confirm: true`.
- `markDone(scope, itemId, attemptId)`: attempt PARTIAL → item PUBLISHED; audit `content.publish.partial-done` with `{ posted, total }`.

- [ ] **Step 1: Write failing tests**:
  - `nextFramesToPublish(4, [{i:0,state:"published"},{i:1,state:"published"}])` → `[2, 3]`; with `{i:2,state:"publishing"}` it throws.
  - `attemptOutcome` → PUBLISHED / PARTIAL / FAILED cases.
  - `settleStoryFrame(progress, 2, true)` on 4 frames with 0–1 published → PARTIAL, and `attemptOutcome` after settling frames 2 and 3 → PUBLISHED.
  - Executor with a mocked publisher that fails on frame 3 of 4: attempt PARTIAL, item SCHEDULED, progress shows 0–1 published; a plain `schedulePublication` afterwards → 409 (PARTIAL is live).
  - `postRest` creates an attempt whose publisher call has `skip: [0, 1]`.
  - Publishing limit with 2 slots and 4 frames → FAILED, publisher never called.
  - `decide(CHANGES_REQUESTED)` on an APPROVED `byHand` story sets `byHand: false`.
- [ ] **Step 2–4:** FAIL, implement, PASS. Also run the existing publishing tests unchanged.
- [ ] **Step 5: Commit** "Publish stories frame by frame without ever posting a frame twice, and handle partly posted stories".

### Task 11: Post by hand (flag, due list, package, "I posted it")

**Files:**
- Create: `apps/web/server/stories/by-hand.ts`
- Modify: `apps/web/server/reels/service.ts:226-238` (move the body of `registerPostLink` into `registerManualPost` in `apps/web/server/services/manual-post.ts`, used by reels and stories; reel behaviour and message unchanged)
- Create: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/stories/[contentId]/package/route.ts` (GET: `?format=zip` streams the zip; default returns signed frame URLs + link + steps as JSON for the phone)
- Create: `apps/web/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/stories/due/route.ts`
- Modify: content `[contentId]` route (actions `byHand: { at: string } | null`, `postedByHand: { url?: string }`, `publish.execute`)
- Add dependency: `npm i fflate` in `apps/web`
- Test: `apps/web/tests/stories-by-hand.test.ts`

**Interfaces:**
- Produces:
  - `setByHand(scope, itemId, at: Date | null)`: item must be APPROVED with current approval; sets/clears `byHand` + `scheduledFor`; refuses while a SCHEDULED attempt exists ("Cancel the scheduled post first").
  - `dueByHand(scope: { workspaceId; brandId; userId }, now = new Date()): Promise<{ id: string; title: string; scheduledFor: string; firstFrameUrl: string }[]>`: `byHand`, status APPROVED, `scheduledFor <= now`, current approval still holds; only when the caller has `publish.execute` (checked by the route on every request).
  - `storyPackage(scope, itemId): Promise<{ frames: { n: number; url: string; kind: "photo" | "video" }[]; link: string; steps: string[] }>`: requires `currentApproval` to hold and the product gate to pass (refusal → 409 with the gate's message); URLs signed 3600 s.
  - `STORY_LINK = /^https:\/\/(www\.)?instagram\.com\/stories\/([A-Za-z0-9._]{1,30})\/(\d{5,25})\/?(\?.*)?$/`; when the brand has an active Instagram connection, group 2 must equal its handle (case-insensitive).
  - `registerManualPost(scope, itemId, url: string | undefined, kind: "reel" | "story")`: reels keep requiring a URL and their regex; stories accept no URL.
- Clearing `byHand`: `createStoryVersion` (Task 6) and `decide` (Task 10) already clear it; switching to Schedule (`schedulePublication` story path) clears it too.

- [ ] **Step 1: Write failing tests**:
  - `STORY_LINK` accepts `https://www.instagram.com/stories/boisetchiffons/3361234567890123456/`, refuses `http://…`, `/p/…`, a handle of another account when connected.
  - `dueByHand` lists a due approved story; drops it after a new version (approval lapsed) and after `byHand` cleared; a caller without `publish.execute` gets 403 from the route.
  - `storyPackage` with an ended offer → 409 and no URLs.
  - `registerManualPost(..., undefined, "story")` → PUBLISHED, audit `content.publish.manual`; for a reel without a URL → 400 as before.
  - Zip route returns `frame-1.jpg … frame-n` + `link.txt` (unzip with fflate in the test).
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** "Let people post a story by hand from a checked package, with a due list for everyone who can publish".

### Task 12: Web: stories in the calendar, lists, Today and the content workspace

**Files:**
- Modify: `apps/web/app/(shell)/calendar/page.tsx` and its components (story label/icon; by-hand slot shows "Post by hand · <time>")
- Modify: `apps/web/components/workspace/content-panels.tsx` (story panel: frames read-only — 9:16 thumbnails, full size on click, `<video controls>` for clips; checks; version history; Approve / Request changes / Approve anyway; Schedule / Post by hand; zip download; Partly posted actions with the expiry warning; "Edit on the phone")
- Modify: `apps/web/components/workspace/draft-editor.tsx` (no editor for stories)
- Modify: `apps/web/app/(shell)/page.tsx` (Today: due-story card from `/stories/due`, one card with a count when several)
- Modify: the content list channel filter (find with `grep -rn "INSTAGRAM_CAROUSEL" apps/web/app apps/web/components`)
- Test: extend `apps/web/e2e/` with `stories.spec.ts` (seeded story: open it, see 4 frames, approve, choose Post by hand, see it on Today when due). Seed script: `apps/web/scripts/_tmp/seed-story.ts` (photo frames only, no AI calls).

- [ ] **Step 1: Write the e2e test** as above. **Step 2: Run** `PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/stories.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** "Show stories on the web: calendar, content workspace, approval and the by-hand reminder".

### Task 13: Phone API client and P07 Stories

**Files:**
- Modify: `apps/mobile/src/api/endpoints.ts` (a `stories` group: `list`, `create`, `get`, `editStory`, `uploadSlot`, `uploadDone`, `sources`, `package`, `due`, `byHand`, `postedByHand`, `postRest`, `markDone`, `settleFrame`; types mirroring Task 2's `StoryBody`/`StoryInput`)
- Create: `apps/mobile/src/ui/stories/` (`card.tsx`, `due-card.tsx`, `use-stories.ts`)
- Modify: `apps/mobile/src/app/posts/stories.tsx` (replace the coming-soon page)
- Modify: `apps/mobile/src/i18n/en/*.json` (namespace `stories`)
- Test: `npx tsc --noEmit`, `npx expo lint`, emulator check

**Interfaces:**
- Consumes: routes from Tasks 6, 7, 10, 11.
- Produces: `useStories(): { drafts; scheduled; posted; due; refresh }` grouping by status: Drafts = PLANNED|BRIEF_READY|DRAFT_REVIEW|AWAITING_APPROVAL|APPROVED without `byHand`|REJECTED|BLOCKED; Scheduled = SCHEDULED without a PARTIAL attempt, or APPROVED with `byHand`; Posted = PUBLISHED, or any with a PARTIAL / PENDING_VERIFY attempt.
- Screen per Figma P07: brand chip, "Stories / 9:16 vertical social moments", **New story** (opens the new-story sheet: product, goal, direction; shows "5 credits"), three tabs with counts, cards (first rendered frame or the "Add photos" placeholder; status label; "…" Duplicate / Delete for drafts), the due card above the tabs (dismiss per device for 24 h in SecureStore), Posted cards with **Post the rest** / **Mark as done** / "Did frame 3 appear?" Yes / No.
- Error codes from the server map to `stories.errors.<code>` strings; unknown codes show the server text.

- [ ] **Step 1:** Implement the API group and types; `npx tsc --noEmit` clean.
- [ ] **Step 2:** Implement P07; lint clean.
- [ ] **Step 3: Emulator check** (seeded story from Task 12's script): the three tabs show the seeded story in the right tab; a due by-hand story shows the card; screenshot with `adb emu screenrecord screenshot <path>`.
- [ ] **Step 4: Commit** "Show real stories on the phone's Stories screen".

### Task 14: Phone P08 Edit story

**Files:**
- Modify: `apps/mobile/src/app/posts/edit-story.tsx`
- Create: `apps/mobile/src/ui/stories/` (`preview.tsx`, `frame-strip.tsx`, `picker.tsx`, `trim.tsx`, `crop.tsx`, `upload.ts`, `limits.ts`)
- Modify: `apps/mobile/src/i18n/en/stories.json`
- Test: tsc, lint, emulator

**Interfaces:**
- Consumes: `stories.*` API (Task 13); `TEXT_BOX` and `STORY_LIMITS` values copied into `src/ui/stories/limits.ts` (one source: add a comment pointing at `server/stories/body.ts` and `render.ts`).
- `upload.ts`: `uploadToSlot(uri, kind, onProgress): { promise, cancel }` using `expo-file-system`'s upload task with progress; slot → PUT with returned headers → `uploadDone`; network loss → "Offline: we'll try again" and retry on reconnect; app background → retry on return.
- Behaviour per spec "Phone screens": true 9:16 preview, letterboxed; safe-area guide while editing text; fit warning while typing from `limits.ts`; frame strip (tap, +, "…" Move left / Move right / Remove); tools Text / Image / Brand / CTA; crop gestures only in Image mode, with Fit / Fill buttons; reel frames crop-locked; trim slider (gesture-handler + reanimated, 15 s window, preview plays the window) for clips over 15 s; sound switch on clip frames; rights question before every phone upload ("We own or may use this"); bottom box "Link: …" and "No tappable link when scheduled" when the story's route is Schedule; **Save draft**; main button **Save and check** (→ story detail, Task 15) or **Schedule story** when approved and unchanged; Undo; discard prompt on leaving with changes; while `rendering` the editor is read-only with "Preparing frames", failure shows the reason and Try again; accessibility labels "Frame 2 of 4, video: <headline>".

- [ ] **Step 1:** Implement preview, strip, text, CTA, brand; tsc + lint.
- [ ] **Step 2:** Implement picker (four tabs; Generate opens Photoshoot or Reels, see Task 15), upload, crop, trim, sound; tsc + lint.
- [ ] **Step 3: Emulator check:** make a 3-frame story from Library photos, add a phone clip over 15 s, trim it, save → "Preparing frames" → frames rendered; deny the rights question → no upload starts; screenshots.
- [ ] **Step 4: Commit** "Let people build a story's frames on the phone".

### Task 15: Phone story detail, scheduling, package and Generate return

**Files:**
- Create: `apps/mobile/src/app/posts/story/[id].tsx` (story detail)
- Modify: `apps/mobile/src/app/posts/schedule.tsx` (story mode: Schedule / Post by hand choice; by-hand calls `byHand`)
- Create: `apps/mobile/src/ui/stories/package.ts` (`saveFramesToGallery(pkg)` with `expo-media-library`: request permission, download each frame to cache, `createAssetAsync` in order, `createAlbumAsync("Espanda – <title>")`; denied → share sheet one frame at a time like `src/ui/reels/download.ts`)
- Modify: `apps/mobile/src/app/reels/review.tsx` (when opened with `returnTo=story:<id>:<frame>`, show **Use in story** that routes back with the reel picked and the trim open)
- Add dependency: `npx expo install expo-media-library` in `apps/mobile`, then `npx expo prebuild --platform android --no-install`, re-add `cmake.dir` in `android/local.properties` if rewritten, rebuild the dev APK (HANDOVER "Running it on this Windows machine")
- Modify: `apps/mobile/src/i18n/en/stories.json`

**Interfaces:**
- Story detail: swipe through rendered frames (clips play with `expo-video`), checks with Fix it, Approve / Approve anyway / Request changes (same rules as `posts/[id].tsx`, reuse its parts), then Schedule or Post by hand; by-hand view: **Save frames** (`saveFramesToGallery`), steps, **Copy link**, **I posted it** (optional link field).
- Generate: before navigating to Reels or Photoshoot, save the draft (`editStory`); pass `returnTo`; Photoshoot results get a **Use in story** action the same way.

- [ ] **Step 1:** Implement detail + scheduling; tsc + lint.
- [ ] **Step 2:** Add `expo-media-library`, implement the package, rebuild the dev build, install on the emulator.
- [ ] **Step 3:** Implement Generate return for Reels and Photoshoot.
- [ ] **Step 4: Emulator check:** approve the seeded story → Post by hand at now+1 min → due card appears on P07 → Save frames (album shows frames in order) → I posted it → Posted tab. Generate → Reels → back with "Use in story" (render will fail without Higgsfield credits; check the navigation and the saved draft).
- [ ] **Step 5: Commit** "Let people approve, schedule and post stories by hand from the phone".

### Task 16: Wrap-up

**Files:**
- Modify: `docs/HANDOVER.md` (top section: what was built, how to try it, what needs a Business account / Higgsfield / push / translation)
- Modify: `docs/handover/2026-11-05-brief-gap-audit.md` (A6 story channel now present)

- [ ] **Step 1:** Run `npx vitest run`, `npx tsc --noEmit` (web), `npx tsc --noEmit && npx expo lint` (mobile); report results in the conversation, not in the commit.
- [ ] **Step 2:** Four-lens review of the branch diff (correctness/money, security, phone UI + i18n, spec + simplicity), fix findings.
- [ ] **Step 3: Commit** "Record the stories work in the handover".
