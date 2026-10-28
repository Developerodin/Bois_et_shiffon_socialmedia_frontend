# Brand assets v2: website name, wide logos, stylesheet fonts, editable palette

Date: 2026-10-28 · Follows `2026-10-28-brand-assets-design.md` · Screens: A09, A10 (and A11/A12 name/logo)

## Feasibility (measured on boisetchiffons.fr)

| Ask | Finding | Verdict |
|---|---|---|
| Name from the website, not the URL | `og:site_name` = "Bois & Chiffons"; JSON-LD Organization `name` also common | Build |
| Logo shown whole | Logo is 201×98 (2:1 wordmark) squeezed into a square | Build: store the size, widen the frame |
| Fetch CSS | 30 stylesheets on the homepage. Theme `custom.css` + `base.css`: Poppins ×22, Inter ×2 → fonts ranking confirmed. CSS colours are UI noise (`#25D366` WhatsApp, `#F5A624` stars, `#D22727` errors) | Build for **fonts only**; colours stay logo + photos first |
| Palette "Editable" label true | Needs save API + UI + Research not overwriting edits | Build |

## Design

**1. Website name** (server)
- `pageAssets` adds `siteName`: `og:site_name` → JSON-LD `Organization`/`WebSite` `name` → `application-name`.
  Decoded, trimmed, 2–80 chars, not a generic word (home/accueil/shop/store/index), never a URL.
- Brands created from a website by the app no longer get a name guessed from the URL on the phone: mobile omits
  `displayName`; the server derives the same placeholder from the host and records `BrandProfile.nameSource = "url"`.
  Web callers that type a name are unchanged (`nameSource` stays null).
- Research, right after the crawl and **before** the documents (so the documents use the real name): if
  `nameSource = "url"` and the homepage has a site name → rename the brand, `nameSource = "website"`, audit event
  `brand.renamed_from_website`, INFO log. A name a person typed is never touched. Slug stays (URLs keep working).

**2. Wide logos** (server + mobile)
- `assets.logo` gains `width`/`height` of the stored PNG. `BrandLogo` takes a height and draws width =
  height × aspect, clamped to [1, 3] × height; containers size to the logo instead of a fixed square.

**3. Stylesheet fonts** (server)
- `pageAssets` adds `stylesheets`: `<link rel=stylesheet>` hrefs on the page's own host, skipping
  `/shopifycloud/`, `checkout`, `vendor`, `judge` (third-party widgets), first 4 in document order.
- `collectBrandAssets` fetches the homepage's ≤4 stylesheets (`safeFetch`, `text/css`, same deadline signal),
  counts `font-family` declarations and `@font-face` names with the same filter as HTML.
- Ranking: total uses across HTML + CSS; keep fonts used ≥ 2 times, top 3 (if none reach 2, the top 1).

**4. Editable palette** (server + mobile)
- `PATCH /api/v1/workspaces/:ws/brands/:id/assets` `{ colors: string[] }` (1–5 `#RRGGBB`), permission
  `context.edit`. Saves `colors` as `from: "you"`, sets `colorsEditedAt`, audit event `brand.colors_edited`.
- Research keeps people's colours: when `colorsEditedAt` is set, collection leaves `colors` alone. The final write
  happens in a transaction that re-reads the row `FOR UPDATE`, so an edit saved during a 30 s collection isn't lost.
- A10: tap a swatch → sheet with a hex field, live preview, Save / Remove; "+" swatch when fewer than 3. Optimistic
  update, rollback + message on failure. Source label "Yours" for edited colours. The "Editable" label is now true.

