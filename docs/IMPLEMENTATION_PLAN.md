# Implementation Plan — Multi-Brand AI CMO Platform

Phased delivery aligned with Master Development Instructions Screens 1–11.

---

## Phase 0 — Audit

**Status:** Documentation draft complete — **pending architecture sign-off** (not production-ready)  
**Deliverables:** `docs/*`, `.env.example`, `README.md`, `BC_Social_Media_Agent_Functional_Brief.pdf`, skill vendor clone (gitignored)

**Exit criteria**

- [x] Repo vs stack discrepancy reported
- [x] Skill audit and mapping
- [x] Blueprint documents
- [x] Functional brief PDF extracted — `REQ-BRIEF-001`–`110` in `docs/PRODUCT_REQUIREMENTS.md`
- [x] Initial adversarial review doc corrections

---

## Phase 0.5 — Adversarial remediation + multi-brand architecture

**Status:** Documentation updated in repo — **pending stakeholder sign-off**  
**Deliverables:** `FINDINGS_REGISTER.md`, `ADVERSARIAL_ACCEPTANCE_TESTS.md`, `MULTI_BRAND_MIGRATION.md`, revised architecture/data/API/decisions/integrations/design

**Exit criteria (documentation)**

- [x] P0 findings F-001–F-004 + F-011 addressed in docs
- [x] P1 findings F-005–F-010 addressed in docs
- [x] Multi-brand findings F-019–F-024 addressed in docs
- [x] Next.js 15 stack pinned below
- [ ] Product sign-off on DEC-020 waivable blocker list (U-001)
- [ ] Architecture sign-off to start Phase 1 scaffold

**Implementation gate (post-scaffold):** AT-001, AT-002, AT-017 **and AT-019–AT-024** passing in CI **before Screen 3** (multi-brand isolation before feature screens).

---

## Stage 0 — Blueprint blockers (before feature code)

Per adversarial review §6 — complete Phase 0.5 sign-off, then scaffold only:

1. Tenant isolation helpers + composite FK migrations (`workspaceId` + `brandId`)
2. `Brand` / `BrandProfile` model + B&C seed per `MULTI_BRAND_MIGRATION.md`
3. `PublicationPackage` + `ApprovalDecision` services (stubs OK in Phase 1)
4. Job claim module + cron contract (`brandId` validation in payload)
5. OAuth transaction table + encryption envelope (`brandId` on connect)
6. Capability middleware + `requireBrandAccess`
7. Multi-brand adversarial tests AT-019–AT-024 in Phase 1 (before Screen 3)

---

## Pre-development confirmation (`REQ-BRIEF-102`)

Stakeholder sign-off in onboarding/settings (not hard-coded in prompts). Track completion before Screen 5 goes live:

- Brand guidelines, audiences, primary language
- Source watchlist and scan expectations
- Product catalogue + stock data source
- Active channels (five groups) and weekly production capacity
- Named approvers and commercial owner duties
- Analytics / GSC / GA4 access and assisted-conversion definition

---

## Phase 1 — Foundation scaffold

**Status:** **In progress** — Screen 1.1–1.2 largely complete; AT-023–024 and Playwright 1.3 remain.

**Goal:** Runnable Next.js app with DB, auth skeleton, design tokens, CI scripts.

**Pinned stack (REQ-MDI-031):** Next.js **15.x** (App Router), React 19, TypeScript 5.x, Node 20 or 22 LTS, npm.

| Task | Output | Status |
|------|--------|--------|
| `npx create-next-app@15` with `--ts --tailwind --eslint --app --no-src-dir` (or equivalent flags for v15) — **do not use `@latest` unpinned** | `apps/web/package.json` (`next@15.5.28`) | Done |
| Add Prisma + Postgres on Neon (DEC-025) | `apps/web/prisma/schema.prisma` User/Workspace/**Brand**/BrandProfile | Done |
| Seed first brand (B&C) | `prisma/seed.ts` + `prisma/seeds/bc-brand.json` | Done |
| Add Vitest + Playwright | `vitest.config.ts`, `playwright.config.ts`, AT-001–002/017/019–022 | Partial |
| Add shadcn init | `components.json`, Button/Input/Badge/Dropdown/Sheet/Avatar | Done |
| Scripts: `lint`, `test`, `test:e2e`, `db:migrate`, `typecheck`, root `dev:web` | Root + `apps/web` `package.json` | Done |
| Auth.js wiring (per DEC-001) | `auth.ts`, `/login` | Done |
| Tenant + brand + capability test harness | AT-001/002/017/019–022 Vitest; AT-023–024 pending | Partial |
| Env + Windows setup doc | `.env.example`, `docs/ENV_SETUP.md`, `neon.ts` | Done |
| Application shell 1.1 | Live switchers, cookies, `GET /api/v1/me`, brands list API | Done |

**Dependencies:** Phase 0.5 architecture sign-off; DEC-001 accepted (or explicit waiver for login stub only); Postgres on Neon (DEC-025).

---

## Phase 2 — Screens (vertical slices)

Implement in order; do not skip approval/publish guards on later screens.

### Screen 1: Application shell

| Slice | Scope | Status |
|-------|--------|--------|
| 1.1 | Layout, sidebar, header, workspace selector, **brand switcher** (REQ-PLAT-002) | **Done** |
| 1.2 | Design tokens + shadcn primitives | **Done** |
| 1.3 | Playwright: navigation smoke | Pending |

### Screen 2: Brand onboarding

