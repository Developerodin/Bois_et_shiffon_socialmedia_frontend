# Reels: real templates, AI actors, recorded and cloned voices (phone R10, R11, R12)

Draft 4, 2026-11-12 (after three review rounds: a 4-lens review of draft 1, four single-lens reviews of draft 2, a
4-lens Fable review of draft 3, and the owner's answers). Not in the B&C brief: the phone app is our addition.

## What the owner asked (2026-11-12)

- **Templates (R12):** replace the four fixed sample cards. Everyone first sees generic previews; a brand that wants
  more pays for previews rendered from its own photos.
- **AI actor (R10):** brand-made presenters made with Higgsfield AI Influencer; a reel can show its presenter speaking.
  The voice is picked per reel.
- **Voices:** "test both and decide": (A) our voice track lip-synced by Higgsfield, against (B) Higgsfield models that
  generate the speech themselves.
- **Script (R11):** record a voiceover for this reel, and clone a voice. Clones go into a voice catalogue usable by
  the whole workspace. Only workspace owners/admins clone, at most 2 live clones per workspace.
- **Recordings that don't match the script:** transcribe on upload; if it differs, the person keeps it (the scene's
  text becomes what was said) or records again.
- **EU AI Act disclosure:** reels with an AI presenter or a cloned voice get a caption line and a small on-screen mark.
- **Presenter scene price:** 4 credits/s until a real invoice is known.
- Providers: Higgsfield (video, presenters); ElevenLabs (voices, cloning; `ELEVENLABS_API_KEY`, free plan for
  testing, upgraded before launch, so build everything). Don't check or spend Higgsfield credits during the build.

## Facts this design rests on (checked 2026-11-12)

- Higgsfield's key-auth API: 95 models, video and image only; no speech, voice or lip-sync. Voices exist only behind
  a personal login.
- `POST /bytedance/seedance-2.5/reference-to-video` `{}` → `400 'audio_urls' is a required property`.
- `POST /higgsfield/ai-influencer` `{}` → `403 not_enough_credits`: **no Higgsfield credits now.**
- ElevenLabs: free tier (10,000 characters/month, no cloning, 3 voice slots, no commercial licence, about 2
  concurrent requests). One account is shared by every customer.
- Code facts that shape this design (verified in reviews):
  - `agents.ts` `toPlan` hard-codes `presenter: "none"`, takes `voice` from the scriptwriter (`Draft.voice` is
    `z.enum(REEL_VOICES)`) and rebuilds scenes (no scene ids); `validate` forces `presenter: "none"`;
    `plan.template` is never set from the chosen template.
  - `planProblems` and `reelPrice` are synchronous over the plan; `planProblems` also runs inside the scriptwriter's
    `validate`; `reelPrice` runs in list, detail, create, chat, edit and render. `planProblems` refuses scenes over
    30 words; `clipSeconds` floors at 3 s.
  - `join.ts` dissolves start the next clip 0.4 s early and only pad at the end, while the voice is padded per scene.
  - `nextStep` fails the render when a failed scene is already in `out.backups`, else sends failed scenes to the Kling
    backup; `prepareVoice` moves too-long scenes to the backup.
  - `spendCredits` with a known `refId` returns the existing charge: a retry needs a new refId.
  - `padAndJoinWav` needs one WAV format (OpenAI: 24 kHz mono 16-bit).
  - The media bucket is private; `mediaKey` is `workspace/brand/file`; the phone caches signed images with
    expo-image `cacheKey` (photoshoot screens).
  - PhotoShoot code (`runShoot`, `attemptsFor`, `shootView`, `listShoots`) and the phone's photoshoot screens assume
    product/fashion shoots: not reusable for other kinds without branches everywhere.
  - Permissions: a key not in `WORKSPACE_ONLY` is also given to project admins; `ensureSystemRoles` only re-syncs the
    Owner role, so existing workspaces' Admin roles never get a new key without a data migration.
  - `removeMember` is one array transaction; `enqueueJob` accepts a transaction.
  - Jobs run when an open app pokes the runner or from a once-a-day cron.
  - No account deletion exists in the code.
  - Seedance's shortest clip is 4 s.

## Build order (one reviewable commit each; each adds its own checks)

1. **Carry-over fix**: chat and templates stop wiping `presenter`, `voice` and `template`; recordings follow their
   text (a pure function, used once recordings exist). `Draft.voice` becomes a plain string.
2. **Templates** (R12): the list, the generic previews, and paid per-brand previews (`ReelAsset`, see below).
3. **Presenters** (R10) and presenter scenes in the render.
4. **Voices**: ElevenLabs stock voices, voice picker, Voices screen; deletes the phone's duplicate `VOICES` list.
5. **Recording voiceovers** (`expo-audio`, new dev build).
6. **Cloning**, consent, removal hooks, AI disclosure.

