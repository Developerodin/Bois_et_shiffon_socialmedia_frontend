# Product Requirements — Multi-Brand AI CMO Platform

**Version:** Phase 0.5+ (multi-brand architecture)  
**Last updated:** 2026-10-16  
**Product:** Brand-agnostic multi-brand AI CMO platform. **Bois & Chiffons (B&C)** is the first onboarded brand (seed/fixture only—not product identity).  
**Sources:** `BC_Social_Media_Agent_Functional_Brief.pdf` (B&C-specific SoT), Master Development Instructions (technical charter), reference products, skill audit

---

## 0. Platform requirements (`REQ-PLAT-*`)

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-PLAT-001 | **Multi-brand onboarding** — workspace can create N brands with isolated profiles | `POST .../brands` creates `Brand` + `BrandProfile`; B&C seed is one ordinary brand record | API + seed test; no B&C hard-code in shared services |
| REQ-PLAT-002 | **Brand switcher** — user selects active brand in shell | All brand-scoped screens require selected brand; block primary actions without selection | Playwright shell test |
| REQ-PLAT-003 | **Brand intelligence isolation** — AI/agents use one brand context per run | No workflow accepts multiple `brandId`; cross-brand leakage fails closed | AT-019, AT-020; DEC-023 |
| REQ-PLAT-004 | **Dashboard portfolio vs brand view** — explicit modes | Brand view = single `brandId`; portfolio = `portfolio.read` roll-up only | API contract §3c |
| REQ-PLAT-005 | **Terminal / Agents feed scoped** — activity list filtered by brand or portfolio | Events tagged `brandId` or `portfolio`; UI filter matches selection | Screen 1 + agent run log |
| REQ-PLAT-006 | **Conversational AI CMO scope** — chat grounded in active brand or declared portfolio summary | Portfolio chat uses aggregated metrics only, not merged rule prompts | DEC-023 |
| REQ-PLAT-007 | **Integrations per brand** — default connection ownership per `brandId` | OAuth connect under `.../brands/:brandId/integrations`; share explicit via share model | INTEGRATIONS.md |
| REQ-PLAT-008 | **Analytics per brand** — metrics and learning notes brand-scoped | Imports and reports include `brandId`; portfolio compares with labels | DATA_MODEL + Screen 10 |
| REQ-PLAT-009 | **Archive brand without deleting history** | `ARCHIVED` blocks new ops; audit/published/analytics remain readable | AT-024 |
| REQ-PLAT-010 | **Seven specialist agents** under CMO orchestration | Specialists listed in `ARCHITECTURE.md` §8b; each single-brand scoped | Workflow registry |

**`REQ-BRIEF-*` applicability:** Requirements in §1 describe **per-brand** marketing behavior (validated using B&C as first brand). Platform mechanics (`REQ-PLAT-*`) apply to all brands. Where the brief says “B&C”, implement as **active brand’s** catalogue/rules in product code.

---

## 1. Functional brief (`BC_Social_Media_Agent_Functional_Brief.pdf`)

**Document:** Bois & Chiffons — B&C Social Media Agent Functional Brief, Draft 14 October 2026 (11 pages).  
**In-repo copy:** [`BC_Social_Media_Agent_Functional_Brief.pdf`](../BC_Social_Media_Agent_Functional_Brief.pdf) (~142 KB).  
**Extraction source path used:** `C:\Users\INTEL\Downloads\BC_Social_Media_Agent_Functional_Brief (1).pdf` (2026-10-16).

### 1.1 Search performed

| Location | Result |
|----------|--------|
| `C:\Users\INTEL\Desktop\Social Media Agent` | Found — copied to project root (2026-10-16) |
| `C:\Users\INTEL\Downloads\BC_Social_Media_Agent_Functional_Brief (1).pdf` | User-supplied source used for extraction |
| Prior workspace searches (2026-10-16 AM) | Not found before user supplied file |

### 1.2 Extracted requirements (`REQ-BRIEF-*`)

Explicit statements from the brief only. Where the brief states functional acceptance criteria (§5), those are `REQ-BRIEF-077`–`REQ-BRIEF-084`.

#### Vision, users, and v1 scope

| ID | Requirement | Acceptance criteria (from brief) | Verification (from brief or implied) |
|----|-------------|----------------------------------|--------------------------------------|
| REQ-BRIEF-001 | Build an AI agent that helps the B&C team discover relevant content opportunities, plan and brief content, check drafts, and improve decisions using published results | Content more consistent, useful and commercially relevant; reduced daily research and coordination work | Stakeholder review of operating outcomes |
| REQ-BRIEF-002 | Intended roles: social media manager (opportunities, calendar); designers and editors (production briefs); brand approver (final content); commercial owner (product priorities, campaigns, offer rules) | One person may hold several roles; **permissions must remain separate** | Role/permission matrix tests |
| REQ-BRIEF-003 | First version is a research, planning, briefing and review assistant | Can prepare content and recommend schedules; **publishing requires approval of the exact final version** | Publish blocked without version-bound approval |
| REQ-BRIEF-004 | Approved scheduling may be added through connected channels | Scheduling only after approval | Integration tests with mock publish |
| REQ-BRIEF-005 | **Out of v1 product scope:** paid campaigns, direct messages, comment replies | No product features for these in first release | Scope review |
| REQ-BRIEF-006 | Core operating loop: monitor sources → filter opportunities → connect to B&C products and goals → generate channel briefs → review drafts → approve and publish → collect results → record lessons → improve the next calendar | End-to-end traceability from source to learning | Lifecycle E2E with fixtures |

