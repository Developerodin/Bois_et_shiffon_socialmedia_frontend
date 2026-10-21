# Architecture Decisions — Multi-Brand AI CMO Platform

ADR-style log. Status: **Proposed** until implementation starts.

---

## DEC-001 — Authentication library

**Status:** Proposed (leaning accept)  
**Context:** Need session-based auth for Windows/local dev and future hosted deploy. Master instructions name Auth.js as candidate.  
**Decision:** Use **Auth.js (NextAuth v5)** with Prisma adapter, email magic link or OAuth (Google/Microsoft) for team login.  
**Alternatives:** Clerk (cost, vendor lock), custom JWT (more work).  
**Consequences:** Add `@auth/prisma-adapter`, session tables, `AUTH_SECRET` required.  
**Verification:** Login E2E; session available in server components and route handlers.

---

## DEC-002 — Credential storage

**Status:** Proposed  
**Context:** OAuth tokens for Meta, LinkedIn, etc. must not reach client.  
**Decision (MVP):** Encrypt refresh tokens at rest in PostgreSQL using **AES-256-GCM** with `CREDENTIALS_ENCRYPTION_KEY` (32-byte base64) via Node `crypto`. Store ciphertext in `IntegrationConnection.encryptedCredentials`.  
**Ciphertext format (DEC-018):** versioned binary envelope stored as base64:

`v1:<keyVersion>:<iv_b64>:<tag_b64>:<ciphertext_b64>`

- `keyVersion` maps to env `CREDENTIALS_KEY_VERSION` (integer) and optional future `CREDENTIALS_ENCRYPTION_KEY_<version>` for rotation.
- Decrypt tries recorded `credentialKeyVersion` on row; re-encrypt on successful read when rotating.

**Alternatives:** AWS KMS, HashiCorp Vault, Doppler — defer until production hardening.  
**Consequences:** Key rotation procedure required; document in runbook.  
**Verification:** DB leak does not expose plaintext tokens; integration tests with test key; round-trip after key version bump.

---

## DEC-003 — AI provider abstraction

**Status:** Proposed  
**Context:** REQ-MDI-060; skills assume Claude but product must stay provider-agnostic.  
**Decision:** Internal `AiProvider` interface with implementations for OpenAI and Anthropic; `mock` for tests. Default from `AI_PROVIDER_DEFAULT`.  
**Consequences:** Prompt templates parameterized; no provider-specific types in business services.  
**Verification:** Swap `mock` → real provider in one env change.

---

## DEC-004 — Reddit commercial and AI use

**Status:** Unresolved — **blocker for production Reddit research**  
**Context:** Reddit Data API terms restrict commercial use and may restrict AI training on retrieved content.  
**Decision:** MVP may use **mock Reddit connector** only until legal/commercial terms confirmed.  
**Action:** Review current Reddit Developer Terms before enabling live connector.

---

## DEC-005 — Web search provider

**Status:** Unresolved  
**Options:** Brave Search API, Bing Web Search, SerpAPI.  
**Decision:** Defer selection to Screen 5; implement `MockWebSearchConnector` first.  
**Criteria:** Cost per query, ToS for storing snippets, EU data handling.

---

## DEC-006 — Background jobs

**Status:** Proposed accept (updated Phase 0.5)  
**Context:** Collection runs, analytics sync, publish retries.  
**Decision (MVP):** Durable `Job` collection/table + short-lived worker invoked by Vercel Cron (or external cron) hitting `/api/v1/jobs/run` with `CRON_SECRET` — **not** reliance on long-running in-process timers inside serverless Next.js handlers. Local dev may use `node-cron` in `npm run dev` only. *(Originally specified PostgreSQL; local Phase 1 uses MongoDB per DEC-024 — production may adopt Postgres or stay on Mongo when the job model lands.)*  
**Claim semantics:** See **DEC-015**.  
**Alternatives:** BullMQ + Redis, Inngest — defer until job volume requires.  
**Verification:** Job retry, dead-letter, lease recovery; see AT-007 in `ADVERSARIAL_ACCEPTANCE_TESTS.md`.

