# Handover: mobile app on the real backend, Posts to Photoshoot (end of day 2026-11-02)

Branch `ai-reels` (not pushed, not merged). Today moved the app's Figma screens from sample data to the real server,
one module at a time. Each module was given a review for correctness, security, performance and maintainability,
tested on the emulator, fixed, and committed.

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
1. Feed products into the Brief, Creator and Quality agents (product facts in briefs; Quality checks claims against
   them; an unavailable product blocks approval) — gap audit B1, B2, B6.
2. Test Shopify Admin live: a custom app with `read_products` + `read_inventory` on a real store, connect on the web
   Connections page, Sync now. The query cost and throttle handling follow Shopify's documented rules but have
   never met a real store.
3. Offers, campaigns and priorities (the rest of the brief's commercial context); CSV import.

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