#### Onboarding and configuration inputs

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-BRIEF-007 | Validate brand assumptions during onboarding: thoughtful furniture, practical interior inspiration, refined editorial tone; French as **proposed** primary language | Team confirms positioning, customer segments, tone, prohibited topics, approved product claims before production starts | Onboarding checklist complete before first production brief |
| REQ-BRIEF-008 | Premium reference brands are inspiration sources only; they do not automatically define B&C positioning | Positioning sourced from confirmed B&C inputs | Brand profile audit |
| REQ-BRIEF-009 | **Brand guidelines** onboarding: tone, content pillars, target audiences, languages, approved/rejected post examples, visual rules, CTA preferences | Stored as configurable inputs, not hard-coded in prompts | Screen 2 + settings |
| REQ-BRIEF-010 | **Source watchlist:** competitors, furniture brands, design publishers, creators, cultural sources; priority and monitoring frequency per source | Watchlist editable in settings | Screen 5 / settings |
| REQ-BRIEF-011 | **Product catalogue:** SKU, name, URL, category, materials, dimensions, approved descriptions, price, assets, verified certifications | Catalogue fields available for matching and briefs | Screen 3 |
| REQ-BRIEF-012 | **Commercial context:** stock, stock freshness, replenishment dates, product priorities, campaigns, offers, launch dates, seasonal moments | Used for prioritization and hold/reject decisions | Product + campaign settings |
| REQ-BRIEF-013 | **Channel configuration:** approved accounts, publishing frequency, content goals, available formats, account access, analytics connections | Per-channel configuration before use | Settings / integrations |

#### §1 Monitoring and opportunity discovery

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-BRIEF-014 | Run a **configurable daily scan** of approved sources | Scan runs on schedule per source configuration | Job logs + collection runs |
| REQ-BRIEF-015 | Capture per item: source URL, account or publisher, publication date, collection time, topic, format, visible engagement signals, short description | All listed fields stored or marked unavailable | Collection record schema |
| REQ-BRIEF-016 | Group repeated examples into one **trend**; retain supporting references | Deduped trend with linked references | Unit tests on clustering |
| REQ-BRIEF-017 | Use authorised integrations, feeds, permitted public sources, or **manual imports** | All ingestion paths supported where configured | Connector matrix |
| REQ-BRIEF-018 | Monitoring exposes which sources were checked, which failed, and when each last succeeded | Health visible in UI/settings | REQ-BRIEF-110 + integration health |
| REQ-BRIEF-019 | Unavailable data labelled unavailable; agent must **never invent** competitor metrics or access | No fabricated metrics in UI or outputs | QA review + tests |
| REQ-BRIEF-020 | Brand relevance filtering evaluates: audience relevance, brand fit, product connection, timeliness, originality, production feasibility, commercial usefulness | Each dimension considered in scoring/explanation | Opportunity analysis workflow |
| REQ-BRIEF-021 | Return **priority rating** and short explanation grounded in references and B&C inputs | Every ranked item has rationale | Feed UI + API |
| REQ-BRIEF-022 | Keep **brand suitability separate from commercial priority** | Popular trend cannot override a brand rule | Ranking service tests |
| REQ-BRIEF-023 | Dispositions: **Recommend** (relevant and feasible); **Hold** (missing facts, assets, stock confirmation or approval); **Reject** (off-brand, stale, repetitive, unsuitable audience, unsupported claims) — **record the reason** | Status + reason on each opportunity | Opportunity detail |
| REQ-BRIEF-024 | Treat audience relevance as a **reasoned hypothesis**, not guaranteed reach or sales | Copy/UI does not promise outcomes | Content review |
| REQ-BRIEF-025 | Store approval, rejection and edits as **feedback** for later recommendations | Feedback persisted and queryable | `OpportunityFeedback` + learning loop |
| REQ-BRIEF-026 | **Daily opportunity feed:** ranked **5–10 opportunities by default** | Default feed size within range | Feed API default |
| REQ-BRIEF-027 | Feed filters: topic, platform, audience, product, urgency, status | Filters affect result set | UI + API query params |
| REQ-BRIEF-028 | Manager actions: shortlist, reject with reason, request different angle, convert to calendar item | Each action supported | Screen 5 E2E |
| REQ-BRIEF-029 | Opportunity card fields: title; why now; references; target audience; relevance explanation; suggested hook; recommended formats and channels; related SKUs; commercial objective; proposed CTA; needed assets; estimated effort; expiry date; confidence or missing information | Card shows all fields or explicit gaps | UI fixture test |
| REQ-BRIEF-030 | Hold recommendation if product dimensions or stock cannot be confirmed (per illustrative example) | Hold state when facts missing | Product matcher tests |
| REQ-BRIEF-031 | References inform angle and production direction; **competitor copy, images or video must not be reused as B&C assets** without appropriate rights | Rights check in asset permissions | REQ-BRIEF-058 asset permissions check |