## One small table for paid Higgsfield assets: `ReelAsset`

`ReelAsset { id, workspaceId, brandId, kind ("template-preview" | "presenter"), status (RUNNING | DONE | FAILED),
input Json, requestId?, outputKey?, chargeId, error?, createdByUserId, createdAt }`, with one job (about 60 lines)
copying the photoshoot shape: charge (refId = row id) → submit (Idempotency-Key = row id) → poll → copy the output to
our storage → done, or fail and refund. A retry is a **new row** (new id, so a new charge and a new request). The
photoshoot code and screens are untouched. A partial unique index (raw SQL) allows one RUNNING row per brand and kind
(and template id for previews), so two taps can't both charge. Permission: `content.create`, as photoshoots.

## 1. Carry-over (commit 1)

- `toPlan` keeps `presenter`, `voice` and `template` from `current`. The scriptwriter's `voice` is used only for a
  brand-new plan; its prompt says the voice is set in the voice picker, not the chat. `Draft` gains per-scene
  `presenter` (bool) and `validate` stops forcing `presenter: "none"`.
- Recordings follow their text, not their position: a new scene whose `voiceText` equals an old scene's recorded text
  keeps that recording; others are dropped. `editPlan` does the same, so a script edit on R11 drops the recording of a
  changed scene ("Recording removed: the text changed").
- Ownership checks go in a new async `planOwnershipProblems(plan, scope, tx)`, called in `editPlan`, before
  `savePlan` in chat, and in `startRender`; never in the scriptwriter's `validate`. Each later commit adds its rule.
- Old plans parse unchanged: no data migration; in-flight renders finish as is.

## 2. Templates (commit 2)

- `server/reels/templates.ts`: `{ id, version, seconds, ask }` for six templates (spotlight, collection, material,
  arrival, three-uses, detail-to-room). The phone renders what the server returns; titles and subtitles stay phone
  strings (`templates.item.<id>`, the id if missing). The phone's sample template list and `templates.useAsk` are
  deleted.
- Applying a template: the create and chat routes accept `templateId`; with it, `message` is optional, the server
  builds the instruction from `ask`, stores the template's title as the person's chat turn, and sets `plan.template`.
- `GET …/reels/options` returns the templates (cover and preview URLs) and, from commit 3, presenters and traits.
- **Generic previews:** one 5 s `kling-3-std` clip per template, rendered once by
  `scripts/render-template-previews.ts` through the same preview function (no charge; Idempotency-Key
  `template:<id>:<version>`; skips ones already stored). Stored privately under a fixed `system/templates/` prefix
  (`<id>.mp4` + `<id>.jpg`), signed normally; the phone caches by `cacheKey` = storage key. Until rendered, a card
  shows its cover photo.
- **Grid loads posters only;** a clip plays when a card is tapped.
- **Paid per-brand preview:** "Preview with my photos · 10 credits". Cover = the brand's DONE preview photo if it
  still exists in `productPhotos()`, else `productPhotos()[0]`; no photos → button disabled. The server picks the
  photo, crops to 9:16, and makes a `ReelAsset` of kind `template-preview` (input: templateId, photoKey). A brand's
  DONE preview replaces the generic one on that card.

## 3. Presenters (commit 3)

