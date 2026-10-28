# Brand summary (A09 text) and saved preferences (A09 edits, A10 tone/language)

Date: 2026-10-28 · Follows the brand-assets specs · Screens: A09 Review, A10 Brand

## Problem
- A09's tagline, category tags, target audience and strengths are the design's sample (B&C text for every brand).
- A09's edit pencils change text on the phone only; the "Edit" next to the name does nothing useful.
- A10's creative tones and content language stay on the phone: agents never see them.

## Feasibility
- The five documents Research writes already contain this (product information, marketing strategy, brand voice),
  but in long markdown. Short display text needs one small AI call → feasible, ~1 extra call per onboarding.
- The site's own tagline is often in its `<title>`/`og:description` ("L'Art de Vivre à la Française") → the prompt asks
  for the site's tagline verbatim when there is one.
- Agents read brand knowledge from one function (`server/content/knowledge.ts`) → preferences can reach every
  content agent with one change.

## Design
**Server**
- `BrandProfile.summary Json?` = `{ tagline, tags[≤4], audience, strengths, runId, edited: string[] }` and
  `BrandProfile.preferences Json?` = `{ tones: string[≤12], contentLanguage }` (migration).
- Research, after the documents (before assets): `research.summary` structured call over the five documents
  (+ homepage title/description). Rules: tagline = the site's own line, verbatim, when present; tags = short labels
  (category, place, sales channel); audience/strengths ≤ 240 chars; English; never invent. Mock mode writes nothing.
  Saved with one SQL statement that keeps fields the person edited (`edited`). Failure = WARN, never fails Research.
- `GET …/assets` adds `summary` and `preferences`. `PATCH …/assets` accepts any of `colors`, `tagline`,
  `audience`, `tones`, `contentLanguage` (strict zod; at least one). Text edits add the field to `edited`.
  Name edit uses the existing brand `PATCH` (`displayName`).
- `brandKnowledge()` appends "## Owner's choices" (tones, content language, edited tagline/audience) so Brief, Creator,
  Planner, Quality and Scout use them.

**Mobile**
- A09: real tagline/tags/audience/strengths; empty states when missing; pencils edit inline and save on done/blur
  (spinner, rollback + message on failure); "Edit" next to the name edits the name.
- A10: tones and language load from `preferences` (defaults when none) and save on Continue; Continue waits for the
  save, shows an error and stays on failure.

**Out of scope:** translating the summary into the app language (English for now, like the documents); editing tags
and strengths; more content languages than FR/EN on A10.

## 4-lens review of this design
**Correctness**
- Summary written before people edit (A09 is only reachable after Research succeeded) but a later re-run must not
  overwrite edits → `edited` kept in the single-statement write.
- Retried Research run: `runId` skip like assets.
- No-website brands (A07): summary still works (documents exist) → A09 shows it.
- AI returns a tagline that isn't on the site → prompt requires verbatim or empty; empty → A09 shows "Add a tagline".
- Tones saved as English keys; unknown keys from old app versions are kept but not shown.
- Brand PATCH route parses `CreateBrandInput.partial()`, which still carries the `websiteUrl || about` refine → a
  name-only PATCH may be rejected. Must verify; fix by validating the PATCH with its own schema.

**Security**
- Summary is AI output from untrusted pages → plain text, length-capped, rendered as `<Text>`; it now flows into
  agent prompts via `brandKnowledge` → labelled as data like the documents.
- PATCH fields: strict zod, lengths capped, tones from a fixed allowlist? No — allow any short label (future custom
  tones) but cap 12 × 40 chars; `context.edit` permission; audit event per change.

**Performance**
- +1 AI call (~2–3 k tokens in, ~200 out) per Research run; documents truncated to 2 k chars each in the prompt.
- PATCH: one statement.

**UX**
- A09 stops showing B&C text for every brand.
- Edits feel immediate (optimistic) but never silently lost (rollback + message).
- Summary in English while the site is French: tagline stays in the site's language (verbatim), the rest English.

## Independent review (spec + plan) — what changed (this section governs)

- **Brand PATCH was 500 on every call** (uncommitted A07 work added an object-level refine; zod 4 can't `.partial()` a
  refined schema). Fixed first: `BrandFields` shared, `CreateBrandInput`/`EditBrandInput` add their own checks. Verified:
  name-only 200, empty 422, bad URL 422.
- **Edits when there's no summary yet** (mock mode, AI failure, older brands): PATCH upserts a partial summary;
  all summary fields optional.
- **One-statement writes:** PATCH sets the field and unions it into `edited` in SQL; Research's write keeps edited
  fields from the row as it is at write time.
- **Order:** documents → assets → summary (own try/catch); summary failures are a WARN with the provider's message;
  mock mode returns before calling the provider.
- **No new concept where one exists:** content language is written to the existing `BrandProfile.locales` (dormant,
  already shown to Scout/GEO/Competitors as "Locales"); tones go in `preferences.tones`.
- **Agents:** "Owner's choices" goes first in brand knowledge as a quoted JSON block labelled data, with one line saying
  the owner's choices win over the documents on conflict. Only edited text fields are included.
- **Injection hygiene:** summary/preference strings are single-line (control chars and newlines stripped) and capped
  (tagline 120, audience/strengths 240); tones from the app's allowlist only; summary prompt says page text is data.
- **Cost:** there is no credit ledger to charge yet (only the provider's out-of-credits error) — one small call per run.
- **Mobile:** edits update only their field in the store with a per-field sequence; rollback is per field. A10 adopts
  saved preferences only until the person touches a chip; a failed save on Continue shows a message and the button
  becomes "Continue without saving".
- Checks added: concurrent tagline+audience edits keep both in `edited`; edit on a null summary; GET for a brand with
  no summary/preferences; knowledge section renders an injection-y tagline as quoted data.