#### §2 Content briefs and rolling calendar

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-BRIEF-032 | **Standard content brief** includes: objective, audience, core message, hook, platform, format, linked SKUs, verified product facts, source references, CTA, destination URL, language, draft caption or script, asset list, production instructions, accessibility requirements, owner, deadline, approval status | Brief template enforces fields | Schema validation |
| REQ-BRIEF-033 | **Reels:** scene sequence, opening shot, narration, on-screen text, cover direction in brief | Reel brief sections present | Studio UI |
| REQ-BRIEF-034 | **Carousels:** purpose and copy of each slide | Slide list in brief | Studio UI |
| REQ-BRIEF-035 | **Static posts and stories:** composition and message hierarchy | Specified in brief | Studio UI |
| REQ-BRIEF-036 | Specify format dimensions and limits from **configured channel requirements** | Dimensions from channel config | Channel settings |
| REQ-BRIEF-037 | **Instagram** adaptation: visual storytelling, styling ideas, product discovery, reels, carousels, stories; clear openings and save-worthy value | Platform-specific brief variant | Channel adapt workflow |
| REQ-BRIEF-038 | **Facebook** adaptation: useful context, room inspiration, campaigns, discussion prompts; copy and destination links adapted to post format | Platform-specific variant | Channel adapt workflow |
| REQ-BRIEF-039 | **Pinterest** adaptation: search-oriented titles/descriptions, product and room keywords, relevant boards, vertical visual concepts, product or editorial destination links | Platform-specific variant | Channel adapt workflow |
| REQ-BRIEF-040 | **LinkedIn** adaptation: approved professional angles (designers, architects, B2B); verified product suitability, projects or business value | Platform-specific variant | Channel adapt workflow |
| REQ-BRIEF-041 | **Other channels:** activate only after approval and configuration of audience, formats, tone, workflow and available integrations | Channel gated by configuration | Settings |
| REQ-BRIEF-042 | **Rolling calendar:** proposed **30-day** calendar; **next 7 days production-ready by default** | Calendar horizon and readiness rules | Screen 7 |
| REQ-BRIEF-043 | Calendar shows: channel, format, theme, objective, campaign, product, owner, deadline, publishing slot, workflow status | Fields on calendar items | Calendar UI |
| REQ-BRIEF-044 | Calendar and list views; drag-and-drop rescheduling; visibility of missing assets or overdue approvals | UX capabilities delivered | Playwright calendar tests |
| REQ-BRIEF-045 | Balance product priorities, educational content, inspiration, brand stories and campaigns using a **configurable mix** | Mix rules in settings | Calendar planner |
| REQ-BRIEF-046 | Respect **production capacity** and **channel frequency** | Scheduling respects limits | Validation on schedule |
| REQ-BRIEF-047 | Check stock and offer validity before final approval and again before publishing | Two checkpoint validations | Quality + publish guards |
| REQ-BRIEF-048 | If stock changes, flag affected items and propose alternatives; **do not silently change approved content** | User-visible flags and alternatives | Stock change job |
| REQ-BRIEF-049 | **Repurposing:** linked variants from one approved core idea (reel, carousel, stories, static, captions, Pinterest assets, B2B version where relevant) | Multiple variants per parent idea | Studio repurpose workflow |
| REQ-BRIEF-050 | Preserve product facts while adapting hook, depth, visual sequence and CTA across variants | Facts consistent across variants | Variant diff tests |
| REQ-BRIEF-051 | Track **parent idea ID** to compare variants and avoid repetitive publishing | Parent link on variants | Data model |
| REQ-BRIEF-052 | System prepares production instructions and text; finished visual/video by creative team or **separately approved generation integration** | Text/instructions in product; visuals optional via integration | DEC-010 |
| REQ-BRIEF-053 | Generated visuals must not misrepresent materials, proportions, finish or features | Visual QA / blocker rules | Quality visual check |

