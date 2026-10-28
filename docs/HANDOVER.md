# Handover: Espanda mobile app (2026-10-27)

Native Expo app in `apps/mobile`, built from the Espanda Figma (file `dGILR13Xa3SLUnjGAtHn1C`, pages App·00–07). It talks to the same backend as the web app (`apps/web`, `/api/v1`). The desktop web app stays the place for approval.

## Where it stands

- **All 68 Figma screens are built** (onboarding, reels, posts, photoshoot, marketing, business, plans, recovery), in 24 languages (machine translated, needs native review; Arabic right-to-left not done). See `apps/mobile/src/i18n/README.md`.
- **Real data so far: sign-in and onboarding up to Learning.** Everything after Learning still shows sample data (`src/ui/onboarding/profile.ts` and each module's sample files).
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
| A05 Business source | "Website" → A06; "Google Maps" → Find on Google Maps (below); every other choice → A07 |
| Find on Google Maps (no Figma frame) | Real. Search name + city (`POST /api/v1/places/search`, our server calls Places API (New), key `GOOGLE_MAPS_API_KEY` or the shared `GOOGLE_PAGESPEED_API_KEY`, which must allow Places API (New); 30 searches/hour per person) → "Is this your business?" cards → the brand is created from the listing (`placeId`; the server reads name, address, phone, hours, rating, website and Google's description, saved on `BrandProfile.place`). Listing has a website → Research reads it (logo, colours, products, SEO/GEO) plus the listing; no website → the online lookup starts from the listing. Picking is the owner's word, not proof of ownership (that needs Google Business Profile sign-in). "Not on the list?" → A07 |
| A06 Website | Real. Continue first checks the site opens (`POST /api/v1/site-check`, SSRF-guarded like Research); if not, says so. "No website? Describe your business instead" → A07 |
| A07 No website | Name, what they sell, city (optional). Brand is created without a website (`BrandProfile.about` / `location`); Research finds the business with one web search, then writes the five documents from that plus the owner's words. SEO and GEO are skipped (no site to score). Listing-link mode and the extra website field were removed. |
| A08 Learning | Real: follows the Research run |
| A09 Review, A10 Brand | Real. Logo, colours, fonts and products come from the website (see below). Tagline, tags, audience and strengths come from Research's summary (below). Name, tagline and audience can be edited in place. A10's tones and content language are saved on Continue and reach the agents |
| A11 Preparing | Real. Starts the brand's first Scout run (free, once per brand: `POST …/brands/:id/first-ideas` returns the existing run; at most 3 free restarts a day after failures) and follows it (~1 min): product photos ready → finding post ideas → "N ideas found". A failure says why, with Try again and "Continue without ideas". Scout runs after A10 so it uses the owner's tones and language |
| A12 Connect | Built, **not yet tried with a real Instagram/Facebook login.** Buttons connect Instagram (Instagram Login) and Facebook Pages from the phone: the app gets the consent link (`…/connections/start` with `client: "mobile"`), opens it in an in-app browser, and the callback hands state + code back to `espanda://connect` instead of connecting; the app completes with its own token (`POST /api/v1/integrations/:provider/complete`), which only works for the person who started it (so a consent link sent to someone else can't put their account on your brand). Checked with a fake code (`scripts/_tmp/check-mobile-connect.ts`). Onboarding progress is now saved on the device when the app goes to the background and cleared at the end and on sign-out, because Android can kill the app while the sign-in browser is open |

**Brand assets** (spec `docs/superpowers/specs/2026-10-28-brand-assets-design.md`): after writing the documents, Research collects the logo, up to 5 colours, up to 4 fonts and up to 12 products with photos (Shopify `/products.json`, else JSON-LD on crawled pages). Images are re-encoded by sharp into the brand's private bucket; saved on `BrandProfile.assets`; served signed by `GET …/brands/:id/assets`. No AI cost; 30 s cap; failures are a WARN, never a failed Research. Colours come mostly from the logo and photos (B&C's CSS colours are only black/white), so they are approximate. Check: `npm run check:brand-assets -w web`.

**v2 (same day, spec `…/2026-10-28-brand-assets-v2-design.md`):** brands made from a website are named the way the site names itself (`og:site_name` → "Bois & Chiffons") at creation; wide logos shown whole; fonts ranked from the homepage + its theme stylesheets (Poppins, Inter, Caveat for B&C); A10 palette editable (pick a colour + shade, Lighter/Darker, or hex; `PATCH …/brands/:id/assets`, `context.edit`); Research keeps people's colours. A10 creative tone now has Feel / Style / Positioning groups (22 options) — still kept on the phone only.

**Summary + owner's choices** (spec `…/2026-10-28-brand-summary-design.md`): after the assets, Research makes one small AI call that writes `BrandProfile.summary`: the site's own tagline word for word, up to 4 tags, and one-sentence audience and strengths. On B&C it gave "Bois Vivant. Des Espaces Qui Respirent." Mock AI skips the call. A failure is only a warning. Fields people edit are listed in `edited`, and a Research re-run never overwrites them. Tones go to `BrandProfile.preferences`; content language goes to the existing `locales`. `brandKnowledge()` puts an "Owner's choices" block first for every content agent: edited text only, as quoted data. Edits go through `PATCH …/brands/:id/assets` (`context.edit`); renames go through the brand `PATCH` (`displayName`, whose schema was fixed: it used to fail on every call). Check: `npm run check:brand-assets -w web`. The A09 screen wasn't walked through on the emulator: getting there needs a fresh onboarding, which means a paid Research run.

**Research speed (2026-10-28):** the five documents are written in parallel, and logo/colours/photos are collected alongside them. B&C went from 5 min 37 s to 2 min 21 s (the slowest document is competitor analysis, which searches the web). Running jobs renew their lock so a long run is never started a second time. The summary reads the whole homepage, so it finds slogans further down the page, and it ends long text on a whole word.

**Not yet tried end to end:** the A07 no-website path (each run is a paid Research run with web search). Try one business that's on Google Maps / Instagram and one that isn't online at all.

## Decisions waiting on the owner

1. ~~A06 promise vs Research~~: decided 2026-10-28, Research now collects them (above). Still open: A10 says the palette is "Editable" but editing isn't built; and DNS pinning in the crawler (named in the spec) before onboarding opens to the public.
2. **New/changed strings are English-only** in the other 23 languages (they fall back to English): A06 error and "No website?" link, A07 subtitle, the "Finding your business online" Learning stage, and the A09/A10 empty states, colour sources and fonts line. Run `node apps/mobile/scripts/i18n-translate.mjs` once approved.
3. **Gmail "Copy code" chip** doesn't show on our sign-in email. Likely sender trust: `theodin.in` has no SPF or DMARC record, and `EMAIL_FROM` (a gmail.com address) doesn't match the sending account (`developer@theodin.in`). Add SPF `v=spf1 include:_spf.google.com ~all` and DMARC `v=DMARC1; p=none; rua=mailto:developer@theodin.in` in GoDaddy DNS, and set `EMAIL_FROM="Espanda <developer@theodin.in>"`.

## Owner's setup tasks

- **To test A12 on a phone:** Instagram only accepts https redirect addresses, so run a tunnel (`cloudflared tunnel --url http://localhost:3100`), add `https://<tunnel>/api/v1/integrations/instagram/callback` and `…/meta/callback` in the Meta developer dashboard (Instagram business login settings; Facebook Login → Valid OAuth Redirect URIs), and point `INSTAGRAM_REDIRECT_URI` / `META_REDIRECT_URI` in `apps/web/.env` at them while testing. With them pointing at the tunnel, connecting from the web app on localhost won't work; switch back afterwards. In production these are the real domain.

- Android OAuth client in Google Cloud: package `com.espanda.app`, debug SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.
- Twilio: upgrade the account, set Geo permissions for the countries you'll serve, and an India sender ID / DLT registration.
- Apple developer account (for Apple sign-in and iOS builds).

## Running it

- Web API: `cd apps/web && npm run dev` (port 3100). The phone reaches it at `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`.
- Android dev build on the Pixel_10 emulator: `npx expo run:android --no-bundler` (JAVA_HOME = JDK 17; Windows long paths on), then Metro `npx expo start --dev-client --port 8081`.
- Android 17 needs `adb shell pm grant com.espanda.app android.permission.ACCESS_LOCAL_NETWORK` or the app can't reach Metro or the API.
- After a schema change: `npm run db:deploy`, then restart the web server (a running server keeps the old Prisma client and fails on new columns).

## Things to know

- Rate limits live in `RateLimitBucket`: email codes 5 per 15 min per email, site checks 30 per hour per person, 10 new brands per person per day. Clear a row to reset one.
- Known debt: four near-duplicate module headers in the mobile kit (`src/ui/reels/kit`, `posts/chrome`, `photoshoot/chrome`, `plans/kit`) to merge; Figma page 98 never exported.
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