---

## DEC-007 — Retention of external content

**Status:** Proposed  
**Decision:** Raw excerpts in `SourceReference` TTL **90 days** default; opportunities retained; user-configurable later.  
**Rationale:** Reddit/API terms often limit retention.

---

## DEC-008 — Separation of creator and approver (role override only)

**Status:** Proposed accept (MVP)  
**Context:** REQ-MDI-049 blocks AI self-approval; brief expects distinct approver roles (REQ-BRIEF-002).  
**Decision (MVP):** `content.approve` capability required; actor must be human; `actorUserId !== contentVersion.createdByUserId` unless `OWNER` uses **separation-of-duties override** (`content.approve.self` waiver) with mandatory `AuditEvent`.  
**Not in scope of DEC-008:** waiving failed stock, rights, hash, or offer blockers — see **DEC-020**. OWNER self-approval override does **not** imply commercial-safety waiver.  
**Verification:** API tests AT-012; audit event on OWNER override; AT-015 ensures blockers remain.

---

## DEC-009 — Port Instagram skill Python to TypeScript

**Status:** Proposed accept  
**Context:** MIT license; scripts are stdlib-only; Windows subprocess fragility.  
**Decision:** Reimplement `hookscore`, `caption`, `humanize`, `detect`, `swipe` algorithms in `server/validators/` and `server/ai/workflows/`; import JSON (`hooks.json`, `slop.json`, `rubric.json`) as data files with attribution in `NOTICE.md`.  
**Alternatives:** Spawn Python — rejected for deploy simplicity.  
**Verification:** Golden-file tests against upstream script output on sample fixtures.

---

## DEC-013 — Public media URLs for social publish

**Status:** Proposed accept  
**Context:** Meta Graph API (and peers) fetch media from public HTTPS URLs at publish time; adversarial review identified gap with upload-only MVP.  
**Decision (MVP):** Implement `MediaStorageProvider` with (a) catalogue/product public URLs where rights allow, (b) server-side upload to object storage (provider TBD: Vercel Blob, S3, Azure Blob) returning stable HTTPS URLs on `VisualAsset`.  
**Verification:** Publish integration test rejects non-HTTPS or workspace-local URLs.

---

## DEC-010 — Visual generation provider

**Status:** Unresolved  
**Context:** REQ-MDI-006; furniture imagery quality bar high.  
**Options:** OpenAI images, Flux via Replicate, manual upload only for MVP.  
**Proposal:** MVP = **upload + asset library** only; generation behind feature flag when provider chosen.

---

## DEC-011 — Single workspace vs multi-tenant

**Status:** Proposed (updated multi-brand)  
**Decision:** Data model supports multi-workspace **and** multi-brand per workspace. Production may use one workspace with many brands (agency/portfolio). Implement `workspaceId` on all tenant rows and `brandId` on brand-scoped rows (DEC-021). B&C is first **brand** seed, not a product singleton.

---

## DEC-021 — Multi-brand workspace model

**Status:** Proposed accept  
**Context:** Product pivot to brand-agnostic AI CMO; fix erroneous Workspace 1:1 `BrandProfile`.  
**Decision:**

- `Workspace` 1:N `Brand`; each `Brand` has 1:1 `BrandProfile` and brand-scoped ops entities.
- All brand-specific rows carry `workspaceId` + `brandId`; composite FK integrity `(workspaceId, brandId)`.
- Optional `BrandMember` restricts users to subset of brands; if unused, all workspace members access all `ACTIVE` brands.
- Archive via `Brand.status = ARCHIVED` — retain audit, approvals, published posts, analytics.

**Alternatives:** Separate workspace per brand — rejected (poor agency UX, duplicated integrations).  
**Verification:** AT-019–AT-024; `MULTI_BRAND_MIGRATION.md`.

---

## DEC-022 — Portfolio aggregation policy

