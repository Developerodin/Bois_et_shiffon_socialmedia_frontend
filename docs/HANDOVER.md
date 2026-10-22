# Handover: production-readiness pass (2026-10-21)

Prow PLUS AI CMO (`apps/web`, Next.js 15 + Prisma on Neon). This pass took an audit of the whole app (backend, user journeys, comparison with Okara and peers) and fixed what it found, in order of impact. Everything below is committed on `main`.

## What changed

| Commit | Area | Summary |
|---|---|---|
| `2cc7e64` | Core loop | People can write and edit drafts (each save is a new version that needs a fresh approval; editors can't approve their own). "Request changes" sends the note back to the Creator. Each post shows its next step with a button for the right agent. Agents never overwrite a newer draft. Double-clicked runs are reused, not paid twice. Agent failures show their reason. Panels render once (phone or desktop, not both). |
| `edbdbb6` | Publishing | Pinterest / Instagram / Threads tokens refresh before expiry; refused ones mark the account "Needs reconnect". Overdue jobs run while the app is open. Poison jobs stop. No OpenAI key in production stops agents instead of faking drafts. Disconnecting cancels that account's scheduled posts. |
| `f6042fd` | Security | Owner-only: inviting/removing owners, ownership powers in custom roles. IPv4-mapped IPv6 SSRF bypass closed. Live links scrubbed from sent emails. Daily caps: 100 manual agent runs per workspace, 10 brands per person. Chat respects role permissions and sends the last 40 messages. Login lockout is per email + IP. |
| `3a5852d` | Usability | Edit brand name/website in place (Context panel, "Edit"). Deep links: `?post=`, `?doc=`, `?agent=`, `?competitor=`, `?panel=`. Menu "Content calendar" opens the panel. "Nothing to do" runs aren't red. Planner retries don't duplicate. Daily pruning of short-lived rows. |
| `260968e` | Media | Instagram carousels (2 to 10 image links) and Reels (public video link) publish. Publishing can also take uploaded files from the brand's private storage, signed at posting time. |
| 2026-10-22 | Follow-ups | Upload button for images in the publish form (JPG/PNG up to 4 MB, type checked from the file bytes, stored per brand). Phones get a tab for every panel. Welcome: a retry after a failed step reuses the brand already created; after 5 minutes it offers a way out while reading carries on. Index on `AgentRun(agentKey, status)`; running-audit lookup limited to the brand's own competitor domains. |

Checks: `npm run typecheck`, `npm run lint`, `npm test` (55), `npm run smoke:publishing` (11 scenarios), `smoke:connections`, `smoke:rbac`, `smoke:auth`.

## Decisions waiting on the owner

1. **Job trigger for on-time scheduled posts.** Vercel Hobby cron runs once a day. Either upgrade to Pro and set `apps/web/vercel.json` to `*/5 * * * *`, or point a cron service at `POST /api/v1/jobs/run` with `Authorization: Bearer $CRON_SECRET` every 5 minutes. See `docs/ENV_SETUP.md` → Background jobs.
2. **SMTP in production** (`SMTP_HOST`, `EMAIL_FROM`, …), or invites and password resets won't send.
3. **OpenAI credits.** Agents are paused until they're added; manual drafting, approval and publishing work without them.
4. **Bois & Chiffons website** is still `example.com` in the database. Fix it in the app (Context panel → Edit → `boisetchiffons.fr`), then run Research once to redraft the documents.

## Still open (in priority order)

1. **Product catalogue + stock checks** (brief REQ-BRIEF-011/012/047/058/106). Needs a design first: data model (SKU, materials, dimensions, price, stock, freshness), import (CSV or Shopify/WooCommerce), checks at approval and again before publishing, "hold" when stock can't be confirmed.
2. Competitor gaps vs Okara/peers: drag-to-reschedule calendar view, real performance metrics into the Analyst, LinkedIn/X/CMS publishing, morning email digest.

## Things to know

- **Uploaded images nobody publishes stay in the `media` bucket.** Add a bucket lifecycle rule if storage grows.

- **Opening the workspace runs overdue jobs** (`kickIfDue` from the agents poll). On a dev box with real data, check the queue first (`Job` rows with status `PENDING`).
- **Smoke tests vs a running server:** stop the dev/prod server before `smoke:publishing`; an open app tab can pick up the test's jobs mid-run (they use fake tokens, so nothing posts, but the test result becomes flaky).
- `smoke:rbac` and `smoke:auth` run against the real first workspace with a throwaway user they delete afterwards.
- Commit messages: no co-author or session lines, no test mentions (owner's rule).