#### §3 Quality checks, approval, publishing, UI

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-BRIEF-054 | **Automated draft review** of text and available final visuals | Review runs on draft versions | Quality runs API |
| REQ-BRIEF-055 | Each check returns **pass, warning, or blocker** with specific issue and suggested correction | Structured check results | Screen 8 |
| REQ-BRIEF-056 | Checks that cannot be completed remain **unresolved and visible** to approver | Unresolved state in UI | Approval screen |
| REQ-BRIEF-057 | **Brand voice** check: tone, approved language, content pillar, audience suitability | Check type in quality run | Automated + manual |
| REQ-BRIEF-058 | **Product accuracy** check: SKU, material, dimensions, price, stock, links, offer dates, factual claims vs approved records | Blockers on mismatch | Deterministic validators |
| REQ-BRIEF-059 | **Editorial quality** check: spelling, grammar, **French phrasing**, readability, repetition, consistency between caption, script and visual text | French editorial rules | Lint + AI assist |
| REQ-BRIEF-060 | **CTA clarity** check: one clear next action, correct destination, tracking parameters where applicable | CTA validation | Quality run |
| REQ-BRIEF-061 | **Visual requirements** check: dimensions, crop safety, legibility, branding, cover quality, subtitles or alt text as applicable, product fidelity | Visual checklist | Quality run |
| REQ-BRIEF-062 | **Asset permissions** check: owned or licensed assets; approval status of creator or customer content | Rights enforcement | Approval gate |
| REQ-BRIEF-063 | **Content states:** suggested → shortlisted → brief ready → in production → draft review → awaiting approval → approved → scheduled → published → reviewed; also rejected, blocked, cancelled | State machine implemented | `ContentWorkflowStatus` enum |
| REQ-BRIEF-064 | Each state transition records **actor, timestamp and content version** | Audit trail on transitions | `AuditEvent` |
| REQ-BRIEF-065 | Approver may approve, reject with reason, or request changes | Approval API actions | Screen 8 E2E |
| REQ-BRIEF-066 | Editing copy, assets, product, CTA, offer or schedule after approval triggers **configured reapproval rule**; **material changes always invalidate approval** | Approval cleared on material edit | Version-bound approval tests |
| REQ-BRIEF-067 | Comments and **version comparison** without losing the original brief | Version history UI | Studio |
| REQ-BRIEF-068 | Connected scheduling: publish **only approved version** to **approved account** | Publish guard | REQ-MDI-048 aligned |
| REQ-BRIEF-069 | Use unique **publishing reference** to prevent duplicate posts on retries | Idempotent publish | `PublicationAttempt` |
| REQ-BRIEF-070 | Confirm publication with platform post ID and URL; show failures and retry status | Published post record | Screen 9 |
| REQ-BRIEF-071 | If publishing unavailable: **export approved content package** for manual posting; user can **register resulting post URL** | Manual path | Screen 9.1 |
| REQ-BRIEF-072 | **Today** UI: ranked opportunities, urgent stock/offer issues, briefs to produce, approvals pending | Today dashboard content | Screen 4 |
| REQ-BRIEF-073 | **Calendar** UI: upcoming content with owners, readiness, campaign/product filters | Calendar screen | Screen 7 |
| REQ-BRIEF-074 | **Content workspace** UI: brief, references, variants, drafts, checks, comments, version history | Studio screen | Screen 6 + 8 |
| REQ-BRIEF-075 | **Performance and learning** UI: published results, post-level lessons, recurring patterns | Screen 10 | Analytics views |
| REQ-BRIEF-076 | **Settings** UI: brand rules, watchlist, product connections, channel permissions, schedule, approval roles | Screen 11 | Settings tests |
| REQ-BRIEF-077 | Daily UX focuses on **reviewing recommendations and approving work**; collection, product matching and analytics run in background with **visible connection health and last refresh times** | Background jobs + health UI | Dashboard/settings |

#### §4 Performance review and learning

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-BRIEF-078 | Attach each published post to channel, core idea, theme, format, hook, product, audience hypothesis, objective | Linkage fields on `PublishedPost` | Data model |
| REQ-BRIEF-079 | Collect available reach, engagement, saves, shares, clicks, product views, attributable commercial signals; **separate organic and paid** where data allows | Metrics in snapshots; organic/paid flag | Import pipeline |
| REQ-BRIEF-080 | Assess engagement quality using comments and meaningful audience questions, not likes alone | Qualitative signals stored | Learning workflow |
| REQ-BRIEF-081 | Mark unavailable metrics explicitly; compare with **recent comparable posts** on same channel and format; avoid comparing raw totals across platforms or exposure levels | Comparison baseline in UI | Screen 10 |
| REQ-BRIEF-082 | Review checkpoints: **48 hours** and **7 days** initially; **later review for longer-lived Pinterest** content (operating defaults, not platform guarantees) | Scheduled review jobs | Job config |
| REQ-BRIEF-083 | Attach trackable URLs where supported; connect website analytics when available | UTM + GA connection | Integrations |
| REQ-BRIEF-084 | Distinguish platform-reported clicks from measured website sessions and product views | Separate metrics in reporting | Analytics model |
| REQ-BRIEF-085 | Define assisted conversions per agreed analytics model and attribution window; label as **attributed observations**; do not claim post caused sale or sum overlapping platform conversion counts | Disclaimer + model config | Reporting copy |
| REQ-BRIEF-086 | **Learning note after every post:** initial note after first review, updated when more data arrives | Note exists per reviewed post | REQ-BRIEF-108 |
| REQ-BRIEF-087 | Learning note includes: objective, available results, comparison baseline, what worked, what underperformed, limitations, **one specific change to test next time**; observations separate from hypotheses; missing data must not become failure judgement | Note template | Screen 10 |
| REQ-BRIEF-088 | **Weekly:** summarize recurring themes, products, formats, hooks, creators, audience questions with supporting posts, time period and **sample size** for every pattern | Pattern report with evidence | Learning dashboard |
| REQ-BRIEF-089 | Separate strong evidence from early signals; account for paid boosts, seasonality, campaign differences where possible | Confidence labels on patterns | UI |
| REQ-BRIEF-090 | Recommend what to repeat, refine, pause or test | Actionable recommendations | Weekly summary |
| REQ-BRIEF-091 | Review creator performance only where B&C collaboration results exist; otherwise label as **public trend signals** | Creator metrics gated | Copy rules |
| REQ-BRIEF-092 | Feed **approved lessons** into opportunity ranking and calendar suggestions | Learning influences suggestions | Ranking tests |
| REQ-BRIEF-093 | **Major changes to brand rules require human approval** | Rule change workflow | Brand settings |
| REQ-BRIEF-094 | **Weekly business summary:** content delivered, approval delays, strongest themes, quality issues, product interest, measurable commercial contribution | Report generated | Reporting job |
| REQ-BRIEF-095 | Track: approval rate, time from idea to brief, calendar readiness, on-time publishing, quality failures, performance vs each post’s objective | KPIs in report | Analytics |
| REQ-BRIEF-096 | Set **numeric performance targets after collecting an initial baseline** | Targets configurable post-baseline | Settings (later phase) |

