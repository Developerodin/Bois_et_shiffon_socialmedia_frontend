# Integrations — Multi-Brand AI CMO Platform

Connector architecture for external platforms. Capabilities are **declared**, not assumed.

---

## 1. Capability types

| Type | Description |
|------|-------------|
| `research` | Permitted public data collection (API or user-directed) |
| `account` | OAuth connection, token refresh, account metadata |
| `publish` | Create scheduled/live posts per platform rules |
| `insights` | Post and account metrics |
| `websiteAnalytics` | GA4, Search Console |

Each `IntegrationConnection` stores `capabilities: ConnectorCapability[]` actually granted.

**Brand scope (REQ-PLAT-007):** Default `IntegrationConnection.brandId` — OAuth connect flows start from `/api/v1/workspaces/:workspaceId/brands/:brandId/integrations/...`. OAuth `state` / `OAuthStateTransaction` includes `brandId`. To use the same social account from another brand, create `IntegrationConnectionShare` with explicit capability subset (see `DATA_MODEL.md` §1.2) — never implicit cross-brand token use.

---

## 2. Platform matrix (MVP targets)

| Platform | research | account | publish | insights | websiteAnalytics | Notes |
|----------|----------|---------|---------|----------|------------------|-------|
| Instagram / Facebook (Meta) | Limited¹ | ✓ | ✓² | ✓² | — | Graph API; app review required |
| LinkedIn | Limited¹ | ✓ | ✓³ | ✓³ | — | Org page posting permissions vary |
| Reddit | ✓⁴ | ✓ | ✗⁵ | Limited | — | Commercial/AI terms — DEC-004 |
| Pinterest | Limited¹ | ✓ | ✓ | ✓ | — | API v5 |
| Google Search Console | — | ✓ | — | — | ✓ | Verified site only |
| Google Analytics 4 | — | ✓ | — | — | ✓ | Data API |
| Web search provider | ✓ | — | — | — | — | TBD provider DEC-005 |

¹ Research = official API search or curated URLs, not scraping logged-in feeds at scale.  
² Requires Meta app review, professional account, linked Facebook Page.  
³ LinkedIn marketing API product access.  
⁴ Reddit Data API for subreddit/post metadata within terms.  
⁵ Organic post creation may be limited; treat as defer if API disallows brand use case.

---

## 3. Meta (Instagram & Facebook)

**Docs:**  
- https://developers.facebook.com/docs/instagram-platform/  
- https://developers.facebook.com/docs/graph-api/

**MVP path**

