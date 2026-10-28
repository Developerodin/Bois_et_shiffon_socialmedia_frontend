# Brand assets from the website (logo, colours, fonts, product photos)

Date: 2026-10-28 · Status: approved to build · Screens: mobile A06 (promise), A09 Review, A10 Brand

## Problem

A06 promises "We'll pull your catalog photos, colors and tone of voice" and lists *Product photos* and
*Colors & Typography*. Research only reads text and writes the five documents. A09/A10 show sample data.

## What we collect (and from where)

Measured on boisetchiffons.fr (Shopify) on 2026-10-28:

| Asset | Sources, in order | B&C result |
|---|---|---|
| Product photos | 1. Shopify `/products.json?limit=12` (title, handle, product_type, first image). 2. JSON-LD `Product` (name, image, url) on crawled pages. | 12 products with images |
| Logo | 1. JSON-LD `logo` (Organization). 2. `<img>` in the page whose class/alt/src mentions "logo". 3. `apple-touch-icon`, then `icon`. SVG skipped (next candidate). | JSON-LD PNG |
| Fonts | Google Fonts `family=` params, `font-family:` declarations in the homepage HTML. Generic families and icon fonts dropped. Max 4. | Poppins, Inter, Caveat, Carattere |
| Colours | 1. `theme-color` meta, hex/rgb values in `--color*` CSS vars in the homepage HTML. 2. Dominant colours of the logo and the first 6 product photos (sharp). Near-white/black/grey dropped, near-duplicates merged. Max 5. | CSS vars are only black/white → colours come from photos (wood tones) |

Collection is best-effort: no AI call, so no credits. A failure is logged as a WARN on the Research run
and never fails Research.

## Design

**Server (`apps/web`)**
- `server/research/crawl.ts`: `safeFetch` gains a bytes variant (`safeFetchBytes(url, accept, maxBytes)`),
  which reports `truncated`. `safeFetch` is rebuilt on it (same behaviour for existing callers).
  `extractPage` adds `assets: pageAssets(html, base)` (pure parsing) and `CrawledPage` carries it, so the
  crawl's HTML isn't kept around (SEO/GEO callers just ignore the field).
- `server/research/brand-assets.ts` (new):
  `pageAssets(html, base)` (pure), `shopifyProducts(origin)`, `collectBrandAssets(scope, websiteUrl, pages)`.
  Downloads go through `safeFetchBytes` (SSRF guard on every hop, 10 s timeout, 8 MB cap, truncated = rejected),
  then sharp: refuse anything that isn't jpeg/png/webp/gif, `limitInputPixels` 40 MP, resize to ≤ 1200 px,
  strip metadata. Products → JPEG, logo → PNG (keeps transparency). Up to 4 downloads at a time.
  Keys: `mediaKey(scope, "brand-logo.png")`, `product-<sha256(sourceUrl)[0:16]>.jpg`, so a re-run overwrites
  instead of piling up.
- `BrandProfile.assets Json?` (migration). Shape (zod `BrandAssets`, validated on read):
  `{ collectedAt, logo: { key } | null, colors: [{ hex, from: "site"|"logo"|"products" }], fonts: string[],
  products: [{ title, kind: string|null, url, imageKey: string|null }] }`.
- Research `readWebsite`: after the crawl, before the documents: `collectBrandAssets` in try/catch;
  SUCCESS log "Found logo, 3 colours, 2 fonts, 12 products" or WARN.
- `GET /api/v1/workspaces/:ws/brands/:id/assets` (`brand.read`): name, website, logo/product image
  URLs signed for 1 h, colours, fonts, products. `assets: null` when nothing was collected (no website, or not yet).
- `sharp` becomes an explicit dependency of `apps/web` (already installed through Next, 0.35.5).

**Mobile (`apps/mobile`)**
- `brandAssets(ws, brandId)` in `src/api/endpoints.ts`; `useBrandAssets()` in `src/ui/onboarding/` reads
  `onboarding.workspaceId/brandId`.
