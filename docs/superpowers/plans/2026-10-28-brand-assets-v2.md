# Plan: brand assets v2 (revised after review)

Spec: `docs/superpowers/specs/2026-10-28-brand-assets-v2-design.md` (the "revised design" section governs).

1. **Parsing.** `pageAssets` → `siteName` (sanitised), `stylesheets` (ranked, filtered); `fontFamilies(text)` shared by
   HTML + CSS + `@font-face`. → check: fixture asserts incl. sanitiser and stylesheet ranking.
2. **Name at creation.** `CreateBrandInput` refine (`displayName || websiteUrl`), `createBrandWithResearch` derives the
   name; mobile `use-research` stops sending the URL name. → check: check script creates nothing; unit call of the
   name resolver on B&C → "Bois & Chiffons".
3. **Collector.** Parallel stylesheet fetch + font ranking (≥2 uses, top 3); colour `from: "you"`; atomic final write
   that preserves edited colours. → check: network check shows Poppins first, no Azeret Mono; keep-edits assertion.
4. **API.** GET returns `colorsEditedAt`; PATCH (`context.edit`, zod, normalise, dedupe, 1–5, audit, atomic update).
   → check: 200 / 422 / 403 via curl with a mobile token.
5. **Mobile.** Store-based `useBrandAssets`; `BrandLogo` aspect via onLoad; A09/A10/A12 frames; A10 editor; strings.
   → check: tsc, lint, emulator walkthrough (new brand from B&C).
6. **Review of the build** (independent, 4 lenses) → fix → re-check. **Docs + memory.**