#### §5 Delivery scope, records, acceptance, pre-dev confirmation

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-BRIEF-097 | **First release** delivers: brand onboarding, configurable watchlist, daily opportunity feed, product matching, briefs for **five channel groups**, rolling calendar, linked content variants, quality checks, human approval, **manual publication registration**, available analytics import, post-level learning notes; start with connected or supplied data; **display gaps clearly** | All listed capabilities present or explicitly “unavailable” | Release checklist |
| REQ-BRIEF-098 | **Defer until access/data confirmed:** automated scheduling, broader source connectors, website attribution, deeper pattern recommendations | Not required for first release sign-off | Phase plan |
| REQ-BRIEF-099 | API capabilities and platform requirements validated during implementation; brief does **not** assume unrestricted competitor monitoring or analytics access | Connector legal/technical review | DEC-004, integrations doc |
| REQ-BRIEF-100 | **Minimum records:** brand profile and rule versions; monitored sources and collection logs; opportunities and reference evidence; product snapshots; content ideas and channel briefs; calendar items; draft and approval versions; published post IDs; metric snapshots; learning notes; approved recommendation feedback | All entity types persisted | DATA_MODEL |
| REQ-BRIEF-101 | Every content item retains links **from source idea through publication and review** | Lineage queryable end-to-end | Traceability test |
| REQ-BRIEF-102 | Confirm before development (configurable, not embedded in code/prompts): brand guidelines and audiences; watchlist; primary language; catalogue and stock access; active channels; weekly production capacity; approvers; scheduling requirements; analytics access; assisted-conversion definition | Pre-flight checklist in settings/onboarding | Stakeholder sign-off |

#### §5 Functional acceptance criteria (brief-stated)

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-BRIEF-103 | Daily scan and feed | Configured daily scan creates ranked, deduplicated feed and reports source failures; every recommendation includes reason, references, format, audience and product connection **or stated gap** | Integration test + feed inspection |
| REQ-BRIEF-104 | Opportunity to brief | User can convert opportunity into complete channel brief and calendar item, assign owner, edit, track status | E2E workflow |
| REQ-BRIEF-105 | Multi-variant ideas | One idea produces multiple channel variants with consistent product facts and original idea link | Variant linkage test |
| REQ-BRIEF-106 | Publication blockers | Incorrect product fact, expired offer, unavailable product, stale stock (per freshness policy), or unresolved required visual check **blocks publication approval** until resolved or **explicitly waived** by authorized role per **DEC-020** (non-waivable: hash, rights, claims, connection auth) | AT-008, AT-015; waiver audited |
| REQ-BRIEF-107 | Version-bound approval and publish idempotency | Approval binds to sealed **`PublicationPackage`** hash (includes media, variant URL, account); material edits require reapproval; connected retries cannot create duplicate posts | DEC-016; AT-003, AT-004 |
| REQ-BRIEF-108 | Post metrics and learning | Published post linkable to imported metrics or manual data; missing measures remain unavailable; every reviewed post produces traceable learning note | Screen 10 E2E |
| REQ-BRIEF-109 | Pattern learning | Weekly patterns cite supporting posts and sample sizes; accepted/rejected recommendations influence future suggestions without overwriting brand rules | Learning loop tests |
| REQ-BRIEF-110 | Operational dashboard | Dashboard exposes stale stock, failed connections, missing assets, delayed approvals, failed publishing for team action | Today + alerts |

**Total explicit `REQ-BRIEF-*` IDs:** 110.

### 1.3 Brief vs `REQ-MDI-*` reconciliation

| Topic | Brief (`REQ-BRIEF`) | MDI (`REQ-MDI`) | Resolution |
|-------|---------------------|-----------------|------------|
| Product SoT | Functional brief | Charter + screens | **Brief wins** on product scope; MDI carries technical/security/stack |
| Human approval before publish | REQ-BRIEF-003, 068, 107 | REQ-MDI-009, 048 | **Aligned** |
| Paid ads, DMs, comment replies | REQ-BRIEF-005 out of scope | REQ-MDI-020–022 | **Aligned** |
| First-release publish path | Manual registration + export (REQ-BRIEF-097, 071); automated scheduling deferred (REQ-BRIEF-098) | REQ-MDI-010 includes API publish | **Clarified:** MVP emphasizes manual registration first; connected publish per REQ-BRIEF-004 when integration ready — matches IMPLEMENTATION_PLAN Screen 9 ordering |
| Platforms | Five channel groups: IG, FB, Pinterest, LinkedIn, other (REQ-BRIEF-037–041) | Screens 6–9 generic “channel variants” | **Gap closed:** channel list explicit in brief; MDI unchanged but implementation must cover all five groups in v1 briefs |
| Content workflow states | REQ-BRIEF-063 detailed state machine | MDI-007/108 imply states; DATA_MODEL had draft `status` only | **Doc update:** `ContentWorkflowStatus` added to DATA_MODEL |
| Business roles | Manager, designer/editor, approver, commercial owner (REQ-BRIEF-002) | `WorkspaceRole` enum (OWNER, ADMIN, …) | **Gap:** map brief roles to workspace roles + duties in API_CONTRACTS; commercial owner not a separate MDI role |
| Primary language | French proposed (REQ-BRIEF-007) | `locales` array on brand | **Brief-only default:** default `fr` in onboarding when confirmed |
| Weekly business reporting | REQ-BRIEF-094–095 | REQ-MDI-110 partial (metrics, notes) | **Gap:** add weekly summary report to Screen 10 scope |
| Competitor asset reuse | REQ-BRIEF-031, 062 | REQ-MDI-045 | **Aligned** |
| Never invent metrics | REQ-BRIEF-019 | REQ-MDI-062 (facts) | **Aligned**; brief extends to competitor metrics |
| Visual generation | Optional approved integration (REQ-BRIEF-052–053) | REQ-MDI-006 | **Aligned** with DEC-010 upload-first MVP |
| Reddit / unrestricted monitoring | REQ-BRIEF-099 | DEC-004 mock Reddit | **Aligned** |
| CMS / articles | Not in brief v1 | DEF-005 deferred | **Brief confirms:** no CMS in first release |
| Numeric KPI targets | After baseline (REQ-BRIEF-096) | Not stated | **Brief-only** |
| Screen count / UI areas | Five areas + settings (REQ-BRIEF-072–076) | Screens 1–11 | **Aligned** (MDI splits studio/calendar/quality; brief groups conceptually) |

