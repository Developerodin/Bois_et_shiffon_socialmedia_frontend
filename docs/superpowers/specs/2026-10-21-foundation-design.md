# Foundation Design — Hybrid AI CMO (Okara × Scalio × B&C brief)

**Date:** 2026-10-21 · **Status:** Draft for approval · **Owner:** Prakhar Sharma  
**Reads with:** `BC_Social_Media_Agent_Functional_Brief.pdf` (product source of truth), `docs/DATA_MODEL.md`, `docs/DECISIONS.md`, `docs/API_CONTRACTS.md`, `docs/PRODUCT_REQUIREMENTS.md`

Marks: **[decided]** = the user decided in conversation · **[call]** = designer's call, open to override · **[builder]** = left to the builder.

---

## 1. Intent

Build a multi-brand AI CMO platform. Bois & Chiffons (B&C, French furniture brand) is the first brand, onboarded via seed/config, never hard-coded.

The user wants **everything Okara and Scalio do, and more**, combined into one product **[decided]**:

- **Okara's brain** — enter a website URL; agents research it and write strategy documents; specialist agents run 24/7 off those documents; a live Agent Log; chat with your CMO; publish to connected tools.
- **Scalio's look and content engine** — dark, cinematic, confident UI; a content calendar that fills itself; Reels/carousels/photoshoots generated from product photos; "always running" feel.
- **The B&C brief's discipline** — the thing neither competitor has: ranked opportunities with reasons, channel briefs, quality checks, approval bound to an exact version, stock/offer checks, every post traceable from idea to learning note.

**Why:** B&C's brief asks for a research/planning/briefing/review assistant that makes content more consistent and commercially relevant while cutting daily coordination work. Okara and Scalio show users love "it runs itself"; the brief shows a premium brand needs control. The product's edge is *autopilot energy with editorial control*.

**Success looks like:** a B&C manager opens **Today**, sees what the agents found and made overnight, approves good work in a few clicks, and trusts that nothing reaches a channel without a human approving that exact version.

## 2. Goals, non-goals, anti-goals

**Goals (first release)** — the brief's §5 first release, delivered through Okara/Scalio-style UX:

