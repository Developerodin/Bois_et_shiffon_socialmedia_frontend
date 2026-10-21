# API Contracts — Multi-Brand AI CMO Platform

**Style:** Next.js Route Handlers under `/api/v1/...` (version prefix for future compatibility).  
**Format:** JSON request/response; errors use RFC 7807-like shape `{ type, title, status, detail, errors? }`.  
**Auth:** Session cookie (Auth.js, DEC-001); session cookie uses `SameSite=Lax` and CSRF protection per Auth.js defaults on mutating routes.

**Workspace context:** Routes under `/api/v1/workspaces/:workspaceId/...` are canonical. If `X-Workspace-Id` is sent, it **must equal** `:workspaceId`; mismatch → `403`. Every handler calls `requireWorkspaceMember(session.userId, workspaceId)` before service logic (prevents header/path IDOR).

**Brand context (DEC-021):** Brand-scoped resources live under `/api/v1/workspaces/:workspaceId/brands/:brandId/...`. If `X-Brand-Id` is sent on brand routes, it **must equal** `:brandId`; mismatch → `403`. Handlers call `requireBrandAccess(workspaceId, brandId, userId)` and assert every loaded entity’s `(workspaceId, brandId)` matches the path. **Archived** brands → `409` on mutating routes; read allowed for history where capability permits.

**Portfolio context (DEC-022):** Aggregates only under `/api/v1/workspaces/:workspaceId/portfolio/...` — never reuse brand-scoped entity ids across brands in one response body without explicit `brandId` on each item.

---

## 1. Capabilities (authoritative — DEC-019)

Every mutating handler calls `requireCapability(workspaceId, userId, capability)` **and** brand access when under `.../brands/:brandId/...`. `WorkspaceRole` supplies defaults; duty flags on `TeamAssignment` may add capabilities without changing role. Optional `BrandMember` may restrict which brands a user sees (DEC-021).

| Capability | Default roles | Notes |
|------------|---------------|-------|
| `brand.manage` | ADMIN+ | Create/archive brands, onboard profile |
| `brand.read` | all members | List brands user can access |
| `portfolio.read` | ADMIN+ (default) | Workspace roll-up dashboards (DEC-022) |
| `content.read` | all members | Brand-scoped when in brand routes |
| `content.create` | EDITOR+ | |
| `content.edit` | EDITOR+ | |
| `content.approve` | REVIEWER+, ADMIN | Brand approver duty |
| `content.approve.self` | OWNER only | DEC-008 separation override |
| `content.approve.waive` | ADMIN+ with commercial duty | Waive **waivable** blockers only (DEC-020) |
| `content.publish` | ADMIN, OWNER | |
| `product.edit` | EDITOR+ | |
| `commercial.campaign.manage` | ADMIN+ | Commercial owner duty |
| `commercial.offer.manage` | ADMIN+ | Offer validity waivers |
| `integration.manage` | ADMIN+ | OAuth connect/disconnect |
| `audit.read` | ADMIN+ | |
| `settings.manage` | ADMIN+ | |

Publish requires `content.publish` **and** valid `PublicationPackage` + `ApprovalDecision` (service checks — not capability alone).

### Role matrix (UI hint only — server uses capabilities)

| Role | Typical capabilities |
|------|-------------------|
| VIEWER | `content.read` |
| REVIEWER | + `content.approve` |
| EDITOR | + `content.create`, `content.edit`, `product.edit` |
| ADMIN | + `content.publish`, `integration.manage`, `commercial.*`, `audit.read`, `settings.manage` |
| OWNER | all + `content.approve.self` |

### Brief role mapping (REQ-BRIEF-002)

Operational duties are **separate from** `WorkspaceRole` even when one user holds multiple hats:

| Brief role | Typical `WorkspaceRole` | Capabilities |
|------------|-------------------------|--------------|
| Social media manager | `EDITOR` or `ADMIN` | Opportunities, calendar, convert to brief |
| Designer / editor | `EDITOR` | Drafts, assets, production states |
| Brand approver | `REVIEWER` or `ADMIN` | Approve / reject / request changes (REQ-BRIEF-065) |
| Commercial owner | `ADMIN` (duty flag) | Product priorities, campaigns, offer rules (REQ-BRIEF-012) |

`TeamAssignment.approvalDuty` / settings flags should encode approver and commercial-owner duties without collapsing permissions (see DEC-008).

**Revoked membership:** cache membership per request; on 403 do not leak whether resource id exists (AT-001).

**Cross-workspace denial:** all `:entityId` routes must scope `where: { id: entityId, workspaceId }` (and `brandId` on brand routes) — document tests in `ADVERSARIAL_ACCEPTANCE_TESTS.md`.

