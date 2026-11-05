# Product catalogue (brief §"Required onboarding inputs": product catalogue + stock)

Date: 2026-11-05. Owner asked to skip questions; the calls below are Claude's unless marked (owner).

## Why

The B&C brief makes a product catalogue a required onboarding input (SKU, name, URL, category, materials,
dimensions, approved descriptions, price, assets, verified certifications) plus stock and stock freshness. Quality
checks, approval blocking and stock re-checks before publishing all depend on it (gap audit A7, B1, B2, B6:
`docs/handover/2026-11-05-brief-gap-audit.md`). Today products are only `{title, kind, url, imageKey}` scraped
into `BrandProfile.assets` (max 12).

## Scope of this step

In: a `Product` table per brand; three sources (website feed, Shopify Admin, manual); a sync job; API routes; a
web Products page; Shopify connect form. **Shopify Admin code is written now and tested live later (owner).**

Also in: mobile Business → Products list and product detail (read, edit materials/dimensions/certifications,
Sync now). Adding products by hand stays web-only.

Out (next steps): feeding products into the Brief/Creator/Quality agents; offers, campaigns and priorities; stock
re-check before approval/publishing; CSV import; adding products on mobile. `BrandProfile.assets.products` stays
as is (onboarding uses it for photos).

## Sources

1. **WEBSITE** — the public Shopify feed `/products.json?limit=250&page=N` of `BrandProfile.websiteUrl`
   (B&C runs on Shopify: variants carry `sku`, `price`, `compare_at_price`, `available`; product has
   `body_html`, `product_type`, `images`). Non-Shopify sites return nothing: that's fine, say so.
   Currency from `/cart.js` (`currency`), else null. Fetch through the crawler's SSRF guard (`safeFetch` in
   `server/research/crawl.ts`), reuse `shopifySized` for image URLs. Cap 20 pages and 5,000 variants
   (more → partial, nothing archived); `ponytail:` comment names the ceiling.
