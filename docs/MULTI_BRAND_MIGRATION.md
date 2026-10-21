# Multi-Brand Migration & Seed Strategy

**Status:** Documentation (pre-scaffold)  
**Related:** DEC-021, DEC-022, `DATA_MODEL.md`, `IMPLEMENTATION_PLAN.md` Phase 1

---

## 1. Product pivot summary

The platform is a **brand-agnostic multi-brand AI CMO** product. **Bois & Chiffons (B&C)** is the first onboarded brand via seed data—not the product name, default tenant assumptions, or hard-coded prompts in shared code.

**Hierarchy:** Platform → `Workspace` (org/team) → **many `Brand`** → brand-scoped operations.

---

## 2. Schema direction (documentation only)

| Before (Phase 0.5) | After (multi-brand) |
|--------------------|---------------------|
| `Workspace` 1:1 `BrandProfile` | `Workspace` 1:N `Brand`; `BrandProfile` 1:1 per `Brand` (config child) |
| `workspaceId` only on ops rows | `workspaceId` + `brandId` on all brand-specific rows |
| Single implicit brand in routes `.../brand` | Canonical `.../brands/:brandId/...` |
| Jobs validate `workspaceId` only | Jobs validate `workspaceId` + `brandId` alignment on every payload entity id |

**Composite integrity:** child FKs enforce `(workspaceId, brandId)` matches parent row (see `DATA_MODEL.md` §1).

**Archive:** `Brand.status = ARCHIVED` hides brand from switcher and blocks new ops; **does not** delete `AuditEvent`, `PublishedPost`, `ApprovalDecision`, or analytics history.

---

## 3. Seed strategy — B&C as first brand

Execute after **`npm run db:push`** (or dedicated seed script `prisma/seed.ts`):

1. Create one `Workspace` (name/slug from env or seed config—**not** hard-coded in application services).
2. Create `Brand` record: `slug: bois-chiffons` (or stakeholder-provided), `displayName` from seed config, `status: ACTIVE`.
3. Create `BrandProfile` + initial `BrandRuleVersion` from **seed JSON** (`prisma/seeds/bc-brand.json`) or onboarding fixture—French locale, voice, pillars per functional brief **only in seed**, not in `server/ai/prompts` defaults.
4. Optional: seed demo `Product`, `MonitoredSource` rows scoped to `brandId`.
5. **No** `if (workspace.slug === 'bc')` branches in shared services, validators, or UI copy.

**Environment:** `SEED_BRANDS_PATH` or inline seed module; production onboarding uses UI/API (`POST .../brands`), not B&C-specific code paths.

---

## 4. API & UI migration (implementer checklist)

| Area | Action |
|------|--------|
| Route handlers | Move brand-scoped resources under `/api/v1/workspaces/:workspaceId/brands/:brandId/...` |
| Portfolio | Add `/api/v1/workspaces/:workspaceId/portfolio/...` (explicit scope only—DEC-022) |
| Middleware | `requireBrandAccess(workspaceId, brandId, userId)` after workspace membership |
| Session | Persist `activeBrandId` per workspace in session or client store; validate on each brand route |
| Jobs | Payload includes `brandId`; worker asserts all entity ids match `(workspaceId, brandId)` |
| AI workflows | `BrandContext` loaded once per request; refuse multi-brand tool batch in one run (DEC-023) |

**Deprecation:** singular `GET .../brand` may exist as alias to default/first brand **only during transition**—remove before Phase 2 Screen 5.

---

## 5. Data backfill (if migrating existing single-brand DB)

Not applicable until scaffold exists. When a single-brand schema exists:

1. Add `Brand` table; insert one row per workspace from legacy `BrandProfile`.
2. Add nullable `brandId` to brand-scoped tables; backfill from workspace’s sole brand.
3. Set `brandId` NOT NULL; add composite indexes and FKs.
4. Drop 1:1 `BrandProfile.workspaceId` unique in favor of `BrandProfile.brandId` unique.

---

## 6. Verification gates (before Screen 3+)

| Gate | Tests |
|------|-------|
| Cross-brand isolation | AT-019, AT-020, AT-021 |
| Cross-workspace (unchanged) | AT-001, AT-002, AT-017 |
| Job scope | AT-022 |
| Portfolio unauthorized | AT-023 |
| Archived brand | AT-024 |

See `docs/ADVERSARIAL_ACCEPTANCE_TESTS.md`.

---

## 7. Open items

| ID | Topic | Owner |
|----|-------|-------|
| U-007 | Default brand on first login (last-used vs first active) | Product |
| U-008 | `BrandMember` vs workspace-only roles for brand restriction | DEC-021 |
| U-009 | Shared `IntegrationConnection` across brands (explicit share model) | DEC-022 / DATA_MODEL |
