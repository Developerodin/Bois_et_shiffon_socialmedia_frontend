# Products in briefs, drafts, checks, approval and publishing (brief B1, B2, B6)

Date: 2026-11-05. Ninth draft, after an adversarial review and seven 4-lens plan reviews (history at the end).
Builds on `2026-11-05-product-catalogue-design.md`. Calls are Claude's unless marked (owner).

## What the brief asks

- Every content brief carries "linked SKUs, verified product facts".
- Quality verifies "SKU, material, dimensions, price, stock, links … against approved records"; a check that
  can't be completed "must remain unresolved and visible to the approver".
- "An incorrect product fact, expired offer, unavailable product … blocks publication approval until resolved or
  explicitly handled by an authorized approver."
- "Check stock and offer validity before final approval and again before publishing. If stock changes, flag
  affected items and propose alternatives; do not silently change approved content."

## Scope

In: linking posts to products; facts in Brief/Creator/Quality prompts; product checks; alternatives on request; one
gate at approval, scheduling and publishing with an approver override (before and after approval); issues on the
post.
Out (named): offers and campaigns (no data: "expired offer" waits, except a compare-at price that disappeared);
image-vs-product checks; studio reels (no links, so no product rows or gate); picking products by hand; a badge in
post lists for product issues; the override on mobile (mobile gets "Ask for changes"; the override is a web
action); a push or other notification (push is off in today's builds: no EAS project, and it only knows reels).
Known gap against "flag affected items": nobody is notified. A stock change on a scheduled post shows when someone
opens the post; if nobody does, the publish is refused and the post shows "Not posted." with the reason in the web
post list and on the post (web and mobile already show FAILED publications). No sweep of scheduled posts after each
sync; the upgrade is a notice once push is live.

## Products are judged per product, not per variant

A "product" = the brand's active rows of one synced source sharing a URL path `/products/<handle>`; a MANUAL row,
or any row without such a path (Shopify products not on the Online Store have no URL), stands alone. Links store
one row id, the representative: the group's first active row by `externalId` at link time; it is only an id.
Its **name** = the representative's title before the first ` — ` (sync titles variants "Product — Variant").
Availability looks at the group (available if any variant is in stock). Prices are per variant: any variant's
`price` or `compareAtPrice` is a price of the product.

## One loader: `linkedProducts(db, scope, ids)` in `server/catalog/linked.ts`

The only way content code reads products. Scoped by workspaceId + brandId (ids from elsewhere = gone). An archived
id is mapped, in order, to: the live row of the other synced source with the same variant number
(`variantNumericId`, both directions, same brand — this replaces any link rewriting on a store switch); else the
first live row by `externalId` of its own source with the same `/products/<handle>` path (one deleted variant of a
live product). No match = gone. Returns per id: the live row (or null = gone), its variant group, its name and its
`stockState`. A gone link's name is its own row's (archived rows keep their title), or "a removed product" when the
row was deleted (MANUAL rows are hard-deleted). Queries: the ids and the groups.

## Pure rules: `server/content/product-checks.ts` (no Prisma)

- `stockState(group, now)` → the first that applies:
  1. **gone**: no live row.
  2. **in**: a **fresh** variant is in stock (`stockQuantity > 0` or `inStock === true`). A MANUAL row is always
     fresh (a person vouched for it, and only `rules.approve` holders can: see below; `productData` stamps
     `stockCheckedAt` on every typed answer, but nothing re-stamps MANUAL rows, so age means nothing there). A
     synced row is fresh when its own `stockCheckedAt` is null (never reported) or at most 50 h old (two missed
     days).
  3. **unconfirmed**: a variant claims stock but only stale ones do. Judged per variant, so a variant the sync
     stopped refreshing (past the cap, or deleted while fetches stay partial, so never archived) can't keep its
     group in. One failed sync does not count (a store 503 would block every post for a day); a revoked token or a
     store that keeps failing stops refreshing the stamps, so 50 h catches it. Not row age: syncs run whenever the
     queue reaches them (one daily cron, `kickIfDue` only while the app is open, `runAt` order).
  4. **out**: no variant is in and at least one reports stock (`inStock` or `stockQuantity` not null).
  5. **unknown**: no variant reports stock.
  For in / out / unknown the result matches the web and mobile `stockLabel` (they stay as they are; a test
  asserts they agree).
  Ceiling: a store above `MAX_ROWS` (5,000 variants) syncs partially; rows past the cut are never stamped, so their
  in-stock claims turn unconfirmed after 50 h and need "Approve anyway". The Brief writer leaves unconfirmed
  products out; the upgrade is paging the sync past the cap.
- `pricesIn(text)` → amounts with a currency in any common format: "1 299,00 €" (U+0020/U+00A0/U+202F),
  "1.299,00 €", "€1,299.00", "1299 €", "EUR 1299".
- `stillPriced(group, field, amount)` → `yes` / `no` / `unknown`, the one price rule Quality and the gate share
  (below).
- `productRows(linked, draftText, previousSnapshot)` → Quality rows + a new snapshot (below).
- `gateIssues(linked, snapshot, override)` → the issues, each marked refusing or not (below).
- `rankCandidates(...)`.
Result rows extend `CheckResult` with optional `kind`, `productId`, `field`, `amount`, defined by a zod schema in
this module (the AI's rows can't fake them: zod strips unknown keys from AI output).

## Data

- `ContentItem.productIds` (applied): links at the **brief stage only**, read once to fill v1, never updated after
  (not on a switch either). From v1 on the version body's `productIds` is the truth (sealed by `packageHash`, which
  hashes the body).