**Brief-only (no MDI equivalent):** REQ-BRIEF-007–008 (onboarding validation narrative), REQ-BRIEF-022 (brand vs commercial priority split), REQ-BRIEF-026–027 (feed size defaults), REQ-BRIEF-045–046 (content mix + capacity), REQ-BRIEF-082–085 (review timing and attribution semantics), REQ-BRIEF-094–096 (weekly business KPIs), REQ-BRIEF-102 (pre-dev confirmation list).

**MDI-only (technical charter, not in brief):** REQ-MDI-030–036 (stack), REQ-MDI-040–049 (security), REQ-MDI-050–052 (connector design), REQ-MDI-120–122 (delivery protocol), screen numbering REQ-MDI-101–111.

---

## 2. Master development instructions (explicit charter)

These IDs come from the project charter provided at kickoff. They are **not** a substitute for the functional brief.

### Product vision and scope

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-MDI-001 | System understands brand, products, audience, goals, approved claims | `ApprovedClaim` records + `BrandRuleVersion.allowedClaimIds`; generation cites claim IDs only | Integration test: draft cites only approved claim IDs |
| REQ-MDI-002 | Research permitted public content and industry discussions | Research jobs use connector-declared capabilities; provenance stored | Audit log shows source URL, connector, timestamp |
| REQ-MDI-003 | Discover, deduplicate, rank, explain opportunities | Feed shows score, rationale, duplicate cluster id | Unit tests on ranking/dedup services |
| REQ-MDI-004 | Connect opportunities to verified products and priorities | Opportunity links to `Product` or explicit “no product” | UI + API enforce product FK or null with reason |
| REQ-MDI-005 | Generate briefs, captions, carousel copy, Reel scripts, channel variants | Structured outputs validated by Zod; version history | Schema tests + studio workflow E2E (later phase) |
| REQ-MDI-006 | Coordinate visual creative via replaceable providers | Provider interface; failures surfaced; no fake “generated” URLs | Mock provider in tests; real provider behind feature flag |
| REQ-MDI-007 | Rolling calendar and production workflow | Calendar items with status, owner, deadlines | Screen 7 acceptance checklist |
| REQ-MDI-008 | Review drafts: brand, facts, editorial, visual requirements | Quality gate runs deterministic + AI checks; results stored | Screen 8 checklist |
| REQ-MDI-009 | **Human approval** of exact final version before publication | No publish without approved, sealed `PublicationPackage` and matching `ApprovalDecision` on `packageHash` (DEC-016) | AT-003, AT-004; publish blocked without valid package state |
| REQ-MDI-010 | Publish via authorized integrations or manual registration | Connector capability matrix honored; manual path documented | Publish integration tests with mocks |
| REQ-MDI-011 | Import analytics, compare, traceable learning notes | Snapshots importable; learning notes link to posts/opportunities | Screen 10 checklist |
| REQ-MDI-012 | Improve recommendations from feedback without overriding brand rules | Learning updates ranking weights/prompt hints only within rule guardrails | Tests: prohibited claim never suggested |

### Out of initial scope (explicit)

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-MDI-020 | Paid advertising not in initial product | No ad campaign entities in MVP | Scope review |
| REQ-MDI-021 | DMs not in initial scope | No DM send automation | No DM publish endpoints |
| REQ-MDI-022 | Automated comment replies not in initial scope | No auto-reply to third-party posts | Connector matrix excludes comment automation |

### Technical environment

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-MDI-030 | Windows dev, PowerShell, Git | Docs and scripts PowerShell-compatible | `docs/IMPLEMENTATION_PLAN.md` |
| REQ-MDI-031 | Next.js App Router, TypeScript, npm | `package.json` reflects stack after scaffold | `npm run build` |
| REQ-MDI-032 | Tailwind + component system (e.g. shadcn/ui) | Design tokens in `docs/DESIGN_SYSTEM.md` implemented | Visual + a11y spot check |
| REQ-MDI-033 | PostgreSQL + Prisma + Zod | Schema validates; migrations applied | `npx prisma validate` |
| REQ-MDI-034 | Vitest + Playwright | Test scripts in package.json | CI/local test runs |
| REQ-MDI-035 | Single Next.js app; no microservices without demonstrated need | One deployable unit | Architecture review |
| REQ-MDI-036 | Auth evaluated before build; workspace isolation explicit | ADR in `docs/DECISIONS.md` | Permission matrix in API doc |

