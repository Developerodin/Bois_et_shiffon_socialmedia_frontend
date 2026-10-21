# Data Model — Multi-Brand AI CMO Platform

Prisma-oriented entity design. **MVP** = required for Screens 1–11 initial vertical slices. **Later** = explicit deferral.

**Phase 0.5:** Tenant composite rules, `PublicationPackage`, append-only `ApprovalDecision`, job leases, campaign/offer, structured analytics — see `docs/FINDINGS_REGISTER.md`.  
**Multi-brand (DEC-021):** `Brand` under `Workspace`; brand-specific rows carry `brandId` + composite `(workspaceId, brandId)` integrity.

---

## 1. Conventions

- **Workspace** = org/team boundary (auth, billing, members). **Brand** = marketing scope (catalogue, content, integrations default).
- All **brand-specific** data scoped by `workspaceId` **and** `brandId` (except `User`, Auth.js tables, `Workspace`, `WorkspaceMember`, and optional workspace-only portfolio config)
- Child rows loaded by **API id** or **background workers** **must** store `workspaceId` and `brandId` directly — do not rely on join-only scoping
- **Composite tenant integrity:** for each parent/child pair, enforce child.`workspaceId` = parent.`workspaceId` **and** child.`brandId` = parent.`brandId` (Prisma: `@@index([workspaceId, brandId, parentId])`; migration SQL composite FKs where Prisma cannot express them)
- **Portfolio aggregation** does not use a shared “all brands” table — query per permitted `brandId` and merge in service layer (DEC-022)
- UUID primary keys (`@id @default(uuid())`)
- `createdAt` / `updatedAt` on all models
- Money: `price` / offer amounts as `Decimal` (`@db.Decimal(12, 2)`), never binary float
- Soft delete optional on `Product`, `ContentDraft` — use `archivedAt` when needed
- JSON columns for flexible metadata only when shape is validated at service boundary

### 1.1 Direct `workspaceId` + `brandId` on worker/API-addressable children

| Model | Why |
|-------|-----|
| `ProductAsset`, `ProductSnapshot` | Asset URLs fetched by id in publish/approval |
| `ChannelVariant`, `VisualAsset` | Variant/media changes affect publish package |
| `QualityRun`, `ReviewComment`, `ApprovalDecision` | Queried by version/package id |
| `SourceReference`, `OpportunityFeedback` | Collection provenance |
| `PublicationPackage`, `PublicationAttempt` | Publish worker |
| `AnalyticsSnapshot`, `LearningNote` | Import jobs |
| `OAuthStateTransaction` | Callback without path workspace; includes `brandId` when connection is brand-scoped |

### 1.2 Shared workspace assets (optional explicit share)

Some connections or media libraries may be **shared** across brands in one workspace:

| Model | Purpose |
|-------|---------|
| `SharedAsset` | Workspace-owned file/metadata; not brand-owned by default |
| `BrandAssetShare` | `sharedAssetId`, `brandId`, `permission` (`READ` / `USE_IN_PUBLISH`) |
| `IntegrationConnectionShare` | `connectionId`, `brandId`, `capabilities` subset |

Default: `IntegrationConnection.brandId` set — connection belongs to one brand. Share row grants another brand limited use without duplicating tokens.

---

## 2. Entity relationship overview

