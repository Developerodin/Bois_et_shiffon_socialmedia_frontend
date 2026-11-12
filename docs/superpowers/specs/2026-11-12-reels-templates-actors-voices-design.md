# Reels: real templates, AI actors, recorded and cloned voices (phone R10, R11, R12)

Draft 2, 2026-11-12 (after a 4-lens review and the owner's answers). Not in the B&C brief: the phone app is our
addition. Build order: templates (R12) → AI actor (R10) → script and voice (R11). Each step: build → code review →
emulator check → commit.

## What the owner asked (2026-11-12)

- **Templates (R12):** replace the four fixed sample cards. Everyone first sees generic previews; a brand that wants
  more can pay for previews rendered from its own photos.
- **AI actor (R10):** brand-made presenters made with Higgsfield AI Influencer; a reel can show its presenter speaking.
  The voice is picked per reel (no default voice per presenter).
- **Voices:** "test both and decide": (A) our voice track lip-synced by Higgsfield, against (B) Higgsfield models that
  generate the speech themselves.
- **Script (R11) "Record your own voice":** record a voiceover for this reel, and clone the voice. Cloned voices go
  into a voice catalogue for later reels, **usable by the whole workspace**.
- Providers: Higgsfield for video and presenters; ElevenLabs for voices, cloning and the catalogue
  (`ELEVENLABS_API_KEY`). ElevenLabs stays on the free plan for testing; the owner upgrades it before launch, so build
  everything. Don't check or spend Higgsfield credits during the build.

## Facts this design rests on (checked 2026-11-12)

- Higgsfield's key-auth API (`api.higgsfield.ai`) has 95 models, video and image only: no speech, voice or lip-sync.
  Its voices exist only behind a personal login (CLI), which a server can't hold.
- `POST /bytedance/seedance-2.5/reference-to-video` `{}` → `400 'audio_urls' is a required property`. Rest of the body
  unconfirmed (see "Guesses").
- `POST /higgsfield/ai-influencer` `{}` → `403 not_enough_credits`: **the API account has no credits now.**
- ElevenLabs key: free tier, 10,000 characters a month, no instant cloning, 3 voice slots, no commercial licence. TTS
  works now; cloning and customer use need the paid plan (owner will upgrade).
- Phone uploads: `POST …/media`, 4 MB cap. No audio package in the app yet (`expo-audio` → new dev build).
- Reel internals that constrain this design (file:line from the review, verified):
  - `agents.ts` `toPlan` hard-codes `presenter: "none"` and takes `voice` from the scriptwriter (`z.enum(REEL_VOICES)`),
    and rebuilds scenes from the draft: a chat revision or "Use template" would wipe a presenter, an ElevenLabs voice
    and recordings. `plan.template` is never set from the chosen template.
  - `join.ts` dissolves start the next clip 0.4 s early while the voice is padded per scene (`render.ts` ~288); the
    seam check can turn cuts into dissolves (`render.ts` ~318).
  - `prepareVoice` switches a too-long scene to `BACKUP_MODEL`, and `retryOnBackup` re-runs failed scenes on Kling
    from the product photo.
  - `padAndJoinWav` needs every scene WAV in the same format (`wav.ts` ~34); OpenAI's WAV is 24 kHz mono 16-bit.
  - `reelPrice` counts words, not recorded seconds.
  - Stored product photos come from `productPhotos()` (`knowledge.ts`), not `Product.imageUrl` (a shop hotlink).
  - Long jobs use the job queue (`photoshoot/shoot.ts`, `enqueueJob` with timed follow-ups).

## 1. Templates (R12)

### The list
`server/reels/templates.ts`, a code table like `router.ts`: `{ id, seconds, ask }` (`ask` = the instruction given to
the scriptwriter, moved from the phone's `templates.useAsk`). Six: spotlight, collection, material, arrival,
three-uses, detail-to-room. Titles and subtitles stay phone strings (`templates.item.<id>`); the server list is the
one source of ids (the phone renders what `GET …/reels/templates` returns, a missing string falls back to the id).
Applying a template sets `plan.template` to its id.

### First view: generic previews for everyone
Each template has one generic preview clip we render once with Higgsfield (`scripts/render-template-previews.ts`,
run by us when credits exist) and store in our media bucket under `templates/<id>.mp4` plus a poster frame
`templates/<id>.jpg`. `GET …/reels/templates` returns each template with signed URLs for its generic preview (if
rendered yet; until then the card shows the brand's cover photo, below). No user charge, no table.

### "Make it with my photos": per-brand paid previews
On a card: **"Preview with my photos · 10 credits"**. Renders one 5 s clip of that template's opening shot from the
card's cover photo (the brand's own: first of `productPhotos()` assigned per template in a stable order; once a
preview exists, that preview's photo stays the cover). Cheapest model (`kling-3-std`), charged 5 s ×
`reelPerSecond`, refunded on failure. Stored in `ReelTemplatePreview { id, workspaceId, brandId, templateId,
photoKey, status (MAKING|READY|FAILED), requestId?, videoKey?, chargeId, error?, createdAt }`, unique
`[brandId, templateId, photoKey]`; a second tap while MAKING returns the same row (no second charge). Runs as a job
(the `shoot.ts` pattern). Needs `content.create`. A brand preview, when READY, replaces the generic one on that card.

## 2. AI actor (R10)

### Brand presenters
`BrandPresenter { id, workspaceId, brandId, name, traits Json, status (MAKING|READY|FAILED), requestId?, sheetKey?,
chargeId, error?, createdByUserId, createdAt, archivedAt? }`. Up to 5 live per brand; one MAKING at a time per brand
(a second "make" while one is MAKING is refused: no double charge).

- **Make one:** a name and a short trait picker from AI Influencer's options (gender, age, ethnicity, skin tone, hair,
  hair colour, style; tier `normal`; ids validated against a code list). A job submits `POST /higgsfield/ai-influencer`
  (Idempotency-Key = row id), polls, copies the sheet into our storage (`sheetKey`). Charge **2 credits** (cost $0.05;
  1 credit would sit under the 70 % margin floor), refunded on failure.
- **Pick one:** R10 lists "No presenter" (default) and READY presenters with their sheet. Choosing sets
  `plan.presenter` to the id (saved through the existing plan PATCH). MAKING: spinner; FAILED: "Couldn't make this
  presenter" with Try again (new charge) / Remove.
- **Remove:** archives; reels already planned with it keep rendering from the stored sheet.
- **Play sample:** plays the reel's current voice saying a fixed line in the reel language (see §3 samples).

### Plan and scriptwriter
- `ReelPlan.presenter`: `"none" | <presenter id>`; `ReelScene.presenter?: true` marks a presenter-to-camera scene.
- The scriptwriter, given a presenter, marks presenter scenes: at most half, never a stand-in scene, and the product
  photo still names the product shown.
- **Carry-over (fixes the wipe):** `toPlan` keeps `presenter`, `voice` and per-scene recordings from `current`, like
  `carryStandIns`: recordings stay on a scene only while its `voiceText` is unchanged. The voice changes only through
  the voice picker (R11/Voices), not the chat; the scriptwriter's `voice` is used only for a brand-new plan.
- `planProblems` (save and render) checks: presenter is a READY or archived presenter **of this brand**; presenter
  scenes ≤ half and not stand-ins.

### Render, presenter scenes
- Model chosen **by `scene.presenter`** in render, not by `scene.model`: a separate `PRESENTER_MODEL` entry (path
  `/bytedance/seedance-2.5/reference-to-video`), **not** in `MODEL_IDS`, so a plan PATCH can't put it on another scene.
- Body: `image_urls: [presenter sheet, scene's product photo]` (so the product shown is the real one), `audio_urls:
  [scene voice WAV]`, prompt "the presenter speaks to camera next to <product>". `ClipInput` gains `imageUrls` and
  `audioUrl`; both URLs are signed once at VOICE and stored in `outputs` (like `photoUrls`), so a resend sends the
  identical body under the same Idempotency-Key.
- No fallback model: a too-long or failed presenter scene **fails the render** (refunded), never silently becomes a
  Kling product clip. Presenter scenes are capped at the model's max length in `planProblems`.
- **Lip-sync stays aligned:** transitions into and out of a presenter scene are forced to `cut`, and the seam check
  skips those joins.

### The voice comparison ("test both")
Option A (above) is what the render does. Option B (a native-audio model speaking the line: Kling 2.6 Pro or
Seedance 2.5 image-to-video with `generate_audio: true`) is **not** in the render: it needs a different JOIN and gives
no control over wording or voice. `scripts/compare-presenter-audio.ts <presenterId> "<line>"` renders the same line
both ways and prints both links and costs. Run once credits exist; the owner picks; if B wins, a follow-up wires it.

## 3. Voices: catalogue, recording, cloning (R11)

### Voice ids and speech
- `ReelPlan.voice`: `"openai:<name>" | "eleven:<voiceId>"`; a bare name (old plans) = `openai:<name>`.
- `speak()` dispatches on the prefix. ElevenLabs: `POST /v1/text-to-speech/{voiceId}?output_format=pcm_24000`, model
  `eleven_multilingual_v2` (a constant; it detects the language from the text), PCM wrapped as 24 kHz mono 16-bit WAV
  so `padAndJoinWav` sees one format.
- **Speech cache:** each scene's WAV is stored under a hash of (voice, text, language); a "Try again" render reuses it
  instead of paying for the same speech again.
- Errors: quota used up / plan limits → VOICE fails as `unavailable` and is refunded (extend `renderFailure`'s
  pattern); a deleted voice → "This reel's voice was deleted: pick another" (refunded).

### Voice catalogue
- Stock voices: a code list (OpenAI's five + a few ElevenLabs premade voices).
- Cloned voices: `Voice { id, workspaceId, ownerUserId, name, providerVoiceId?, status (CREATING|READY|FAILED),
  consentAt, consentText, createdAt, archivedAt? }`. **Usable by everyone in the workspace**; only the owner renames or
  deletes. **One clone per person per workspace**; the ElevenLabs account's slot limit is the hard ceiling (shared by
  all customers: a known limit, written in the handover).
- `GET …/voices` (`brand.read`): stock + the workspace's READY clones, each with a sample URL.
- `planProblems` checks the voice: a stock voice, or a READY/archived `Voice` of **this workspace** (so a client can't
  name another workspace's clone on our shared ElevenLabs account).
- Phone **Voices** screen (under Reels, opened from R11's voice row): stock voices and "Workspace voices", play each,
  pick one for the reel; the owner of a clone can rename or delete it.
- Delete: archive the row and delete the ElevenLabs voice (frees the slot). Also on **removal from the workspace** and
  **account deletion**: the person's clones are deleted at ElevenLabs and archived.

### Samples
One sample per (voice, language) for the brand's own locales only, generated on first play and cached in storage
(`voice-samples/<voice>-<lang>.wav`); ElevenLabs premade voices use their free `preview_url` for English.

### Record your own voiceover (this reel only)
- R11 → **Record voiceover**: one recording per scene with the scene's text on screen (`expo-audio`, m4a/AAC, mic
  permission).
- Upload: `POST …/reels/{id}/recordings` (`content.create`; m4a sniffed by bytes; ≤ 4 MB). The server converts with
  ffmpeg (`-f mp4` input, audio only, `-ar 24000 -ac 1 -c:a pcm_s16le`, a timeout), refuses over 15 s ("Keep it under
  15 seconds"), stores the WAV and returns `{ key, seconds }`. It does **not** change the plan.
- The app saves `recordingKey`, `recordingSeconds` and `recordingText` (the text recorded against) on the scene
  through the existing plan PATCH, so the version check and unsaved edits work as today.
- `planProblems` checks a recording key is under this brand's media prefix and ends in `.wav`.
- Render: a scene whose `recordingText` equals its `voiceText` uses the recording instead of speech; if the text
  changed, the render is refused with "Re-record scene N: the text changed" (no silent AI fallback).
- **Price follows the recording:** `reelPrice` uses `recordingSeconds` for recorded scenes.

### Clone my voice
- R11 → **Clone my voice** (`content.create`): read a passage shown on screen (60–90 s, reel language), tick
  **"This is my own voice. I agree to it being used in videos made by this workspace."**, upload (m4a, same checks,
  ≤ 4 MB).
- Server: refuses if the person already has a clone here, or one is CREATING; checks the ElevenLabs plan
  (`can_use_instant_voice_cloning`, else "Voice cloning isn't available yet"); `POST /v1/voices/add` (`name`,
  `files[]`, `remove_background_noise: true`) → READY with `providerVoiceId`.
- **The raw recording is not kept** (biometric data): it's sent to ElevenLabs and discarded; samples come from TTS.
- The new voice is selected for the current reel.

## Permissions
Templates, previews, presenters, recordings, cloning: `content.create`. Listing voices and presenters: `brand.read`.
Renaming/deleting a clone: its owner only.

## Failure modes (handled)
- Higgsfield out of credits → presenter/preview FAILED "Making videos isn't available right now", refunded; raw error
  kept for admins (as `renderFailure`).
- ElevenLabs quota/plan → "Voices are at their monthly limit" / "Voice cloning isn't available yet"; renders refunded.
- Double taps: preview unique row; one presenter MAKING per brand; one clone CREATING per person.
- Presenter archived after planning → still renders from the stored sheet. Voice deleted → render refused, refunded.
- Recording text drift → `recordingText` check. Format mismatch → fixed 24 kHz mono output.
- Lip-sync drift → forced cuts around presenter scenes.
- Not handled: cloning someone else's voice despite the consent box (the consent record is our evidence); ElevenLabs
  outages beyond the job retry; the shared voice-slot ceiling (documented).

## Guesses to confirm on the first live run (credits needed)
- AI Influencer request body and the field holding the sheet URL.
- Seedance 2.5 reference-to-video body beyond `audio_urls` (`image_urls`, `prompt`, `duration`, `resolution`), and
  whether it holds lip-sync with two image references.
- ElevenLabs Starter slot count and licence (confirm when upgrading).

## Cost check
Presenter 2 credits ($0.05 cost). Presenter scenes and previews use `reelPerSecond` until the real Higgsfield cost is
known: add `costUsd` to the presenter model and apply the photoshoot tiers' 70 % margin floor check.

## Phone build
`expo-audio` (config plugin, `RECORD_AUDIO`) → new Android dev build. Strings English first, then
`scripts/i18n-translate.mjs`.

## Tests
Unit (vitest): template list and covers (no photos, stable order, preview photo sticks); carry-over of presenter,
voice and recordings through chat and template; voice id parsing and `speak()` dispatch (bare names); speech cache key;
`planProblems` (foreign presenter, foreign/unknown voice, bad recording key, presenter scene limits, recording text
drift); recording upload (m4a sniff, 15 s cap, WAV format); pricing with recordings; clone guards (one per person,
CREATING lock, plan can't clone, consent required); render picks the presenter model only by `scene.presenter`, forces
cuts around it, no backup fallback; failure mapping. Emulator: templates grid; record a scene; Voices screen; R10 list.
Live Higgsfield runs and ElevenLabs cloning wait for credits / the paid plan.

## Review history
- Draft 1 (2026-11-12): written.
- 4-lens review (2026-11-12): 4 high correctness (chat/template wipe, dissolve lip-sync drift, presenter render path,
  plus pricing), 3 high security/privacy (client-trusted ids, clone ownership, ElevenLabs licence), 1 high cost (shared
  slots); mediums on WAV format, plan saving, covers, polling, locks; cuts suggested.
- Owner (2026-11-12): generic previews first then per-brand paid; clones usable by the workspace; free ElevenLabs for
  testing, upgrade before launch, build everything; no default voice per presenter.
- Draft 2 (2026-11-12): all review findings addressed as above; templates cut to six (before/after and offer
  countdown dropped: no data for them); presenter charge 2 credits; raw clone samples not stored.
