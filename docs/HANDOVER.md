# Handover: Espanda mobile app (end of day 2026-10-28)

Native Expo app in `apps/mobile`, built from the Espanda Figma (file `dGILR13Xa3SLUnjGAtHn1C`, pages App·00–07). It talks to the same backend as the web app (`apps/web`, `/api/v1`). The desktop web app stays the place for approval. Everything below is committed on `main` (not pushed).

## Start here tomorrow

1. **Try A12 with a real Instagram/Facebook login.** Built and security-checked, never run with a real account. Needs the tunnel + Meta dashboard steps under "Owner's setup tasks".
2. **Approve the new English wording, then translate it.** Everything added this week is English-only in the other 23 languages (they fall back to English): A06–A12 wording, the Google Maps screen, the no-website wording on A09/A10, A11's rows. Run `node apps/mobile/scripts/i18n-translate.mjs` once approved.
3. **Gaps found by the 14-brand test** (below): bot-blocked sites get no logo/colours/photos; custom-built sites expose few products (Bellroy 0, Rapha 1); some Google listing names carry SEO text ("Myth I Bangkok Street food | Best mango sticky rice"). Also open: when the online lookup finds a website the owner didn't give, offer "We found your website, use it?".
4. **Next page:** onboarding ends on the goal's home (Posts / Reels / Photoshoot), which still shows sample data.

## Where it stands