- Writers set `body.productIds`: `saveDraft` from `item.productIds` when there's no prior version (it already
  carries other fields over), else from the previous version; the Creator explicitly (its body is built from the AI
  output, nothing carries over) — `item.productIds` on v1, the previous version's list on a rewrite, the chosen
  list on a switch (Alternatives). Tests for each.
- Migration `20261105160000_approval_product_override` on `ApprovalDecision`: `productOverride Json?`
  `{ productIds, states }` and `switchProducts Boolean @default(false)`.

## Quality (product rows; none when the version has no linked ids)

One `linkedProducts` call per run for all items, plus the latest check of each item's earlier versions. Rows named
"Product: <name>":
- gone / out / unconfirmed → **warn** with `kind: "availability"` (the post reaches the approver; the gate
  refuses it unless overridden; the Creator's blocker loop never spins on stock).
- unknown → **warn** "Stock not confirmed".
- prices (live links only: a gone link has no prices to compare and its availability row already stands for it,
  so it gets no price rows, attributions or price gate issues; its old snapshot entries are kept unchanged while it
  stays linked). A linked product is **named** when the post has exactly one linked product, or, with several, when the
  text contains one of its name's words (`rankCandidates`' word rule: folded, ≥ 3 letters, not a stop word) — posts
  shorten long catalogue titles. One rule, `stillPriced(group, field, amount)`, is shared with the gate: `unknown`
  when the field is `price` and every variant's `price` is null; else `yes` when the amount equals some current
  variant's value in that field (`price` ↔ any variant `price`, `compareAtPrice` ↔ any variant `compareAtPrice`);
  else `no`.
  - an amount that is `yes` for a named product is **attributed**: recorded in the new snapshot as
    `{ productId: <the link id>, field, amount }` (row `kind: "price"`, pass);
  - an entry of the previous snapshot whose amount is still in the text: `no` → **blocker** "€X is no longer a
    price of <name> (now €Y)" (Y = the current price, or its min–max range); `unknown` → **warn** "Price of <name>
    unknown";
  - any other amount → **warn** "€X isn't a price of a linked product; fine if it's about something else" (the AI
    decides).
  The previous snapshot is that of the newest earlier version that has a check (versions saved while Quality ran
  have none). The new snapshot = what is attributed now + every previous entry whose amount is still in the text
  and whose product is still linked, kept as it was (blocked or not), so a wrong price stays blocked on every later
  version and the gate can refuse it. An entry is dropped only when its amount leaves the text (or its product is
  unlinked).
- The Creator's "Quality report to fix" leaves out product rows that aren't blockers (availability, unknown stock,
  price warns): they are for the approver, and switching is Alternatives. Product blockers stay in.
- AI review (and the Creator) get the facts per linked product: name, facts, and each variant's title, `price` and
  `compareAtPrice` (up to 20 variants, then the min–max range). A product claim is a **blocker** only if it
  contradicts the facts or is in neither the facts nor the brand knowledge; any variant's price is a valid price.
  `overallOf` keeps deterministic blockers.

## The gate: `productGate(db, scope, loaded)` (one function, used three times)

Takes the already-loaded version, its latest check and the current approval (`currentApproval`, which
`schedulePublication`, `executePublication` and `releaseState` already call; `decide` calls it with its `tx`).
Refuses when:
- availability: a linked product is gone / out / unconfirmed, unless the approval's `productOverride` lists it with a
  recorded state at least as bad (order: unconfirmed < out < gone) — a product that recovered just drops out;