- A09: real name, host, logo, product list (title + kind). No products → the section says none were found.
- A10: real logo, swatches (hex; the name line shows the hex's source, e.g. "From your logo"), a fonts line,
  first two real products. No colours → "No colours found on your site".
- Loading: the existing sample text fields render immediately; asset blocks show a placeholder until loaded.
  Fetch failure → blocks hidden and the screen still works (Continue is never blocked).
- Removed: `sampleProfile.products/palette` and `brand.sampleProducts.*` strings (all locales).
  New strings English-only until translation is approved.

**Out of scope** (still sample, flagged): A09 tagline, tags, audience, strengths (derive from the documents —
next step). Editing colours/fonts (A10 says "Editable"; not wired). A full product catalogue / stock (separate design).
A07 no-website brands get no assets.

## 4-lens review of this design

Done one lens at a time; each line = finding → resolution.

**Correctness**
- `safeFetch` decodes bodies as UTF-8 → images corrupt. → bytes variant.
- A body cut at the size cap still starts with valid magic bytes → saved a broken image. → `truncated` = reject; sharp decode is the real check.
- Protocol-relative URLs (`//www.boisetchiffons.fr/cdn/...`) and `&amp;` in attributes. → resolve with `new URL(src, base)` after entity decode.
- Shopify `/products.json` exists on non-Shopify sites as a 404/HTML page. → only accept `content-type: application/json` with a `products` array.
- Shopify product image `src` can be huge (4000 px). → resize; download cap 8 MB.
- JSON-LD can be an array, `@graph`, or broken JSON; `image` can be string, array, or ImageObject. → normalise all, skip on parse error.
- Retry after a Research crash: assets re-collected and overwritten (deterministic keys) → idempotent.
- Two Research runs at once: last write wins on one JSON column; both write complete sets → acceptable.
- Colour from product photos picks the white studio background. → drop low-saturation and near-white/black buckets.
- A product removed from the store leaves an orphan object. → accepted (same as the media route); ponytail note, lifecycle rule later.

**Security**
- Every image URL is attacker-controlled (any site can point at `http://169.254.169.254/...`). → all fetches through `safeFetchBytes` (SSRF guard per redirect hop); ports 80/443 only.
- Decompression bomb (tiny PNG, 50k×50k). → sharp `limitInputPixels`.
- SVG (script, external entity refs). → refused; never stored, never rendered.
- Stored content type comes from sharp's output, not the remote header. → no type confusion.
- Keys can't escape the tenant: built by `mediaKey(scope, …)` from a hash, never from remote names.
- Product titles are untrusted text → rendered as plain RN `<Text>`, length-capped at 200; never sent to an AI prompt by this feature.
- Assets endpoint: `brand.read` via `authorizeBrandRoute` (tenant + project role) → a Member without the project can't read it. Signed URLs expire in 1 h.

**Performance / cost**
- Extra requests per Research run: 1 products.json + ≤ 12 product images + ≤ 1 logo ≈ 14 fetches, 4 in parallel,
  10 s timeout each → worst case ~40 s added to a background job (job route `maxDuration` 300 s; Research docs take longer).
- sharp work on 13 images ≤ 1200 px: < 2 s.
- Storage: ~13 × ~150 KB ≈ 2 MB per brand.
- No AI tokens.
- Ceiling: sites with hundreds of products still fetch only 12; non-Shopify sites only find products on the 8 crawled pages.

**UX**
- Promise now true for photos/fonts/logo; colours are approximate (from photos) → A10 labels each colour's source so a wrong one is understandable; editing comes later.
- Mixed real + sample on A09 (real name/logo/products, sample tagline/audience) could confuse. → accepted for this step; next step derives them from the documents. Flagged to the owner.
- No website / nothing found → empty states, never sample data pretending to be theirs.
- Screens never wait on assets to let people continue.

## Rejected
- Fetching every stylesheet for colours/fonts: B&C's CSS vars are black/white anyway; homepage HTML gives fonts. Add if fonts come back empty often.
- Asking the AI (vision) to name colours: costs credits on every onboarding; hex + source is enough for now.
- Hot-linking the site's image URLs: break when the store changes; agents can't reuse them for content.
- A `Product` table: belongs to the catalogue design (stock, prices); JSON on BrandProfile until then.

## How we'll know it works
- Unit-ish check `scripts/check-brand-assets.ts`: `pageAssets` on a saved fixture HTML (JSON-LD array/@graph,
  protocol-relative src, `&amp;`, SVG logo skipped, icon fonts dropped) + colour filter asserts.
- Live: `smoke:research https://www.boisetchiffons.fr` (throwaway brand, deleted after, assets objects deleted too)
  → logo + ≥ 3 colours + fonts + 12 products with image keys.
- Emulator: A09/A10 show B&C's real logo, products, colours after a real onboarding run.

## Independent review (2026-10-28) and what changed

A separate reviewer read this spec + plan against the code. Accepted and built:
- **Time budget (blocker).** The per-fetch timeout is per redirect hop, so "~40 s" was wrong. → one 30 s deadline
  shared by every asset fetch (`AbortSignal.any`); collection runs **after** the documents so a slow site can't cost
  document progress; `assets.runId` makes a retried run skip it.
- **A11/A12 used the sample too (blocker).** Preparing and Connect now show the real name, logo and first product photo.
- Memory: `limitInputPixels` 16 MP, `sequentialRead`, `sharp.concurrency(1)`, 3 downloads at a time.
- A run that finds nothing keeps the previous assets.
- The assets endpoint only signs keys under `${workspaceId}/${brandId}/`.
- Images cached by storage key (`cacheKey`), one fetch shared by A09–A12.
- Learning's "gathering photos" stage now starts after all five documents, when assets are actually collected.
- Checks added: private address / metadata IP / SVG / truncated body rejected (`npm run check:brand-assets -w web`).

Deferred, named:
- **DNS pinning** (the crawler checks DNS, then fetch resolves again). This feature adds attacker-chosen image
  hosts, but responses are only decoded as images (blind GET). Fix crawler-wide with an undici dispatcher whose
  `connect.lookup` rejects private addresses; it needs `undici` as a direct dependency.
- Image fetches don't consult robots.txt (pages do); same as a browser loading the page's images.
