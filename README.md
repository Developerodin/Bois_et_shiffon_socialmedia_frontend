# Multi-Brand AI CMO Platform

Brand-agnostic AI marketing operations platform (workspace → **many brands**). **Bois & Chiffons** is the first onboarded brand via seed data—not the product name.

## Status

**Phase 1 in progress** — Screen **1.1–1.2** done (live switchers, shadcn, v1 API stubs, 18 Vitest tests). **Database:** Postgres + Object Storage on Neon (DEC-025) — `npm run db:migrate` + `db:seed`. Setup: [`docs/ENV_SETUP.md`](docs/ENV_SETUP.md). **Reddit:** `apps/brandpilot-ai`.

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) | Requirements, acceptance criteria, deferred scope |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System layers, content lifecycle, security |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | MVP entities and Prisma-oriented model |
| [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) | Route contracts and permissions |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Premium brand UI tokens and components |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Platform connectors and mock adapters |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Screens 1–11, phases, Windows setup |
| [docs/ENV_SETUP.md](docs/ENV_SETUP.md) | Local dev: Neon credentials, `.env`, migrate, seed |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records |
| [docs/FINDINGS_REGISTER.md](docs/FINDINGS_REGISTER.md) | Adversarial review findings and remediation |
| [docs/ADVERSARIAL_ACCEPTANCE_TESTS.md](docs/ADVERSARIAL_ACCEPTANCE_TESTS.md) | Required security/regression tests before feature sign-off |
| [docs/MULTI_BRAND_MIGRATION.md](docs/MULTI_BRAND_MIGRATION.md) | Multi-brand seed/migration strategy (B&C first brand) |
| [docs/REDDIT_DEVVIT_AGENT.md](docs/REDDIT_DEVVIT_AGENT.md) | Reddit Devvit app (`apps/brandpilot-ai`); DEC-004 deferred integration |

## Monorepo packages

| Path | Purpose |
|------|---------|
| `apps/web` | **Next.js 15** platform (Prisma in `apps/web/prisma`) |
| `apps/brandpilot-ai` | Reddit **Devvit** app (playtest / future Reddit agent). Not wired to the main platform connector yet. |

### Web platform

```powershell
cd "C:\Users\INTEL\Desktop\Social Media Agent"
npm install
npx neon@latest env pull                   # then copy Neon vars + AUTH_SECRET into apps\web\.env
npm run db:migrate
npm run db:seed
npm run dev:web
```

### Reddit Devvit app

```powershell
cd "C:\Users\INTEL\Desktop\Social Media Agent\apps\brandpilot-ai"
npm run dev
# or from repo root: npm run dev:reddit
```

Devvit CLI auth lives in `%USERPROFILE%\.devvit\` (gitignored pattern — do not commit tokens).

## Functional brief

**B&C brand configuration (first seed):** [`BC_Social_Media_Agent_Functional_Brief.pdf`](BC_Social_Media_Agent_Functional_Brief.pdf) — `REQ-BRIEF-001`–`110` (per-brand behavior). **Platform:** `REQ-PLAT-001`–`010` in [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md).

## Reference skill audit

Instagram agent skills were inspected from a shallow clone under `_vendor/instagram-agent-skill` (gitignored). Upstream: [Jakeschincariol/instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill) (MIT).

## Next step after review

Sign off **DEC-021–023** (multi-brand) and **U-001** (blocker waivers), resolve **U-007–U-009** where they affect Phase 1 helpers, then **Phase 1 foundation** (Next.js 15 + AT-001/002/017/019–024) per `docs/IMPLEMENTATION_PLAN.md`.