| Slice | Scope |
|-------|--------|
| 2.1 | Brand + profile CRUD API under `.../brands/:brandId` |
| 2.2 | Rule versioning UI |
| 2.3 | Team roles assignment |

### Screen 3: Product catalogue

| Slice | Scope |
|-------|--------|
| 3.1 | Product CRUD + validation |
| 3.2 | Assets + approved claims |
| 3.3 | Snapshots on demand |

### Screen 4: Today dashboard

| Slice | Scope |
|-------|--------|
| 4.1 | Aggregations API |
| 4.2 | Alert cards (stale stock, integration health) |

### Screen 5: Opportunity research

| Slice | Scope |
|-------|--------|
| 5.1 | Sources + collection jobs |
| 5.2 | Mock research connector |
| 5.3 | Opportunity feed + feedback |

### Screen 6: Content studio

| Slice | Scope |
|-------|--------|
| 6.1 | Brief + draft versions |
| 6.2 | AI caption/reel workflows + TS hook/caption lint |
| 6.3 | Carousel planner + channel variants |
| 6.4 | Visual provider stub |

### Screen 7: Calendar & production

| Slice | Scope |
|-------|--------|
| 7.1 | Calendar views |
| 7.2 | Production status + overdue |

### Screen 8: Quality & approval

| Slice | Scope |
|-------|--------|
| 8.1 | Quality runs (brand + fact validators) + blocker/waiver taxonomy (DEC-020) |
| 8.2 | Review comments |
| 8.3 | `PublicationPackage` seal + `ApprovalDecision` history |

### Screen 9: Publishing

| Slice | Scope |
|-------|--------|
| 9.1 | Manual publication registration |
| 9.2 | Meta mock publish + real connector behind flag |
| 9.3 | Idempotency + retries |

### Screen 10: Performance & learning

| Slice | Scope |
|-------|--------|
| 10.1 | Analytics import (mock) |
| 10.2 | Learning notes + post linkage |
| 10.3 | Weekly pattern summary + business KPI report (REQ-BRIEF-088, 094–095) |

### Screen 11: Integrations & settings

| Slice | Scope |
|-------|--------|
| 11.1 | Connection list + OAuth start (Meta first) |
| 11.2 | AI provider settings + audit log viewer |

---

## Cross-cutting workstreams

| Workstream | When |
|------------|------|
| Port `hookscore` / `caption.py` / `humanize.py` logic to TS | Screen 6 |
| Audit logging | Screen 2+ for rules; all approvals |
| Workspace auth tests | Each screen |
| `.env.example` maintenance | Each integration |

---

## Windows foundation setup

Execute in **PowerShell** (admin for installs optional).

### 1. Git

```powershell
git --version
```

Install [Git for Windows](https://git-scm.com/download/win) if missing.

### 2. Node.js

Use **Node 20 LTS** or **22 LTS** (Next.js 15 compatible).

```powershell
node -v   # expect v20.x or v22.x
npm -v
```

Install via [nodejs.org](https://nodejs.org/) or `winget install OpenJS.NodeJS.LTS`.

### 3. Database (Neon)

No local database. `npx neon@latest login` then `npx neon@latest env pull` — see `docs/ENV_SETUP.md`.

### 4. Clone / open project

```powershell
cd "C:\Users\INTEL\Desktop\Social Media Agent"
git init   # if not already a repo
```

### 5. Optional: Python 3 (dev only)

Only needed to run upstream skill scripts locally for comparison — **not** production dependency.

```powershell
python --version
```

### 6. After Phase 1 scaffold (future)

```powershell
npm install
copy .env.example .env
# Edit .env with DATABASE_URL and AUTH_SECRET (openssl rand -base64 32)
npx prisma db push
npm run dev
```

### 7. npm scripts to add in Phase 1

| Script | Command |
|--------|---------|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `next lint` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:e2e` | `playwright test` |
| `db:migrate` | `prisma migrate dev` |
| `db:studio` | `prisma studio` |
| `typecheck` | `tsc --noEmit` |

---

## External accounts checklist

| Service | Purpose | When needed |
|---------|---------|-------------|
| Meta Developer | IG/FB OAuth, publish | Screen 9 |
| LinkedIn Developer | Org posting | Screen 9+ |
| Reddit Developer | Research | Screen 5 |
| Pinterest Developer | Pins | Screen 9+ |
| Google Cloud | GSC + GA4 OAuth | Screen 10 |
| AI provider (OpenAI / Anthropic) | Generation | Screen 6 |
| Web search API | Research | Screen 5 |
| Hosting + DB (Vercel, Neon, etc.) | Deploy | Post-MVP |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Brief vs MDI role mapping | Document duty matrix in API_CONTRACTS; commercial owner as configurable duty |
| Scheduling vs connected publish | DEC-014: v1 = manual + user-initiated API publish; DEF-008 = unattended calendar auto-fire |
| Meta app review delay | Manual publish path first |
| Reddit terms | Legal review before production research |
| AI cost overrun | Per-workspace caps in settings |

---

## Recommended next task

**After Phase 0.5 architecture sign-off:** Execute **Phase 1 foundation** then **Screen 1.1** (application shell + brand switcher). Prove tenant **and multi-brand** denial tests before Screen 3.

Single next task for implementer: **Scaffold Next.js 15 + Tailwind + shadcn; implement workspace + brand scoping helpers and AT-001/002/017/019–024 tests.**

See also: `docs/MULTI_BRAND_MIGRATION.md`.
