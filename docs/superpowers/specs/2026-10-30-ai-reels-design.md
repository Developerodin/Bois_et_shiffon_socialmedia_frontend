# AI reels (mobile page 02) — design

Date: 2026-10-30. Status: draft for owner review (rev 2, after builder check + 4-lens review).

## Intent

The mobile Reels page (Figma 02, R01–R13, built with sample data) makes real reels. The AI makes the video; the person only decides before it goes out. After that the reel is posted/scheduled on a connected Instagram account, or downloaded and posted by hand.

Why: the B&C functional brief wants the team reviewing and approving, not producing. It allows finished video from "a separately approved generation integration" provided generated visuals never misrepresent a product's materials, proportions, finish or features. The owner leans to AI generation for reels and later posts.

## Goals

- An idea from Scout becomes a 9:16 reel with French voiceover and burned-in subtitles, built from the brand's real product photos.
- One human decision before anything leaves the app.
- Redo with a note costs credits again; failed renders cost nothing.
- Post through the existing Instagram publisher, or download the MP4.

## Non-goals

- Changing screens. Only data and actions get wired; every behaviour maps to an existing element, except two owner-approved additions: the "Add link" line + sheet on R06 cards, and a "Not right? Ask for changes" link on R07 that opens R04 for a redo.
- AI presenters speaking on camera (R10 styles other than "No presenter") — later.
- Page 03 Posts — own design after this.
- Users' own video service — later, via web-app connections.
- Facebook posting of reels (R08 says "Instagram & Facebook"; step 1 posts to Instagram only).
- Paid campaigns, DMs, comment replies.

## Anti-goals

- A reel showing a product differently from the real one. Every scene starts from a real product photo, and the visual check stays visibly unresolved until a person has looked.
- Anything leaving the app that isn't the exact version the person looked at.
- Charging for a render the person never got; paying Higgsfield twice for one step.

## Decisions made with the owner