**Status:** Proposed accept  
**Context:** REQ-PLAT-004 portfolio dashboard vs brand-scoped views.  
**Decision:**

- Portfolio endpoints only under `/workspaces/:workspaceId/portfolio/...` with `portfolio.read` capability.
- Aggregation = parallel per-brand queries for brands user may access; merge counts/KPIs in service layer.
- **Forbidden:** returning another brand’s entity payloads by id; portfolio responses label each slice with `brandId`.
- **Forbidden:** single AI prompt assembled from multiple brands’ `BrandRuleVersion` text.

**Verification:** AT-023; portfolio API tests.

---

## DEC-023 — Conversational AI CMO and agent scope

**Status:** Proposed accept  
**Context:** REQ-PLAT-005, REQ-PLAT-006; REF-OKARA-004 pattern.  
**Decision:**

- Active chat/session binds to exactly one `brandId` **or** explicit `portfolio` mode (read-only roll-up tools).
- Specialist agents (seven — see `ARCHITECTURE.md` §8b) invoke with `BrandContext` for that `brandId` only.
- Agents feed / terminal events stored with `brandId` or `scope=portfolio`.
- Job payloads for AI workflows include `brandId`; worker rejects mixed-brand entity lists.

**Verification:** AT-019, AT-020, AT-022.

---

## DEC-012 — Publishing idempotency

**Status:** Proposed accept  
**Decision:** Clients send `idempotencyKey` on publish; unique constraint prevents duplicate posts on retry.

---

## DEC-015 — Job claiming, leases, and publish reconciliation

**Status:** Proposed accept  
**Context:** F-003 — duplicate worker execution.  
**Decision:** Claim jobs in a transaction with row lock (`FOR UPDATE SKIP LOCKED` or Prisma equivalent pattern). Set `leasedBy`, `leasedUntil` (e.g. now + 5m), increment `attempts`. On success → `COMPLETED`; on retryable failure → `PENDING` with exponential `nextRunAt`; on exhaustion → `DEAD_LETTER`.  
**Publish-specific:** If connector returns timeout/unknown after request sent, set `PublicationAttempt.reconciliationStatus=PENDING_VERIFY` and run `PUBLISH_RECONCILE` job — **no** automatic republish until platform state known (AT-005). External idempotency via `PublicationAttempt.idempotencyKey` + platform keys when available.  
**Verification:** AT-004, AT-005, AT-007.

---

## DEC-016 — Publication package and approval binding

**Status:** Proposed accept  
**Context:** F-011 — variant/media/account changes bypass version-only hash.  
**Decision:** Human approves a **sealed `PublicationPackage`** (DEC-016 fields in `DATA_MODEL.md`). `ApprovalDecision` records `packageHashAtDecision`. Material change → new package → prior decisions do not authorize publish.  
**Verification:** AT-003, AT-013.

---

## DEC-017 — OAuth state transaction (single-use)

**Status:** Proposed accept  
**Context:** F-005 — signed state alone allows replay.  
**Decision:** On connect, persist `OAuthStateTransaction` with random `nonce`, `expiresAt` (≤10 min). Callback: verify HMAC `state`, match row, reject if `consumedAt` set; atomically set `consumedAt` before token exchange. Bind `workspaceId`, `userId`, `platform`, and provider app id.  
**Verification:** AT-006.

---

## DEC-018 — Credential encryption envelope

**Status:** Proposed accept (extends DEC-002)  
**Decision:** Ciphertext format and `credentialKeyVersion` on `IntegrationConnection` as documented under DEC-002. Failed decrypt → mark connection `health=error`, require reconnect.  
**Verification:** Rotation test decrypting old rows.

---

## DEC-019 — Capability-based authorization

