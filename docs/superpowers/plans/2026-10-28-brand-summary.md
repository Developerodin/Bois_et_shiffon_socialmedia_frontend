# Plan: brand summary + saved preferences

Spec: `docs/superpowers/specs/2026-10-28-brand-summary-design.md`.

1. **Schema.** `BrandProfile.summary Json?`, `preferences Json?`; `db:deploy`; generate; restart web.
2. **Research summary.** `server/research/brand-summary.ts`: zod `BrandSummary`, `writeSummary(ctx, docs)` (AI call,
   mock = skip), `saveSummary` (one statement keeping `edited`). Hook in `research.ts` after docs, before assets.
   → check: script with a stub AI result: edited tagline survives a second save; un-edited fields refresh.
3. **API.** GET adds `summary`, `preferences`; PATCH accepts `tagline`, `audience`, `tones`, `contentLanguage`
   alongside `colors`. Verify brand PATCH with only `displayName`; fix its schema if it fails.
   → check: curl 200/422/403; name-only rename 200.
4. **Agents.** `brandKnowledge` appends "Owner's choices". → check: unit call prints the section.
5. **Mobile.** endpoints + store; A09 real text, inline edits (optimistic + rollback), name edit; A10 load/save
   preferences on Continue. → check: tsc, lint, emulator (new B&C onboarding: real tagline; edit tagline; tones saved).
6. **Independent build review (4 lenses)** → fix → re-check. Docs + memory.