- A presenter is a `ReelAsset` of kind `presenter` (input: name, traits; output: the character sheet). Charge 2
  credits. Removing deletes the row; a reel planned with a removed presenter is refused at render ("Presenter
  removed: pick another"), like a deleted voice.
- Traits: AI Influencer's options (gender, age, ethnicity, skin tone, hair, hair colour, style; tier `normal`), one
  server list, returned by `GET …/reels/options`.
- **Picking a presenter** saves `plan.presenter`, then runs a scriptwriter revision that marks presenter scenes. "No
  presenter" clears the flags. `planOwnershipProblems`: the presenter is a DONE presenter of this brand. Pure rules:
  presenter scenes only when `plan.presenter !== "none"`, at most half, not on stand-ins.
- **Presenter scenes in the render:**
  - `VIDEO_MODELS` gains `seedance-2.5-ref`, excluded from the zod `MODEL_IDS`; render picks it by `scene.presenter`.
  - Body: `image_urls: [sheet, product photo]`, `audio_urls: [scene voice]`, prompt naming the product (title from
    `productPhotos`). `ClipInput` gains `imageUrls` and `audioUrl`, signed at VOICE and stored in `outputs`.
  - `prepareVoice` never moves a presenter scene to the backup; over the model's maximum it fails the render.
  - Retry: `outputs.presenterRetried: number[]`. `nextStep` sends a failed presenter scene to a new action
    `retryPresenter` (same model, key `:clip:i:retry`) unless already retried, then fails the render (refunded).
    Product scenes keep today's Kling backup.
  - **Every join in a reel with a presenter is a cut** (director output and seam check).
- **Pricing:** `sceneSeconds` = presenter ? `max(4, ceil(seconds)) × presenterPerSecond (4)` : today's rule; seconds
  are the recording's for recorded scenes (see §5). All synchronous over the plan.
- **Margin check at server start**, like the photoshoot tiers: `costUsd` estimates for the preview clip and presenter
  seconds; the server refuses to start if a price falls under the 70 % floor. (The sheet's $0.05 is unverified: no
  check until a real price exists.)
- **Comparison script (A vs B):** `scripts/compare-presenter-audio.ts <presenterId> "<line>"`. Header: "delete after
  the owner decides". Option B is not wired into the render.

## 4. Voices (commit 4)

- Voice ids: bare names are OpenAI; ElevenLabs voices are `eleven:<voiceId>`. An `eleven:` id is accepted only if
  it's in our stock list or a live `Voice` of this workspace (checked in `planOwnershipProblems` and again in
  `speak()`), so no other ElevenLabs voice, public or another customer's, can be used. `speak()` throws on an unknown
  voice instead of silently using coral.
