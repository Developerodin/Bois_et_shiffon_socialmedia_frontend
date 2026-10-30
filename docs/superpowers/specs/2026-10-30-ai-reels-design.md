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
- **Joining:** Higgsfield stitch (`explainer_video`), not ffmpeg, to keep render load off our functions.
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

Per scene, in parallel, each from its own photo:

1. **Voice.** French text-to-speech per scene (Higgsfield). Measure length.
2. **Clip.** Kling 3.0 Standard image-to-video, `image_url` = a signed URL of the scene photo (our bucket is private), `prompt` = direction (+ redo note), `duration` = voice length rounded up, min 3, max 15, `sound: "off"`, 9:16.
3. **Join.** Higgsfield `explainer_video` with ordered (clip, voice) pairs, 1080×1920, subtitles on.
4. **Keep.** Download the result into our media storage (Higgsfield deletes after 7 days); store the key on the version.
5. **Check.** Existing Quality agent on the text (free).

**Driving it.** No step waits minutes inside a function (jobs run in `after()`, 300 s cap; Vercel cron is daily). Each step submits and returns. Steps advance when (a) Higgsfield's webhook calls us or (b) the app's R05/R06 polling calls `kickIfDue()` and checks outstanding request ids — the onboarding Learning pattern. Closed app + lost webhook → caught up on next R06 open or the daily cron. Per-minute cron is the upgrade.

**One step at a time.** Advancing a render takes a per-render advisory lock and moves state with compare-and-set (`WHERE step = <expected>`), so a webhook and a poll arriving together can't both submit the next Higgsfield call. Request ids are stored before anything else happens, so a crash resumes instead of resubmitting.

**Webhook trust.** The webhook is only a nudge. On receipt we re-fetch status from Higgsfield with our key and download only from the result URL that status returns — never from the webhook body. The endpoint takes a per-render secret in its URL and is rate-limited.

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

20 s reel, three scenes rounded up ≈ 21–23 s of Kling at ~$0.112/s ≈ $2.35–2.60, + TTS cents, + stitch (price not published). At 40 credits ($4) margin is thinner than first estimated but positive. Re-check with real invoices before launch.

## Owner answers (2026-10-30)

1. **Self-approval allowed** for reels: the person who made the version may send it out. `decide()`'s author check is skipped for `INSTAGRAM_REEL`.
2. **Redo through R04 chat** — confirmed.
3. **Reels need a plan.** No free first reel; the starter grant stays 20. With too few credits, "Make video" on R03 goes to the existing plans screen (`src/app/plans/reels.tsx`). Caveat: billing (Stripe) isn't built, so until it is, credits come from a manual admin grant or `UNLIMITED_CREDIT_WORKSPACES`.
4. **Manual post link on R06** — the one screen addition. A downloaded reel's card shows "Downloaded · Posted it? Add link"; tapping opens a sheet with one field for the Instagram post URL (must be an instagram.com link). Saving marks the item PUBLISHED with that URL so results can be tracked. Scheduled/published reels also appear on P02 Posts calendar (R09 already points there).

## Later

1. AI presenter (lip-synced speech).
2. Page 03 Posts.
3. Users' own video service behind the same "video maker" interface.
4. ffmpeg joining if stitch falls short.
5. Facebook reels.

## Left to the builder

Exact Higgsfield request shapes; voice preset list; render state as table vs JSON; job naming; redo prompt wording.

## Verify with a real Higgsfield key first

- French voices exist and sound right.
- `explainer_video` takes per-scene audio, burns subtitles acceptably, and its price.
- Kling 3.0 Standard i2v gives 9:16 from a 9:16 photo (docs list no `aspect_ratio`; fall back to Kling 2.6 Pro, which has it).
- Webhook mechanism and whether Higgsfield signs it.
- Real per-reel cost.