---

## 1b. State transitions (`ContentWorkflowStatus`)

`ContentWorkflowStatus` tracks production/calendar UX (REQ-BRIEF-063). It does **not** authorize publish.

| From | To | Requires | Side effects |
|------|-----|----------|--------------|
| `*` → `AWAITING_APPROVAL` | Editor submits for review | `content.edit` | Notify approvers |
| `AWAITING_APPROVAL` → `APPROVED` | Package approved | Valid `ApprovalDecision` on current `PublicationPackage` | Update workflow mirror only |
| `APPROVED` → `IN_PRODUCTION` / `DRAFT_REVIEW` | Changes requested | `ApprovalDecision` = `CHANGES_REQUESTED` | Invalidate pending publish |
| `APPROVED` → `PUBLISHED` | Successful publish or manual registration | `PublishedPost` created | Set only after publish succeeds |
| Any → `BLOCKED` | Hard blocker on quality run | — | Surface blockers in UI |

Illegal transitions return `409`. Publish service ignores `workflowStatus === APPROVED` unless package approval state matches.

---

## 2. Common Zod primitives

```typescript
// lib/schemas/common.ts (to be created)
export const WorkspaceId = z.string().uuid();
export const BrandId = z.string().uuid();
export const Pagination = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});
export const ApiError = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  errors: z.record(z.array(z.string())).optional(),
});
```

---

## 3. Workspace & auth

| Method | Path | Permission | Request | Response |
|--------|------|------------|---------|----------|
| GET | `/api/v1/me` | authenticated | — | `{ user, workspaces[] }` |
| POST | `/api/v1/workspaces` | authenticated | `CreateWorkspace` | `Workspace` |
| GET | `/api/v1/workspaces/:workspaceId` | member | — | `WorkspaceDetail` |

```typescript
const CreateWorkspace = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});
```

---

## 3b. Brands (workspace level)

| Method | Path | Capability | Notes |
|--------|------|------------|-------|
| GET | `.../brands` | `brand.read` | Brands user may access; includes `status` |
| POST | `.../brands` | `brand.manage` | Onboard new brand (REQ-PLAT-001) |
| GET | `.../brands/:brandId` | `brand.read` | Brand + profile summary |
| PATCH | `.../brands/:brandId` | `brand.manage` | Display name; `ARCHIVED` sets `archivedAt` |
| GET | `.../brands/:brandId/members` | `brand.manage` | Optional `BrandMember` list |
| PUT | `.../brands/:brandId/members/:userId` | `brand.manage` | Grant/revoke brand access |

```typescript
const CreateBrand = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(120),
  websiteUrl: z.string().url().optional(),
  locales: z.array(z.string()).optional(),
});
```

---

## 3c. Portfolio (workspace roll-up — DEC-022)

| Method | Path | Capability | Notes |
|--------|------|------------|-------|
| GET | `.../portfolio/dashboard` | `portfolio.read` | Counts/alerts per brand; no cross-brand content bodies |
| GET | `.../portfolio/analytics/summary` | `portfolio.read` | Aggregated KPIs with `brandId` breakdown |

Portfolio handlers **must not** accept arbitrary `brandId` list from client without verifying user has `brand.read` on each id.

---

## 4. Brand profile & rules (Screen 2)

Prefix: `.../brands/:brandId/...`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `.../profile` | VIEWER+ | Brand profile + active rule version |
| PUT | `.../profile` | ADMIN+ | Update profile fields |
| POST | `.../profile/rules` | ADMIN+ | New `BrandRuleVersion` |
| GET | `.../profile/rules` | VIEWER+ | List versions |

```typescript
const BrandProfileUpdate = z.object({
  websiteUrl: z.string().url().optional(),
  voiceSummary: z.string().max(8000).optional(),
  pillars: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
  locales: z.array(z.string()).optional(),
});

const BrandRuleCreate = z.object({
  allowedClaimIds: z.array(z.string().min(1)),
  prohibitedClaims: z.array(z.string()),
  visualGuidelines: z.string().max(16000),
  effectiveAt: z.coerce.date().optional(),
});
```

---

## 5. Products (Screen 3)

All paths under `.../brands/:brandId/...`.

| Method | Path | Permission |
|--------|------|------------|
| GET | `.../products` | VIEWER+ |
| POST | `.../products` | EDITOR+ |
| GET | `.../products/:productId` | VIEWER+ |
| PATCH | `.../products/:productId` | EDITOR+ |
| DELETE | `.../products/:productId` | ADMIN+ |
| POST | `.../products/:productId/snapshots` | EDITOR+ |
| GET/POST | `.../campaigns` | `commercial.campaign.manage` / `content.read` |
| GET/PATCH | `.../campaigns/:campaignId` | manage / read |
| GET/POST | `.../offers` | `commercial.offer.manage` / read |

