# Plan: brand assets from the website

Spec: `docs/superpowers/specs/2026-10-28-brand-assets-design.md`. Order is dependency order; each step has its check.

1. **Bytes fetch.** `crawl.ts`: `safeFetchBytes(raw, accept, maxBytes)` → `{ url, status, bytes, contentType, truncated }`;
   `safeFetch` = wrapper decoding UTF-8 (same signature/behaviour).
   → check: `tsc`; `smoke:research` example.com still reads pages.
2. **Pure parsing.** `brand-assets.ts`: `pageAssets(html, base)` → `{ logos[], products[], fonts[], colors[] }`;
   helpers for JSON-LD walk, attribute decode, colour parse/filter. `extractPage`/`CrawledPage` carry `assets`.
   → check: `scripts/check-brand-assets.ts` asserts on a fixture string (cases listed in the spec).
3. **Shopify products.** `shopifyProducts(origin)` via `safeFetch(…, "application/json")`, JSON + `products[]` required, max 12.
   → check: run against boisetchiffons.fr in the check script (network, skippable with `--offline`).
4. **Image pipeline.** `storeImage(scope, url, kind)`: `safeFetchBytes` 8 MB, reject truncated/non-200, sharp
   (`limitInputPixels: 40e6`, format ∈ jpeg/png/webp/gif, resize ≤1200 inside, rotate, jpeg q80 / png), `putMedia`,
   returns `{ key, colors }` (dominant colours from a 24×24 raw thumbnail). Concurrency 4 with a tiny worker loop.
   Add `sharp@0.35.5` to apps/web deps.
   → check: check script stores the B&C logo to a throwaway key, then deletes it.
5. **Collect + save.** `collectBrandAssets(scope, websiteUrl, pages)`: merge page assets + Shopify, pick logo
   (first candidate that stores OK), store ≤12 products, palette = site colours + logo + first 6 products, merged
   (distance < 24) and capped at 5; fonts capped at 4. Zod `BrandAssets`. Migration `BrandProfile.assets Json?`,
   `db:deploy`, prisma generate.
6. **Research hook.** `readWebsite` calls it in try/catch with SUCCESS/WARN logs. smoke-research cleanup deletes asset keys.
   → check: `smoke:research https://www.boisetchiffons.fr` prints logo + colours + fonts + 12 product keys.
7. **API.** `GET …/brands/[brandId]/assets/route.ts` (`brand.read`), signs URLs.
   → check: curl with a mobile Bearer token for an existing brand; 403 for an unrelated brand id.
8. **Mobile.** endpoint + `useBrandAssets`; A09/A10 wired; empty/loading states; trim `sampleProfile`; drop
   `brand.sampleProducts` from all locales (node one-off); add new en strings.
   → check: `npx tsc --noEmit`, `npx expo lint`, emulator screenshots of A09/A10 for B&C.
9. **Docs.** HANDOVER: A06 decision closed, A09/A10 status, what's still sample.

Review fixes folded in: deadline + after-docs + runId skip, A11/A12, memory limits, keep-on-empty, key-prefix check, cacheKey. Deferred: DNS pinning.

Not doing: stylesheet fetching, AI colour names, colour/font editing, Product table, A07 assets.
