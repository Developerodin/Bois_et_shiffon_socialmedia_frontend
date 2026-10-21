# Findings Register — Adversarial Architecture Review (Phase 0.5)

**Review date:** 2026-10-16  
**Scope:** Eight Phase 0 documents + README + `.env.example`  
**Status:** Remediated in documentation (not verified by running application code — repo has no `src/` yet).

Severity: **P0** = fix before business features; **P1** = fix during foundation; **PX** = cross-cutting / publish-package specific.

---

## P0 — Critical

### F-001 — Workspace isolation incomplete on child entities

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Evidence** | `ARCHITECTURE.md` §4 requires `workspaceId` on every business row; `DATA_MODEL.md` scoped several children only via parent (`ProductAsset`, `ChannelVariant`, `QualityRun`, `Approval`, etc.). |
| **Attack** | Handler validates membership in workspace A but loads child record by UUID from workspace B. |
| **Remediation** | Direct `workspaceId` on API/worker-addressable children; composite unique/FK constraints `(workspaceId, parentId)`; service queries always filter `workspaceId`; document denial tests in `ADVERSARIAL_ACCEPTANCE_TESTS.md`. |
| **Verification** | Automated cross-workspace denial tests per endpoint; DB integration test rejecting cross-tenant FK insert. |

### F-002 — Approval history vs current state ambiguous

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Evidence** | One-to-one `ContentVersion` ↔ `Approval` implied mutable current record only. |
| **Attack** | Overwriting prior approval erases audit evidence; publish guard cannot prove which decision applied. |
| **Remediation** | Append-only `ApprovalDecision`; `PublicationPackageApprovalState` (or derived view) for current validity; hash-bound decisions; supersede on material change. |
| **Verification** | Transaction tests: approve → reject → history retains both; publish uses latest valid decision on matching hash only. |

### F-003 — Job concurrency / duplicate execution

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Evidence** | `API_CONTRACTS.md` §12 idempotent per job id only; no lease/claim. |
| **Attack** | Two workers claim same `PENDING` job → duplicate publish or collection. |
| **Remediation** | **DEC-015:** atomic claim (`FOR UPDATE SKIP LOCKED` or equivalent), `leasedUntil`, backoff, dead-letter, external idempotency keys; ambiguous publish → reconcile before retry. |
| **Verification** | Concurrent claim test (exactly one winner); lease expiry recovery test. |

### F-004 — Blocker override policy unresolved

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Evidence** | `PRODUCT_REQUIREMENTS.md` REQ-BRIEF-106; `DEC-008` OWNER override; API “blocking quality checks must pass” without waiver taxonomy. |
| **Attack** | OWNER separation-of-duties override treated as waiver for stock/rights/hash failures. |
| **Remediation** | **DEC-020:** hard blockers vs waivable checks vs role overrides; waiver audit records; non-waivable list. |
| **Verification** | API tests: OWNER cannot waive non-waivable; waivable waiver requires `commercial.offer.manage` or `content.approve.waive` capability. |

---

## P1 — High priority

### F-005 — OAuth replay and credential lifecycle

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | HMAC `state` in `INTEGRATIONS.md` §11 without single-use nonce store. |
| **Remediation** | **DEC-017** `OAuthStateTransaction`; **DEC-018** ciphertext format + key version; token refresh failure → `health=error`. |
| **Verification** | Reused state rejected; rotation decrypt test; expired token marks connection degraded. |

### F-006 — Dual state systems (`ContentWorkflowStatus` vs approval)

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | Both enums in `DATA_MODEL.md` without transition contract. |
| **Remediation** | Authoritative rules in `API_CONTRACTS.md` § State transitions; workflow status is UX/production tracking; publish authority = `PublicationPackage` + `ApprovalDecision` + freshness checks. |
| **Verification** | State machine unit tests; illegal transitions rejected. |

### F-007 — Campaign / offer / product freshness thin

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | REQ-BRIEF-012; `Product.price` float; no `Campaign`/`Offer` entities. |
| **Remediation** | `Campaign`, `Offer`, `ProductSnapshot` linkage on `PublicationPackage`; `Decimal` price; `stockCheckedAt` + freshness TTL; `UNKNOWN` ≠ `OUT_OF_STOCK`. |
| **Verification** | Publish blocked when stock stale; offer outside validity window. |

### F-008 — Role matrix too coarse

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | Broad `WorkspaceRole` in `API_CONTRACTS.md` §1. |
| **Remediation** | **DEC-019** capability checks on every mutating route; duty flags map to capabilities. |
| **Verification** | Capability denial tests per endpoint; revoked membership immediate 403. |

### F-009 — SSRF on research URLs

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | Untrusted input noted in `ARCHITECTURE.md` §8; connectors lacked fetch contract. |
| **Remediation** | `INTEGRATIONS.md` § SSRF-safe fetch; block private/metadata; redirect validation. |
| **Verification** | Redirect-to-`169.254.x` rejected; timeout/size limits enforced. |