**Status:** Proposed accept  
**Context:** F-008 — coarse roles over-grant power.  
**Decision:** Server enforces capabilities (see `API_CONTRACTS.md` § Capabilities). `WorkspaceRole` grants a default capability set; `TeamAssignment` duty flags add/remove capabilities without promoting role. UI visibility follows capabilities but **never** replaces server checks. Revoked membership → immediate 403 on all workspace routes.  
**Capabilities (MVP minimum):** `content.create`, `content.edit`, `content.approve`, `content.approve.self` (OWNER only), `content.approve.waive`, `content.publish`, `product.edit`, `commercial.campaign.manage`, `commercial.offer.manage`, `integration.manage`, `audit.read`, `settings.manage`.  
**Verification:** Matrix tests per route; AT-018.

---

## DEC-020 — Publication blockers vs waivers vs role overrides

**Status:** Proposed accept (product policy for waivable list confirmed with stakeholder — see Unresolved)  
**Context:** REQ-BRIEF-106; F-004.  
**Decision:**

| Class | Examples | Waivable? |
|-------|----------|-----------|
| **Hard blockers (non-waivable)** | Unapproved/superseded package hash; invalid/expired OAuth connection; asset `rightsStatus` not cleared; unsupported claim vs `allowedClaimIds`; AI/automation as approver; cross-tenant access | Never |
| **Commercial blockers (waivable with audit)** | Stale stock beyond TTL; expired offer; `OUT_OF_STOCK` when brief allows override | `content.approve.waive` or `commercial.offer.manage` + `QualityRunWaiver` record |
| **Quality warnings** | Editorial lint, hook score below threshold | May approve with warning visible per REQ-BRIEF-055 |
| **Role override (DEC-008)** | Creator self-approval | `OWNER` + `content.approve.self` only |

Pre-publish: re-run stock/offer/product snapshot freshness even if approved earlier (AT-008).  
**Verification:** AT-008, AT-015.

---

## DEC-014 — MVP publish bar (brief scheduling tension)

**Status:** Proposed accept  
**Context:** REQ-BRIEF-004 allows approved publishing via connected channels; REQ-BRIEF-097/071 require manual registration and export in v1; REQ-BRIEF-098 defers broader automation until access/data confirmed.  
**Decision (MVP):**

| In scope for v1 sign-off | Deferred (`DEF-008`) |
|--------------------------|----------------------|
| Export approved content package + manual URL registration | Calendar auto-fire at `scheduledAt` without human trigger |
| Connected **immediate** publish when integration + Meta review ready (user-initiated) | Unattended queue worker posting from calendar slots |
| Idempotent retries on failed API publish | Full multi-platform scheduling orchestration |

**Verification:** Screen 9 acceptance: manual path always works; connected publish behind capability flag; no cron-based publish until stakeholder lifts DEF-008.

---

## Security decisions (summary)

| Topic | Decision |
|-------|----------|
| Secrets in frontend | Forbidden |
| AI / automation self-approval | Forbidden (REQ-MDI-049) |
| Human creator self-approval | Forbidden except OWNER override (DEC-008) — not a blocker waiver |
| Unapproved / wrong package hash publish | Forbidden at service layer (DEC-016) |
| External HTML | Untrusted; sanitize |
| Competitor assets | Block at approval without rights |
| SSRF on research URLs | Blocked per `INTEGRATIONS.md` §15 |

---

## Unresolved decisions (documented — need product/legal input)

| ID | Topic | Impact if delayed | Recommended default |
|----|-------|-------------------|---------------------|
| U-001 | Exact waivable list for REQ-BRIEF-106 “explicitly handled by authorized approver” | Screen 8 waiver UI | Use DEC-020 table; stakeholder signs waivable commercial blockers |
| U-002 | `stockFreshnessHours` default (24h proposed) | False publish holds | 24h until catalogue sync frequency known |
| U-003 | DEC-004 Reddit live connector | Production research | Mock only |
| U-004 | DEC-005 web search provider | Live Screen 5 acceptance | Mock for UI; gate live on provider pick |
| U-005 | DEC-010 visual generation provider | Studio scope | Upload-only MVP |
| U-006 | Object storage provider for DEC-013 | Meta publish test | Vercel Blob or S3 — pick at Phase 1 |
| U-007 | Default active brand on login | UX confusion | Last-used brand per workspace in session |
| U-008 | Enforce `BrandMember` in MVP vs workspace-wide access | Security vs simplicity | Workspace-wide until second brand onboarded |
| U-009 | Shared integration connections across brands | Token duplication | Default per-brand; `IntegrationConnectionShare` when needed |