- **Hybrid publishing:** connected Instagram posts/schedules; otherwise download.
- **Redo:** person says what's wrong; new render from the plan + the note; full credits again; old versions stay on R06.
- **Video service:** Higgsfield API (pay-as-you-go key from console.higgsfield.ai, separate from the owner's web plan). Users' own service later.
- **Joining:** ~~Higgsfield stitch~~ — superseded 2026-10-30: Higgsfield's API has no voice or stitch models (checked with the key: 91 models, all image/video). Owner chose **OpenAI text-to-speech for the voice** and a **copy-only ffmpeg join on our server** (no re-encode: ~1 s, little CPU). Subtitles come from Instagram's automatic captions for now; burned-in subtitles (a re-encode) are later.
- **Pricing:** 1 credit ≈ $0.10; 2 credits per second (15 s = 30, 20 s = 40, 30 s = 60); redo same price; failure refunded.

## Screen-by-screen

| Screen | Becomes |
|---|---|
| R01 Create | Real brand name/logo and product photos (`BrandProfile.assets`). "Plan a reel together" → R04. |
| R02 Ideas | Scout `Opportunity` rows whose channels include reels, by score. Tapping one starts a plan (a `ContentItem`, channel `INSTAGRAM_REEL`, linked to the opportunity). |
| R04 Plan in chat | `ChatThread` that drafts the plan from an idea or the person's words. **Also where a redo is asked for** (see Redo). |
| R10 Presenter | Saved on the plan; only "No presenter" renders in step 1, others shown as unavailable. |
| R11 Script & voice | French script, one block per scene, editable; live word count and ~seconds; a scene's block is capped so it fits 15 s. Voice from a preset list. |
| R12 Templates | Fixed list that pre-fills scene count and lengths. Static. |
| R13 Select assets | Brand photos + uploads; selection order = scene order. |
| R03 Storyboard | Scenes (photo, shot, direction, on-screen text, seconds), total length, credit price. "Make video" starts the render. |
| R05 Generating | Real step states. The three designed rows map to: "Preparing N scenes" = voice, "Rendering video frames" = scene clips, "Adding audio" = joining. |
| R06 Results | This brand's reels: Processing / Ready / Failed, credits reserved, every version. The percentage is per-step (no fake smooth progress). |
| R07 Review | Plays our stored MP4. Editable French caption + hashtags = the Instagram caption (AI-drafted; an edit saves a new version, no re-render). Quality checks shown, including **"Visual check — not done by AI: confirm the product looks right"**, which stays unresolved until the person goes on. Footer: "Download video" and "Schedule" — both are the approval act (see Approval). |
| R08 Publish | Connected → Publish now / Schedule via the existing publisher. Not connected → "Connect" (A12 flow) or "Download". |
| R09 Scheduled | Confirmation from the real `PublicationAttempt`. |

## Approval (the one human decision)

No screen has an "Approve" button, so approval is the act of sending the reel out: tapping **Download video** (R07/R08), **Confirm schedule**, or **Publish now** (R08) records an `ApprovalDecision` for the exact version on screen (video + caption), then proceeds. A later caption edit or redo makes a new version, which needs that act again.

Self-approval is allowed for reels (owner, 2026-10-30).

## Redo

R07 has no note field and no redo button. The redo lives in R04 chat: from R07, the person goes back to the plan chat, says what's wrong ("lighter oak, table looks too small"), the chat updates the plan and offers "Make video" again at the same price. The new version appears on R06 beside the old one.

Confirmed by the owner.

## How a render works

1. **Voice.** OpenAI `gpt-4o-mini-tts`, one WAV per scene, French instructions, the plan's voice. Synchronous (seconds). Length read from the file size (OpenAI's streamed WAV header has no data size). Stored in our media.
2. **Clips.** Per scene, in parallel: our photo cropped to 1080×1920 (Kling's image-to-video has no aspect setting; output follows the photo), Kling 3.0 Standard image-to-video on Higgsfield, `prompt` = direction (+ redo note), `duration` = voice length rounded up (3–15), `sound: "off"`, `Idempotency-Key` per scene.
3. **Join.** On our server with `ffmpeg-static`: each scene's voice padded with silence to its clip's length and joined into one WAV (plain byte work), clips concatenated with stream copy, voice encoded to AAC alongside: no video re-encode. Result stored in our media; Higgsfield's files (deleted after 7 days) are no longer needed.
4. **Check.** Existing Quality agent on the text (free).

**Driving it.** No step waits minutes inside a function (jobs run in `after()`, 300 s cap; Vercel cron is daily). Voice and join run inside one job (seconds); only the clips step waits on Higgsfield. It submits and returns; it advances when (a) Higgsfield's webhook calls us or (b) the app's R05/R06 polling calls `kickIfDue()` and checks outstanding request ids — the onboarding Learning pattern. Closed app + lost webhook → caught up on next R06 open or the daily cron. Per-minute cron is the upgrade.

**One step at a time.** Advancing a render takes a per-render advisory lock and moves state with compare-and-set (`WHERE step = <expected>`), so a webhook and a poll arriving together can't both submit the next Higgsfield call. Request ids are stored right after submitting; a crash between the two is safe because every submit carries a per-scene `Idempotency-Key`, so resending returns the original job without a second charge (Higgsfield docs, concepts/idempotency).

**Webhook trust.** The webhook is only a nudge. On receipt we re-fetch status from Higgsfield with our key and download only from the result URL that status returns — never from the webhook body. The endpoint takes a per-render secret in its URL and is rate-limited. (Higgsfield also signs deliveries, Standard Webhooks HMAC with a `whsec_` console secret; verifying that is optional on top.)

## Data (builds on what exists)

- `ContentItem` (`INSTAGRAM_REEL`) linked to its `Opportunity`.
- `ContentVersion.body` gains: `scenes[]` (photo key, shot, direction, on-screen text, seconds, voice text), presenter, template, voice, final video key. Caption/hashtags already there. Redo or caption edit = new version.
- A render record per version: status, step, Higgsfield request ids, error, credit charge id.
- Credits: reserve at "Make video" with **the version id as `refId`** (today `spendCredits` uses a random id, so this is a needed change) — double taps charge once; refund on failure. Price = R03's storyboard total, charged once, no settle-up. New cost `reelPerSecond: 2`.
- Approval: existing `packageHash` must include the video key.
- Publishing: existing Instagram Reels publisher with a signed URL of our MP4.

## Failure modes

- Render step fails → Failed, refund, R06 "Try again".
- Restart mid-render → resume from stored ids, no resubmit.
- Webhook lost → polling/cron. Webhook forged → ignored (re-fetch).
- Webhook + poll race → lock + compare-and-set.
- Voice for a scene > 15 s → blocked at R11 (cap); < 3 s → clip is 3 s, voice ends early.
- Balance too low → existing "Not enough credits"; nothing submitted.
- Edited after approval → new version, approval gone.
- Instagram publish fails → existing FAILED / PENDING_VERIFY; Download still works.

## Cost check (unverified, needs a real key)

20 s reel, three scenes rounded up ≈ 21–23 s of Kling at ~$0.112/s ≈ $2.35–2.60, + OpenAI TTS ≈ $0.01–0.02. No stitch cost. At 40 credits ($4) margin is thinner than first estimated but positive. Re-check with real invoices before launch.

## Owner answers (2026-10-30)

1. **Self-approval allowed** for reels: the person who made the version may send it out. `decide()`'s author check is skipped for `INSTAGRAM_REEL`.
2. **Redo through R04 chat** — confirmed.
3. **Reels need a plan.** No free first reel; the starter grant stays 20. With too few credits, "Make video" on R03 goes to the existing plans screen (`src/app/plans/reels.tsx`). Caveat: billing (Stripe) isn't built, so until it is, credits come from a manual admin grant or `UNLIMITED_CREDIT_WORKSPACES`.
4. **Manual post link on R06** — the one screen addition. A downloaded reel's card shows "Downloaded · Posted it? Add link"; tapping opens a sheet with one field for the Instagram post URL (must be an instagram.com link). Saving marks the item PUBLISHED with that URL so results can be tracked. Scheduled/published reels also appear on P02 Posts calendar (R09 already points there).

## Later

1. AI presenter (lip-synced speech).
2. Page 03 Posts.
3. Users' own video service behind the same "video maker" interface.
4. Burned-in subtitles (an ffmpeg re-encode, or a hosted video API).
5. Facebook reels.

## Left to the builder

Exact Higgsfield request shapes; voice preset list; render state as table vs JSON; job naming; redo prompt wording.

## Verify with a real Higgsfield key first

- ✅ Key works (`Authorization: Key id:secret`; one env var `HIGGSFIELD_API_KEY_ID` holding `id:secret` is accepted). `GET /models` lists what the key can use.
- ✅ No TTS or stitch in the API → OpenAI voice + ffmpeg join (above).
- ✅ OpenAI French voice works (`gpt-4o-mini-tts`, WAV; streamed header data size is 0xFFFFFFFF).
- ✅ Webhook: `hf_webhook` query param on submit; JSON `{ request_id, status, error, payload }`; Standard Webhooks signatures. Idempotency: `Idempotency-Key` header.
- ✅ Kling 3.0 std accepted our request shape; stopped at `403 not_enough_credits` (API balance $0).
- ⏳ After top-up: 9:16 output from a 9:16 crop, clip quality, real cost/second, result URL host (for the download allow-list), ffmpeg stream-copy concat of Kling clips.

## Addendum 2026-10-30: scene routing and the reel agents

Owner: "we have so many models, why stay stuck on one or two" → **automatic model choice per scene**; and "create agents based on these skills" (installed: higgsfield-generate, seedance-prompt-en, h3-prompt-writing, video-marketing, social-content/content-strategy/copywriting/ad-creative, content-strategy-sms). MIT sources adapted with credit in NOTICE.md; MiniMax's H3 skill has no licence and is read for reference only.

**Routing (deterministic table, the AI only classifies the scene).** From Higgsfield's own catalog guidance:

| Scene kind (AI picks one) | Model | Why (higgsfield-generate catalog) | Clip length |
|---|---|---|---|
| `detail` — close-up on material, texture, a still product; slow push/orbit | Kling 3.0 Std `kling-video/v3.0/std/image-to-video` | "lower-cost for single-plane scenes that don't need heavy motion" | 3–15 s |
| `room` — the product in a styled interior, camera travels, light changes | Seedance 2.5 `bytedance/seedance-2.5/image-to-video` (`resolution: "1080p"`, `generate_audio: false`) | "default for serious motion, cinematic" | 4–30 s |
| `physics` — something moves physically: fabric falls, a door/drawer opens, liquid pours | MiniMax Hailuo 2.3 `minimax/hailuo-2.3/standard/image-to-video` | "cheap with strong physics" | 6 or 10 s, trimmed |

Backup when a model refuses or fails: Kling 3.0 Std (the cheapest, most predictable). Prices stay 2 credits/second whatever the model (routing is our cost, not the customer's).

**Consequence for joining (owner chose per-scene, so stated plainly):** clips from different models differ in frame rate and size, so a mixed reel is joined with a light re-encode (scale/pad to 1080×1920, 30 fps, `-preset veryfast`, ≈ 5–10 s CPU for 20 s). When every scene lands on the same model and no trim is needed, the copy-only join (~0.2 s) is kept.

**Agents (server prompts built from the skills, each a small focused step):**
1. **Reel scriptwriter** (R04 plan chat, plan creation): short-form structure from video-marketing — hook in scene 1 (≤ 3 s, one of: question, contrarian, result, story), problem → solution beats, CTA in the last scene; 15–30 s; brand voice from brand knowledge; copywriting's "no AI tells" rules; French.
2. **Reel director** (runs on every plan save, before the storyboard): per scene → `kind` + a model-specific prompt following that model's guide (image-to-video prompts describe motion only, ≤ ~200 tokens, concrete camera verbs, positive phrasing; Seedance: subject + action + camera + style, time-segmented for ≥ 10 s; product fidelity: "keep the product's shape, material and colour exactly as in the photo"). Stored on the scene (`kind`, `model`, `prompt`) so R03 can show it and redo notes can edit it.
3. **Prompt check (deterministic, free)** before charging: per-model lint (length, negative phrasing, re-describing the still, banned terms that trigger refusals). Fails → the director rewrites once; still failing → shown on R03, no charge. This is the "fewer iterations" lever: most failed renders are bad prompts caught before money is spent.
4. **Ideas** (Scout): its reel ideas get a hook type and a content pillar (content-strategy-sms) so R02 cards carry an angle, not just a topic.