- ElevenLabs TTS: `POST /v1/text-to-speech/{voiceId}?output_format=pcm_24000`, model `eleven_multilingual_v2`, wrapped
  as 24 kHz mono WAV. Within a render, ElevenLabs scenes are spoken **one after another** with backoff on 429 (a
  per-process limit wouldn't hold across server instances).
- Stock voices: one server list (OpenAI five + a few ElevenLabs premade). `GET …/voices` (`brand.read`) returns stock +
  this workspace's live clones. The phone's `VOICES` list is deleted; R11's voice row opens a **Voices** screen.
- Samples: ElevenLabs premade voices use their `preview_url`; OpenAI voices and clones have one sample each, made once
  (a clone's at clone time), stored under `<workspace>/voices/<voiceId>/`. `GET …/voices` never generates audio.
- Errors: quota or plan limits → `unavailable` (refunded); a deleted voice → failure kind `voiceDeleted`, checked in
  `startRender` before charging.

## 5. Recording voiceovers (commit 5)

- R11 → **Record voiceover**: one recording per scene, the scene's text on screen (`expo-audio`, AAC 128 kbps mono;
  15 s ≈ 250 KB). A new Android dev build.
- Upload `POST …/reels/{id}/recordings` (`content.create`; the reel loaded scoped to workspace, brand and studio;
  rate-limited per user and per reel). Bytes checked (`ftyp` at offset 4, M4A/isom brand), length read from the
  container first, then ffmpeg in a unique temp dir deleted in `finally`: `-nostdin -protocol_whitelist file -f mp4
  -i in.m4a -t 16 -vn -map 0:a:0 -ar 24000 -ac 1 -c:a pcm_s16le`, 20 s timeout. Over 15 s measured on the output →
  "Keep it under 15 seconds".
- The server writes `ReelRecording { id, workspaceId, contentItemId, key ("rec-<uuid>.wav"), seconds, transcript,
  uploadedByUserId, createdAt }` and returns it. The app attaches it through the plan PATCH as `recordingId`; the
  server then **writes `recordingSeconds` into the scene from the row** (the client's value is ignored), and
  `planOwnershipProblems` checks the row belongs to this reel and the seconds match. Pricing stays synchronous.
- **Transcript check:** OpenAI speech-to-text on upload (uncharged; cents). If it clearly differs from the scene's
  text, the app shows what was heard: **"Keep it"** (the scene's `voiceText` becomes the transcript, so approvers and
  Quality see what is said) or **"Record again"**. The 30-word rule doesn't apply to a recorded scene (its length is
  measured).
- **Remove recording** per scene. Retention: deleted with the reel, and unused ones after 30 days.

## 6. Cloning, consent, removal, disclosure (commit 6)

- **Who and how many:** new `voices.manage` permission, added to `WORKSPACE_ONLY` (so project admins don't get it),
  on the Owner and Admin system roles, with a data migration adding it to every existing workspace's Admin role. At
  most 2 live clones per workspace (checked under an advisory lock). 10 credits per clone. `requirePlan` like other
  paid actions.
- **Flow:** read a passage (60–90 s, reel language), tick the consent box, upload (same audio checks; ≤ 4 MB). The
  server checks the ElevenLabs plan (`can_use_instant_voice_cloning`, else "Voice cloning isn't available yet"),
  **charges first** (refId = the new voice id), calls `POST /v1/voices/add` (`remove_background_noise: true`, 30 s
  timeout), inserts the `Voice` row on success, refunds on failure.
- `Voice { id, workspaceId, ownerUserId, name, providerVoiceId, sampleKey, consent Json, createdAt, archivedAt? }`.
  `consent`: userId, time, consent text version, app version, SHA-256 of the audio sent, and ElevenLabs' sample id.
- **Consent text:** "This is my own voice. I agree to it being used in videos made by this workspace. It is processed
  by ElevenLabs (USA) to create the voice and by Higgsfield to make presenter videos."
- The audio is held in memory only, never written to our storage or logs. ElevenLabs keeps it with the voice until
  the voice is deleted.
- **Deleting** (its owner, or a workspace owner/admin), **withdrawing consent** (its owner), or **removing the
  member**: the row is archived and a delete job enqueued **in the same transaction** (`removeMember`'s included);
  the job deletes the voice at ElevenLabs with retries and purges `<workspace>/voices/<voiceId>/`. Archived voices are
  refused in planning and in `speak()`. **Account deletion doesn't exist yet**: when built, it must enqueue the same
  job (noted in the handover).
- **Audit events:** clone created, renamed, deleted, consent withdrawn, and each render that uses a clone.
- **EU AI Act disclosure:** a version whose plan has a presenter or a clone voice is flagged. Approvers see the "Made
  with AI" caption line (read-only) before approving; publish adds it to the caption; JOIN burns a small corner mark
  into the video (forces a re-encode, about 5–10 s per reel). Neither can be removed for those reels.

## Failure modes (handled)
- Out of Higgsfield credits → FAILED with "Making videos isn't available right now", refunded; raw error kept for
  admins.
- ElevenLabs quota, plan or 429 → backoff, then `unavailable`, refunded.
- Double taps and races → partial unique indexes and advisory locks; retries are new rows or new keys.
- A removed presenter or deleted voice → refused before charging.
- Recording mismatch → the person decides; recordings on edited text → dropped with a notice.
- Jobs only advance when an app is open or on the daily cron: the phone polls every 10 s while something is running;
  an abandoned one finishes on the next run.

## Not handled (documented)
- Someone cloning another person's voice despite the consent box (the consent record is our evidence).
- The shared ElevenLabs account's slot and character ceilings across customers (watch quota; alert at 80 %).
- ElevenLabs/Higgsfield data-processing agreements and "no training" terms: confirm before launch.

## Guesses to confirm on the first live run
- AI Influencer request body, the field with the sheet URL, its real cost.
- Seedance reference-to-video body beyond `audio_urls`; WAV accepted; speech starts at 0 and follows the audio; lip
  sync holds with two image references; real cost per second.
- ElevenLabs Starter slot count, concurrency and licence.

## Tests
Unit (vitest): carry-over (presenter, voice, template; recordings by text); pure plan rules (presenter limits, no word
rule on recorded scenes); ownership checks (foreign presenter, foreign/public/archived voice, foreign recording,
seconds mismatch); templates route with `templateId`; `ReelAsset` job (charge, retry as a new row, one RUNNING per
brand); presenter render path (model by flag, no backup, one retry, forced cuts, 4 s minimum, pricing); margin check;
`speak()` (unknown voice throws, sequential ElevenLabs, 429 backoff); recording upload (sniffing, length, format,
server seconds, transcript decision); clone (role and scope, migration adds to Admin, 2 per workspace, charge before
add and refund, consent record); removal enqueue inside the transaction; disclosure flag in caption and mark.
Emulator: R12 grid, R10 list and making state, R11 recording and transcript prompt, Voices screen.

## Review history
- Draft 1: written; 4-lens review.
- Draft 2: fixes; owner: generic then paid previews, workspace clones, free ElevenLabs for testing, no voice per
  presenter.
- Draft 3: four single-lens reviews; owner: transcript keep/retry, owners/admins clone (2 per workspace), caption line
  and mark, presenter 4 credits/s.
- Fable 4-lens review of draft 3 (all checked against the code): PhotoShoot reuse breaks shoot code and the phone's
  photoshoot list; seeding `backups` kills the presenter retry; recording seconds unreachable from sync pricing;
  "Keep it" vs the 30-word rule; public template objects impossible on a private bucket; `voices.manage` leaks to
  project admins and misses existing Admin roles; removal enqueue outside the transaction; clone charge order; build
  order depending on later tables; cuts (sheet key copy, speech reuse, per-process limiter, "where used" view).
- Draft 4: all of the above (a small `ReelAsset` table instead of PhotoShoot kinds).