```mermaid
erDiagram
  Workspace ||--o{ WorkspaceMember : has
  User ||--o{ WorkspaceMember : belongs
  Workspace ||--o{ Brand : brands
  Brand ||--|| BrandProfile : profile
  Brand ||--o{ BrandMember : optional_access
  User ||--o{ BrandMember : brand_roles
  BrandProfile ||--o{ BrandRuleVersion : versions
  Brand ||--o{ Campaign : campaigns
  Campaign ||--o{ Offer : offers
  Brand ||--o{ Product : owns
  Product ||--o{ ProductAsset : has
  Product ||--o{ ProductSnapshot : snapshots
  Brand ||--o{ MonitoredSource : watches
  MonitoredSource ||--o{ CollectionRun : runs
  CollectionRun ||--o{ SourceReference : refs
  CollectionRun ||--o{ Opportunity : produces
  Opportunity ||--o{ OpportunityFeedback : feedback
  Brand ||--o{ ContentBrief : briefs
  ContentBrief ||--o{ ContentDraft : drafts
  ContentDraft ||--o{ ContentVersion : versions
  ContentDraft ||--o{ ChannelVariant : variants
  ContentDraft ||--o{ VisualAsset : visuals
  ContentDraft ||--o{ CalendarItem : scheduled
  ContentVersion ||--o{ QualityRun : checks
  ContentVersion ||--o{ ReviewComment : comments
  ContentDraft ||--o{ PublicationPackage : packages
  PublicationPackage ||--o{ ApprovalDecision : decisions
  PublicationPackage ||--o{ PublicationAttempt : attempts
  Brand ||--o{ IntegrationConnection : connects
  Workspace ||--o{ SharedAsset : shared_files
  Brand ||--o{ BrandAssetShare : shares
  PublicationAttempt ||--o| PublishedPost : results
  PublishedPost ||--o{ AnalyticsSnapshot : metrics
  PublishedPost ||--o{ LearningNote : learns
  Workspace ||--o{ Job : jobs
  Workspace ||--o{ AuditEvent : audits
  Workspace ||--o{ OAuthStateTransaction : oauth
```

---

## 3. MVP entities

### Identity & access

| Model | Key fields | Notes |
|-------|------------|-------|
| `User` | `email`, `name`, `image` | Auth.js adapter compatible |
| `Workspace` | `name`, `slug` | Org/team; may host many brands |
| `WorkspaceMember` | `workspaceId`, `userId`, `role` | Enum `WorkspaceRole` |
| `Session` / `Account` | per Auth.js | If using Auth.js Prisma adapter |

### Brand (DEC-021)

| Model | Key fields | Notes |
|-------|------------|-------|
| `Brand` | `workspaceId`, `slug`, `displayName`, `status` (`ACTIVE`/`ARCHIVED`), `archivedAt?` | Archive retains audit/publish history; blocks new ops |
| `BrandProfile` | `workspaceId`, `brandId`, `websiteUrl`, `voiceSummary`, `pillars` (Json), `locales` | 1:1 with `Brand`; Screen 2 onboarding per brand |
| `BrandRuleVersion` | `workspaceId`, `brandId`, `brandProfileId`, `version`, `allowedClaimIds`, `prohibitedClaims`, `visualGuidelines`, `effectiveAt` | Rules reference claim IDs |
| `BrandMember` | `workspaceId`, `brandId`, `userId`, `role?` | **Optional MVP:** if empty, all workspace members access all non-archived brands |
| `TeamAssignment` | `workspaceId`, `brandId?`, `userId`, `approvalDuty` | Per-brand duty flags when needed |

### Catalogue & commercial context (REQ-BRIEF-012)

| Model | Key fields | Notes |
|-------|------------|-------|
| `Product` | `workspaceId`, `brandId`, `sku`, `name`, `category`, `url`, `material`, `dimensions`, `price` (Decimal), `currency`, `stockStatus`, `stockCheckedAt`, `replenishmentEta?`, `priorityRank?` | `@@unique([brandId, sku])` |
| `ProductAsset` | `workspaceId`, `brandId`, `productId`, `type`, `url`, `alt`, `rightsStatus`, `contentHash?` | Publish package references asset hashes |
| `ApprovedClaim` | `workspaceId`, `brandId`, `productId?`, `brandProfileId`, `text`, `claimId` | Canonical grounding records |
| `ProductSnapshot` | `workspaceId`, `brandId`, `productId`, `payload` (Json), `capturedAt`, `source` | Immutable point-in-time; linked from `PublicationPackage` |
| `Campaign` | `workspaceId`, `brandId`, `name`, `objective`, `startAt`, `endAt`, `status` (`DRAFT`/`ACTIVE`/`ENDED`) | Editorial/commercial planning — not paid ads (REQ-MDI-020) |
| `Offer` | `workspaceId`, `brandId`, `campaignId?`, `name`, `terms`, `discountLabel?`, `startAt`, `endAt`, `status`, `eligibleProductIds` (Json) | Expired offer → publish blocker unless waived (DEC-020) |