### Security (mandatory)

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-MDI-040 | No API secrets or OAuth tokens in frontend | Env server-only; no `NEXT_PUBLIC_*` for secrets | Build grep / lint rule |
| REQ-MDI-041 | Tokens encrypted or secure credential store | Server decrypts only in integration layer | Security review |
| REQ-MDI-042 | Workspace-level authorization on server | Every mutating route checks membership + role | Auth integration tests |
| REQ-MDI-043 | Validate inputs and external API responses | Zod at boundaries | Contract tests |
| REQ-MDI-044 | Audit trail for sensitive changes and approvals | `AuditEvent` / approval transitions logged | DB + API tests |
| REQ-MDI-045 | No competitor assets as B&C-owned without rights | Asset permission check in approval | Screen 8 rule |
| REQ-MDI-046 | No bypass of platform rate limits or permissions | Connector respects limits; errors surfaced | Integration tests |
| REQ-MDI-047 | External content = untrusted data | Sanitize display; never execute as instructions | Prompt injection tests |
| REQ-MDI-048 | Never publish unapproved content | Publish service checks approval | E2E publish guard |
| REQ-MDI-049 | AI cannot self-approve or grant permissions | Approval actor must be human user id | Role separation tests |

### Integrations (design)

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-MDI-050 | Connector types: research, account mgmt, publishing, insights, website analytics | Each platform documents supported types | `docs/INTEGRATIONS.md` |
| REQ-MDI-051 | Connection health, sync status, rate limits, retries, provenance | Health fields on `IntegrationConnection` | Settings UI + API |
| REQ-MDI-052 | Mock adapters until credentials available | Tests run without live APIs | Vitest with mocks |

### AI layer

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-MDI-060 | Provider-independent AI service layer | Swap provider without changing business services | Interface + mock provider |
| REQ-MDI-061 | Workflows: opportunity analysis, matching, captions, hooks, carousel, reel, repurposing, QA, learning summaries | Each has input/output schema + version id | Per-workflow tests |
| REQ-MDI-062 | Ground facts in approved product/claim records | Missing facts → explicit flags, not invention | Fact validator unit tests |
| REQ-MDI-063 | Deterministic validators for stock, price, offers, approval, publish eligibility | Code paths independent of LLM | Unit tests |

### Screens (implementation order)

| ID | Screen | Acceptance criteria (summary) | Verification |
|----|--------|------------------------------|--------------|
| REQ-MDI-101 | 1 Application shell | Nav, layout, design tokens, reusable primitives | Playwright smoke |
| REQ-MDI-102 | 2 Brand onboarding | Voice, pillars, claims, team roles | E2E onboarding |
| REQ-MDI-103 | 3 Product catalogue | CRUD, snapshots, stock freshness | API + UI tests |
| REQ-MDI-104 | 4 Today dashboard | Opportunities, deadlines, approvals, alerts | Data fixture tests |
| REQ-MDI-105 | 5 Opportunity research | Watchlist, jobs, feed, actions | Connector mock tests |
| REQ-MDI-106 | 6 Content studio | Brief, captions, carousel, visuals, versions | Studio workflow tests |
| REQ-MDI-107 | 7 Calendar & production | Views, states, overdue | Calendar tests |
| REQ-MDI-108 | 8 Quality & approval | Checks, comments, version-bound approval | Approval E2E |
| REQ-MDI-109 | 9 Publishing | Verified approval, manual + API publish | Publish guard tests |
| REQ-MDI-110 | 10 Performance & learning | Metrics import, learning notes | Import mock tests |
| REQ-MDI-111 | 11 Integrations & settings | Connections, rules, AI config, audit | Settings tests |

### Development protocol

| ID | Requirement | Acceptance criteria | Verification |
|----|-------------|---------------------|--------------|
| REQ-MDI-120 | Vertical slices per function; no whole-screen big bang | Each slice has schemas, API, UI, tests | Implementation plan adherence |
| REQ-MDI-121 | No inert buttons or fake integrations | UI labels “not configured” when true | UX audit |
| REQ-MDI-122 | Real persistence for completed features | Prisma models used | DB integration tests |

---

## 3. Reference observations (not requirements)

Labeled **REF-*** — inspiration only; do not treat as B&C scope.