2. **SHOPIFY** — Admin GraphQL API with a custom-app Admin API access token (scopes `read_products`,
   `read_inventory`). Connect form: shop domain (`^[a-z0-9][a-z0-9-]*\.myshopify\.com$`, lower-cased; also accept the
   bare handle) + token. Verify by calling `{ shop { name } currentAppInstallation { accessScopes { handle } } }`
   before saving; both scopes missing → 422. Stored (through `saveConnections`, shared with OAuth) as an
   `IntegrationConnection` with new provider `SHOPIFY`, credentials `{accessToken}` encrypted with
   `encryptCredentials`, `externalAccountId` = shop domain, `displayName` = shop name, `scopes` = the two above.
   Sync pages `productVariants(first: 100, query: "product_status:active")` (50 pages = 5,000 variants; waits on
   the cost bucket's `throttleStatus` before a page and retries THROTTLED) with `id sku title price compareAtPrice inventoryQuantity
   availableForSale product { title handle onlineStoreUrl productType description status featuredMedia/featuredImage url }`;
   only `ACTIVE` products. Pin an API version constant (e.g. `2025-07`). Untested live: mark with a `ponytail:`
   comment and in the handover.
3. **MANUAL** — rows a person adds.

One synced source per brand: **SHOPIFY when an ACTIVE Shopify connection exists, else WEBSITE.** A sync archives
(sets `archivedAt`) rows of the *other* synced source and rows of its own source that it no longer sees — but only
when the fetch completed fully (a failed or partial fetch archives nothing). A row seen again is un-archived.

## Data

```prisma
enum ProductSource { WEBSITE SHOPIFY MANUAL }

model Product {
  id             String        @id @default(cuid())
  workspaceId    String
  brandId        String
  source         ProductSource
  externalId     String?       // variant id from the feed / Admin GID; null for MANUAL
  sku            String?
  title          String        // "Product — Variant" when the variant has its own title
  url            String?
  category       String?
  description    String?       // plain text (HTML stripped), ≤ 5,000 chars
  materials      String?       // person-entered
  dimensions     String?       // person-entered
  certifications String?       // person-entered
  price          Decimal?      @db.Decimal(12, 2)
  compareAtPrice Decimal?      @db.Decimal(12, 2)
  currency       String?
  inStock        Boolean?      // null = unknown
  stockQuantity  Int?          // Shopify Admin only
  stockCheckedAt DateTime?     // when the source last told us about stock: "stock freshness"
  imageUrl       String?
  archivedAt     DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  brand Brand @relation(fields: [brandId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  @@unique([brandId, source, externalId])
  @@index([workspaceId, brandId])
}
```

Field ownership: a sync writes only the fields it owns (sku, title, url, category, description, price,
compareAtPrice, currency, inStock, stockQuantity, stockCheckedAt, imageUrl, archivedAt). `materials`,
`dimensions`, `certifications` are person-owned on every row and never touched by a sync. MANUAL rows: every
field is person-owned. Hand-written migration in `prisma/migrations/<timestamp>_product_catalogue/` (enum value
`SHOPIFY` on `IntegrationProvider`, the new enum and table), matching the existing style.

## Job

`catalog.sync` job, payload `{workspaceId, brandId}`, handler in `server/catalog/sync.ts`, registered in
`server/jobs/runner.ts`. Enqueued by: the daily sweep (every ACTIVE brand with a website or Shopify connection;
idempotency key per brand per day), "Sync now" (no new job while one is queued or running for the brand), and a
successful Shopify connect. Retryable on network errors; a 401/403 or `ACCESS_DENIED` from Shopify (`ReconnectNeeded`) marks the connection `ERROR` with
a fixed `lastError` ("Shopify refused the access token. Reconnect with a new token.") and fails without retry.
Upsert row by row inside the job (`ponytail:` fine for thousands of variants; batch if a store has tens of
thousands). Record the outcome on the brand so the UI can show it: reuse the agent event log is NOT appropriate;
instead store `{at, source, count, error}` in a small JSON column `BrandProfile.catalogSync` (nullable).

## API (brand-scoped, under `app/api/v1/workspaces/[workspaceId]/brands/[brandId]/`)

| Route | Permission | Does |
|---|---|---|
| `GET products?archived=1` | `brand.read` | List (active by default, no descriptions), newest-updated first, plus `catalogSync` status, which source is in use and `running` (a sync is queued or running); `?status=1` returns only the status (polled during a sync) |
| `GET products/:id` | `brand.read` | One product with its description; 404 when not in this brand |
| `POST products` | `context.edit` | Create MANUAL row (zod-validated, lengths capped, price ≥ 0) |
| `PATCH products/:id` | `context.edit` | Edit: synced rows accept only materials/dimensions/certifications (others → 400); MANUAL rows any field |
| `DELETE products/:id` | `context.edit` | MANUAL only (synced → 400: it comes back on the next sync) |
| `POST products/sync` | `context.edit` | Enqueue `catalog.sync` unless one is already queued or running for the brand (`queued: false`), kick the runner, 202 |
| `POST integrations/shopify` | `integrations.manage` | Verify + save the Shopify connection, enqueue a sync |

Every route goes through `authorizeBrandRoute`, scopes every query by `workspaceId` + `brandId`, writes an
`auditEvent` for create/edit/delete/connect (actor, product id; never the token), and returns problem+json via
the existing helpers. Never return or log the Shopify token; Shopify error bodies stay in the server log, the
person sees a fixed message.

## Web UI

- New shell page `/products` (sidebar entry next to Context, `components/shell/sidebar.tsx`): table of
  products (image, title, SKU, price + currency, stock: "In stock"/"Out of stock"/"12 in stock"/"Unknown" with
  "checked 2 h ago", materials, dimensions), source line ("From your Shopify store" / "From your website's
  product feed" / "No synced source"), last sync time or its error, "Sync now", "Add product", per-row edit
  dialog (person-owned fields; all fields for MANUAL), delete for MANUAL. Read-only for people without
  `context.edit`. Empty state explains the sources.
- Connections page (`components/settings/connections-tab.tsx`): a Shopify card with a connect dialog (shop
  domain + Admin API token, a short "create a custom app with read_products and read_inventory" hint),
  disconnect via the existing path.
- Follow the existing components (`components/ui/*`, settings `shared.tsx` patterns) and typography rules.

## Failure modes

- Retry/duplicate: job idempotency keys; upsert on `(brandId, source, externalId)`.
- Partial fetch: archive nothing; record the error.
- Shopify token revoked: connection → ERROR, sync falls back to WEBSITE only when the person disconnects
  (a broken connection must be visible, not silently replaced).
- Two syncs at once: the queue is sequential (`runDueJobs`); upserts are idempotent anyway.
- Untrusted input: the website feed is untrusted (SSRF guard, size caps, string length caps, numeric parsing that
  rejects NaN); the shop domain is validated against `*.myshopify.com` so the token is never sent elsewhere.