**Stock freshness (REQ-MDI-063):** configurable `stockFreshnessHours` per **brand** (or workspace default), default 24. If `now - stockCheckedAt > TTL`, treat stock as **stale** for publish (hard blocker until refresh or explicit waivable policy).

### Research

| Model | Key fields | Notes |
|-------|------------|-------|
| `MonitoredSource` | `workspaceId`, `brandId`, `type`, `identifier`, `connectorId`, `scanFrequency`, `healthStatus` | Screen 5; per-brand watchlist |
| `CollectionRun` | `workspaceId`, `brandId`, `sourceId`, `status`, `startedAt`, `finishedAt`, `itemCount`, `error` | Logs |
| `SourceReference` | `workspaceId`, `brandId`, `runId`, `url`, `title`, `rawExcerpt`, `fetchedAt`, `fetchStatus` | Provenance; URL passed SSRF validator before fetch |
| `Opportunity` | `workspaceId`, `brandId`, `title`, `summary`, `score`, `dedupeKey`, `status`, `productId?` | Feed |
| `OpportunityFeedback` | `workspaceId`, `brandId`, `opportunityId`, `userId`, `action` (`SHORTLIST`/`REJECT`/`REQUEST_ANGLE`), `reason` | Matches API enum |

### Content

| Model | Key fields | Notes |
|-------|------------|-------|
| `ContentBrief` | `workspaceId`, `brandId`, `opportunityId?`, `objective`, `audience`, `cta`, `constraints` | Studio entry |
| `ContentDraft` | `workspaceId`, `brandId`, `briefId`, `parentIdeaId?`, `format`, `workflowStatus`, `currentVersionId?` | Publish guard uses `currentVersionId` |
| `ContentVersion` | `workspaceId`, `brandId`, `draftId`, `version`, `body` (Json), `contentHash`, `createdByUserId` | Immutable; DEC-008 uses `createdByUserId` |
| `ChannelVariant` | `workspaceId`, `brandId`, `draftId`, `platform`, `payload` (Json), `payloadHash` | Changes to CTA/URL/copy affect `PublicationPackage` hash |
| `VisualAsset` | `workspaceId`, `brandId`, `draftId`, `provider`, `url`, `status`, `rightsStatus`, `contentHash` | Generation coordination |
| `CalendarItem` | `workspaceId`, `brandId`, `draftId`, `scheduledAt`, `ownerId`, `productionStatus` | Screen 7 |

### Quality & approval

| Model | Key fields | Notes |
|-------|------------|-------|
| `QualityRun` | `workspaceId`, `brandId`, `contentVersionId`, `publicationPackageId?`, `checkType`, `severity` (`PASS`/`WARN`/`BLOCKER`), `result`, `details` (Json), `waivedAt?`, `waivedByUserId?`, `waiverReason?` | Blockers per REQ-BRIEF-055; waivers audited (DEC-020) |
| `ReviewComment` | `workspaceId`, `brandId`, `contentVersionId`, `userId`, `body`, `resolvedAt` | Thread |
| `ApprovalDecision` | `workspaceId`, `brandId`, `publicationPackageId`, `decision` (`APPROVED`/`REJECTED`/`CHANGES_REQUESTED`), `actorUserId`, `packageHashAtDecision`, `contentVersionId`, `comment?`, `createdAt` | **Append-only** — never update or delete |
| `PublicationPackageApprovalState` | `workspaceId`, `brandId`, `publicationPackageId`, `status`, `latestDecisionId`, `validForPackageHash` | Current approval validity; updated only when new decision applies to current hash |

