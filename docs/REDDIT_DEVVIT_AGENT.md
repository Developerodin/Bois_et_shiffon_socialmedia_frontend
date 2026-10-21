# Reddit Devvit app — `brandpilot-ai`

**Status:** Scaffolded; **deferred** as a production connector for the main AI CMO platform until Reddit commercial/AI terms are cleared (**DEC-004**).

---

## 1. What this is

| Item | Value |
|------|--------|
| **Path** | [`apps/brandpilot-ai/`](../apps/brandpilot-ai/) |
| **Platform** | [Reddit Devvit](https://developers.reddit.com/) (Developer Platform app, not the main product’s Next.js app) |
| **Config** | `apps/brandpilot-ai/devvit.json` — app name `brandpilot-ai` |
| **Template** | Reddit “vibe coding” starter (Vite + React client, Hono/tRPC server) |

This package is a **standalone Reddit-hosted app** (subreddit install, playtest, publish). It is **not** a microservice split of the multi-brand AI CMO platform. The main app (future `apps/web` or repo-root Next.js per `IMPLEMENTATION_PLAN.md`) will keep using **`MockRedditConnector`** for research/account flows until **DEC-004** is resolved.

---

## 2. Relationship to platform requirements

| Reference | How Devvit fits |
|-----------|------------------|
| **DEC-004** | Production use of Reddit Data API / Devvit for commercial AI CMO research is **blocked** until legal review. Devvit work is exploratory and Reddit-surface-only. |
| **REQ-PLAT-007** | Main platform integrations are **per-brand** OAuth under `/api/v1/workspaces/:workspaceId/brands/:brandId/integrations/...`. A future link to Devvit would be an explicit connector + mapping (workspace/brand → subreddit install), not implicit token sharing. |
| **REQ-PLAT-003** | Agent runs in the main app remain **single-brand**. Any Reddit agent logic inside Devvit must not merge brand contexts. |
| **INTEGRATIONS.md §5** | Documents Reddit **Data API** connector matrix; Devvit is a **parallel** delivery channel for Reddit-native experiences. |

---

## 3. Future integration (not implemented)

Planned direction when DEC-004 allows live Reddit:

1. **Main Next.js platform** — `RedditConnector` (or Devvit-backed adapter) behind `IntegrationConnection`, same patterns as Meta/LinkedIn in `INTEGRATIONS.md`.
2. **Devvit app** — Optional Reddit-native UI/workflows (mod tools, subreddit posts) that call back to platform APIs via signed webhooks or internal jobs — **same monorepo**, separate deploy target (`devvit upload` / `devvit publish`).
3. **No duplicate git repo** — `apps/brandpilot-ai` is an npm workspace package; auth token for CLI lives in user profile (`~/.devvit/token`), not committed.

Until then:

- Implement and test Reddit scenarios with **`MockRedditConnector`** and fixture JSON in the main app.
- Use Devvit only for Reddit Developer Platform features and playtest communities.

---

## 4. Local development

**Prerequisites:** Node **≥ 24** (see `apps/brandpilot-ai/package.json` engines); Reddit CLI login (`npm run login` in the app directory).

From repository root:

```powershell
cd "C:\Users\INTEL\Desktop\Social Media Agent\apps\brandpilot-ai"
npm install
npm run dev
```

`npm run dev` runs `devvit playtest` (long-running; develops against a test subreddit).

Other scripts: `npm run build`, `npm run deploy`, `npm run launch` — see `apps/brandpilot-ai/README.md`.

From monorepo root (optional):

```powershell
cd "C:\Users\INTEL\Desktop\Social Media Agent"
npm install
npm run dev -w brandpilot-ai
```

---

## 5. Security and compliance notes

- Do not commit Reddit tokens, `devvit.json` secrets, or user OAuth material.
- `devvit.json` declares Reddit permissions (`SUBMIT_POST`, etc.); review before production publish.
- Align any data retention from Devvit triggers with platform `DATA_MODEL.md` and Reddit Developer Terms.

---

## 6. Related docs

- [DECISIONS.md — DEC-004](./DECISIONS.md)
- [INTEGRATIONS.md — §5 Reddit](./INTEGRATIONS.md#5-reddit)
- [PRODUCT_REQUIREMENTS.md — REQ-PLAT-007](./PRODUCT_REQUIREMENTS.md)