1. URL-driven onboarding → five strategy docs the team confirms (Okara) = the brief's "assumptions to validate".
2. Configurable watchlist + daily opportunity feed (Recommend / Hold / Reject with reasons).
3. Product catalogue + commercial context (stock freshness, offers, campaigns).
4. Channel briefs for Instagram, Facebook, Pinterest, LinkedIn (+ "other" gated), linked variants from one idea.
5. Rolling 30-day calendar (7 days production-ready), calendar + list views.
6. Content creation: captions, scripts, carousel copy; generated visuals that never misrepresent the product (Scalio-style creation, brief's fidelity rule).
7. Quality checks (pass/warn/blocker) + human approval bound to a sealed publication package.
8. Manual publication registration + export package; connected publishing where approved.
9. Analytics import + post-level learning notes + weekly patterns.
10. Agents page + Agent Log + CMO chat, all brand-scoped.

**Non-goals for first release [decided — "combine it" = brief scope first, extras as later switch-on agents]:**

- DM auto-replies, comment replies, review replies (Scalio) — brief excludes.
- Paid ads (Scalio) — brief excludes.
- Posting without approval of the exact final version — brief forbids.
- Reddit / SEO / GEO / Coding / Influencer / Link-broker agents (Okara) — not in brief; designed as plug-in agents for later (Reddit also blocked by DEC-004 legal).
- Website builder, Google Business Profile (Scalio) — later.

**Anti-goals (would be a failure even if it "works"):**

- An agent publishes, replies, or spends money without a recorded human approval.
- Invented competitor metrics, invented product facts, or a generated image that changes a product's material/proportions/finish.
- One brand's rules, products, or files leaking into another brand's agent run or UI.
- Missing data shown as a failure ("0 clicks") instead of "unavailable".
- A UI that looks like a generic admin template — the product must feel premium and alive.

## 3. Product shape

### 3.1 Navigation [call]

Hybrid of Okara's three-tab model and the brief's "simple interface":

| Area | Purpose | Origin |
|---|---|---|
| **Today** (home) | Ranked opportunities, items needing approval, urgent stock/offer issues, briefs due, overnight agent activity summary | Brief "Today" + Scalio "right now" feel |
| **Agents** | Grid of agent tiles with live status, last run, next run; Agent Log terminal pinned/expandable; enable/disable per brand | Okara |
| **Calendar** | 30-day calendar + list, drag-to-reschedule, readiness/owner/missing-asset flags | Brief + Scalio |
| **Studio** | Content workspace: brief, references, variants, drafts, checks, comments, version history, approval | Brief |
| **Context** | The five strategy docs + brand rules, catalogue, watchlist — versioned, confirm/edit | Okara "Context" + brief onboarding |
| **Performance** | Post results, learning notes, weekly patterns, business report | Brief §4 |
| **Chat** | Talk to the CMO about the active brand; it can explain, search, and start agents | Okara |
| **Settings** | Channels/integrations, roles & approvals, schedule, mix rules | Brief |

Answer to "what does the manager see Monday morning": **Today** — it opens with an overnight summary line ("While you were away: 6 opportunities found, 3 drafts ready for approval, 1 product out of stock") then the action queue. Agents/Chat are one click away. **[call]**

### 3.2 Look and feel [call — user said take Scalio design + Okara and mix]

- **Dark-first** (both references are dark), with a light theme supported via tokens. Light/dark by system preference, user toggle.
- **Cinematic, confident:** large display type for page heroes and empty states, generous space, full-bleed imagery where content exists (product photos, generated visuals). Pill buttons, soft-rounded cards, subtle grain/blur surfaces.
- **"Alive" moments (Scalio's "right now" + Okara's terminal):** live Agent Log with typed-out lines; tile status pulses while an agent runs; Today's overnight summary.
- **Accent:** one strong accent, but **warm** rather than Scalio's neon green — brass/olive family suits furniture and keeps platform chrome brand-neutral. Brand photography carries colour. Exact tokens **[builder]** within `DESIGN_SYSTEM.md` principles; update that doc to dark-first.
- **Typography:** keep `DESIGN_SYSTEM.md` pairing (Fraunces display, Inter UI, JetBrains Mono for log/data).
- **Don't copy** Okara/Scalio logos, copy, illustrations or assets (also a brief rule about competitor assets).
- Accessibility: WCAG 2.2 AA in both themes; reduced-motion disables typing/pulse animations.

## 4. Core concepts

### 4.1 Context documents (Okara's handoff, brief's onboarding)

Per brand, five versioned markdown documents: `product-information`, `marketing-strategy`, `competitor-analysis`, `brand-voice`, `content-strategy`.

- Generated by the **Research agent** from the brand's website (crawl, SSRF-guarded, robots-respecting) plus web search for competitors/market; every claim carries source URLs.
- Status per version: `DRAFT` (AI-written) → `CONFIRMED` (human). Agents read the **latest confirmed** version; if none is confirmed, they may read the draft but every output is marked "unconfirmed brand context" and cannot pass approval. **[call]**
- Structured rules that the system enforces (prohibited topics, approved claims, CTA rules, language, mix ratios) live in `BrandRuleVersion` / `ApprovedClaim` (existing model), editable from Context. The docs are guidance for AI; the rules are enforced by validators. **Major rule changes require human approval** (brief §4).
- Catalogue and commercial context come from import (CSV first), not from AI.

### 4.2 Agents (plug-ins)

An **agent** is a registered capability, not an autonomous actor:

```
AgentDefinition {
  key, name, description, icon
  triggers: manual | schedule(cron) | event(e.g. "product.stock_changed")
  inputSchema (zod), outputs: which records it creates
  requiredCapabilities: e.g. ["context.read","opportunity.write"]
  sideEffects: "none" | "drafts_only"   // first release: never "external"
  run(ctx, input): steps that call AI, connectors, services
}
```

- Registered in code (`server/agents/registry.ts`), enabled/configured per brand (`BrandAgentConfig`: enabled, schedule, settings).
- **Hard rule:** agents only *create drafts and records*. Anything external (publish, reply, spend) goes through the approval gate + publication package (DEC-016). Future Scalio-style agents (DM replies, ads) must add their own approval/autonomy policy before `sideEffects: "external"` is allowed — out of scope here.
- Every run is brand-scoped (DEC-023): one `brandId`, a `BrandContext` loaded for that brand only.

**First-release agents** (map onto the seven specialists in `ARCHITECTURE.md` §8b):

| Agent | Does | Trigger |
|---|---|---|
| Research | Website + market research → five context docs | Onboarding, manual refresh |
| Opportunity scout | Scan watchlist → dedupe into trends → rank Recommend/Hold/Reject with reasons & references | Daily schedule |
| Planner | Fill 30-day calendar from shortlisted opportunities, mix rules, capacity | Daily + on shortlist |
| Brief writer | Opportunity → channel brief → linked variants | On convert |
| Creator | Captions, scripts, slide copy; visual generation from product photos with fidelity checks | On brief ready |
| Quality checker | Brand voice, product accuracy, editorial (French), CTA, visual, rights → pass/warn/blocker | On draft change, before approval, before publish |
| Analyst | Import metrics, baselines, learning notes, weekly patterns | 48h / 7d / Pinterest-later checkpoints, weekly |

### 4.3 Agent Log and runs

- `AgentRun` (agent, brand, trigger, status, startedAt/finishedAt, cost/tokens, error, input/outputs refs) and `AgentEvent` (runId, ts, level, message, data, linked entity) — append-only.
- Agent Log UI: terminal-style stream filtered to active brand (REQ-PLAT-005); entity links (e.g. "Created opportunity *Calmer dining corner* →").
- Live updates via polling (2–5 s while a run is active) **[call]**; SSE later if needed. No Realtime service.
- Source health (brief §1: which sources checked/failed/last success) is shown from `CollectionRun` + `MonitoredSource.healthStatus`, surfaced on Agents and Today.

### 4.4 CMO chat

- Conversation bound to one brand (or explicit portfolio mode, read-only aggregates — DEC-022/023).
- Tools exposed to the model: read context docs, search opportunities/calendar/posts/metrics, explain a recommendation, start an agent run, draft (not approve) content. No approval or publish tools.
- Messages stored (`ChatThread`, `ChatMessage`) with tool calls logged as `AgentEvent`s.
- Ships after the core loop (see build order), but the agent/tool registry is designed so chat reuses agent definitions.

### 4.5 The content chain (from the brief; models in `DATA_MODEL.md`)

`MonitoredSource → CollectionRun → SourceReference → Opportunity → ContentBrief (parentIdeaId) → ContentDraft → ContentVersion → ChannelVariant → QualityRun → PublicationPackage (sealed hash) → ApprovalDecision (append-only) → PublicationAttempt (idempotencyKey) → PublishedPost → AnalyticsSnapshot → LearningNote → feeds Opportunity ranking`

Content states (brief §3): suggested → shortlisted → brief ready → in production → draft review → awaiting approval → approved → scheduled → published → reviewed; plus rejected, blocked, cancelled. Each transition records actor, timestamp, content version (`AuditEvent`). Material edits after approval create a new package and void approval. Stock/offer validity re-checked before approval and before publish; if stock changes, flag + propose alternatives, never silently edit approved content.

## 5. Architecture

### 5.1 Runtime and hosting

- **Next.js 15** app (`apps/web`) = UI + API routes + server actions. Existing layering stays: route → authorize → service → integration/AI → Prisma.
- **Database:** Neon Postgres, Frankfurt (DEC-025). **Media:** Neon Object Storage bucket `media`, private, presigned reads (done).
- **Hosting:** Vercel, region `fra1` next to Neon **[call]** — easiest for Next.js; Neon's skill recommends `pg` with Fluid compute there. Revisit if long agent runs exceed function limits.
- **AI:** OpenAI **[decided]** behind the existing `AiProvider` interface (DEC-003). Structured outputs validated with Zod; model per workflow in config, not hard-coded; every call logged (`AiWorkflowRun`: model, prompt version, tokens, cost, latency). Prompts versioned in code.
- **Web research:** OpenAI's built-in web search tool for market/competitor research **[call]** (resolves DEC-005 for now); own-site crawl via a fetch-based crawler with SSRF guard, robots.txt respect, page cap. Stored excerpts follow DEC-007 retention.
- **Visual generation:** OpenAI image generation/editing from product photos **[call]** (resolves DEC-010 for now), with a mandatory product-fidelity check and human approval. Video Reels **[builder]** — prompt/script + storyboard in first release; rendered video via a separate approved provider later.

### 5.2 Background jobs (DEC-006/015, adapted for Neon scale-to-zero)

- `Job` table in Postgres; claim with `SELECT … FOR UPDATE SKIP LOCKED` lease (now possible on Postgres), attempts, exponential backoff, dead-letter.
- **No always-on polling worker** (it would keep Neon awake and burn the free 100 CU-hours). Runner is an authenticated endpoint `/api/v1/jobs/run` (`CRON_SECRET`) that drains due jobs within a time budget, invoked by:
  1. **Vercel Cron** every minute in production (wakes Neon briefly; scheduled agents enqueue from here).
  2. **Immediately after enqueue** via Next's `after()` so user-triggered runs start without waiting for cron.
  3. **Local dev:** `npm run worker:dev` loop calling the runner.
- **Long agent runs** are split into steps; each step is its own job (fits serverless time limits, resumable after crashes). **Ceiling:** cron-per-minute + function time limits ≈ fine for tens of brands and hundreds of runs/day. Upgrade path: dedicated worker container (same runner code, `while` loop with `LISTEN/NOTIFY`) on a paid Neon tier.
- Every job payload carries `workspaceId` + `brandId`; worker validates (existing `validateAiWorkflowPayload`).

### 5.3 Tenancy and security

- Every brand-owned row has `workspaceId` + `brandId`. **Enforce in Postgres** with composite foreign keys (`(brandId, workspaceId)` → `Brand(id, workspaceId)`) via a SQL migration (Prisma can't express all of them) — turns AT-021 into a real DB guarantee. RLS is a later defence-in-depth option **[builder may defer]**.
- Capability-based authorization (DEC-019); roles from the brief: social media manager, designer/editor, brand approver, commercial owner — one person may hold several, permissions stay separate; creator ≠ approver rule (DEC-008).
- Credentials for connectors encrypted (DEC-002/018); OAuth single-use state (DEC-017).
- AI never receives credentials; external text is data, never instructions (prompt-injection-safe tool design: fetched pages can't trigger tools).
- Media keys `workspaceId/brandId/…` (done).

### 5.4 Observability

Structured JSON logs; `AgentRun`/`AgentEvent` double as product-visible activity; `/api/v1/health` (DB ping, last cron run, dead-letter count); error tracking (Sentry) when deployed **[builder]**. Cost tracking per brand from `AiWorkflowRun`.

### 5.5 Testing

Vitest for services/validators/agents (AI provider mocked; recorded fixtures for structured outputs); adversarial ATs in `ADVERSARIAL_ACCEPTANCE_TESTS.md` run against a **Neon branch** in CI (DB-level FK/claim tests need real Postgres); Playwright for critical paths; `smoke:neon` for live infra.

## 6. Build order

Each slice ends usable, tested, and demoable. The **foundation** = Slices 0–1; later slices get their own plans.

| # | Slice | Delivers | Proves |
|---|---|---|---|
| 0 | **Foundation hardening** | Composite tenant FKs; Job table + runner + cron + `after()` kick; `AgentDefinition` registry, `AgentRun`/`AgentEvent`; OpenAI provider + run logging; `AuditEvent`; capability checks; health endpoint; new shell + nav (Today/Agents/Calendar/Studio/Context/Performance/Chat/Settings placeholders) in the hybrid dark theme; CI on Neon branch | AT-001/002/007/017/019–024 pass on real Postgres; a demo "hello" agent runs end-to-end and streams to the Agent Log |
| 1 | **Onboarding (Okara moment)** | Enter URL → Research agent → five context docs with sources → review/edit/confirm → brand rules + claims; catalogue CSV import + stock freshness; watchlist setup | B&C onboarded from bois-et-chiffons site + supplied catalogue; agents refuse to treat unconfirmed context as approvable |
| 2 | Opportunity feed | Scout agent, dedupe/trends, Recommend/Hold/Reject, feed filters & actions, feedback loop, source health | Brief §1 acceptance |
| 3 | Briefs, variants, calendar | Brief writer, parent idea + variants, 30-day calendar, drag-reschedule, mix rules | Brief §2 acceptance |
| 4 | Creation | Creator agent: copy + visual generation with fidelity check | Brief "generated visuals must not misrepresent" |
| 5 | Quality + approval | Quality checker, sealed packages, append-only decisions, waivers, re-approval | Brief §3 + AT-003/013 |
| 6 | Publishing | Export package + manual registration; Meta (IG/FB) connector with idempotency + reconciliation; Pinterest/LinkedIn after | AT-004/005 |
| 7 | Performance & learning | Analyst agent, imports, baselines, learning notes, weekly report | Brief §4 |
| 8 | CMO chat | Brand-scoped chat with read + start-agent tools | REQ-PLAT-006 |
| later | Switch-on agents | Okara: Reddit, SEO, GEO, Writer, Influencer, Coding. Scalio: DM replies, review replies, ads, website/GBP, auto-post policies | Each needs its own approval/autonomy design |

## 7. Failure modes (named, with handling)

| Situation | Handling |
|---|---|
| Agent step crashes / function times out | Job lease expires → retried from that step; after max attempts → dead-letter, run marked failed, visible in Agent Log + Today |
| Same job claimed twice | `SKIP LOCKED` lease; job handlers idempotent by key (e.g. opportunity `dedupeKey`, import idempotency key) |
| Publish retry after ambiguous timeout | `PENDING_VERIFY` reconciliation, never blind republish (DEC-015) |
| OpenAI down / rate-limited | Job retry with backoff; run shows "waiting on AI provider"; no partial records committed outside the step's transaction |
| OpenAI returns malformed output | Zod validation fails → step retried once with repair prompt → else failed with raw output stored for debugging |
| Website crawl blocked / robots disallow | Research agent records the gap; context doc says "source unavailable"; never invents |
| Neon cold start (scale-to-zero) | First request ~sub-second slower; cron cadence keeps the job path acceptable |
| Free-tier compute exhausted | Cost/usage visible on health page; documented upgrade to Neon Launch (usage-based) |
| Stock data stale | Hard blocker on approval/publish until refreshed or waived per DEC-020 |
| Cross-brand reference | DB composite FK rejects; job payload validator rejects; tests AT-019–024 |
| Unconfirmed context docs | Outputs labelled; cannot be approved |
| Partial catalogue import | Import is one transaction per file with row-level error report; nothing half-applied |

## 8. Questions only the user/B&C can answer (not blocking Slice 0)

- B&C's real website URL and catalogue export format (Slice 1).
- Who holds which role at B&C (approver, commercial owner) (Slice 1/5).
- Monthly AI budget ceiling per brand (sets default model choices and run frequency).
- Which channels B&C will actually connect first (Slice 6).

## 8b. Builder-check resolutions (2026-10-21) — supersede earlier sections where they conflict

1. **Job trigger [call]:** no per-minute cron (Vercel Hobby allows daily cron only, and per-minute pings keep Neon awake 24/7). Runner is kicked by `after()` on every enqueue (and re-kicks itself while due jobs remain within its time budget); **one daily Vercel cron** runs the sweep that enqueues scheduled agents (scout/planner/analyst are daily anyway) and recovers expired leases. Local dev: `npm run worker:dev`. Ceiling: retries after a crash wait until the next kick or the daily sweep; upgrade = external per-minute cron or worker container on a paid tier.
2. **Roles [call]:** `WorkspaceRole` stays for workspace admin (OWNER/ADMIN manage brands, members, billing). Brief duties are **per brand** on `BrandMember.duties` (enum array: `SOCIAL_MANAGER`, `EDITOR`, `APPROVER`, `COMMERCIAL_OWNER`) — one person may hold several. A single `can(user, capability, brand)` maps duties → capabilities (DEC-019). Until a brand has members, workspace OWNER/ADMIN hold all duties (U-008 default). Creator ≠ approver enforced on approval actions.
3. **Context confirmation [call]:** per document. Capability `context.confirm` = `SOCIAL_MANAGER` or `APPROVER`. Editing a confirmed doc creates a new `DRAFT` version; agents keep using the latest `CONFIRMED` version until the draft is confirmed. If no confirmed version exists, outputs carry `contextConfirmed=false` and the approval service (Slice 5) blocks them — in Slices 0–4 the flag is stored and shown as a badge. Research agent *proposes* brand rules / approved claims as drafts; a `BrandRuleVersion` only becomes effective when an `APPROVER` confirms it ("major rule change" = any new rule version).
4. **What exists:** "existing" in this doc means *specified in docs*, not implemented. Code today: tenancy/auth models, access helpers, stub validators, media storage. `AiProvider` = OpenAI + mock only (Anthropic dropped from DEC-003 scope).
5. **Brand creation [call]:** Slice 1 includes in-app "New brand" (name + website URL) for workspace OWNER/ADMIN, which kicks off the Research agent. B&C still arrives via seed. Member invites: later.
6. **Language [call]:** UI in English. Context docs in English (team working language) with a `primaryLocale` field per brand; content outputs (captions, scripts) in the brand's content locales (B&C: `fr`). Confirm with user.
7. **Catalogue sample + B&C URL:** needed before Slice 1 planning; not blocking Slice 0. `stockCheckedAt` = value from the file if present, else import time.
8. **CI:** GitHub Actions + Neon API key once a remote exists; until then CI-equivalent = local `npm test` against a Neon dev branch.

## 8c. Login + RBAC — port from Cad (`Desktop/Cad/backend/src/{auth,authorization,roles}`)

Cad is NestJS + Mongoose + custom JWT/refresh sessions; we keep Next.js + Auth.js and port the *behaviour*.

**Done (2026-10-21):** account status (`ACTIVE/INVITED/DISABLED`, `deletedAt`) — Cad `account-eligibility`; dummy-hash compare so unknown emails cost the same as wrong passwords — Cad `auth.service`; login rate limits per email (5/15 min) and per IP (30/15 min) in Postgres `RateLimitBucket` instead of Redis — Cad `rate-limit*`; session revocation via `User.sessionVersion` (bump on password change/disable) — replaces Cad refresh-session revocation; login error messages. Check: `npm run smoke:auth -w web` (app running on 3100).

**Also done (2026-10-21 ~12:55):** items 1–6 below — catalog (`server/auth/permissions.catalog.ts`), DB roles (`Role`, text[] permissions, 7 seeded system roles, legacy enum backfilled), engine (`server/auth/permissions.ts`), invitations, password reset, email outbox (SMTP via nodemailer + job queue; `NOT_CONFIGURED` without SMTP_HOST), Settings Members/Roles/Invitations UI, public invite/forgot/reset pages, auth audit events. Contract: `2026-10-21-rbac-api-contract.md`. Check: `npm run smoke:rbac -w web`. Known gap: inviting needs `roles.read` to populate the role list.

**Original order (for reference):**
1. **Permission catalog** (Cad `permissions.catalog.ts`): code-defined keys `resource.action` with category, description, default scope (`assigned_to_me | team | workspace` for MVP). Replaces the hand-written `Capability` union in `server/auth/capabilities.ts`.
2. **DB roles** (Cad `Role` + `RolePermission`): per-workspace roles, `isSystem` seeded from the brief's duties (Social manager, Editor/Designer, Brand approver, Commercial owner, Workspace admin) + custom roles; `authzGeneration` bump invalidates cached grants. Members get roles per brand (`BrandMember.roleIds`). `can()` reads role grants; creator ≠ approver stays a hard rule.
3. **Invitations**: invite by email → `INVITED` user + token (hashed, single-use, expiry) → accept sets password → `ACTIVE`. Needs an email provider (Resend or SMTP) + Cad's email outbox pattern (send via job queue, retry).
4. **Password reset**: Cad `password-reset*` + `forgot-password` / `reset-password` rate limits; reset bumps `sessionVersion`.
5. **Admin UI**: Users / Roles / Teams tabs (Cad frontend pattern) under Settings.
6. Auth audit events (login success/failure, role changes) into `AuditEvent`.
Not porting: impersonation, platform policy evaluator, delegation (enterprise features without a current need).

## 9. Left to the builder

Exact tokens and component styling within §3.2; table/column names beyond `DATA_MODEL.md`; OpenAI model choices per workflow (configurable); crawler implementation details; whether RLS lands in Slice 0 or later; test fixture strategy; polling intervals.

### 8d. Connect-account buttons (2026-10-21, pulled forward from Slice 6)

Settings → **Connections** (per brand): Facebook Pages, Instagram, Threads, Google (Analytics + Search Console), Reddit.
- `IntegrationConnection` (composite brand FK, AES-256-GCM token envelope per DEC-002/018, `server/crypto/credentials.ts`) and `OAuthStateTransaction` (hashed single-use state bound to user + brand + provider, 10-min TTL, consumed atomically before the code exchange; access re-checked at callback — DEC-017).
- Adapters: `server/integrations/providers.ts` (Meta stores one row per granted Page with its non-expiring Page token; IG/Threads long-lived 60-day tokens; Google/Reddit refresh tokens). Callback: `/api/v1/integrations/{meta,instagram,threads,google,reddit}/callback`; redirect URI = `*_REDIRECT_URI` env or derived from `AUTH_URL`.
- Check: `npm run smoke:connections -w web`.
- **Not yet:** token refresh job (IG/Threads expire after 60 days, Google/Reddit access tokens hourly — refresh before use), provider-side revoke on disconnect, uninstall/data-deletion callbacks (Meta App Review requirement), https tunnel for IG/Threads redirect URIs in dev.

### 8e. Channel/agent decisions (2026-10-21)

- **SEO + GEO agents:** instructions adapted from **claude-seo** (agricidaniel, MIT, v1.8.x — installed locally at `~/.claude/plugins/marketplaces/agricidaniel-seo`): `seo-technical`, `seo-content` (E-E-A-T), `seo-schema`, `seo-images`, `seo-hreflang` (FR/EU sites), `seo-ecommerce` (product schema; DataForSEO parts optional/skipped), `seo-drift` (baselines → regressions), `seo-geo` (AI-crawler access, llms.txt, passage citability, brand mentions). Copy as versioned prompt files with MIT attribution in `NOTICE.md`. `bencium-aeo` used as reference only (no explicit licence for its guide text) — write our own AEO wording. Data: our crawler + PageSpeed key + Search Console OAuth + OpenAI web search (GEO "does ChatGPT mention the brand" checks). No new keys; Perplexity/Gemini/DataForSEO optional later.
- **X:** needed — requires X developer account + paid API; check current pricing before building the connector.
- **UGC video:** idea only, on hold.
- **Reddit:** on hold pending Reddit commercial approval; assisted mode (web search + manual post) possible meanwhile.
- **Pinterest:** wanted (furniture fit); needs Pinterest Trial → Standard access + public privacy policy.

### 8f. SEO + GEO agents (2026-10-21)

- `seo` and `geo` agents (registry), reports in `AuditReport` (latest per kind on **Performance**). Scores and findings are deterministic (`server/seo/checks.ts`); AI only orders and explains them. GEO adds a live visibility test: 5 shopper questions answered by OpenAI with web search, checking for the brand and competitors.
- First real run on boisetchiffons.fr: SEO 78/100 (mobile LCP ~9.5 s, 95 images without alt, missing meta descriptions); GEO 50/100 — mentioned in 1/5 AI answers (only when named); AI recommends Tikamoon, IKEA, Maisons du Monde, La Redoute, Ethnicraft instead.
- Dev tool: `npm run audit -w web -- seo|geo <url>`.
- **Ceiling — run time:** SEO ~70 s, GEO ~120 s (parallel AI calls), Research similar. The Vercel job route has `maxDuration = 60` and the job lease is 5 min. Works with the local worker (`worker:dev`); on Vercel these runs need Pro `maxDuration` 300 s or splitting each agent into checkpointed steps (one job per step). Not scheduled yet (manual runs only) to control OpenAI web-search cost.

### 8g. First-run page + Google sign-in (2026-10-21)

- `/welcome`: signed-in person with no brand (Today redirects there) enters their website → brand + Research run → live "reading room" (Agent Log lines + five docs drafting) → Context to confirm. Resumable via `?brand&run&site`.
- **Continue with Google** on `/login` (Auth.js Google provider, same OAuth client as the Analytics connection). Requires Google `email_verified`; links to an existing account with the same email; refuses disabled/deleted accounts. A new Google account accepts its pending invitations, otherwise gets its own workspace as Owner (`server/services/google-signup.ts`; check `npm run smoke:google -w web`).
- Google Cloud client needs the extra redirect URI `http://localhost:3100/api/auth/callback/google` (and the production domain's).
- **Ceiling:** open Google sign-up lets anyone create a workspace and run agents (OpenAI cost). Before a public launch add an allow-list/waitlist or per-workspace run quota.

### 8h. One-screen workspace with a free panel layout (2026-10-21) — supersedes the 8-item sidebar in §3.1

- `/` is the workspace: panels **Context**, **Today & agents** (docs and agents open here), **Analytics** (SEO / GEO), **Agents feed**, **Chat** (placeholder until chat is built), **Agent Log**.
- Free layout like VS Code / Cursor (`components/workspace/panel-layout.tsx`): drag a panel header to another column, onto a panel, or to the right edge (new column); drag dividers to resize; each panel menu has keyboard equivalents (move left/right, own column, collapse, hide). Presets: **Focus** (Okara main), **Classic** (Okara analytics layout), **Operator** (agents + live log). Saved per browser (`ws.layout.v1`); phones get one panel at a time with a bottom tab bar.
- One top bar for every page: brand switcher, Connect Google, PageSpeed + AI-visibility score rings (→ Performance), Logs drawer, Menu (other areas), Settings; account menu at the foot of Context (Okara), avatar elsewhere. Sidebar removed.
- Ceiling: stacked panels split a column's height equally (no vertical splitters yet).

### 8i. CMO Chat + reuse decisions (2026-10-21)

- Chat built on the **Vercel AI SDK** (`ai` v7, `@ai-sdk/openai`, `@ai-sdk/react`): streaming, multi-step tool calls (`isStepCount(6)`), conversations saved per person+brand in `ChatThread` (client sends only the newest message). Tools: listDocuments, readDocument, getSiteReports, listAgents, startAgent (same `agents.run` check as the Run button), OpenAI webSearch. **No publish/approve/spend tool.** 30 messages / 10 min per person. Usage logged to `AiWorkflowRun` (`chat.turn`). Check: `npm run smoke:chat -w web`.
- Out of AI credits: provider marks it non-retryable (`isOutOfCreditsText`), agents stop with one plain message, workspace banner, chat shows the same sentence.
- Reuse plan for the next agents (repo research 2026-10-21): prompts adapted (MIT, attributed in NOTICE.md) from **coreyhaines31/marketingskills** (social, content-strategy, copywriting, copy-editing, marketing-ideas, analytics, influencer-marketing) and **instagram-agent-skill** (hooks, caption, carousel, plan, audit, slop/humanizer → French equivalents). Quality checker: LLM rubric + **LanguageTool** over HTTP for French. Orchestration/handoffs later: `@openai/agents` if agents need to call each other. Do not copy **Postiz** (AGPL). React bumped to 19.1.10 (security patch line; required by `@ai-sdk/react`).

### 8j. Content agents (2026-10-21)

Pipeline (agents only draft; people shortlist, approve and publish):
`Opportunities (scout, daily) → people shortlist → Planner → Brief writer → Creator → Quality check → [approval, later] → … → Analyst`.

- Models: `Opportunity` (Recommend/Hold/Reject + reason + sources, deduped per brand), `ContentItem` (channel, date, status lifecycle, brief), `ContentVersion` (immutable drafts; approval will bind to one), `QualityCheck` (per-check pass/warn/blocker), `LearningNote`.
- Planner dates come from a fixed cadence per channel (`server/content/calendar.ts`); the AI only proposes posts. Falls back to top Recommend ideas when nothing is shortlisted, and says so.
- Quality = deterministic rules (`server/content/rules.ts`: caption limits, 125-char first line, ≤5 hashtags, one ask, FR/EN AI-filler list, Pin title, Threads 500, carousel/Reel structure, alt text) + optional **LanguageTool** (`LANGUAGETOOL_URL`) + AI review (voice, product accuracy vs. brand docs, French, CTA). Blocker → stays in draft review; Creator's next run rewrites it from the report (new version).
- Analyst writes honest notes (no published posts yet → says so; uses reports, pipeline, quality patterns).
- UI: **Ideas** panel (shortlist / dismiss), **Content calendar** panel, post view (brief, draft, quality), learning notes on the Analyst page, Today tasks for ideas to decide and drafts awaiting approval, "Content team" layout preset.
- Checks: `npm run smoke:pipeline -w web` (mock AI, throwaway brand), `tests/content-rules.test.ts`.
- Not yet: approval/publishing (next slice), image generation, product catalogue facts (stock/price) for accuracy checks, per-brand cadence settings, Reddit/Pinterest/Influencer/UGC agents (locked tiles).

### 8k. Competitor audits, shared library, credits (2026-10-21)

- **Competitors** agent: brand's competitor list (private) from GEO answers + competitor doc + web search, resolved to verified domains; never the brand's own domain. Manual add/remove too.
- **Site audit** (internal agent, never on the Run button): PageSpeed (performance, accessibility, best practices, SEO), our site checks, AI crawler access, social profiles linked from the site, and the marketing approach (positioning, audience, products, price signals only if shown, content themes, strengths, gaps). Saved to the **shared `SiteAudit` library keyed by domain**: only public data; `requestedByWorkspaceId` is never returned. Only competitor audits go there; a customer's own SEO/GEO stays private (`AuditReport`). Decision 2026-10-21 (user).
- Any customer tracking that domain sees the latest audit free, tagged "Last checked <date>", flagged stale after 30 days. **Fresh audit = 10 credits** (decision: credits, not Stripe yet). `CreditEntry` ledger (grant/spend/refund; balance = sum), starter grant 100, spend under a per-workspace advisory lock, refund once if the run finally fails, no charge when the same domain is already being audited by anyone.
- AI visibility per competitor = mentions in the brand's own GEO questions (free).
- UI: **Competitors** panel (credits, last checked, mini scores, Fresh audit with price confirm, add/find/stop tracking), competitor view, **Market** layout preset.
- Check: `npm run smoke:competitors -w web`. Not yet: plans/monthly allowances, Stripe top-ups, competitor Instagram metrics (needs Facebook Login Business Discovery), per-competitor GEO question runs.

### 8l. Approval and publishing (2026-10-21)

- `ApprovalDecision` (append-only): verdict APPROVED / CHANGES_REQUESTED / REJECTED, bound to one `ContentVersion` and the sha256 of item + channel + version + body. An approval counts only while that version is still the latest and the hash matches; a newer draft voids it. Creator ≠ approver; a note is required to request changes or reject; approval needs a passing (or warn) quality check. Capability `content.approve`.
- `PublicationAttempt`: one live attempt per (version, account), serialised by a per-post advisory lock. Publish now or schedule (`content.publish` job, `maxAttempts: 1`). At posting time the seal is re-checked; a draft changed after scheduling is not posted. Capability `publish.execute`.
- Outcomes: platform refusal (4xx) → FAILED with the reason, retry allowed. Timeout / 5xx / crash mid-post → PENDING_VERIFY, never retried automatically; a person marks "It's live" or "It didn't post" (DEC-015). Duplicate job delivery is a no-op.
- Publishers: Facebook Page (text, or photo with an image link), Instagram post (image link), Threads (text or image), Pinterest Pin (board + image link, links to the brand site). Not yet: carousels and Reels (need media in drafts), image upload/hosting (people paste a public https image link), stock/offer re-check before publish.
- Scheduled posts go out when the job runner runs (`/api/v1/jobs/run` cron).
- UI: post view "Approval and publishing" (approve / request changes / reject, then account, board, image, now or schedule, two-click confirm) and a history with cancel and verify actions. Check: `npm run smoke:publishing -w web`.