| ID | Source | Observation |
|----|--------|-------------|
| REF-OKARA-001 | [okara.ai/docs/introduction](https://okara.ai/docs/introduction) | URL-driven strategy docs, multi-channel “agents”, daily opportunity feed, analytics refresh (~6h) |
| REF-OKARA-002 | Okara | Specialized agents (Reddit, SEO, GEO, X, LinkedIn, articles, HN, UGC, coding, influencer) |
| REF-OKARA-003 | Okara | Positioning: autonomous daily marketing for founders without full team |
| REF-OKARA-004 | Okara CMO agent pattern | Conversational marketing lead + specialist sub-agents; **this product** keeps human approval gate and multi-brand isolation |
| REF-SCALIO-001 | [scalio.app](https://scalio.app/) | Mobile/web app; learns business once; posts, Reels, photoshoots, ads, message/review replies |
| REF-SCALIO-002 | Scalio | Human approves; system publishes/schedules; 30 posts/month tier mentioned |
| REF-SCALIO-003 | Scalio | Pricing observed: Starter ~$29.99/mo, Professional ~$49.99/mo (regions vary) |

**Platform differentiation (proposed):** Multi-brand workspace for agencies and portfolios; per-brand catalogue/claims/editorial depth; explicit approval gate; no autonomous posting without human sign-off; no Scalio-style DM/review auto-reply in MVP (aligned with REQ-MDI-021/022). B&C exercises furniture/interior depth as first seed brand.

---

## 4. Proposed architecture (Phase 0)

| ID | Proposal | Rationale |
|----|----------|-----------|
| ARCH-001 | Monolithic Next.js 15 App Router | Matches REQ-MDI-035 |
| ARCH-002 | `src/server/services/*` business logic | Testable without UI |
| ARCH-003 | Connector registry + capability flags | REQ-MDI-050 |
| ARCH-004 | Port Instagram skill **logic** (hooks, caption lint, humanize) to TypeScript services | MIT license; stdlib Python not required in production path |
| ARCH-005 | Job queue: start with DB-backed `Job` table + cron/worker in process | Avoid extra infra until volume proven |

---

## 5. Unresolved decisions

See `docs/DECISIONS.md` (DEC-001 …). Summary:

- Auth provider finalization (Auth.js candidate)
- Credential encryption approach (app-level vs vault)
- Primary AI provider and cost caps
- Meta app review timeline and account types
- Reddit commercial / AI training use terms
- Visual generation provider (none selected)
- Web search provider for research

**From brief — confirm before build (`REQ-BRIEF-102`):** brand guidelines and audiences; watchlist; primary language (French proposed in brief, not locked); catalogue/stock access; active channels; weekly production capacity (no numeric rule in brief); approvers; scheduling expectations; analytics access; assisted-conversion definition (`REQ-BRIEF-085`). **Publication blocker waivers:** documented default in **DEC-020** — stakeholder must confirm waivable commercial blockers (U-001 in `DECISIONS.md`) before Screen 8 sign-off.

**Phase 0.5 traceability:** `docs/FINDINGS_REGISTER.md`, `docs/ADVERSARIAL_ACCEPTANCE_TESTS.md`. REQ-MDI-009/048 aligned with publication package model.

---

## 6. Deferred features

| ID | Feature | Reason |
|----|---------|--------|
| DEF-001 | Paid ads campaigns | REQ-MDI-020 |
| DEF-002 | Instagram DM automation (`/ig-dm`, `/ig-comment`, `/ig-reply`) | REQ-MDI-021/022; ToS risk per skill README |
| DEF-003 | Browser automation for Instagram research at scale | Skill forbids; use permitted APIs + manual capture |
| DEF-004 | Influencer payouts (Okara-like) | Out of charter |
| DEF-005 | CMS article publishing | Not in brief v1 (REQ-BRIEF-097); REQ-MDI screens omit |
| DEF-008 | Calendar-driven **unattended** scheduling (auto-publish at slot time) | REQ-BRIEF-098; manual registration + user-initiated connected publish remain in v1 (DEC-014) |
| DEF-009 | Broader source connectors beyond v1 watchlist | REQ-BRIEF-098 |
| DEF-010 | Full website attribution and assisted-conversion model | REQ-BRIEF-098, 085; confirm per REQ-BRIEF-102 |
| DEF-011 | Deeper pattern recommendations (beyond weekly summary) | REQ-BRIEF-098 |
| DEF-012 | Numeric performance targets | REQ-BRIEF-096 — after baseline collection |
| DEF-006 | Multi-workspace agency billing / cross-workspace reporting | Single deployable app; multi-**brand** within workspace is in scope (REQ-PLAT-001) |
| DEF-007 | `ig-profile` rubric as live profile scraper | Research-only; use connected account insights instead |

---

## 7. Instagram agent skill mapping (audit)

**License:** MIT (`_vendor/instagram-agent-skill/LICENSE`)  
**Dependencies:** Python 3 stdlib only in scripts; no pip packages in repo  
**Execution:** Local CLI; skills are Claude `SKILL.md` prompts + optional Python

| Skill | B&C use | Action |
|-------|---------|--------|
| `/ig-reel` + `hooks.json`, `hookscore.py`, `beats.py` | Reel scripts, hook QA | **Adopt** — port scoring/lint to TS |
| `/ig-caption` + `caption.py` | Caption lint, 125-char preview | **Adopt** |
| `/ig-carousel` | Carousel structure | **Adopt** — prompt patterns + studio UI |
| `/ig-plan` | Weekly planning | **Adapt** — calendar service, not IG-specific cadence only |
| `/ig-repurpose` | Multi-format from one source | **Adopt** — studio workflow |
| `/ig-viral` + `swipe.py` | Niche research ranking | **Adapt** — outlier math in TS; collection via permitted sources |
| `/ig-human` + `humanize.py`, `detect.py`, `slop.json` | Editorial QA | **Adopt** — brand-tunable lexicon |
| `/ig-audit` | Post-mortem analytics | **Adapt** — after insights import (Screen 10) |
| `/ig-story` | Stories | **Defer** — lower priority for furniture editorial MVP |
| `/ig-profile` + `rubric.json` | Profile optimization | **Defer** — use brand onboarding instead |
| `/ig-comment`, `/ig-reply`, `/ig-dm` | Social engagement automation | **Reject** MVP — scope + ToS |
| `templates/voice.md` | Voice profile | **Adopt** — maps to Brand Voice entity |

**Security / compliance notes from skill README:**

- Does not post to Instagram; aligns with REQ-MDI-009
- Warns against scraping and browser automation for posting/DM
- Humanizer is local heuristic, not “undetectable AI” marketing
- Hashtag cap (5) encoded in `caption.py` — keep rules configurable
