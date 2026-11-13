# Handover: mobile app on the real backend, Posts to Photoshoot (end of day 2026-11-02)

Branch `ai-reels` (not pushed, not merged). Today moved the app's Figma screens from sample data to the real server,
one module at a time. Each module was given a review for correctness, security, performance and maintainability,
tested on the emulator, fixed, and committed.

## Instagram stories (end of day 2026-11-13)

Branch `desktop-shell`, committed, **not pushed** (`main` still at `08e5fb1`). Spec
`docs/superpowers/specs/2026-11-13-instagram-stories-design.md`, plan `docs/superpowers/plans/2026-11-13-instagram-stories.md`
(commits `f7e6ef6` to `e033d6b`). Each task had its own review (most had a fix round). The whole-branch four-lens
review ran at the end of the day: no Critical findings and 8 Important; the handover one is fixed here, **7 to fix tomorrow** (list below; full reports in
`docs/handover/2026-11-13-stories-final-review/`). Web: 756 vitest tests pass, tsc clean; phone: tsc clean, `expo lint`
shows only 4 older errors in the reels screens.

**What it does**
- A story is 3–5 frames, each a photo or a clip (15 s window, sound on or off), with headline/body text, a CTA on the
  last frame and an optional brand mark, rendered on the server (`server/stories/render.ts`, ffmpeg + sharp, text burned in).
- Frame sources: phone upload (one-tap rights confirmation, single-use upload slots, 20 per brand per hour), catalogue
  products, the brand's earlier work (library, posts, photoshoots, finished reels), and Generate (Photoshoot or the Reels
  studio, with **Use in story** bringing the result back to its frame).
- The agents plan and write stories (Planner slots Wed + Sat); an app-requested story costs 5 credits, refunded if writing fails.
- Checks: story rules plus the shared text, product and offer checks.
- Two ways out: Schedule (published frame by frame, never a frame twice, partly-posted state with Post the rest / Mark
  done) or Post by hand (a checked zip package plus a due list and in-app reminder; the pasted story link is kept).
- Web: calendar, lists, content workspace with approval, schedule, download, post by hand. Phone: Stories and Today
  screens, approve / schedule / post by hand, and the editor (frames, text, CTA, picker, crop with Fit/Fill, trim, sound).

**How to try it**
- Seed a draft: `npx tsx --env-file=.env scripts/seed-story.ts` in `apps/web` (pinned to the dev workspace and brand;
  only database hosts listed in `SEED_ALLOW_DB_HOSTS`); `--reel` seeds a finished reel to pick; `--remove` cleans up.
- Phone deep links: `espanda://posts/edit-story?id=<id>`, `espanda://posts/story/<id>`.

**Before it can go live**
- Scheduling needs an Instagram **Business** account connected; it was not run end to end against the Graph API.
- Generate needs Higgsfield credits for new Photoshoot or Reels results (picking existing ones works).
- The in-app due card works today; only a push reminder for by-hand stories waits for Firebase push setup.
- Check that `next build` traces `ffprobe-static` and the fonts (`next.config.ts` outputFileTracingIncludes); not run.
- A new phone dev build is needed (expo-media-library, expo-clipboard and the `app.json` plugins).
- New phone strings are English only in this branch; the other 23 languages need translating.
- A release build is needed to confirm an upload retries after the app returns from the background, and pinch-to-zoom
  needs a real device.