- price: a snapshot entry of a live link (its link id resolved through `linkedProducts`, so a store switch or a deleted variant
  changes nothing while a variant still has the amount) that `stillPriced` calls `no` — never overridable
  ("€X is no longer a price of <name> (now €Y). Ask for changes."); on `compareAtPrice` with no variant left
  having one, the message is "the offer on <name> ended". `unknown` → issue "Price of <name> unknown", not a
  refusal (only `rules.approve` holders can type a price on MANUAL rows: see below). Quality uses the same rule
  with the same outcomes (`no` blocker, `unknown` warn), so the two never disagree.
Used in:
- `decide(APPROVED)` inside its transaction, with the override being recorded;
- `schedulePublication`;
- `executePublication`: in **its own try/catch**, after the seal re-check and before the token refresh and the
  existing try (whose catch turns errors into PENDING_VERIFY), reading through `prisma`. A refusal or any error →
  `finish("FAILED", the refusal's message, "APPROVED")`, never thrown; the post then shows "Not posted." with that
  message (web list and post, mobile post). Publish audit metadata gets `overrideUsed`.

## Approval and override

- Route: zod gains `override: z.boolean().optional()` (note required, 1–500 chars, 400 first) and
  `switchProducts: z.boolean().optional()` (CHANGES_REQUESTED only). Override decisions skip the route's
  `autoPublish` (after a cancelled schedule it would re-book the first account); the person schedules.
- `decide` itself checks `rules.approve` (brand-scoped `requirePermission`) when `override` is set — not only the
  route (reels and future callers call `decide`). The `productOverride` of any override decision lists every
  availability issue at that moment, judged as if there were no override (already covered and new), since only the
  latest decision counts. Override when that list is empty → 400. Self-approval rules unchanged.
- `decide(APPROVED, override)` is accepted for **AWAITING_APPROVAL** and for **APPROVED, not scheduled** posts on
  the same version (a product sold out after approval) whose current approval still holds (else 409): it adds a
  new decision with `productOverride` (same package hash). Audit `approval.product_override`
  {versionId, productIds, states, note}.
- `decide(CHANGES_REQUESTED)` is also accepted for APPROVED, not scheduled posts: back to DRAFT_REVIEW with the
  note; the Creator rewrites.