**Out of scope:** editing fonts, logo or name on A10 (A09's Edit stays as it is); re-running Research from the app.

## 4-lens review of this design

**Correctness**
- `og:site_name` can be the platform or a page title ("Shopify", "Home"). → generic-word filter; homepage only (deeper pages can carry odd values).
- A brand someone named on purpose must never be renamed. → only when `nameSource = "url"`, which only the server sets.
- Rename after documents would leave "Boisetchiffons" inside all five documents. → rename before drafting; prompts use the new name.
- Retry after a crash: rename already done → `nameSource = "website"` → skipped; idempotent.
- Edited colours lost to a concurrent Research write. → `FOR UPDATE` re-read in the write transaction.
- Wide logo with ratio 10:1 (a banner picked as logo) → clamp to 3× height; `contentFit="contain"` shows it whole.
- PATCH with 0 colours → 422 (A10 keeps at least one; removing the last isn't allowed).
- Existing assets rows (from earlier today) have no width/height → treated as square; still valid against the schema.

**Security**
- Site name is untrusted text: length-capped, entities decoded, rendered as plain `<Text>`; it now also goes into AI prompts as the brand name → prompts already say page content is data; name is capped at 80 chars.
- Stylesheet URLs: same host as the page only (no third-party CSS), through the SSRF-guarded fetch, 1 MB cap, inside the 30 s deadline.
- CSS parsing is regex only, never evaluated; ReDoS: patterns are linear (`[^;}"<]+`).
- PATCH: `authorizeBrandRoute(..., "context.edit")` (tenant + project role); strict zod; hex regex; audit event. A Viewer gets 403.

**Performance**
- +≤4 stylesheet fetches per run (B&C: 36 KB + 82 KB), within the same deadline; regex over ≤4 MB.
- Rename: 2 writes in one transaction, once per brand.
- PATCH: one transaction, row lock held for one read + one write.

**UX**
- Name: A09–A12 show "Bois & Chiffons" after Learning. If the site has no usable name, the URL-based name stays and can be renamed on the web app (A09 Edit is still sample, flagged).
- Logo readable as the brand's own mark.
- Fonts: Poppins first; one-off widget fonts (Azeret Mono) drop out.
- Palette editing: 44 px touch targets; hex keyboard; invalid hex keeps Save disabled with a hint; failure rolls back with a message; no edit is lost silently.

## Independent review (spec + plan) and the revised design — this section supersedes the parts above it

Blockers found: (1) a person's web rename racing Research's rename could be overwritten; (2) SEO/GEO start in
parallel with Research and snapshot the old name (GEO's brand-mention matching would miss "Bois & Chiffons").
Both come from renaming *after* creation, so the design changes instead of adding locks:

1. **Name at creation, not rename.** `POST …/brands` with a `websiteUrl` and no `displayName`: the server fetches
   the homepage (SSRF-guarded, 5 s cap) and uses `siteName`, else the host-derived placeholder. Every agent, document
   and email sees the right name from the start. No `nameSource` column, no rename, no race. Web callers always send
   a name: unchanged. Validation: `displayName` required unless `websiteUrl` (existing `websiteUrl || about` rule kept);
   PATCH `.partial()` unaffected. Slug comes from the final name.
2. **Name sanitising** (it reaches prompts and emails): strip control/bidi characters and `<>`, collapse whitespace,
   reject anything with a URL or `://`, 2–80 chars, not a generic word. Falls back to the placeholder.
3. **Logo shape from the image** (expo-image `onLoad` width/height), not stored: works for existing rows, no schema change.
4. **Stylesheets:** page host with `www.`/apex treated alike, plus `cdn.shopify.com` theme assets; theme-looking
   files (`/assets/` + base/theme/custom/main/style) ranked first; app/widget sheets skipped by path; fetched in parallel.
5. **Atomic JSON writes, no locks** (Neon pooler is PgBouncer transaction mode): PATCH = one `UPDATE … SET assets =
   jsonb_set(jsonb_set(assets,'{colors}',…),'{colorsEditedAt}',…)`; the collector's write = one `UPDATE` that keeps
   `colors`/`colorsEditedAt` from the row when `colorsEditedAt` is present. Each is a single statement → no lost update.
6. **Mobile store:** `use-brand-assets` becomes a tiny subscribable store; a successful PATCH replaces the entry and
   every mounted screen (A10–A12) re-renders with the saved colours. PATCH returns the normalised colours.
7. **Editor details:** `#abc`/lowercase normalised to `#RRGGBB`, duplicates refused; up to 5 colours shown 3 per row,
   "+" while fewer than 5; single-line field, `autoCapitalize="characters"`, `maxLength 7`; sheet avoids the keyboard
   and safe areas; swatches are buttons labelled "#7C6754, from photos, edit"; hint and rollback message announced
   (`accessibilityLiveRegion`) and written in text, not colour alone.
8. GET assets returns `colorsEditedAt`; `BrandAssetsView` updated.

Checks added: name from og:site_name at creation (B&C → "Bois & Chiffons"), name sanitiser cases, stylesheet ranking
on B&C (Poppins first, Azeret Mono gone), PATCH 200/422/403 (Viewer), collector keeps edited colours (two writes in
either order), emulator: edit → reopen → persists.

## Build review (independent, 4 lenses) and fixes — 2026-10-28

Fixed:
- Entity decoding threw on out-of-range `&#…;` (crafted page → 500 on brand creation); hex entities (`&#x27;`) weren't decoded. Now bounded and decoded; `nameFromWebsite` also falls back on any parse error.
- Quadratic regexes on hostile pages (`<script …ld+json`, unterminated tags in `tagAttrs`) — now linear (`[^<>]` + `indexOf`); check: 1 MB hostile page < 2 s.
- Brand name: NFKC + strip `\p{Cc}\p{Cf}\p{Co}` (incl. tag-character smuggling, BOM, soft hyphen); names with a colon or > 8 words refused.
- Partial failures (logo timeout, `/products.json` 429) no longer wipe the previous logo/products/fonts/colours.
- JSON-LD products without a URL no longer collapse into one (keyed by URL + title).
- Fonts: `--font-family` custom properties ignored; homepage is `pages[0]`; monospace-fallback fonts (Azeret Mono countdown) dropped.
- Logo image key includes a content hash, so apps caching by key show a new logo.
- Mobile store: keyed per brand + Research run (a retried run refetches); a GET landing after a PATCH is ignored.
- Picker: 44 px colours (scrolling row) + 5 shades ≥ 52 px, named for screen readers; sheet can't close mid-save; "Lighter" never darkens; hex label "Or type a hex code"; 409 has its own problem type; redirect bodies cancelled.

Accepted / deferred: DNS pinning (named in v1); `saveEditedColors`' label lookup isn't atomic (label only); the
check script needs live sites and writes a throwaway brand (like the smoke scripts); creation now waits ~1–5 s on the
homepage fetch; creative-tone choices are still phone-only (not sent to the server).