**Deprecated pattern:** single mutable `Approval` row per version — replaced by decisions + package state (Phase 0.5).

### Publication package (DEC-016)

Immutable **sealed** package = exact publish intent. Material change → new package row (increment `packageVersion` on draft).

| Field group | Stored on `PublicationPackage` |
|-------------|-------------------------------|
| Target | `workspaceId`, `brandId`, `draftId`, `contentVersionId`, `connectionId`, `platform`, `accountExternalId` |
| Copy | `caption`, `slides` (Json), `metadata` (Json) — frozen at seal |
| Media | `mediaAssetRefs` (Json): `{ visualAssetId, contentHash, publicUrl }[]` |
| Destination | `destinationUrl`, `trackingParams` (Json) |
| Commercial | `productSnapshotIds[]`, `offerIds[]`, `campaignId?` |
| Integrity | `packageHash`, `sealedAt`, `supersededAt?`, `supersededByPackageId?` |

Seal operation computes `packageHash` = SHA-256 canonical JSON of publish-relevant fields. Approval binds to `packageHashAtDecision`.

### Integrations & publish

| Model | Key fields | Notes |
|-------|------------|-------|
| `IntegrationConnection` | `workspaceId`, `brandId`, `platform`, `accountLabel`, `accountExternalId`, `capabilities` (Json), `encryptedCredentials`, `credentialKeyVersion`, `health`, `lastSyncAt`, `tokenExpiresAt?` | Per-brand default; share via `IntegrationConnectionShare` |
| `OAuthStateTransaction` | `workspaceId`, `brandId`, `userId`, `platform`, `nonce`, `expiresAt`, `consumedAt?` | Single-use state (DEC-017) |
| `PublicationAttempt` | `workspaceId`, `brandId`, `publicationPackageId`, `connectionId`, `idempotencyKey`, `status`, `externalId?`, `reconciliationStatus?`, `error?` | Ambiguous timeout → `reconciliationStatus=PENDING_VERIFY` before retry |
| `PublishedPost` | `workspaceId`, `brandId`, `attemptId`, `platform`, `permalink`, `publishedAt` | Manual or API |

### Analytics & learning

| Model | Key fields | Notes |
|-------|------------|-------|
| `AnalyticsSnapshot` | `workspaceId`, `brandId`, `publishedPostId`, `periodStart`, `periodEnd`, `metrics` (Json), `source`, `importIdempotencyKey`, `collectedAt` | Metrics: see § Analytics metric shape |
| `LearningNote` | `workspaceId`, `brandId`, `publishedPostId?`, `opportunityId?`, `body`, `experimentTag` | Traceable |
| `UtmMapping` | `publishedPostId`, `campaign`, `parameters` (Json) | Optional MVP |

### System

| Model | Key fields | Notes |
|-------|------------|-------|
| `AuditEvent` | `workspaceId`, `brandId?`, `actorUserId`, `action`, `entityType`, `entityId`, `metadata` (Json) | `brandId` optional for workspace-level events |
| `AiWorkflowRun` | `workspaceId`, `brandId`, `workflowId`, `promptVersion`, `inputHash`, `status`, `tokenUsage`, `scope` (`brand`/`portfolio`) | Portfolio runs log `scope=portfolio` without mixing prompts |
| `Job` | `workspaceId`, `brandId?`, `type`, `payload`, `status`, `runAt`, `attempts`, `maxAttempts`, `leasedBy`, `leasedUntil`, `nextRunAt`, `deadLetterAt`, `externalIdempotencyKey?` | Brand-scoped jobs require `brandId`; workspace jobs (e.g. retention) may omit |

---

## 4. Later entities (not MVP)

