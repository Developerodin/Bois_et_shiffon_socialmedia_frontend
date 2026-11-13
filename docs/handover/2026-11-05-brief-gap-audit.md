# Brief gap audit (2026-11-05)

What the code on `desktop-shell` does against `BC_Social_Media_Agent_Functional_Brief.pdf` (Draft 14 October 2026).
Checked in the code, not in `docs/PRODUCT_REQUIREMENTS.md` (that file predates most of the code). Paths are under
`apps/web` unless they start with `apps/mobile`.

**Summary:** the backbone works end to end: ideas → Planner → brief → draft → quality check → version-bound approval →
publish with one live attempt per account. What the brief adds on top is mostly missing: a product catalogue with
stock and offers, a watchlist with source health, metrics and post-level learning, weekly reporting, and the
richer opportunity and brief fields.

## Discovery, briefs, calendar

| # | Brief asks | State | What's there / missing |
|---|---|---|---|
| A1 | Daily scan of a watchlist, ranked and deduplicated feed, source health | Partial | Scout runs daily (`server/agents/definitions/scout.ts:38`, cron in `vercel.json`), dedupes by slug, scores 0–100. **No watchlist:** it does open web search. `Competitor` has no priority or frequency and Scout doesn't read it. No record of sources checked, failed or last successful. |
| A2 | Card fields: why now, references, audience, SKUs or gap, hook, CTA, assets, effort, expiry, confidence; Recommend/Hold/Reject | Partial | Has reason, sources, channels, decision, timing, angle (`prisma/schema.prisma:764-788`). Missing audience, SKUs, CTA, assets, effort, expiry, confidence. Brand fit and commercial priority are one blended score. |
| A3 | Shortlist, reject with reason, ask for another angle, convert one idea; feedback improves later ideas | Partial | Shortlist and dismiss exist (web). No reject reason, no "different angle", no single-idea convert (Planner takes everything shortlisted). Scout only sees past titles so it doesn't repeat them. |
| A4 | Full channel brief, owner, deadline, editable | Partial | Brief has goal, audience, key message, products (free text), CTA, visual (`brief.ts:10-18`). Missing SKUs, verified facts, destination URL, language, asset list, production and accessibility instructions, **owner, deadline**. Briefs can't be edited. |
| A5 | 30-day calendar, next 7 days ready, list + calendar views, drag-and-drop, missing-asset and overdue flags, configurable mix | Partial | Slot search over 30 days with a fixed cadence (`server/content/calendar.ts:6`, hard-coded). Mobile has month + list; web has a list. No drag-and-drop, no readiness or overdue flags, mix not configurable. |
| A6 | One idea → linked variants (reel, carousel, story, static, Pinterest, LinkedIn) sharing product facts | Partial | Planner makes 1–3 posts per idea linked by `opportunityId`, but excludes reels (`planner.ts:10`). Story channel added 2026-11-13 (Instagram stories: planned, written, checked, scheduled or posted by hand). No LinkedIn. No shared facts across variants. |
| A7 | Product catalogue (SKU, materials, dimensions, price, stock, freshness), campaigns, offers | Missing | No Product, Offer or Campaign model. Products are scraped `{title, url, image}` in `BrandProfile.assets`. |

## Checks, approval, publishing

| # | Brief asks | State | What's there / missing |
|---|---|---|---|
| B1 | Pass/warn/blocker per check: voice, product accuracy, French, CTA, visuals, asset rights; unfinished checks stay visible | Partial | Rules + LanguageTool + AI review (`quality.ts`, `server/content/rules.ts`). Product accuracy only against free-text brand docs. **The AI never sees the images.** No destination/UTM check, no asset-rights check, no "unresolved" state. |
| B2 | Wrong fact, expired offer, unavailable product or open visual check blocks approval; authorised override recorded | Partial | A blocker blocks approval (`server/services/publishing.ts:187`). Offers and stock can't be detected (no data). **No override path.** |
| B3 | Full state list; every transition records actor, time, version | Partial | No SUGGESTED/SHORTLISTED/IN_PRODUCTION on content. REVIEWED, BLOCKED and CANCELLED are never written. Human transitions are audited; agent transitions are not. |
| B4 | Approval bound to exact version; material edits remove it; comments; version compare | Partial | Approval seals version + body hash; edits create new versions. Schedule, account and extra media are not in the seal. No comments thread, no version compare. |
| B5 | Publish approved version once; post ID + URL; failures shown; manual export + register URL | Partial | One live attempt per version and account, ID + URL stored, failures shown. Manual export + register URL only for studio reels. `server/services/publication-package.ts` is an unimplemented stub. |
| B6 | Re-check stock and offers before approval and before publishing; flag affected items | Missing | No stock or offer data anywhere. |
| B7 | Manager, designer/editor, brand approver, commercial owner as separate permissions | Partial | Roles and per-action permissions exist and stay separate when combined. No commercial owner. `rules.approve` is defined but never checked. Four-eyes is silently skipped when nobody else can approve and for studio reels. |

## Measurement, learning, dashboard

| # | Brief asks | State | What's there / missing |
|---|---|---|---|
| C1 | Metrics per published post (imported or manual), unavailable ≠ zero, compare like with like | Missing | No metrics model; insights scopes are requested but never used. |
| C2 | Review checkpoints 48 h / 7 days (+ later for Pinterest) | Missing | Nothing scheduled; REVIEWED never set. |
| C3 | Learning note per reviewed post (objective, results, baseline, worked, didn't, limits, one test) | Partial (weak) | `LearningNote` is brand-level, written by the Analyst from pipeline counts and SEO/GEO, not post results. No agent reads it. |
| C4 | UTM links, platform clicks vs site sessions, attributed conversions | Missing | GA/Search Console connect only; no UTM. |
| C5 | Weekly patterns with sample sizes; weekly business report | Missing | No weekly job or report. |
| C6 | Feedback and lessons improve ranking without overwriting brand rules | Partial | Brand docs are versioned; agents read drafts by design (`server/content/knowledge.ts:6-9`). Feedback and lessons don't affect ranking. |
| C7 | Today view: stale stock, failed connections, missing assets, overdue approvals, failed publishing; last refresh times | Partial | Today shows pipeline counts. Connection errors and publish failures live on other screens. No stock, no per-connection refresh time. |
| C8 | Minimum records | Partial | Missing: monitored sources and collection logs, product snapshots, metric snapshots, recommendation feedback, review link. |
| C9 | Settings configurable, not in prompts or code | Partial | Cadence hard-coded; French and interior-design niche baked into prompts (`server/agents/prompts/content.ts`). |