**Known gaps (documented, not built)**
- Generate for a product story opens Photoshoot's product setup at 9:16 but doesn't preselect the product photo
  (catalogue products aren't linked to the photo library); owner to confirm that reading of "product preset".
- Clips picked from the library or posts (not uploaded, not reels) take their size from the player, so a rotated one may
  preview a little off; the render is right.
- The server doesn't strip a crop sent on a reel frame (the phone never sends one).
- Deferred minors from the per-task reviews: library list has no cap, list GET exposes media keys, calendar thumbnails
  re-signed on each poll, no per-version frame history.

**To fix tomorrow (final review, Important)** — details and file:line in `docs/handover/2026-11-13-stories-final-review/`
1. Correctness: a duplicated story is created PLANNED, so a Generate calendar run gives it an AI brief and the Creator
   overwrites the person's text as v2 (`server/stories/service.ts:370`, `brief.ts:38`, `creator.ts:75`).
2. Spec: web users never see the post-by-hand steps; the zip has only `link.txt` (`package/route.ts:58`), the web panel
   shows none (`release-panel.tsx:482`), and the server `STEPS` (`by-hand.ts:63`) are unused while the phone keeps its
   own copy. One source of steps, shown on web and in the zip.
3. Spec: a story whose first frame is a clip shows an `.mp4` as an image thumbnail in four places (web calendar
   `content-panels.tsx:400`, phone card `ui/stories/card.tsx:79`, Today `ui/posts/use-posts.ts:76`, due list). Needs a
   poster JPEG from the clip render or a video tile.
4. Phone: a Planner story with no draft is a dead end ("Add photos" → editor says "not drafted yet", no action)
   (`posts/story/[id].tsx:259`, `edit-story.tsx:152`, `ui/stories/card.tsx:83`).
5. Phone: VoiceOver can't reach a story card's "…" menu (Duplicate, Delete) (`ui/stories/card.tsx:71`); add
   accessibilityActions.
6. Phone: about 31 of 47 story refusal codes have no app string, so people see server English (`ui/stories/errors.ts:15`,
   `stories.errors` in en `posts.json`), e.g. `story.textFit`, `story.clipWindow`, `story.renderFailed`, `story.framesNotReady`.
7. Phone: the editor hides a failed story read (no error, no retry; a rendering or approved story opens editable)
   (`edit-story.tsx:143`).

**Minor worth doing with them**
- Security: rendered clips keep the phone's GPS location tag; add `-map_metadata -1` to `clipArgs`
  (`server/stories/render.ts:396`), bump `RENDERER_VERSION`, optionally strip it at upload check.
- Money: a re-run Creator job can refund a paid story, and the Generate calendar run can write paid stories free
  (`engine.ts:225`, `runner.ts:65`, `creator.ts:74`); nobody is charged twice.
- An edit to an approved by-hand story after its zip was downloaded blocks "I posted it" (`manual-post.ts:91`); a retried
  final render step never starts Quality (`stories/service.ts:251`); an agent's failed clip render shows on the phone as
  the person's failed save (`stories/service.ts:293`).
- Web: the by-hand time shows without a day in the content list, and the time field accepts a past time.
- Duplicated constants across server modules (`MIN_CLIP_SECONDS`, `LOGO_MAX_BYTES`, the 8 MB cap, the 15 s window) and
  about 12 exports with no outside user.

## Reels templates, presenters and voices (end of day 2026-11-12)

Branch `desktop-shell`, everything committed, **not pushed** (`main` still at `08e5fb1`). Built from
`docs/superpowers/specs/2026-11-12-reels-templates-actors-voices-design.md`, one commit per step; each step had a
four-lens review (Fable, medium: correctness/money, security, phone UI + i18n, spec + simplicity) and every finding was
fixed before its commit. Web: tsc clean, 492 vitest tests pass. Phone: tsc + lint clean on the touched screens.

| Commit | What it does |
|---|---|
| `9708b6b` | A chat revision keeps the voice (and template) picked in the app. |
| `34f73c8` | R12 templates: six server templates (`server/reels/templates.ts`), generic preview clips, paid per-brand previews (10 credits) as `ReelAsset` rows. |
| `8a4f81a` | R10 presenters: AI Influencer character sheets (2 credits); presenter scenes on Seedance reference-to-video (4 credits/s, at least 4 s, one retry, cuts only); shared paid-asset job `server/reels/assets.ts`; ownership checks at save and before charging (`server/reels/ownership.ts`). The app reads reel and scene lengths from the server. |
| `e68dba3` | Voices: OpenAI five + six ElevenLabs stock voices, Voices screen with samples; unknown voices refused; ElevenLabs spoken one scene at a time with 429 backoff (2 min cap). |
| `b739bc9` | R11 recorded voiceovers: per-scene takes (expo-audio, up to 15 s), ffmpeg to 24 kHz WAV, speech-to-text check with Keep it / Record again, recordings follow their text, 30-day sweep (`server/reels/recordings.ts`). |
| `1c68ab4` | Voice cloning (`server/reels/clones.ts`): `voices.manage` (Owner/Admin, workspace-only; a data migration adds it to existing Admin roles), 2 per workspace, 10 credits (placeholder), charge first, refund + ElevenLabs delete on failure, consent record; delete / withdraw / member removal queue the ElevenLabs delete in the same transaction; audit events. "Made with AI" for presenter or cloned-voice reels: caption line in the reel's language (shown to approvers, added at publishing, can't be edited out) and a corner mark burned into the video. |
| `b13aa36` | ElevenLabs voice library (`server/reels/library.ts`): Voices > Library tab, one row of filter buttons (language = the reel's by default, gender, age, use) opening a sheet, search, previews; picking saves `library:<id>`. |

**What needs money before it can be tried live**
- Higgsfield credits (the account answers `403 not_enough_credits`): generic template previews
  (`npx tsx --env-file=.env scripts/render-template-previews.ts <workspaceId> <demoBrandId>`; use our own demo brand
  only, every customer sees them), a real presenter, a presenter reel, and the A/B audio comparison
  (`scripts/compare-presenter-audio.ts`; delete it after the owner chooses A or B). Guesses to confirm on that first
  run (AI Influencer result field, Seedance reference body) are listed in the spec.
- ElevenLabs paid plan (Starter or above): cloning (the free plan can't), and speaking with library voices (the free
  plan answers 402 `paid_plan_required`; until then a render with one is refused before charging). At the upgrade,
  check whether a library voice must first be added to our account (`POST /v1/voices/add/{public_owner_id}/{voice_id}`,
  uses a voice slot); if so, that step needs adding. Then check the 10-credit clone price and the margin estimates
  (`PREVIEW_COST_USD` in templates.ts, `PRESENTER_COST_USD_PER_SECOND` in presenters.ts) against real invoices.

**Before release**
- About 250 new phone strings in 23 languages are machine translations (`gpt-6.1-terra`): a native speaker should review.
- Confirm ElevenLabs' and Higgsfield's data-processing agreements and "no training" terms (cloned voices).

**Known gaps (documented, not built)**
- No account deletion exists; when built it must archive the person's clones and queue `voices.delete` as
  `removeMember` does. Deleting a workspace (no path yet) would drop clone rows without deleting them at ElevenLabs.
- A recording's audio stays in storage when its reel is deleted (only the row cascades; no reel-delete path yet).
- Withdrawing consent uses brand routes: an owner with no brand access must ask an admin.
- The data migration re-adds `voices.manage` to a system Admin role an owner had trimmed.
- The disclosure line adds about 15 characters at publishing; a caption right at the channel limit fails then, not at review.
- Three reel screens (`generating`, `review`, `scheduled`) have lint errors that predate this work.

**Test data:** the test presenter was deleted. The test reel "Tête de lit Sculpture II"
(`cmwd6rj9e0005v620hne74fvm`, Bois & Chiffons) still names it: pick "No presenter" on its Presenter screen (or delete
the reel). Its test recordings are removed by the daily sweep after 30 days.

**Running it on this Windows machine**
- Web: `npm run dev` in `apps/web` (port 3100). Stop it before `npx prisma generate` (Windows locks the engine DLL);
  ours is the node process whose command line contains `Social Media Agent`. The `Cad` node and python processes
  belong to another project: leave them.
- Phone build: the SDK's default CMake 3.22.1 (ninja 1.10) can't build `react-native-worklets` past the 260-character
  path limit, even with Windows long paths on. `apps/mobile/android/local.properties` (git-ignored) sets `cmake.dir`
  to CMake 3.31.6 (ninja 1.12). Build with `gradlew.bat app:assembleDebug -PreactNativeArchitectures=x86_64` in
  `apps/mobile/android` (ANDROID_HOME = `C:\Users\INTEL\Android\sdk`), then `adb install -r` the APK. After changing
  `app.json` plugins, run `npx expo prebuild --platform android --no-install` first (android/ is generated; re-add the
  `cmake.dir` line if prebuild rewrites local.properties).
- Metro: another project's agent holds port 8081, so run `npx expo start --dev-client --port 8082`; the installed
  app's dev host is set to `10.0.2.2:8082` (its shared prefs `debug_http_host`). A fresh install loses that setting.
- Memory is tight (31 GB, often about 3 GB free): the emulator, Metro, the web server and a Gradle build together got
  processes killed once; start them one at a time.

**Next, in order (to agree with the owner):** top up Higgsfield and render one presenter reel end to end; decide A or
B for presenter audio; upgrade ElevenLabs and try cloning and a library voice; then the older open items below
(Shopify live test, CSV import).

## Session of 2026-11-12 in short

Branch `desktop-shell` (still not pushed). Owner picked the phone offer check and the campaigns-screen follow-ups.
- Campaigns screen (`1f6f308`): the section sits above the product table; 24-hour HH:MM time fields; timezone is a
  list of readable names ("Paris (Central European Time)"); a warning when the offer wording and discount % disagree;
  product picker search with a ticked count. Offer issues now say "(Paris)", not "Europe/Paris" (web and phone).
- Phone (`7ad85a0`): "Approve anyway" on the post screen for people with `content.approve` + `rules.approve` when
  every refusing issue is overridable (same rule as the web); approved issues read "(approved anyway)"; a waiting post
  reads "Waiting for approval", not "Draft ready". 7 new strings machine-translated (`gpt-6.1-terra`): review first.
- Checked: web tsc + full vitest; `e2e/campaigns.spec.ts` in Chrome, 3 of 4 pass. The fourth ("post with an ended
  offer") fails only because the catalogue was last synced 7 days ago: Julia's stock is unconfirmed, so the post also
  shows "Suggest another product". Sync the catalogue before running it. Phone: tsc + lint, and on the emulator a
  seeded ended-offer post → empty-note error → Approve anyway → Approved, Schedule unlocked.
- Host IP is now 192.168.0.14 (`apps/mobile/.env.local` updated).
**Open, in order:** Shopify live test (needs the owner's store); CSV import.

## Session of 2026-11-05 in short

Branch `desktop-shell` (not pushed; `main` still at `08e5fb1`). Owner's priority: the B&C brief's base work first.
Done today, each planned → reviewed → built → code-reviewed → run on real Bois & Chiffons data → committed:
- Product catalogue (`d51b285`), products in briefs, drafts, checks, approval and publishing (`9355d8a`),
  offers, campaigns and standing priorities (`bb64cd0`, `84ce85c`). Details under "Product catalogue" below.
- Phone post status label and connect wording (`10e98ed`); all phone strings translated into 23 languages
  (`08189c8`, machine translation: review before release).
**Next session (owner, 2026-11-05): before starting anything, ask the owner which of the open items below to do
first.** Open, in order: phone check of a post with an offer; the five campaigns-screen follow-ups listed below; Shopify
live test (needs the owner's store); CSV import. Dev environment: web on :3100 (`npm run dev` in `apps/web`; stop it
before `prisma generate`), Metro on :8081, emulator Pixel_10 (screenshots with `adb emu screenrecord screenshot`).

## Start here next time (checked against the code on 2026-11-05)

Branch `desktop-shell` now holds everything: it contains `ai-reels` (with Marketing, `ab830c2`) and `audit-fixes`
(Phases 1-4, see `docs/handover/2026-11-03-*.md`). Each module below goes through the same steps: wire it, review
it, test it on the emulator, fix it, commit it.

1. **Website Studio is hidden until the brief's base work is done** (owner's call, 2026-11-05; the B&C functional
   brief doesn't cover it). The Marketing card, the drawer link, the Plans tool row and the Professional plan's
   "Website Studio & custom domain draft" line are gone, and the three Figma screens (`marketing/website`,
   `website-edit`, `website-publish`), `ui/marketing/sample.ts` and their strings are deleted. Restore them from
   `17b7438` if needed. The owner's direction when it comes back: show the issues on the brand's own site against
   standards. Research's SEO agent (PageSpeed performance, SEO, accessibility and best-practice scores, on-page
   checks), the GEO agent and the competitor site audit already produce this; the phone just doesn't show it.
2. **Stories** (`posts/stories`, `posts/edit-story`) is a "coming soon" page. It needs server work first: a story
   channel in the publish chain.
3. **AI actor** (`reels/actor`): the sample voice is shown as "coming soon". The reel voice is OpenAI
   gpt-4o-mini-tts, so samples could come from there.
4. **Reels templates** (`reels/templates`) is still a fixed list of four with Bois & Chiffons photos
   (`ui/reels/sample.ts`). Picking one does send a real request to the chat. `ui/reels/sample.ts` also holds the
   Espanda logo and mark the chrome uses; that part is app branding, not sample data.
5. **Plans has no payment.** That's deliberate for now: an admin turns plans on.
6. **New strings are English only.** Other locales still hold older text; re-run `scripts/i18n-translate.mjs`
   once the owner approves the wording.
7. **Photoshoot fashion tiers are untested live.** The Higgsfield account has no credits. Before selling fashion
   shoots:
   - Top up Higgsfield.
   - Run one fashion shoot per tier.
   - Confirm two guesses (in `server/reels/higgsfield.ts` and `server/photoshoot/tiers.ts`): the image status
     answers with `images[].url`, and Marketing Studio Flare takes `input_images`.
8. **Check the tier costs against real invoices.** `costUsd` in `tiers.ts` are estimates. The server refuses to
   start if any tier drops under the 70% margin floor.
9. **Push and merge** `desktop-shell` when the owner says so (`main` is still at `08e5fb1`, 2026-10-30).

**Product catalogue (brief A7) is in** (2026-11-05, spec `docs/superpowers/specs/2026-11-05-product-catalogue-design.md`).
Next steps on it, in order:
1. **Done (2026-11-05): products in briefs, drafts, checks, approval and publishing** — gap audit B1, B2, B6.
   Plan: `docs/superpowers/specs/2026-11-05-products-in-content-design.md` (ninth draft, after an adversarial
   review and seven review → fix rounds). Posts link products at the brief stage (`ContentItem.productIds`, then
   the version body's `productIds`); app posts link the product of their photo. Products are judged per product
   group (same `/products/<handle>`). Quality adds stock and price rows; the price snapshot is the `kind:"price"`
   rows in `QualityCheck.results` (`productRows` writes, `snapshotOf` reads). One gate (`productGate` in
   `publishing.ts`) refuses approval, scheduling and publishing when a linked product is gone / out / unconfirmed
   (synced stock older than 50 h) or a recorded price changed. "Approve anyway" (needs `content.approve` +
   `rules.approve`, note ≤ 500) covers stock only, never prices. "Ask for changes" + "Suggest another product"
   (web and phone) makes the Creator swap to an in-stock product. Typed stock, prices and facts need
   `rules.approve` (Managers lose fact editing).
   Code: `server/catalog/linked.ts`, `server/content/product-checks.ts`, the Brief/Creator/Quality agents
   (prompt version 8), `server/content/knowledge.ts`, `publishing.ts`, the content and products routes,
   `release-panel.tsx`, `products-board.tsx`, mobile `posts/[id].tsx` and `business/product/[id].tsx`.
   Checked: 4-lens code review (2 medium, 8 low, all fixed); real runs on Bois & Chiffons with the real AI (post
   linked to Chaise "Julia" → draft with its price → Quality pass → sold out → approve refused → approve anyway
   with a note); web `e2e/product-gate.spec.ts` in Chrome; on the emulator the phone showed the issue, the
   prefilled note and "Suggest another product", and "Ask for changes" made the Creator swap to an in-stock sibling
   chair with its own price and photo, after which Schedule was enabled.
   Also checked live: stock confirmed 60 h ago shows "hasn't been confirmed for over two days" and refuses
   scheduling of an approved post. Publish-time refusal is covered by tests only (no connected account).
   `e2e/product-gate.spec.ts` needs a seeded post: the seed/unseed helpers live in the git-ignored
   `apps/web/scripts/_tmp/` (copy `run-products.ts`'s setup if they're gone). New strings are English only.
2. **Done (2026-11-05): offers, campaigns and priorities** — brief A7 (rest), B2/B6 "expired offer", B7 commercial
   owner. Plan: `docs/superpowers/specs/2026-11-05-offers-campaigns-design.md` (fifth draft: adversarial review +
   two 4-lens reviews). One `Campaign` table: offer (has terms, needs an end), dated campaign, standing priority (no
   end). Times have hours and follow `BrandProfile.timeZone` (`zonedInstant`/`wallTime` in
   `server/content/offer-checks.ts`: a spring-forward gap time is refused, a fall-back overlap takes the first one).
   New `commercial.manage` permission + "Commercial owner" role. Planner gives each campaign/priority up to 2 posts
   per 30 days (inside a dated campaign's window); Brief/Creator/Quality/Scout get the campaign facts; Quality checks
   every discount % in the text against the linked offer or a compare-at price. The gate holds a post when its offer
   ended (overridable with "Approve anyway"), was withdrawn, changed terms or products, or would go out before it
   starts (all three: ask for changes). Web: "Campaigns and offers" on /products (timezone control, affected-posts
   warning on edit/withdraw); posts show a campaign line and the offer issues (web and phone).
   Checked: tsc + full vitest; 4-lens code review (2 medium, 7 low, all fixed); real run on Bois & Chiffons with the
   real AI (-20 % flash sale + code → draft → Quality pass → offer really ended → approve refused → approve anyway;
   terms changed to -15 % → refused, not overridable).
   Browser: `e2e/campaigns.spec.ts` passes in Chrome (create/edit/withdraw an offer, viewer read-only, a post whose
   offer ended → Approve anyway; seed with `scripts/_tmp/seed-offer.ts`, clean up with `unseed-offer.ts`).
   Phone post screen with an offer: checked on the emulator 2026-11-12, with "Approve anyway" now on the phone
   (`7ad85a0`). The five UI follow-ups from the browser check are done (`1f6f308`, see the 2026-11-12 summary at the
   top). Known limits: "réduction de
   30 %" is always read as a discount; a standing priority starting later today can get a 09:00 UTC post a few hours
   early. Seed helpers for e2e live in the git-ignored `apps/web/scripts/_tmp/`.
3. Test Shopify Admin live: a custom app with `read_products` + `read_inventory` on a real store, connect on the web
   Connections page, Sync now. The query cost and throttle handling follow Shopify's documented rules but have
   never met a real store.
4. CSV import of products.

**Brief gap audit:** `docs/handover/2026-11-05-brief-gap-audit.md` lists every acceptance criterion of the B&C
functional brief against the code (built, partial or missing). Use it to pick the base work.

### Done on 2026-11-05

- **Planner "Generate calendar" shows the outcome.** New `GET …/agents/:agentKey/runs?id=` (`agents.read`) returns
  the run's status, its output, and a reason only when the run had nothing to do (other failure text stays in the
  log). P09 polls it every 5 s and then says how many posts were planned, or that planning didn't finish and the
  5 credits are back, with Try again.
- **Photoshoot brief note:** "French prompt" (a Figma leftover; the brief is sent as typed) is now "Required" for a
  custom scene and "Optional" otherwise. The orphan key is removed from all locales.
- **`ui/posts/sample.ts` → `ui/posts/format.ts`.** The unused `POSTS`, `POST_COPY` and `getPost` and the
  `bunting-tv-unit.jpg` they used are deleted.
- **Checked on the emulator (Pixel_10, test account, Bois & Chiffons):** Marketing home, drawer and Plans tools
  without Website Studio; photoshoot brief note "Optional"/"Required"; planner "nothing to plan" outcome with
  refund and Try again. Two fixes came out of it (`f6ea36d`): a duplicate `briefRequired` key, and the run status
  route now starts a stalled job queue (a run sat QUEUED for minutes). The planner's success message was not seen
  on screen: the account has no ideas left to plan.
- **Product catalogue:** `Product` table, website feed sync (public Shopify `/products.json`, 1,394 Bois & Chiffons
  variants in ~7–11 s; only changed rows are written), Shopify Admin sync code (untested live), manual products,
  daily sync + "Sync now", web Products page (search, 50 rows at a time, facts edit, add/delete manual), Shopify
  connect card (checks the token's scopes), phone Business → Products list + product detail (facts edit, Sync now).
  Materials, dimensions and certifications are person-owned: no sync touches them. 4-lens review done and fixed.
  Checked: `e2e/products.spec.ts` passes in Chrome (run with `PLAYWRIGHT_CHANNEL=chrome
  E2E_PRODUCTS_BRAND=<workspaceId>/<brandId>`), and on the emulator (first sync from the phone, facts saved).
- Already fixed before today, so dropped from the list: the Reels home's Bois & Chiffons logo and photo, and the
  `photos.table` fallback in `reels/publish`, `scheduled` and `script`.

## What changed today (oldest first)

| Commit | Module | What |
|---|---|---|
| `98b6956`, `9da7b8b` | Posts | List, detail, edit, schedule, calendar, brief, planner on real posts; the agent chain (Planner → Brief → Creator → Quality); self-approval when nobody else can approve |
| `6998521` | Recovery | Video failed, low credits, reconnect, import failed show the real reason, balance, account or address |
| `aecb8d7` | Business | Switching business, details, brand, photos (library upload), connections, billing, account, automations (monthly plan on the 1st, auto-publish after approval) |
| `ebeb02d` | Plans | Making a reel and generating the calendar need an active plan. There is no payment yet: an admin turns plans on |
| this commit | Photoshoot | Quality tiers the person picks, real shoots, results, detail |

## Photoshoot (Figma "04 Photoshoot")

- **Tiers.** All prices are for a shoot of four photos. Base is preselected.

  | Tier | Price | Product shoot | Fashion shoot |
  |---|---|---|---|
  | Base | 4 credits | OpenAI GPT Image 2, low | Higgsfield Soul 2, 720p |
  | Moderate | 6 credits | Higgsfield Qwen Image 3 edit, 2k | Soul 2, 1080p |
  | Higher | 12 credits | GPT Image 2, medium | Marketing Studio Flare, 2k |
  | Ultra | 24 credits | GPT Image 2, high | Flare, 4k |

  - Nano Banana Pro was the plan for Higher and Ultra fashion. It isn't in Higgsfield's API, so Flare fills in.
  - The phone keeps its own copy of the prices (`SHOOT_TIERS` in `apps/mobile/src/api/endpoints.ts`). The server
    is what charges. Keep the two in step.
- **Server** (`apps/web/server/photoshoot/shoot.ts`, job `photoshoot.run`):
  - A shoot needs a plan, like reels.
  - It is paid up front, and a failure refunds it in the same transaction that marks it failed.
  - OpenAI tiers:
    - make all four photos in one call;
    - get one job attempt only, because a retry would pay OpenAI again.
  - Higgsfield tiers:
    - submit four jobs, then poll every 15 s;
    - send the same signed link and the same Idempotency-Key on every resend;
    - fail at once (and refund) if Higgsfield refuses the request, e.g. `not_enough_credits`.
  - A status read that fails counts as a hiccup, not a failure. A shoot gives up after one hour.
  - Shots are cropped to the ratio asked for and saved as JPGs in the brand's media, so posts can use them.
  - The app is never shown the provider's error text, only that the shoot failed and was refunded.
- **App:**
  - Setup screens pick from the brand's photo library and can upload a photo.
  - The generating screen polls the shoot. Results polls while a shoot is running.
  - The detail screen shows the four photos and can compare with the original. Download and Share open the share
    sheet. Variation runs the same setup again and is charged again.
- **Tested on the emulator (test account, Bois & Chiffons):**
  - A Base product shoot made four real photos of the Dimona buffet, product intact.
  - A fashion shoot failed on Higgsfield credits and showed "4 credits refunded". The test workspace is
    unlimited, so nothing was charged in the first place.
- **Left out:**
  - **Quality check of each shot against the original.** It was in the plan; skipped for now. Add it when bad
    shots show up.
  - **"More options" and "Expand".** Both were inert in the design and have been removed.
  - **Business switch during a shoot.** If the business is switched while a shoot is open on the generating
    screen, its poll asks the new business for the shoot and keeps getting 404.
  - **Duplicate POST.** A POST retried after a timeout makes a second shoot. The app doesn't retry, so there is
    no idempotency key yet.

## How to run and test

- **Web:**
  - `npm run build -w web && npm run start -w web` (port 3100).
  - Stop the server before `prisma generate`: it locks the engine DLL (EPERM).
- **Phone:**
  - Run Metro in `apps/mobile` with `EXPO_PUBLIC_API_URL=http://localhost:3100 npx expo start --dev-client --port 8081`.
  - Emulator: `Pixel_10`, emulator build `37.3.5-backup`, `-gpu swiftshader_indirect`.
  - `adb shell screencap` crashes on this GPU. Take screenshots with
    `adb emu screenrecord screenshot <absolute path>` instead.
  - Open screens with deep links, e.g. `adb shell am start -a android.intent.action.VIEW -d espanda://photoshoot/results`.
- **Test account:** `emu-test@cmo.local`, owner of dev workspace `cmvhqkx8h0001v630qd3rb7gb`.
- **To test without a plan:** start the server with `UNLIMITED_CREDIT_WORKSPACES=none`.
- **Plans:** `npm run set-plan -w web -- <workspaceId> <starter|professional|none>`.
- **Copy:** after adding English strings, run `node scripts/i18n-translate.mjs --model gpt-6.1-terra` from
  `apps/mobile`. It only translates missing keys, so changed wording needs a new key.
- **Never use the live database as Prisma's shadow database** (`migrate diff --shadow-database-url`): it wipes it.
  Write migrations by hand and apply them with `npx prisma migrate deploy`.