### F-010 — Analytics semantics undefined

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | `AnalyticsSnapshot.metrics` JSON without availability semantics. |
| **Remediation** | Structured `MetricValue` with `status: available \| unavailable \| delayed`; import idempotency key; native vs normalized fields. |
| **Verification** | Missing metric renders unavailable (not 0); duplicate import no double-count. |

---

## PX — Publication package (§5 of review)

### F-011 — Publish guard bound to content version hash only

| Field | Detail |
|-------|--------|
| **Severity** | PX (treated as P0 for publish path) |
| **Evidence** | Image/variant/account change without `contentVersion` hash change could pass guard. |
| **Remediation** | **DEC-016** immutable `PublicationPackage` with `packageHash`; approval binds to package hash; material change creates new package version. |
| **Verification** | Replace image after approval → new package hash → publish blocked; variant URL change → reapproval. |

---

## Cross-document operational gaps (documented, not all P0)

| ID | Issue | Remediation doc |
|----|-------|-----------------|
| F-012 | Phase 0 marked “complete” vs production readiness | README + `IMPLEMENTATION_PLAN.md` → “documentation draft pending architecture sign-off” |
| F-013 | 90-day TTL without cleanup job | `DATA_MODEL.md` §7 + `Job` type `RETENTION_CLEANUP` |
| F-014 | `INTEGRATIONS_MODE=mock` isolation | `INTEGRATIONS.md` §10 + `.env.example` |
| F-015 | In-memory rate limits | `API_CONTRACTS.md` §16 → DB atomic quotas for MVP multi-instance |
| F-016 | Search provider deferred vs Screen 5 | `IMPLEMENTATION_PLAN.md` gate: mock UI vs live acceptance |
| F-017 | Visual generation unresolved | DEC-010 unchanged; upload-first |
| F-018 | `create-next-app@latest` unpinned | `IMPLEMENTATION_PLAN.md` pins Next.js 15 |

---

## Traceability

| Finding | Primary requirements |
|---------|---------------------|
| F-001 | REQ-MDI-042, REQ-MDI-035 |
| F-002, F-011 | REQ-BRIEF-003, REQ-MDI-009, REQ-MDI-048 |
| F-003 | REQ-MDI-051, DEC-006 |
| F-004 | REQ-BRIEF-106, REQ-BRIEF-065, DEC-008 |
| F-005 | REQ-MDI-040–041 |
| F-006 | REQ-BRIEF-063 |
| F-007 | REQ-BRIEF-012, REQ-MDI-063 |
| F-008 | REQ-BRIEF-002, REQ-MDI-042 |
| F-009 | REQ-MDI-047 |
| F-010 | REQ-BRIEF-019, REQ-BRIEF-089 |

---

## Multi-brand architecture (Phase 0.5+)

### F-019 — Workspace 1:1 BrandProfile cannot support multi-brand

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Evidence** | `DATA_MODEL.md` ERD `Workspace ||--|| BrandProfile`; singular `GET .../brand` in API. |
| **Attack** | Second brand onboarding overwrites or leaks first brand’s catalogue, opportunities, and AI context. |
| **Remediation** | **DEC-021:** `Brand` entity; `brandId` on brand-scoped rows; routes `.../brands/:brandId/...`. |
| **Verification** | AT-019, AT-020; seed B&C as one brand row. |

### F-020 — Missing brandId on job payloads and workers

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Evidence** | `ARCHITECTURE.md` §4 job rule cited `workspaceId` only; `Job` model without `brandId`. |
| **Attack** | Collection/publish job for brand A processes entity ids from brand B within same workspace. |
| **Remediation** | `Job.brandId` for brand-scoped types; payload validation `(workspaceId, brandId)` on all referenced ids. |
| **Verification** | AT-022. |

### F-021 — AI / conversational CMO cross-brand context mixing

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Evidence** | No brand binding on `AiWorkflowRun`; REF-OKARA multi-agent pattern without isolation guard. |
| **Attack** | Single chat or workflow loads rules/products from two brands → wrong claims in publish path. |
| **Remediation** | **DEC-023:** `BrandContext` loader; one `brandId` per run; portfolio mode uses aggregates only. |
| **Verification** | AT-019, AT-020. |

### F-022 — Portfolio dashboard implicit cross-brand access

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | Single `dashboard/today` without portfolio vs brand split. |
| **Attack** | User without access to brand B sees B’s pending approvals in workspace roll-up. |
| **Remediation** | **DEC-022:** `portfolio.read`; per-brand permission filter; labeled roll-up only. |
| **Verification** | AT-023. |

### F-023 — Archive brand data loss risk

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | Soft-delete patterns on `Product`/`ContentDraft` without brand lifecycle. |
| **Attack** | Deleting “brand” cascades audit/publish history. |
| **Remediation** | `Brand.status = ARCHIVED`; block new ops; retain immutable history tables. |
| **Verification** | AT-024. |

### F-024 — B&C hard-coded as product identity

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Evidence** | README and docs titled “B&C Social Media Agent”; implied single-tenant brand. |
| **Remediation** | Platform naming; B&C only in seed/fixture (`MULTI_BRAND_MIGRATION.md`); REQ-PLAT-001. |
| **Verification** | Grep gate: no `bois`/`B&C` in `src/` shared prompts (post-scaffold). |
