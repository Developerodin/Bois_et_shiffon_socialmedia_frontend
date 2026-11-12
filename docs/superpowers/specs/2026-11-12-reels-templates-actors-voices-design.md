# Reels: real templates, AI actors, recorded and cloned voices (phone R10, R11, R12)

Draft 3, 2026-11-12 (after two review rounds: one 4-lens review of draft 1, four single-lens reviews of draft 2, and
the owner's answers). Not in the B&C brief: the phone app is our addition.

## What the owner asked (2026-11-12)

- **Templates (R12):** replace the four fixed sample cards. Everyone first sees generic previews; a brand that wants
  more pays for previews rendered from its own photos.
- **AI actor (R10):** brand-made presenters made with Higgsfield AI Influencer; a reel can show its presenter speaking.
  The voice is picked per reel.
- **Voices:** "test both and decide": (A) our voice track lip-synced by Higgsfield, against (B) Higgsfield models that
  generate the speech themselves.
- **Script (R11):** record a voiceover for this reel, and clone a voice. Clones go into a voice catalogue usable by
  the whole workspace. Only workspace owners/admins clone, at most 2 live clones per workspace.
- **Recordings that don't match the script:** transcribe on upload; if it differs, the person chooses to keep it (the
  scene's text becomes what was said) or record again.
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
- Code facts that shape this design (verified by the reviews):
  - `agents.ts` `toPlan` hard-codes `presenter: "none"`, takes `voice` from the scriptwriter and rebuilds scenes
    (no scene ids); `validate` forces `presenter: "none"`; `plan.template` is never set from the chosen template.
  - `planProblems` is synchronous and also runs inside the scriptwriter's `validate`.
  - `join.ts` dissolves start the next clip 0.4 s early and only pad at the very end, while the voice is padded per
    scene: every earlier dissolve shifts later scenes 0.4 s against their voice. The seam check can turn cuts into
    dissolves.
  - `nextStep` sends any failed scene to the Kling backup; `prepareVoice` moves too-long scenes to the backup;
    `higgsfield.animate` and `Outputs.models` expect `VIDEO_MODELS` keys.
  - `spendCredits` with a known `refId` returns the existing (possibly refunded) charge: a retry must use a new refId.
  - `padAndJoinWav` needs one WAV format (OpenAI: 24 kHz mono 16-bit).
  - Stored product photos: `productPhotos()`; the media route needs `publish.execute`, 4 MB cap.
  - Jobs run when an open app pokes the runner or from a once-a-day cron (`vercel.json`).
  - No account deletion exists in the code; member removal is one DB transaction (`removeMember`).
  - Seedance's shortest clip is 4 s; `clipSeconds` bills a 3 s minimum.

## Build order (one reviewable commit each)

1. **Carry-over fix** (agents.ts, plan.ts): chat and templates stop wiping plan choices. Needed by everything after.
2. **Templates** (R12).
3. **Presenters** (R10) and presenter scenes in the render.
4. **Voices**: ElevenLabs stock voices, voice picker, Voices screen; deletes the phone's duplicate `VOICES` list.
5. **Recording voiceovers** (`expo-audio`, new dev build).
6. **Cloning**, consent, removal hooks, AI disclosure.

## 1. Carry-over (commit 1)

- `toPlan` keeps `presenter`, `voice` and the template from `current`. The scriptwriter's `voice` is used only for a
  brand-new plan; its prompt says the voice is set in the voice picker, not the chat. `Draft` gains per-scene
  `presenter` (bool), and `validate` stops forcing `presenter: "none"`.
- Recordings move with their text, not their position: a new scene whose `voiceText` equals an old scene's recorded
  text keeps that recording; others are dropped. `editPlan` does the same, so a script edit on R11 drops the recording
  of a changed scene (shown as "Recording removed: the text changed") instead of blocking the render later.
- Ownership checks (presenter of this brand, voice of this workspace, recording of this reel) live in a new async
  `planOwnershipProblems(plan, scope, tx)`, called in `editPlan`, before `savePlan` in chat, and in `startRender`;
  never in the scriptwriter's `validate`. `planProblems` adds the pure rules: presenter scenes only when
  `plan.presenter !== "none"`, at most half the scenes, not on stand-ins.
- Old plans parse unchanged (bare voice names, `presenter: "none"`): no data migration; in-flight renders finish as is.

## 2. Templates (commit 2)

- `server/reels/templates.ts`: `{ id, seconds, ask }` for six templates (spotlight, collection, material, arrival,
  three-uses, detail-to-room). The phone renders what the server returns; titles and subtitles stay phone strings
  (`templates.item.<id>`, the id if missing). The phone's sample template list and `templates.useAsk` are deleted.
- Applying a template: `templateId` is added to the create and chat routes; the server builds the scriptwriter
  instruction from `ask` and sets `plan.template`.
- `GET …/reels/options` returns templates (with cover and preview URLs) and presenters, one call for R10 and R12.
- **Generic previews (first view):** one 5 s clip per template, `kling-3-std`, rendered once by
  `scripts/render-template-previews.ts` (skips templates already rendered; Idempotency-Key `template:<id>`; a few
  dollars in all) using the same preview function as the paid path. Stored as public objects `templates/<id>.mp4`
  and `templates/<id>.jpg`. Until rendered, a card shows its cover photo.
- **Grid loads posters only;** a video plays when a card is tapped. Signed URLs are rounded to a fixed expiry window
  so the phone's cache hits.
- **Paid per-brand preview:** "Preview with my photos · 10 credits" on a card. Cover = the brand preview's photo if
  one exists and still exists in `productPhotos()`, else `productPhotos()[0]`; no photos → the button is disabled.
  The server picks the photo (never the client), crops it to 9:16 as `prepareVoice` does, and runs it as a
  **`PhotoShoot` row of kind `template-preview`** (input: templateId, photoKey; output key: the clip), reusing the
  photoshoot job, charge, poll and refund code rather than a new table. Retry is a new attempt (refId and
  Idempotency-Key `<id>:<attempt>`). A MAKING preview for the same brand and template blocks a second one.

## 3. Presenters (commit 3)

- A presenter is a **`PhotoShoot` row of kind `presenter`** (input: name, traits; output key: the character sheet),
  reusing the photoshoot job code. Listing filters by kind. Charge 2 credits (AI Influencer's $0.05 is unverified;
  covered by the margin check below). One MAKING presenter per brand, enforced by a partial unique index (raw SQL
  migration), not a read-then-insert. Removing deletes the row.
- Traits: AI Influencer's options (gender, age, ethnicity, skin tone, hair, hair colour, style; tier `normal`), one
  code list on the server, returned by `GET …/reels/options` so the phone has no copy.
- **Picking a presenter** saves `plan.presenter` (the presenter id) and `plan.presenterSheetKey` (so later removal
  doesn't break the reel), then runs a scriptwriter revision that marks presenter scenes. Choosing "No presenter"
  clears the flags.
- **Presenter scenes in the render:**
  - `VIDEO_MODELS` gains `seedance-2.5-ref` (reference-to-video), excluded from the zod `MODEL_IDS` so a PATCH can't
    put it on a scene; render picks it by `scene.presenter`.
  - Body: `image_urls: [sheet, product photo]`, `audio_urls: [scene voice]`, prompt naming the product (title from
    `productPhotos`). `ClipInput` gains `imageUrls` and `audioUrl`, signed at VOICE and stored in `outputs` so a
    resend is identical.
  - No backup model: at VOICE the presenter scenes are listed in `outputs.presenterScenes` and seeded into
    `out.backups`, so a failure doesn't go to Kling. A failed presenter scene is retried once on the same model with
    a new key (`:clip:i:retry`); a second failure fails the render (refunded). Presenter scenes over the model's
    maximum are refused at plan time.
  - **Every join in a reel with a presenter is a cut** (director output and seam check), so no dissolve shifts a
    presenter against its voice.
  - Priced at **4 credits/s** (`CREDIT_COSTS.presenterPerSecond`), using the model's own minimum (4 s).
- **Margin check at server start**, like the photoshoot tiers: `costUsd` estimates for the preview clip, the
  presenter sheet and presenter seconds; the server refuses to start if any price falls under the 70 % floor. Update
  the estimates after the first invoice.
- **Comparison script (A vs B):** `scripts/compare-presenter-audio.ts <presenterId> "<line>"` renders one line both
  ways and prints links and costs. Header: "delete after the owner decides". Option B is not wired into the render.

## 4. Voices (commit 4)

- Voice ids: bare names stay OpenAI (no `openai:` prefix); ElevenLabs voices are `eleven:<voiceId>`. `speak()`
  throws on an unknown voice instead of silently using coral. ElevenLabs TTS: `POST
  /v1/text-to-speech/{voiceId}?output_format=pcm_24000`, model `eleven_multilingual_v2`, wrapped as 24 kHz mono WAV.
- ElevenLabs calls run **two at a time** with retry and backoff on 429 (the plan's concurrency limit is
  account-wide).
- A "Try again" render reuses the previous attempt's speech for the same version when voice and text are unchanged;
  the VOICE step is claimed with compare-and-set (as clips are), so a duplicate tick doesn't pay twice. No separate
  speech cache.
- Stock voices: one server list (OpenAI five + a few ElevenLabs premade). `GET …/voices` returns stock + this
  workspace's live clones. The phone's `VOICES` list is deleted; R11's voice row opens a **Voices** screen.
- Samples: stock ElevenLabs voices use their `preview_url`; OpenAI voices and clones have one sample each, made once
  (a clone's at clone time), stored under `<workspace>/voices/<voiceId>/`. `GET …/voices` never generates audio.
- ElevenLabs errors: quota or plan limits → `unavailable` (refunded); a deleted voice → new failure kind
  `voiceDeleted` ("This reel's voice was deleted: pick another"), checked in `startRender` before charging.

## 5. Recording voiceovers (commit 5)

- R11 → **Record voiceover**: one recording per scene, the scene's text on screen (`expo-audio`, AAC 128 kbps mono;
  15 s ≈ 250 KB). A new Android dev build.
- Upload `POST …/reels/{id}/recordings` (`content.create`; the reel is loaded scoped to workspace, brand and studio
  first; per-user rate limit). Bytes checked (`ftyp` at offset 4, M4A/isom brand), length read from the container
  before converting, then ffmpeg in a unique temp dir deleted in `finally`: `-nostdin -protocol_whitelist file -f mp4
  -i in.m4a -t 16 -vn -map 0:a:0 -ar 24000 -ac 1 -c:a pcm_s16le`, 20 s timeout. Over 15 s (measured on the output) →
  "Keep it under 15 seconds".
- The server writes a `ReelRecording { id, workspaceId, contentItemId, key ("rec-<uuid>.wav"), seconds, transcript,
  uploadedByUserId, createdAt }` row. **Seconds are measured by the server** and used for pricing; the plan stores
  only `recordingId`. `planOwnershipProblems` checks the row belongs to this reel.
- **Transcript check:** the recording is transcribed (OpenAI speech-to-text). If it clearly differs from the scene's
  text (word-level similarity below a threshold), the app shows what was heard and asks: **"Keep it"** (the scene's
  `voiceText` becomes the transcript, so approvers and Quality see what is actually said) or **"Record again"**.
- **Remove recording** per scene. Retention: recordings of a reel are deleted when the reel is deleted, and unused
  ones after 30 days.
- Scenes are priced from the recording's seconds.

## 6. Cloning, consent, removal, disclosure (commit 6)

- **Who and how many:** workspace owners/admins only (a new `voices.manage` permission on those roles); at most 2
  live clones per workspace (partial unique count enforced in a transaction with an advisory lock); 10 credits per
  clone (slot cost; adjust). `requirePlan` like other paid actions.
- **Flow:** read a passage (60–90 s, reel language), tick the consent box, upload (same audio checks; ≤ 4 MB at
  128 kbps). The server checks the ElevenLabs plan (`can_use_instant_voice_cloning`, else "Voice cloning isn't
  available yet"), calls `POST /v1/voices/add` (`remove_background_noise: true`, 30 s timeout) and inserts the
  `Voice` row only on success (no CREATING state).
- `Voice { id, workspaceId, ownerUserId, name, providerVoiceId, sampleKey, consent Json, createdAt, archivedAt? }`.
  `consent`: userId, time, consent text version, app version, SHA-256 of the audio sent.
- **Consent text** names the recipients: "This is my own voice. I agree to it being used in videos made by this
  workspace. It is processed by ElevenLabs (USA) to create the voice and by Higgsfield to make presenter videos."
- The audio is held in memory only, never written to our storage or logs. ElevenLabs keeps it with the voice until
  the voice is deleted.
- **Deleting a voice** (its owner, or a workspace owner/admin), **withdrawing consent** (its owner), or **removing
  the member** from the workspace: the row is archived at once (archived voices are refused in planning and in
  `speak()`), then a queued job deletes it at ElevenLabs with retries, and purges `<workspace>/voices/<voiceId>/`.
  The member-removal hook enqueues that job after `removeMember`'s transaction. **Account deletion doesn't exist in
  the app yet**: when it's built, it must call the same job (noted in the handover).
- **Audit events** (`auditEvent.create`): clone created, renamed, deleted, consent withdrawn, and each render that
  uses a clone. The Voices screen shows a clone's owner where it was used.
- **EU AI Act disclosure:** a version whose plan has a presenter or a clone voice is flagged; at publish the caption
  gets a "Made with AI" line, and the JOIN step burns a small corner mark into the video. Neither can be removed for
  those reels.

## Failure modes (handled)
- Out of Higgsfield credits → FAILED with "Making videos isn't available right now", refunded; raw error kept for
  admins.
- ElevenLabs quota, plan or 429 → backoff, then `unavailable`, refunded.
- Double taps and races → partial unique indexes and advisory locks; retries are new attempts with new keys.
- A removed presenter → the plan's stored sheet still renders. A deleted voice → refused before charging.
- Recording mismatch → the person decides; recording drift on edits → dropped with a notice.
- Jobs only advance when an app is open or on the daily cron: the phone polls every 10 s while something is MAKING;
  a presenter started and abandoned finishes on the next run (documented).

## Not handled (documented)
- Someone cloning another person's voice despite the consent box (the consent record is our evidence).
- The shared ElevenLabs account's voice-slot and character ceilings across all customers (watch quota; alert at
  80 %).
- ElevenLabs/Higgsfield data-processing agreements and "no training" terms: confirm before launch.

## Guesses to confirm on the first live run
- AI Influencer request body and the field with the sheet URL; its real cost.
- Seedance reference-to-video body beyond `audio_urls`; WAV accepted; speech starts at 0 and follows the audio; lip
  sync holds with two image references; real cost per second.
- ElevenLabs Starter slot count, concurrency and licence.

## Tests
Unit (vitest): carry-over (presenter, voice, template, recordings by text); pure plan rules; ownership checks
(foreign presenter, foreign/archived voice, foreign recording); template list, covers, previews as PhotoShoot kinds
with attempts; presenter render path (model by flag, forced cuts, no backup, one retry, 4 s minimum, pricing);
margin check; voice ids and `speak()` (unknown voice throws, ElevenLabs concurrency and 429 retry); speech reuse on
retry; recording upload (sniffing, length, format, server seconds, transcript decision); clone guards (role, 2 per
workspace, plan can't clone, consent record); deletion and member-removal jobs; disclosure flag in caption and mark.
Emulator: R12 grid, R10 list and making state, R11 recording and transcript prompt, Voices screen.

## Review history
- Draft 1: written; 4-lens review (chat wipe, dissolve drift, presenter path, pricing, client-trusted ids, clone
  ownership, licence, shared slots).
- Draft 2: those fixed; owner: generic then paid previews, workspace clones, free ElevenLabs for testing, no voice
  per presenter.
- Four single-lens reviews of draft 2:
  - correctness: drift from any earlier dissolve, free retries, sync `planProblems`, presenter pick changes nothing;
  - security: client-set recording seconds, recordings bypassing review, missing deletion paths, shared-quota abuse,
    consent record, AI Act;
  - cost: retries, presenter price, ElevenLabs concurrency, network video;
  - maintainability: reuse the photoshoot job, cut CREATING states, the speech cache and the `openai:` prefix, split
    commits.
- Owner: transcribe and let the person keep or re-record; owners/admins clone, 2 per workspace; caption line and
  on-screen mark; presenter scenes 4 credits/s.
- Draft 3: all of the above.