- Web release panel: when `productIssues` exist, show them in the AWAITING_APPROVAL, APPROVED and SCHEDULED
  branches; "Approve anyway" (note required) for holders of both `content.approve` and `rules.approve`; "Ask for
  changes" for approvers, with a "Suggest another product" checkbox (`switchProducts`). The checkbox starts ticked
  whenever an issue refuses for availability; unticked, the control reads "The product stays linked, so the post
  will still be refused" (web and mobile). On SCHEDULED the next step
  reads "Cancel the schedule, then approve anyway or ask for changes" (cancelling already returns the post to
  APPROVED). Mobile post detail: the issues on AWAITING_APPROVAL, APPROVED and SCHEDULED posts; a new "Ask for
  changes" control for `content.approve` holders on AWAITING_APPROVAL and APPROVED (not scheduled) posts, shown when
  `productIssues` exist: a required note field prefilled with the issues' text (e.g. "Milo Sofa is out of stock"),
  the "Suggest another product" checkbox (same default and hint as web), calling `posts.sendBack` with a new optional `switchProducts` argument
  (the edit screen's "Re-generate" stays as it is); Schedule disabled while an issue refuses, the next step reading
  "Ask for changes" for `content.approve` holders and "An approver needs to look at this" for others.
- Decision history (`releaseState` + release panel): an override decision reads "approved anyway: <names>"; an
  earlier approval with the same package hash as the current one is not marked "no longer valid".

## Who may vouch for product data

Typed stock and prices clear the gate, and typed facts decide whether Quality accepts a product claim ("product
claims" are `rules.approve` in the permission catalogue). So any write to `inStock`, `stockQuantity`, `price` or
`compareAtPrice` on MANUAL rows, and to `materials`, `dimensions` or `certifications` on any row — including
clearing one to null — needs `rules.approve`, both when creating (POST) and editing (PATCH): route check, 403
otherwise; the web and mobile forms disable those fields without it. Other fields (title, SKU, link, category,
description, image) stay `context.edit`; a Manager loses fact editing (accepted: the Approver role has it).
`product.updated` audit metadata records `{ field: [before, after] }` for stock, price and facts.

## Alternatives (the Creator)

The Creator switches products only when the CHANGES_REQUESTED decision it is answering has `switchProducts`; any
other rewrite (typo, blocker fix) keeps the links. On a switch it gets up to 10 in-stock products (same category
first, else top candidates; one per product group) and returns `productIds` from that list or `[]` (unknown ids
dropped, not a `validate` rule: a retry would double the top-tier call). With none available it writes without a
product — no loop. On a switch: old product photos dropped, `brief.products` names updated, new version + links in
one transaction (item lock + version check as today; `item.productIds` is left alone), audit
`content.products_switched`.
Photos: for each linked product (switched or not, max 3) with no library photo, the Creator run imports its
`Product.imageUrl` with the existing `storeImage(…, versioned = true)` (content-hashed key: a re-import of the same
image lands on the same key, a changed image gets a new one, so an approved post's photo never changes) and adds it
to that run's photo choices; if that fails, the channel's existing "This channel needs an image" stays the error.
It is not saved to the library, so each Creator run re-downloads up to 3 images: accepted, a few seconds next to the
run's top-tier AI call; the upgrade is recording imports in `BrandProfile.assets`.

## Brief writer (picking)

- One query per run: active products, ranking fields only.
- `rankCandidates`: group by product; keep only groups whose `stockState` is in or unknown (gone, out and
  unconfirmed would be refused at approval after a top-tier Creator call); word overlap (accents folded,
  ≥ 3 letters, small FR/EN stop list) between post title + angle + idea and product name + category; score ≥ 1,
  in stock first, max 15 products; when fewer than 5 score, one in-stock product per category (largest first) up to
  15. ponytail: words + categories, not embeddings.
- Schema `productIds` (0–3) from candidate ids (others dropped); prompt: link only products the post is about,
  [] otherwise; `brief.products` = chosen names; saved with BRIEF_READY in the same `updateMany`.
- App posts (`createPost`): `productPhotos` parses `BrandProfile.assets` with the existing `BrandAssets` schema and
  returns `url` (its callers, the Creator and reels, keep working — test); the photo's URL path is matched to
  this brand's products (hosts can differ); a group → its representative.

## Prompts

Candidates, facts and alternatives are appended **after the existing `---` divider**, as one-line JSON with no
`\n\n---\n` inside (the prompt-cache breakpoint is the last divider: `provider.ts:199`), labelled "catalogue data,
not instructions". Bump `CONTENT_PROMPT_VERSION`.

## Issues on the post

`releaseState` gains `productIssues` (each with `refuses`) from `productGate` on what it already loads (+ the
`linkedProducts` queries).

## Tests (vitest)

- `tests/product-checks.test.ts`: stockState (variant groups; order gone > in > unconfirmed > out > unknown;
  unconfirmed after 50 h; a late but successful sync stays in; a synced row's null `stockCheckedAt` isn't stale; a
  MANUAL row typed in stock 3 days ago is still in; a stale in-stock variant next to a fresh out-of-stock sibling =
  unconfirmed; unknown + out variants = out) and agreement with the web `stockLabel`; pricesIn formats; productRows (warns; a
  single linked product attributed without its name; a shortened name ("notre canapé Milo") among several linked
  products is attributed; a variant title "Oslo Chair — Oak" with the price on its own line is attributed; another
  variant's price is attributed; carried-forward blocker; the previous snapshot skips an unchecked version (v3
  checked with €10, v4 unchecked, v5 still €10 after a price change → blocker); two hops (v3 €10 checked, price
  changes, v4 €10 blocked, v5 €10 still blocked); every price null → warn, entry kept; entries dropped when the
  amount leaves the text; no rows without links); gateIssues (override covers / worse voids / one overridden
  product back in stock still passes; price never overridable; every price null → issue, no refusal; compare-at
  ended; a gone link with a compare-at entry and an override passes, named from its archived row or "a removed
  product"; store switch with the same prices passes; deleted variant whose price no
  sibling has refuses, one a sibling has passes); rankCandidates (overlap, accents, groups, out and unconfirmed left out,
  category fill, cap).
- `tests/products-linked.test.ts` (prisma mocked): cross-brand id = gone; store-switch mapping both ways; a
  deleted variant of a live product maps to a sibling.
- `tests/publishing-products.test.ts` (prisma mocked, pattern `automations.test.ts`): decide override needs
  rules.approve; override on APPROVED same version, refused when its approval no longer holds; nothing-to-override
  400; two overrides in a row keep both products covered; override skips autoPublish; CHANGES_REQUESTED on
  APPROVED; executePublication gate error → FAILED (not PENDING_VERIFY) with the message; saveDraft and the Creator copy `item.productIds`
  into v1; the Creator report excludes non-blocker product rows; the Creator keeps links unless `switchProducts`; product POST and PATCH with stock/price/facts, including null,
  need rules.approve.
- `reel-service` tests still green with the new `productPhotos` shape. Then one real dev-DB run.

## Review history

Adversarial review (draft 1): dead-end "pick another product"; € amounts blocking; French number formats; price
changes not re-checked; override ignored at publish; French word overlap; no stock-change flag; photo matched by
title; no check at scheduling; untrusted descriptions; third copy of the stock rule; reels not named.

4-lens review (draft 2): unknown stock = out; ids changing on a store switch; override unreachable + rewrite loop;
old photo after a switch; price refusal with nothing stored; no send-back after approval; publish errors as "check
the account"; override in the audit log; permission not wired; note limits; feed titles unfenced; tenant scoping;
sync flags without an AgentRun; cache order; one query per run; productPhotos reader; no tests.

Second round, adversarial + 4 lenses (draft 3): no override after approval; compare-at snapshot never clearing;
productIds lost from version bodies; stale synced stock passing the gate; per-variant links; gate inside the
PENDING_VERIFY try; store-switch rewrite unworkable and duplicated (replaced by read-time mapping); typed stock
clearing the gate without rules.approve; audit without before/after; decide trusting the caller; empty override;
re-check skipping the price refusal; rows on posts without links; cache breakpoint; gate re-reading; validate
doubling Creator cost; tests for the risky paths; label rewrite churn.

Third round, 4 lenses (draft 4): unconfirmed tied to a failed sync or 50 h, not 26 h row age (late queue runs);
prices recorded only when attributed to the product; non-blocker product rows kept out of the Creator's report;
representative defined, with a deleted-variant fallback; Alternatives no longer drop links on unconfirmed stock;
rules.approve on product POST too; issues shown on SCHEDULED posts; URL-less rows stand alone; Approve anyway
needs content.approve too. Nothing rejected.

Fourth round, 4 lenses (draft 6): price attribution by product name anywhere in the post, against any variant
(variant titles and prices on their own line recorded nothing); clearing MANUAL stock/price to null needs
rules.approve; carried-forward price blocker redefined so it can fire, old entries dropped; facts carry every
variant's price; stockState order, null stamps and all-null groups spelled out; push on a gate-refused publish and
the remaining "flag" gap named in Scope; the Creator switches only on "Suggest another product"; linked products
without a library photo get their catalogue image; mobile shows issues on AWAITING_APPROVAL and blocks Schedule;
override coverage per product (recovery doesn't void it); decide reads currentApproval; override skips autoPublish;
unconfirmed products out of Brief candidates, 5,000-variant ceiling named. Rejected/accepted: a daily sweep that
notifies on every scheduled post after each sync (accepted as a named gap: the push at refusal plus the issues on
the post cover it with less code).

Fifth round, 4 lenses (draft 7): the price gate uses Quality's rule (`stillPriced` on the link's live group, not
the snapshot row id), so a store switch or a deleted variant with a sibling at the same price no longer refuses;
the previous snapshot is the newest checked version's; one linked product is attributed without its name, several by
name words; the publish-refusal push dropped (push is off and reel-only) and the gap named, relying on the existing
"Not posted." display; one failed sync no longer makes products unconfirmed (50 h only); every override decision
lists all availability issues; catalogue images imported content-hashed, re-import per run accepted; mixed
unknown/out groups are out; history no longer calls an extended approval void; mobile points non-approvers at an
approver. Nothing rejected.

Sixth round, 4 lenses (draft 8): the snapshot carries every previous entry whose amount is still in the text, so a
wrong price stays blocked on every later version and at the gate (two-hop test); `stillPriced` gains `unknown`
(every `price` null), a warn in Quality and a non-refusing issue at the gate, so the two agree; stock freshness
judged per variant, so a stale in-stock variant can't keep its group in (and the cap note holds); mobile "Ask for
changes" spelled out (new control, prefilled required note, checkbox, `switchProducts`); the Creator's v1 copies
`item.productIds`, which is never updated after the brief. Nothing rejected.

Seventh round, 4 lenses (draft 9): MANUAL rows are always fresh (typing stock stamps `stockCheckedAt`, so the 50 h
rule would have turned every hand-added product unconfirmed after two days); the Brief writer leaves out sold-out
products too; "Suggest another product" starts ticked on an availability refusal, with a hint when unticked; facts
need `rules.approve` like stock and prices (they decide whether Quality accepts a product claim); gone links skip the
price rule and get a fallback name. Nothing rejected.