```typescript
const ProductCreate = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  category: z.string().optional(),
  url: z.string().url().optional(),
  material: z.string().optional(),
  dimensions: z.string().optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), // decimal string → Prisma Decimal
  currency: z.string().length(3).optional(),
  stockStatus: z.enum(["IN_STOCK", "LOW", "OUT_OF_STOCK", "UNKNOWN"]),
});
```

---

## 6. Dashboard (Screen 4)

| Method | Path | Permission | Response |
|--------|------|------------|----------|
| GET | `.../brands/:brandId/dashboard/today` | VIEWER+ | `TodaySummary` (brand-scoped) |
| GET | `.../portfolio/dashboard/today` | `portfolio.read` | `PortfolioTodaySummary` (per-brand slices) |

```typescript
const TodaySummary = z.object({
  opportunitiesAwaitingReview: z.number(),
  pendingApprovals: z.number(),
  upcomingDeadlines: z.array(z.object({ calendarItemId: z.string().uuid(), dueAt: z.string().datetime() })),
  alerts: z.array(z.object({ code: z.string(), message: z.string(), severity: z.enum(["info", "warn", "error"]) })),
});
```

---

## 7. Research (Screen 5)

| Method | Path | Permission |
|--------|------|------------|
| GET | `.../sources` | VIEWER+ |
| POST | `.../sources` | ADMIN+ |
| PATCH | `.../sources/:sourceId` | ADMIN+ |
| POST | `.../sources/:sourceId/collect` | EDITOR+ | triggers `Job` |
| GET | `.../collection-runs` | VIEWER+ |
| GET | `.../opportunities` | VIEWER+ |
| POST | `.../opportunities/:id/feedback` | EDITOR+ |

```typescript
const OpportunityFeedback = z.object({
  action: z.enum(["SHORTLIST", "REJECT", "REQUEST_ANGLE"]),
  reason: z.string().max(2000).optional(),
  alternativeAngle: z.string().max(4000).optional(),
});
```

---

## 8. Content studio (Screen 6)

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `.../briefs` | EDITOR+ |
| GET/POST | `.../drafts` | EDITOR+ |
| POST | `.../drafts/:draftId/versions` | EDITOR+ |
| POST | `.../drafts/:draftId/generate` | EDITOR+ | AI workflow |
| POST | `.../drafts/:draftId/variants` | EDITOR+ |
| GET | `.../drafts/:draftId/versions` | VIEWER+ |

```typescript
const GenerateDraft = z.object({
  workflow: z.enum(["CAPTION", "CAROUSEL", "REEL_SCRIPT", "REPURPOSE", "CHANNEL_ADAPT"]),
  options: z.record(z.unknown()).optional(),
});

const ContentVersionBody = z.object({
  caption: z.string().optional(),
  slides: z.array(z.object({ headline: z.string(), body: z.string() })).optional(),
  reelScript: z.object({ hook: z.string(), beats: z.array(z.string()) }).optional(),
});
```

---

## 9. Calendar (Screen 7)

| Method | Path | Permission |
|--------|------|------------|
| GET | `.../calendar` | VIEWER+ | query `from`, `to` |
| POST | `.../calendar/items` | EDITOR+ |
| PATCH | `.../calendar/items/:id` | EDITOR+ |

---

## 10. Publication packages & approval (Screen 8)

| Method | Path | Capability |
|--------|------|------------|
| POST | `.../drafts/:draftId/publication-packages/seal` | `content.edit` | Build + seal package from current version + variant + media + connection |
| GET | `.../publication-packages/:packageId` | `content.read` |
| POST | `.../publication-packages/:packageId/quality-runs` | `content.edit` |
| GET | `.../publication-packages/:packageId/quality-runs` | `content.read` |
| POST | `.../versions/:versionId/comments` | `content.approve` |
| POST | `.../publication-packages/:packageId/approve` | `content.approve` | DEC-008 + DEC-016 |
| POST | `.../publication-packages/:packageId/reject` | `content.approve` |
| POST | `.../publication-packages/:packageId/waive-blocker` | `content.approve.waive` | Waivable checks only (DEC-020) |