| Model | When |
|-------|------|
| `AdCampaign`, `AdCreative` | Paid ads phase |
| `DmThread`, `AutoReplyRule` | Out of scope |
| `InfluencerCampaign` | Not in charter |
| `WebhookSubscription` | Enterprise integrations |
| `FeatureFlag` | Multi-tenant rollout |

---

## 5. Prisma sketch (illustrative excerpt)

Not applied until scaffold — names and relations for implementers:

```prisma
enum WorkspaceRole {
  OWNER
  ADMIN
  EDITOR
  REVIEWER
  VIEWER
}

enum ApprovalDecisionType {
  APPROVED
  REJECTED
  CHANGES_REQUESTED
}
// Current validity: PublicationPackageApprovalState.status (derived from latest decision on current packageHash)

// REQ-BRIEF-063 — content production workflow (distinct from ApprovalStatus)
enum ContentWorkflowStatus {
  SUGGESTED
  SHORTLISTED
  BRIEF_READY
  IN_PRODUCTION
  DRAFT_REVIEW
  AWAITING_APPROVAL
  APPROVED
  SCHEDULED
  PUBLISHED
  REVIEWED
  REJECTED
  BLOCKED
  CANCELLED
}

model Workspace {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  members   WorkspaceMember[]
  brands    Brand[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Brand {
  id          String   @id @default(uuid())
  workspaceId String
  slug        String
  displayName String
  status      BrandStatus @default(ACTIVE)
  profile     BrandProfile?
  @@unique([workspaceId, slug])
}

model ContentDraft {
  id                String   @id @default(uuid())
  workspaceId       String
  brandId           String
  briefId           String
  currentVersionId  String?
  workflowStatus    ContentWorkflowStatus
}

model ContentVersion {
  id              String   @id @default(uuid())
  workspaceId     String
  draftId         String
  version         Int
  body            Json
  contentHash     String
  createdByUserId String
  qualityRuns     QualityRun[]
  @@unique([draftId, version])
}

model PublicationPackage {
  id                String   @id @default(uuid())
  workspaceId       String
  brandId           String
  draftId           String
  contentVersionId  String
  connectionId      String
  packageHash       String
  sealedAt          DateTime
  @@index([workspaceId, brandId, draftId])
}
```

Full schema to be generated during Screen 1–2 scaffold with incremental migrations per screen.

---

## 6. Analytics metric shape (JSON validated at boundary)

Each metric key maps to:

```typescript
type MetricValue = {
  status: "available" | "unavailable" | "delayed";
  value?: number;           // present only when status === "available"
  unit?: string;            // e.g. "count", "percent", "seconds"
  nativeName?: string;      // platform field name
  normalizedName?: string;  // for cross-channel compare when valid
  observedAt?: string;      // ISO datetime
};
```

**Rules:** missing platform field → `unavailable` (UI must not show `0`). GA4 sessions ≠ Meta clicks — comparisons only where `normalizedName` explicitly aligned (REQ-BRIEF-089). `LearningNote` must cite `publishedPostId` + sample size when inferring patterns.

---

## 7. Indexing (MVP)

- `Opportunity(workspaceId, brandId, status, score DESC)`
- `CalendarItem(workspaceId, brandId, scheduledAt)`
- `PublicationAttempt(workspaceId, brandId, idempotencyKey)` unique
- `AnalyticsSnapshot(workspaceId, brandId, importIdempotencyKey)` unique
- `Brand(workspaceId, status)`
- `Job(status, runAt)` partial where `PENDING`
- `Job(leasedUntil)` where `RUNNING`
- `OAuthStateTransaction(nonce)` unique
- `AuditEvent(workspaceId, createdAt)`
- `Product(workspaceId, brandId, sku)` unique

---

## 8. Data retention

- Raw external excerpts: configurable TTL (default 90 days) — **DEC-007**; enforced by scheduled `Job` type `RETENTION_CLEANUP` (deletes `SourceReference.rawExcerpt` or archives row)
- Analytics snapshots: retain indefinitely; aggregate older than 24 months — later