- **All 68 Figma screens are built** (onboarding, reels, posts, photoshoot, marketing, business, plans, recovery), in 24 languages (machine translated, needs native review; Arabic right-to-left not done). See `apps/mobile/src/i18n/README.md`.
- **Onboarding (page 01) runs on real data end to end**, tested on the emulator with real AI and Google calls. Only A12's real login is untried.
- **After onboarding, everything is still sample data** (each module's sample files).
- Backend-less features (video/image generation, inbox, website studio, payments) are designed screens only.

### Sign-in

| Method | Status |
|---|---|
| Email code | Works. `POST /api/v1/mobile/code` then `/mobile/session`. HTML email in the app's design (`server/email/sign-in-code.ts`), logo embedded. |
| Google | Works in the Android dev build (`@react-native-google-signin`, needs a dev build, not Expo Go). Server verifies the ID token: `POST /api/v1/mobile/google`. |
| Phone | Twilio Verify, any country (country picker + libphonenumber validation). New number → "Add your email" → email code links the number. Needs a Twilio upgrade before real users (trial only texts verified numbers). |
| Apple | Parked until there's an Apple developer account. |

Mobile tokens are Auth.js JWEs under their own salt (`server/auth/request-user.ts`); disabling an account or bumping `sessionVersion` signs out web and mobile together.

### Onboarding (page 01), screen by screen

| Screen | Status |
|---|---|
| A01 Sign in, A02 Verify | Real |
| A03 Welcome | Static by design |
| A04 Creation goal | Real: saved on the brand (`BrandProfile.goal`) and decides where onboarding ends (Posts / Reels / Photoshoot fashion / product) |
| A05 Business source | "Website" → A06; "Google Maps" → Find on Google Maps; every other choice → A07 |
| Find on Google Maps (no Figma frame) | Real. Search name + city (`POST /api/v1/places/search`; our server calls Places API (New) with `GOOGLE_MAPS_API_KEY`, else the shared `GOOGLE_PAGESPEED_API_KEY`, which now allows Places API (New); 30 searches/hour per person) → "Is this your business?" cards → the brand is created from the listing (`placeId`; the server reads name, address, phone, hours, rating, website and Google's description, saved on `BrandProfile.place`). Listing has a website → Research reads it plus the listing; no website → the online lookup starts from the listing. Picking is the owner's word, not proof of ownership (that needs Google Business Profile sign-in). "Not on the list?" → A07 |
| A06 Website | Real. Continue checks the address exists (`POST /api/v1/site-check`): only a bad URL, unknown domain or private address stops it. Sites that refuse bots pass; Research then looks them up online. "No website?" → A07 |
| A07 No website | Real, tested with a real bakery (found online) and a made-up business (honestly reported as not found, nothing invented). Name, what they sell, city. SEO/GEO skipped |
| A08 Learning | Real: follows the Research run. Website brands ~70–100 s; Maps-only / no-website ~85 s |
| A09 Review, A10 Brand | Real. Logo, colours, fonts, products from the website; tagline, tags, audience, strengths from Research's summary. Name, tagline, audience editable in place; palette editable; tones and content language saved and reach the agents. A10's audience tile shows the real audience. No-website brands get no-website wording |
| A11 Preparing | Real. Starts the brand's first Scout run (free, once per brand: `POST …/brands/:id/first-ideas`; at most 3 free restarts a day after failures) and follows it (~1 min, ~8 ideas in the brand's language). Failure → Try again or "Continue without ideas" |
| A12 Connect | Built, **not yet tried with a real login.** Instagram (Instagram Login) and Facebook Pages: the app gets the consent link (`…/connections/start` with `client: "mobile"`) and opens it in an in-app browser; the callback hands state + code back to `espanda://connect`; the app completes with its own token (`POST /api/v1/integrations/:provider/complete`), which only works for the person who started it. "Skip for now" → "Continue without connecting" works |

Onboarding progress is saved on the device when the app goes to the background (Android can kill it while a sign-in browser is open), restored at start, and cleared at the end and on sign-out. "Try again" on Learning only restarts Research for the brand made from what's on screen; otherwise it creates the brand again.

### Research (what A08 waits for)

- **Reads the website** (8 pages, robots.txt respected, honest bot user-agent), then writes five documents **in parallel** and collects logo, colours, fonts and up to 12 products alongside; then a short summary (tagline, tags, audience, strengths). Specs: `docs/superpowers/specs/2026-10-28-brand-assets-design.md`, `…-brand-assets-v2-design.md`, `…-brand-summary-design.md`.
- **Website blocks bots** (robots.txt, Cloudflare check, refused connection): Research says so once and **looks the business up online** instead; documents still written, no logo/colours/photos. Before: 10 minutes of retries, then a failure.
- **Logos:** a logo image first, then a logo **drawn as inline SVG** (rendered to PNG only if self-contained: no scripts, external references, embedded files or entities), then the site icon. Small square interface icons are ignored.
- **Competitor analysis:** low reasoning + light web search (it was the slowest document), with a source link after each competitor claim.
- **Online lookup** (no website / blocked site / Maps-only): low reasoning + light search, 20–27 s (was 60–70 s), with a strict matching rule so same-name businesses elsewhere stay out.
- Running jobs renew their lock, so a long run is never started twice.

**14-brand test (2026-10-28):** India, USA, UK, Germany, Spain, Netherlands, Denmark, Japan, Australia, Brazil (websites) and Thailand, Vietnam, Portugal, Kenya (Maps-only). After the fixes all succeed; documents in English even for German/Spanish/Japanese sites, taglines kept word for word; Maps-only prices credited to their source, gaps marked "Unknown". Harness: `apps/web/scripts/_tmp/batch-research.ts` (creates the brands through the real code, saves every document and timing to `scripts/_tmp/batch/`, then deletes the test brands, their jobs and images). It's in `_tmp`, so not committed: promote it to `scripts/` to keep it.

## Today's commits (2026-10-28)

`ed39b33` A04–A10 real · `f3ea887` job lease renewal · `9cd70aa` documents in parallel, real tagline · `dfddf91` A11 first ideas · `598928c` A12 connect + saved onboarding progress · `9660a41` faster competitor analysis · `40b21e6` competitor citations · `5cb72bb` A10 real audience · `a22bea7` no-website wording · `038504b` Google Maps step (+ "Try again" fix) · `7bbe71e` bot-blocked fallback · `fdedc97` inline SVG logos · `abd7fe7` faster, stricter lookup.

## Decisions waiting on the owner

1. **Translations** of this week's English wording (see "Start here" 2).
2. **Gmail "Copy code" chip** doesn't show on our sign-in email. Likely sender trust: `theodin.in` has no SPF or DMARC record, and `EMAIL_FROM` (a gmail.com address) doesn't match the sending account (`developer@theodin.in`). Add SPF `v=spf1 include:_spf.google.com ~all` and DMARC `v=DMARC1; p=none; rua=mailto:developer@theodin.in` in GoDaddy DNS, and set `EMAIL_FROM="Espanda <developer@theodin.in>"`.
3. **Ownership proof** for Google Maps listings (Google Business Profile sign-in, `business.manage`, needs Google's app approval): later.
4. **Before onboarding opens to the public:** DNS pinning in the crawler; real-domain redirect addresses for Meta; restrict the Google key to the server's IP once deployed.

## Owner's setup tasks

- **To test A12 on a phone:** Instagram only accepts https redirect addresses. Run a tunnel (`cloudflared tunnel --url http://localhost:3100`; the address changes every restart), add `https://<tunnel>/api/v1/integrations/instagram/callback` and `…/meta/callback` in the Meta developer dashboard (Instagram business login settings; Facebook Login → Valid OAuth Redirect URIs), and point `INSTAGRAM_REDIRECT_URI` / `META_REDIRECT_URI` in `apps/web/.env` at them while testing. While they point at the tunnel, connecting from the web app on localhost won't work; switch back afterwards.
- Android OAuth client in Google Cloud: package `com.espanda.app`, debug SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.
- Twilio: upgrade the account, set Geo permissions for the countries you'll serve, and an India sender ID / DLT registration.
- Apple developer account (for Apple sign-in and iOS builds).

## Running it

- **Web API:** `npm run build -w web && npm run start -w web` (port 3100). Don't use `npm run dev`: Turbopack panics ("Next.js package not found") in this monorepo. Rebuild and restart after every server change.
- After a schema change: stop the web server, `npm run db:deploy` and `npx prisma generate` in `apps/web` (Windows locks the Prisma engine file while the server runs), then build and start.
- The phone reaches the API at `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`. The host IP changes (DHCP, `.17` ↔ `.18`): check `ipconfig` if the app shows network errors.
- **Emulator (Pixel_10):** cold-boot with `emulator -avd Pixel_10 -no-snapshot-load -no-snapshot-save -gpu swiftshader_indirect`. The saved snapshot runs a stale copy of the app, and hardware graphics crash Android's window manager when a browser opens on top of the app. Then `adb reverse tcp:8081 tcp:8081`, `adb reverse tcp:3100 tcp:3100`, `adb shell pm grant com.espanda.app android.permission.ACCESS_LOCAL_NETWORK`, and open the app with `adb shell am start -a android.intent.action.VIEW -d "espanda://expo-development-client/?url=http%3A%2F%2F192.168.0.17%3A8081" com.espanda.app`. Keep it awake: `adb shell svc power stayon true`.
- Metro: `npx expo start --dev-client --port 8081` in `apps/mobile`.
- Sign in on the emulator as `admin@cmo.local`: tap Continue on the email screen, then run `npx tsx --env-file=.env scripts/_tmp/plant-code.ts admin@cmo.local` in `apps/web` and type `424242`.

## Checks

- `npm run check:brand-assets -w web` (parsing, inline SVG safety, Shopify, logo storing, summary edits). `-- --offline` skips the network part.
- `npm run smoke:research -w web -- <url>` (set `OPENAI_API_KEY=` empty for the free mock AI). Its cleanup now also removes the SEO/GEO jobs that brand creation queues.
- Throwaway checks in `apps/web/scripts/_tmp/`: `check-first-ideas.ts`, `check-mobile-connect.ts`, `check-places.ts`, `batch-research.ts`.

## Things to know

- Rate limits live in `RateLimitBucket`: email codes 5 per 15 min per email, site checks and Maps searches 30 per hour per person, 10 new brands per person per day (today's testing hit it; clear the `brands:<userId>` row to reset).
- Smoke and check scripts run against the live Neon database: read a script's cleanup before running it.
- Known debt: four near-duplicate module headers in the mobile kit (`src/ui/reels/kit`, `posts/chrome`, `photoshoot/chrome`, `plans/kit`) to merge; Figma page 98 never exported; some failed jobs left from brands deleted before 2026-10-28 (harmless).
- `apps/web/scripts/_tmp/` holds throwaway debug scripts and isn't committed.

---

# Handover: production-readiness pass (2026-10-21)

Prow PLUS AI CMO (`apps/web`, Next.js 15 + Prisma on Neon). This pass took an audit of the whole app (backend, user journeys, comparison with Okara and peers) and fixed what it found, in order of impact. Everything below is committed on `main`.

## What changed

| Commit | Area | Summary |
|---|---|---|
| `2cc7e64` | Core loop | People can write and edit drafts (each save is a new version that needs a fresh approval; editors can't approve their own). "Request changes" sends the note back to the Creator. Each post shows its next step with a button for the right agent. Agents never overwrite a newer draft. Double-clicked runs are reused, not paid twice. Agent failures show their reason. Panels render once (phone or desktop, not both). |
| `edbdbb6` | Publishing | Pinterest / Instagram / Threads tokens refresh before expiry; refused ones mark the account "Needs reconnect". Overdue jobs run while the app is open. Poison jobs stop. No OpenAI key in production stops agents instead of faking drafts. Disconnecting cancels that account's scheduled posts. |
| `f6042fd` | Security | Owner-only: inviting/removing owners, ownership powers in custom roles. IPv4-mapped IPv6 SSRF bypass closed. Live links scrubbed from sent emails. Daily caps: 100 manual agent runs per workspace, 10 brands per person. Chat respects role permissions and sends the last 40 messages. Login lockout is per email + IP. |
| `3a5852d` | Usability | Edit brand name/website in place (Context panel, "Edit"). Deep links: `?post=`, `?doc=`, `?agent=`, `?competitor=`, `?panel=`. Menu "Content calendar" opens the panel. "Nothing to do" runs aren't red. Planner retries don't duplicate. Daily pruning of short-lived rows. |
| `260968e` | Media | Instagram carousels (2 to 10 image links) and Reels (public video link) publish. Publishing can also take uploaded files from the brand's private storage, signed at posting time. |
| 2026-10-22 | Follow-ups | Upload button for images in the publish form (JPG/PNG up to 4 MB, type checked from the file bytes, stored per brand). Phones get a tab for every panel. Welcome: a retry after a failed step reuses the brand already created; after 5 minutes it offers a way out while reading carries on. Index on `AgentRun(agentKey, status)`; running-audit lookup limited to the brand's own competitor domains. |

Checks: `npm run typecheck`, `npm run lint`, `npm test` (55), `npm run smoke:publishing` (11 scenarios), `smoke:connections`, `smoke:rbac`, `smoke:auth`.

| 2026-10-22 | Project access | Every person owns a workspace (also when they join by invite). Projects (brands) are shared per person: workspace roles are Owner / Admin / Member; project roles are Project admin / Manager / Creator / Approver / Viewer, plus custom roles of either kind. Owner/Admin reach every project; a Member sees only projects they were added to. Settings → Project access adds a colleague by email (direct grant if already in the workspace, else a project invite). /welcome can switch workspace and sign out. |

### Access model (2026-10-22)

- `Role.scope` is `WORKSPACE` or `PROJECT`. Permissions are split in `server/auth/permissions.catalog.ts` (`permissionScope`); a project role can't hold workspace permissions.
- Effective permissions on a project = workspace role ∪ the `BrandMember` grant's role (`server/auth/permissions.ts`). Project access needs `brand.read` from either.
- `project.members.manage` lets a project admin invite and manage people on that project only.
- New system roles are seeded by migration `20261022120000_project_roles` for existing workspaces, and with one `createMany` for new ones (`ensurePersonalWorkspace`).

## Decisions waiting on the owner

1. **Job trigger for on-time scheduled posts.** Vercel Hobby cron runs once a day. Either upgrade to Pro and set `apps/web/vercel.json` to `*/5 * * * *`, or point a cron service at `POST /api/v1/jobs/run` with `Authorization: Bearer $CRON_SECRET` every 5 minutes. See `docs/ENV_SETUP.md` → Background jobs.
2. **SMTP in production** (`SMTP_HOST`, `EMAIL_FROM`, …), or invites and password resets won't send.
3. **OpenAI credits.** Agents are paused until they're added; manual drafting, approval and publishing work without them.
4. **Bois & Chiffons website** is still `example.com` in the database. Fix it in the app (Context panel → Edit → `boisetchiffons.fr`), then run Research once to redraft the documents.

## Still open (in priority order)

1. **Product catalogue + stock checks** (brief REQ-BRIEF-011/012/047/058/106). Needs a design first: data model (SKU, materials, dimensions, price, stock, freshness), import (CSV or Shopify/WooCommerce), checks at approval and again before publishing, "hold" when stock can't be confirmed.
2. Competitor gaps vs Okara/peers: drag-to-reschedule calendar view, real performance metrics into the Analyst, LinkedIn/X/CMS publishing, morning email digest.

## Things to know

- **Uploaded images nobody publishes stay in the `media` bucket.** Add a bucket lifecycle rule if storage grows.

- **Opening the workspace runs overdue jobs** (`kickIfDue` from the agents poll). On a dev box with real data, check the queue first (`Job` rows with status `PENDING`).
- **Smoke tests vs a running server:** stop the dev/prod server before `smoke:publishing`; an open app tab can pick up the test's jobs mid-run (they use fake tokens, so nothing posts, but the test result becomes flaky).
- `smoke:rbac` and `smoke:auth` run against the real first workspace with a throwaway user they delete afterwards.
- Commit messages: no co-author or session lines, no test mentions (owner's rule).