1. Meta Developer App (Business type)
2. Two separate customer OAuth connections (each brand connects its own accounts):
   - **Instagram** — "Instagram API with Instagram Login" (`INSTAGRAM_APP_ID/SECRET`), no Page needed.
     Scopes: `instagram_business_basic`, `instagram_business_content_publish` (+ `instagram_business_manage_insights` for analytics).
   - **Facebook Pages** — Facebook Login for Business (`META_APP_ID/SECRET`).
     Scopes: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `read_insights`, `business_management` (Pages in a Business portfolio).
   - Later (reply/DM agents): `pages_manage_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `instagram_business_manage_comments`, `instagram_business_manage_messages`.
3. Every scope needs App Review before non-tester accounts can connect — request only what the first release uses.
4. OAuth → long-lived token stored encrypted (Page tokens derived from the user token)
5. Publishing: create media container → publish (supports image, carousel, Reels per current API)

**Mock adapter:** `MockMetaConnector` returns synthetic media ids and insights.

**Risks**

- App review lead time (weeks)
- Instagram account must be Professional (Business/Creator); Facebook publishing needs the user to be a Page admin
- Rate limits per app tier

---

## 4. LinkedIn

**Docs:** https://learn.microsoft.com/en-us/linkedin/marketing/

**MVP path**

- LinkedIn Developer App
- Organization page admin for posting
- Scopes: verify `w_organization_social`, `r_organization_social` equivalents

**Mock:** `MockLinkedInConnector`

**Risks**

- No competitor scraping for analytics
- Member vs organization token differences

---

## 5. Reddit

**Docs:** https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data

**Devvit app (deferred / Reddit-native):** Monorepo package [`apps/brandpilot-ai/`](../apps/brandpilot-ai/) — Reddit Developer Platform app scaffold. See [REDDIT_DEVVIT_AGENT.md](./REDDIT_DEVVIT_AGENT.md) for DEC-004, REQ-PLAT alignment, and future connector integration with the main Next.js platform (not a separate product repo).

**MVP path (main platform connector)**

- OAuth app for research connectors (subreddit monitoring)
- Store subreddit + post ids with retention policy

**Access (Responsible Builder Policy, checked 2026-10-21):** self-serve app creation is blocked until Reddit approves the account; **commercial use needs explicit written approval** (Devvit is the path only for non-commercial apps). Commercial request form ("enterprise partner/commercial developer", asks for company details and a **data budget** — expect paid access): https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164&tf_42139884615700=api_request_type_enterprise_clone. Reddit also says unregistered Data API apps lose access from 2027-01-12 and remaining public API access ends March 2027 (https://developers.reddit.com/app-registration). Design rules the Reddit agent must follow:

- Human approves every post/comment; never identical or near-identical text across subreddits (spam rule).
- No vote/karma manipulation; respect blocks and bans.
- Read only the subreddits a brand watches; request only the scopes used.
- No inferring sensitive traits about Reddit users, no matching them to off-platform identities, no ads targeting.
- Reddit content may be sent to the LLM to draft a reply (inference) but never used for training; keep only post ids + short excerpts, and drop items Reddit has deleted.
- Use the brand's own connected account for its replies; don't mix app automation into a personal account.

**Mock:** `MockRedditConnector` with fixture JSON — **required** until DEC-004 cleared; Devvit does not replace mock in the main app today.

**Risks (DEC-004)**

- Commercial use and AI training restrictions
- Rate limits; must not scrape without API

---

## 6. Pinterest

**Docs:** https://developers.pinterest.com/docs/api/v5/

**MVP path**

- Pinterest app + OAuth
- Create pins, boards, read analytics endpoints supported by v5

**Mock:** `MockPinterestConnector`

---

## 7. Google (GSC + GA4)

**Docs:**  
- https://developers.google.com/webmaster-tools/v1/api_reference_index  
- https://developers.google.com/analytics/devguides/reporting/data/v1  

**MVP path**

- Single Google Cloud project
- OAuth with separate connection records for GSC site vs GA4 property
- `GSC_SITE_URL`, `GA4_PROPERTY_ID` in env after setup

**Mock:** `MockGoogleAnalyticsConnector` returns sample metrics series

**Clarification:** GSC ≠ general web search. Web research uses separate provider.

---

## 8. Web search (research)

**Purpose:** Industry articles, trend discovery (not Instagram scraping).

**Options (DEC-005):** Bing Web Search API, Google Custom Search (limited), Brave Search API, SerpAPI (paid).

**Mock:** `MockWebSearchConnector` with canned results.

---

## 9. Connector interface (TypeScript sketch)

```typescript
export type ConnectorCapability =
  | "research"
  | "account"
  | "publish"
  | "insights"
  | "websiteAnalytics";

export interface ConnectorHealth {
  status: "healthy" | "degraded" | "error" | "disconnected";
  lastSuccessAt?: Date;
  lastError?: string;
  rateLimitRemaining?: number;
}

export interface PublishPayload {
  publicationPackageId: string;
  packageHash: string;
  text?: string;
  mediaUrls: string[];
  destinationUrl?: string;
  scheduledAt?: Date; // deferred DEF-008
}