---

## DEC-024 — Local development database (MongoDB)

**Status:** Superseded by DEC-025 (2026-10-21)  
**Context:** Phase 1 scaffold used PostgreSQL + Prisma Migrate. Team preference: simpler local setup on Windows, document-oriented growth for brand config, and faster iteration without SQL migration churn during early schema changes.  
**Decision:** **Local dev** uses **MongoDB 7** with Prisma `provider = "mongodb"`. Schema sync via `prisma db push` + `npm run db:seed`. Docker Compose runs `mongo:7`.  
**Production:** Not locked in this ADR — managed PostgreSQL remains valid for hosted deploy (DEC-002 encryption, DEC-006 jobs, relational integrity). Revisit before production hardening.  
**Tradeoffs:** No Prisma Migrate history on Mongo; some Prisma features differ (no native `$queryRaw` SQL, no cross-collection transactions in older server versions, ObjectId string ids in app code). Auth.js Prisma adapter supports MongoDB with standard User/Account/Session/VerificationToken models (ObjectId ids).  
**Verification:** `npx prisma validate`, `npm run db:push`, `npm run db:seed`, login with seeded user.

---

## DEC-025 — Postgres + Object Storage on Neon (all environments)

**Status:** Accepted  
**Context:** DEC-015/016/012/021 rely on relational guarantees — row-locked job claims, unique idempotency keys, enforced foreign keys from source idea → publication → learning note, and DB-level brand isolation. On MongoDB these become app-code conventions, and transactions need a replica set the local single-node setup lacked. Prisma Migrate history is also SQL-only. DEC-013/U-006 needed a media store.  
**Decision:** Neon project `cmo-platform`, region `aws-eu-central-1` (Frankfurt, EU data residency for B&C). Prisma `provider = "postgresql"`: `url` = pooled `DATABASE_URL`, `directUrl` = `DATABASE_URL_UNPOOLED` for migrations. Object Storage bucket `media` (private), declared in root `neon.ts`; app stores object keys in Postgres and serves presigned GET URLs (`apps/web/server/storage/media.ts`, keys prefixed `workspaceId/brandId/`). Resolves U-006.  
**Consequences:** No Docker/local DB; developers use Neon branches (DB + bucket copy-on-write). Free tier scales to zero after 5 min idle — the job worker (DEC-006) must not busy-poll Postgres or it burns compute hours; wake on cron/signal. Composite tenant FKs (AT-021) can now be enforced in SQL — not yet done.  
**Verification:** `npm run db:migrate`, `npm run db:seed`, `npm run smoke:neon -w web`, login with seeded user.

---

## Change log

| Date | ADR | Change |
|------|-----|--------|
| 2026-10-21 | DEC-025 | Postgres + Object Storage on Neon; supersedes DEC-024; resolves U-006 |
| 2026-10-16 | DEC-024 | Local dev MongoDB + db push; PostgreSQL migrations archived |
| 2026-10-16 | All | Initial Phase 0 proposals |
| 2026-10-16 | DEC-008, DEC-013 | Adversarial review follow-up; tenant + publish guard doc sync |
| 2026-10-16 | Product scope | Functional brief (`BC_Social_Media_Agent_Functional_Brief.pdf`) is primary SoT for product; `REQ-BRIEF-*` in PRODUCT_REQUIREMENTS.md |
| 2026-10-16 | DEC-014 | MVP publish bar — immediate connected publish vs calendar automation |
| 2026-10-16 | DEC-015–020 | Phase 0.5 adversarial remediation (jobs, package, OAuth, capabilities, blockers) |
| 2026-10-16 | DEC-021–023 | Multi-brand model, portfolio policy, AI CMO scope |