```typescript
const SealPublicationPackage = z.object({
  contentVersionId: z.string().uuid(),
  connectionId: z.string().uuid(),
  channelVariantId: z.string().uuid().optional(),
  visualAssetIds: z.array(z.string().uuid()).min(1),
  destinationUrl: z.string().url(),
  trackingParams: z.record(z.string()).optional(),
  productSnapshotIds: z.array(z.string().uuid()),
  offerIds: z.array(z.string().uuid()).optional(),
  campaignId: z.string().uuid().optional(),
});

const ApprovePackage = z.object({
  comment: z.string().max(2000).optional(),
  ownerSeparationOverride: z.boolean().optional(), // requires content.approve.self
});

const WaiveBlocker = z.object({
  qualityRunId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});
// Server asserts: non-waivable blockers → 403; append ApprovalDecision; update PublicationPackageApprovalState
```

---

## 11. Publishing (Screen 9)

| Method | Path | Capability |
|--------|------|------------|
| POST | `.../publication-packages/:packageId/publish` | `content.publish` |
| POST | `.../publications/manual` | `content.publish` | register manual post |
| GET | `.../publications` | `content.read` |

```typescript
const PublishRequest = z.object({
  idempotencyKey: z.string().min(8).max(128),
});
// Connected scheduling deferred (REQ-BRIEF-098, DEF-008). Publish is immediate when integration supports it.

const ManualPublication = z.object({
  publicationPackageId: z.string().uuid(),
  platform: z.string(),
  permalink: z.string().url(),
  publishedAt: z.string().datetime(),
});
```

**Server guards (DEC-016, DEC-020):** latest `ApprovalDecision` = `APPROVED` with matching `packageHash`; package not superseded; `contentVersionId` = `draft.currentVersionId`; connection `health=healthy` and capability `publish`; fresh stock/offer validation; no non-waivable `QualityRun` blockers; `mediaUrls` public HTTPS (DEC-013); ambiguous prior attempt → reconcile (DEC-015).

---

## 12. Background jobs (DEC-006, DEC-015)

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| POST | `/api/v1/jobs/run` | `Authorization: Bearer ${CRON_SECRET}` | Claims batch of jobs atomically; respects leases |

**Claim algorithm (documented contract):**

1. `BEGIN` transaction.
2. Select up to N rows `WHERE status='PENDING' AND runAt<=now() AND (leasedUntil IS NULL OR leasedUntil < now()) ORDER BY runAt FOR UPDATE SKIP LOCKED`.
3. Update each to `RUNNING`, set `leasedBy`, `leasedUntil=now()+interval`.
4. `COMMIT`; process outside transaction; on success/failure update status per DEC-015.

Worker validates every entity id in `payload` belongs to `Job.workspaceId` and, when `Job.brandId` is set, to that `(workspaceId, brandId)`. Job handlers must be idempotent. Publish jobs honor `PublicationAttempt.reconciliationStatus`.

---

## 13. Analytics (Screen 10)

| Method | Path | Capability |
|--------|------|------------|
| POST | `.../analytics/import` | `settings.manage` or dedicated `analytics.import` (ADMIN+) |
| GET | `.../analytics/posts/:publishedPostId` | `content.read` |
| GET/POST | `.../learning-notes` | `content.edit` |

```typescript
const AnalyticsImport = z.object({
  publishedPostId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  source: z.enum(["META", "LINKEDIN", "GA4", "GSC", "MANUAL"]),
  importIdempotencyKey: z.string().min(8).max(128),
  metrics: z.record(z.object({
    status: z.enum(["available", "unavailable", "delayed"]),
    value: z.number().optional(),
    unit: z.string().optional(),
    nativeName: z.string().optional(),
    normalizedName: z.string().optional(),
    observedAt: z.string().datetime().optional(),
  })),
});
// Unique (workspaceId, importIdempotencyKey) — AT-016
```

---

## 14. Integrations & settings (Screen 11)

| Method | Path | Permission |
|--------|------|------------|
| GET | `.../integrations` | ADMIN+ |
| POST | `.../integrations/:platform/connect` | ADMIN+ | returns OAuth URL |
| DELETE | `.../integrations/:connectionId` | ADMIN+ |
| GET | `.../audit-events` | ADMIN+ |
| GET/PATCH | `.../settings/ai` | ADMIN+ |

OAuth callbacks (no workspace in path):

| Method | Path |
|--------|------|
| GET | `/api/v1/oauth/meta/callback` |
| GET | `/api/v1/oauth/linkedin/callback` |
| ... | per platform |

**OAuth `state`:** HMAC-signed payload `{ workspaceId, userId, platform, nonce, exp }` verified server-side; reject expired or tampered state (see INTEGRATIONS § OAuth).

---

## 15. Webhooks (later)

Not MVP. Platforms may use polling + scheduled import instead.

---

## 16. Rate limiting (planned)

- Per-workspace AI generation: configurable daily cap in settings
- Per-connection API: respect platform limits in connector

Implementation: **database-backed atomic counters** per workspace/day for MVP (safe with multiple serverless instances). Redis optional later.