export interface PlatformConnector {
  id: string;
  capabilities: ConnectorCapability[];
  getHealth(): Promise<ConnectorHealth>;
  publish?(payload: PublishPayload): Promise<{ externalId: string; permalink?: string }>;
  fetchInsights?(externalPostId: string): Promise<Record<string, number>>;
  // research methods vary by platform
}
```

---

## 10. Registry & testing

```typescript
// server/integrations/registry.ts
registerConnector("meta", metaFactory);
registerConnector("meta-mock", mockMetaFactory);
```

- `INTEGRATIONS_MODE=mock|live` — **mock is default in dev/CI**. Live connectors require `INTEGRATIONS_MODE=live` **and** non-empty platform credentials; registry refuses live factory if mode is mock (fail closed).
- Tests always use mocks unless tagged `@live` with secrets
- Separate OAuth app credentials for staging vs production (no shared refresh tokens)

---

## 11. OAuth state and callbacks (DEC-017, DEC-018)

Integration OAuth is separate from Auth.js login. On `connect`:

1. Create `OAuthStateTransaction` row (`nonce`, `workspaceId`, `brandId`, `userId`, `platform`, `expiresAt` ≤10 min).
2. Server builds signed `state` (HMAC with `OAUTH_STATE_SECRET` or `AUTH_SECRET`): `{ workspaceId, brandId, userId, platform, nonce, exp }`.
3. User completes provider consent; callback verifies signature, expiry, **single-use** (`consumedAt` null → set atomically before token exchange), and that `userId` still has `integration.manage` in `workspaceId`.
4. Validate provider `code` and error parameters before exchange; on provider error → audit + user-visible failure (no partial connection).
5. Tokens stored only in `IntegrationConnection.encryptedCredentials` using DEC-002/DEC-018 envelope; set `credentialKeyVersion`, `tokenExpiresAt`, `health=healthy`.

**Token lifecycle:** proactive refresh before expiry; on refresh failure set `health=error`, disable publish, surface reconnect (AT-014). Revocation/disconnect clears credentials and marks `disconnected`.

Reject callbacks with missing, expired, tampered, or **replayed** `state`. Do not put refresh tokens in URLs or client storage.

**Meta publish note:** Container creation requires **public HTTPS** media URLs (DEC-013). Catalogue URLs or uploaded assets in object storage — not localhost links.

---

## 12. Provenance & errors

Every external fetch stores:

- `connectorId`, `requestId`, `url` or `externalId`, `fetchedAt`, `workspaceId`, `brandId`

Retries: exponential backoff; respect `Retry-After`; max 3 attempts for publish **only when outcome known**. On timeout after request may have succeeded → `reconciliationStatus=PENDING_VERIFY` and `PUBLISH_RECONCILE` job (DEC-015, AT-005) — query platform by idempotency key / external id before retry.

---

## 13. SSRF-safe URL fetch (research connectors)

Applies to user-supplied `MonitoredSource.identifier` URLs and discovered links before `SourceReference` persistence.

| Control | Rule |
|---------|------|
| Schemes | `https` only (optional `http` for explicit allowlist domains — default deny) |
| Block | Loopback, private RFC1918, link-local, IPv6 ULA, metadata hosts (`169.254.169.254`, etc.) |
| DNS | Resolve before connect; re-resolve on redirect; reject if resolved IP in blocked set (mitigate rebinding) |
| Redirects | Max 3 hops; each hop re-validated |
| Limits | Timeout ≤15s; response body cap (e.g. 2MB); content-type allowlist (`text/*`, `application/json`) |
| Parsing | HTML → text extraction only; no script execution; snippets stored as data |
| Prompt boundary | Fetched text wrapped as quoted data in AI workflows; never merged into system instructions (REQ-MDI-047) |
| Provenance | Store `url`, `fetchedAt`, `fetchStatus`; 90-day TTL on raw excerpt (DEC-007) |

**Out of scope:** automated login, authenticated scraping, or bypassing platform ToS — align with instagram-agent-skill boundaries (§14).

---

## 14. Manual publication path

When `publish` capability missing or app review pending:

- UI: “Mark as published” with permalink + datetime
- Creates `PublishedPost` without `externalId` from API
- Still requires approved `PublicationPackage` (DEC-016)

---

## 15. Instagram skill alignment

The [instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill) explicitly avoids automated Instagram login/scraping. Platform connectors must follow the same boundary: **human-in-the-loop** for account browsing; API-only for publish/insights where authorized (per brand connection).

Reference files inspected:

- `_vendor/instagram-agent-skill/skills/ig-viral/SKILL.md` — manual browser research rules
- `_vendor/instagram-agent-skill/README.md` — Content Publishing API vs ToS
