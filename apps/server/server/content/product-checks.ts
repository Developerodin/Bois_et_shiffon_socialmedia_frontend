import type { Product } from "@prisma/client";
import { z } from "zod";
import { byExternalId, groupKey, handleOf, productName, REMOVED_PRODUCT_NAME } from "@espanda/shared";

export { byExternalId, groupKey, handleOf, productName, REMOVED_PRODUCT_NAME };

/**
 * Product rules for content (docs/superpowers/specs/2026-11-05-products-in-content-design.md): stock, prices,
 * Quality's product rows, the gate's issues and the Brief writer's candidates. Pure: no database. Rows come from
 * `linkedProducts` (server/catalog/linked.ts) or the Brief writer's one query.
 */

/** A catalogue row as these rules read it. Prices may be Prisma Decimals, strings or numbers. */
export type ProductRow = Pick<
  Product,
  | "id" | "source" | "externalId" | "title" | "url" | "category" | "materials" | "dimensions" | "certifications"
  | "currency" | "inStock" | "stockQuantity" | "stockCheckedAt" | "imageUrl" | "archivedAt"
> & { price: Money; compareAtPrice: Money };
type Money = { toString(): string } | string | number | null;
type StockFields = Pick<ProductRow, "source" | "inStock" | "stockQuantity" | "stockCheckedAt">;

export type StockState = "gone" | "in" | "unconfirmed" | "out" | "unknown";
/** The states the gate refuses, least bad first (an override recorded at one covers it and the ones before). */
export const BAD_STATES = ["unconfirmed", "out", "gone"] as const;
export type BadState = (typeof BAD_STATES)[number];
export type PriceField = "price" | "compareAtPrice";

/** One linked product as `linkedProducts` returns it. `id` is the link id; `row` null = gone. */
export type LinkedProduct = { id: string; row: ProductRow | null; group: ProductRow[]; name: string; state: StockState };

/** A price recorded as said about a product: what the gate re-checks. */
export const PriceEntry = z.object({ productId: z.string(), field: z.enum(["price", "compareAtPrice"]), amount: z.number() });
/** A check's price snapshot, read back from its rows: every row carrying a whole PriceEntry is one entry. */
export const snapshotOf = (results: unknown): PriceEntry[] =>
  (Array.isArray(results) ? results : []).flatMap((r) => (r?.productId && r.field ? (PriceEntry.safeParse(r).data ?? []) : []));
export type PriceEntry = z.infer<typeof PriceEntry>;
export type Snapshot = PriceEntry[];

/**
 * `ApprovalDecision.productOverride`: the products approved anyway and the state each was in then, and `offers`, the
 * campaign ids whose offer had ended (server/content/offer-checks.ts `offerIssues`).
 */
export const ProductOverride = z.object({ productIds: z.array(z.string()), states: z.record(z.string(), z.enum(BAD_STATES)), offers: z.array(z.string()).optional() });
export type ProductOverride = z.infer<typeof ProductOverride>;

/**
 * A Quality row: `CheckResult` (server/content/rules.ts) plus the product keys. Parse AI rows with the plain
 * CheckResult schema, which strips these keys, so only these rules can set them.
 */
export type ProductCheckResult = {
  check: string;
  status: "pass" | "warn" | "blocker";
  note: string;
  kind?: "availability" | "price";
  productId?: string;
  field?: PriceField;
  amount?: number;
};

/** A product gate issue. `refuses`: approval, scheduling and publishing stop on it; `overridable`: "Approve anyway" can cover it. */
export type GateIssue = { productId: string; kind: "availability" | "price"; message: string; refuses: boolean; overridable: boolean };

const STALE_MS = 50 * 3_600_000; // two missed daily syncs
/** The product ids a version body links (`body.productIds`). */
export const linkedIds = (body: unknown) => (body as { productIds?: string[] } | null | undefined)?.productIds ?? [];

/**
 * stockState(group of live variant rows, now) → gone (empty group) / in (a fresh variant claims stock) /
 * unconfirmed (only stale variants claim stock) / out (none claims, one reports) / unknown (none reports).
 * MANUAL rows are always fresh; a synced row is fresh when its `stockCheckedAt` is null or at most 50 h old.
 * ponytail: rows past the sync's MAX_ROWS cap are never stamped, so their stock turns unconfirmed after 50 h;
 * paging the sync past the cap is the upgrade.
 */
export function stockState(group: StockFields[], now: Date): StockState {
  if (!group.length) return "gone";
  const claims = (r: StockFields) => (r.stockQuantity !== null && r.stockQuantity > 0) || r.inStock === true;
  const fresh = (r: StockFields) => r.source === "MANUAL" || r.stockCheckedAt === null || now.getTime() - r.stockCheckedAt.getTime() <= STALE_MS;
  if (group.some((r) => claims(r) && fresh(r))) return "in";
  if (group.some(claims)) return "unconfirmed";
  return group.some((r) => r.inStock !== null || r.stockQuantity !== null) ? "out" : "unknown";
}

const AMOUNT = "\\d{1,3}(?:[ \\u00A0\\u202F.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
const CODES = "EUR|USD|GBP|CHF|CAD";
const PRICE = new RegExp(`(?:[€$£]|\\b(?:${CODES})\\b)\\s?(${AMOUNT})|(${AMOUNT})\\s?(?:[€$£]|(?:${CODES}|euros?)\\b)`, "gi");

/** "1 299,00" / "1.299,00" / "1,299.00" / "1299" → 1299: a trailing 1–2 digit group is the decimals. */
function amountOf(s: string) {
  const t = s.replace(/\s/g, "");
  const dec = /[.,](\d{1,2})$/.exec(t);
  const whole = (dec ? t.slice(0, -dec[0].length) : t).replace(/[.,]/g, "");
  return Math.round(Number(`${whole}.${dec?.[1] ?? "0"}`) * 100) / 100;
}

/**
 * pricesIn(text) → every amount written with a currency: "1 299,00 €" (normal, no-break or narrow no-break
 * spaces), "1.299,00 €", "€1,299.00", "1299 €", "EUR 1299", "1299 euros". `text` is the match as written.
 * ponytail: a number right before a spaced price joins it ("Top 3 299 €" reads 3299); rare in captions.
 */
export function pricesIn(text: string): { amount: number; text: string }[] {
  return [...text.matchAll(PRICE)].map((m) => ({ amount: amountOf(m[1] ?? m[2]!), text: m[0] }));
}

const currencyOf = (link: LinkedProduct) => link.group.find((r) => r.currency)?.currency ?? null;
const cents = (v: Money) => (v === null ? null : Math.round(Number(v.toString()) * 100));

/**
 * stillPriced(group, field, amount) → "unknown" when field is price and every variant's price is null; "yes" when
 * some variant's value in that field equals the amount; else "no". The one price rule Quality and the gate share.
 */
export function stillPriced(group: Pick<ProductRow, "price" | "compareAtPrice">[], field: PriceField, amount: number): "yes" | "no" | "unknown" {
  const values = group.map((r) => cents(r[field]));
  if (field === "price" && values.every((v) => v === null)) return "unknown";
  return values.includes(Math.round(amount * 100)) ? "yes" : "no";
}

function money(amount: number, currency: string | null) {
  try {
    if (currency) return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    // unknown code: plain number below
  }
  return `${amount.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

/** "€10.00 is no longer a price of Milo Sofa (now €12.00)", or "the offer on Milo Sofa ended". */
function noLongerPriced(link: LinkedProduct, entry: PriceEntry) {
  const currency = currencyOf(link);
  const values = link.group.flatMap((r) => (r[entry.field] === null ? [] : [Number(r[entry.field]!.toString())])).sort((a, b) => a - b);
  if (!values.length) return entry.field === "compareAtPrice" ? `The offer on ${link.name} ended` : `Price of ${link.name} unknown`;
  const now = values[0] === values.at(-1) ? money(values[0]!, currency) : `${money(values[0]!, currency)}–${money(values.at(-1)!, currency)}`;
  return `${money(entry.amount, currency)} is no longer a price of ${link.name} (now ${now})`;
}

const STOP = new Set([
  "the", "and", "for", "with", "our", "your", "you", "new", "this", "that", "from", "les", "des", "une", "pour", "avec",
  "dans", "sur", "par", "notre", "nos", "votre", "vos", "est", "qui", "que", "aux", "plus", "tout", "tous", "son", "ses",
]);
/** Folded words of ≥ 3 letters, stop words out: "Canapé Milo" → milo, canape. */
export function words(text: string) {
  const folded = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return new Set((folded.match(/\p{L}{3,}/gu) ?? []).filter((w) => !STOP.has(w)));
}
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

const AVAILABILITY: Record<BadState, (name: string) => string> = {
  gone: (n) => `${n} is no longer in the catalogue`,
  out: (n) => `${n} is out of stock`,
  unconfirmed: (n) => `${n}'s stock hasn't been confirmed for over two days`,
};
const isBad = (s: StockState): s is BadState => (BAD_STATES as readonly string[]).includes(s);
const entryKey = (e: PriceEntry) => `${e.productId}|${e.field}|${e.amount}`;

/**
 * productRows(linked, draftText, previousSnapshot) → Quality's "Product: <name>" rows; the snapshot to store is read
 * back from them (`snapshotOf`). Availability: gone/out/unconfirmed warn (kind "availability"), unknown warns, in passes. Prices (live links
 * only): an amount some variant of a named product has is attributed (pass, recorded); an earlier entry whose amount
 * is still in the text is kept as it was and re-judged (no → blocker, unknown → warn); any other amount warns.
 * `previousSnapshot` is the newest earlier checked version's (null for none). No rows when nothing is linked.
 */
export function productRows(linked: LinkedProduct[], draftText: string, previousSnapshot: Snapshot | null) {
  const rows: ProductCheckResult[] = [];
  const snapshot = new Map<string, PriceEntry>();
  const row = (link: LinkedProduct, status: ProductCheckResult["status"], note: string, extra: Partial<ProductCheckResult> = {}) =>
    rows.push({ check: `Product: ${link.name}`, status, note, productId: link.id, ...extra });

  for (const link of linked) {
    if (isBad(link.state)) row(link, "warn", AVAILABILITY[link.state](link.name), { kind: "availability" });
    else row(link, link.state === "in" ? "pass" : "warn", link.state === "in" ? "In stock" : "Stock not confirmed");
  }

  const mentions = pricesIn(draftText);
  const inText = new Set(mentions.map((m) => m.amount));
  const byId = new Map(linked.map((l) => [l.id, l]));
  for (const entry of previousSnapshot ?? []) {
    const link = byId.get(entry.productId);
    if (!link || !inText.has(entry.amount)) continue; // unlinked, or the amount left the text
    snapshot.set(entryKey(entry), entry);
    // Every kept entry gets a row: the gate reads the snapshot back from these rows.
    const verdict = link.row ? stillPriced(link.group, entry.field, entry.amount) : "gone"; // gone: its availability row stands for it
    if (verdict === "no") row(link, "blocker", noLongerPriced(link, entry), { kind: "price", ...entry });
    else if (verdict === "unknown") row(link, "warn", `Price of ${link.name} unknown`, { kind: "price", ...entry });
    else if (verdict === "gone") row(link, "pass", `${money(entry.amount, null)} is kept as said about ${link.name} until it's taken out of the text`, { kind: "price", ...entry });
    else row(link, "pass", `${money(entry.amount, currencyOf(link))} is still the ${entry.field === "price" ? "price" : "was-price"} of ${link.name}`, { kind: "price", ...entry });
  }

  const live = linked.filter((l) => l.row);
  const textWords = words(draftText);
  const named = linked.length === 1 ? live : live.filter((l) => overlap(words(l.name), textWords) > 0);
  const handled = new Set([...snapshot.values()].map((e) => e.amount));
  for (const m of mentions) {
    if (handled.has(m.amount)) continue;
    handled.add(m.amount);
    let attributed = false;
    for (const link of named) {
      const field = (["price", "compareAtPrice"] as const).find((f) => stillPriced(link.group, f, m.amount) === "yes");
      if (!field) continue;
      const entry = { productId: link.id, field, amount: m.amount };
      snapshot.set(entryKey(entry), entry);
      row(link, "pass", `${m.text} is a current ${field === "price" ? "price" : "compare-at price"} of ${link.name}`, { kind: "price", ...entry });
      attributed = true;
      break;
    }
    if (!attributed && live.length) rows.push({ check: "Product prices", status: "warn", note: `${m.text} isn't a price of a linked product; fine if it's about something else`, kind: "price", amount: m.amount });
  }
  return rows;
}

/**
 * gateIssues(linked, snapshot, override) → every product issue on a version. Availability (gone/out/unconfirmed)
 * refuses unless `override` lists the product at a state at least as bad (unconfirmed < out < gone). A snapshot
 * entry of a live link that `stillPriced` calls "no" always refuses; "unknown" is an issue that doesn't refuse.
 * Pass `override: null` to list what an override would have to cover.
 */
export function gateIssues(linked: LinkedProduct[], snapshot: Snapshot, override: ProductOverride | null): GateIssue[] {
  const issues: GateIssue[] = [];
  for (const link of linked) {
    if (!isBad(link.state)) continue;
    const recorded = override?.productIds.includes(link.id) ? override.states[link.id] : undefined;
    const covered = recorded !== undefined && BAD_STATES.indexOf(recorded) >= BAD_STATES.indexOf(link.state);
    issues.push({ productId: link.id, kind: "availability", message: AVAILABILITY[link.state](link.name), refuses: !covered, overridable: true });
  }
  const byId = new Map(linked.map((l) => [l.id, l]));
  for (const entry of snapshot) {
    const link = byId.get(entry.productId);
    if (!link?.row) continue; // unlinked, or gone (its availability issue stands for it)
    const verdict = stillPriced(link.group, entry.field, entry.amount);
    if (verdict === "no") issues.push({ productId: link.id, kind: "price", message: noLongerPriced(link, entry), refuses: true, overridable: false });
    else if (verdict === "unknown") issues.push({ productId: link.id, kind: "price", message: `Price of ${link.name} unknown`, refuses: false, overridable: false });
  }
  return issues;
}

/** What the Brief writer ranks: the ranking fields of active rows, read with `RANK_SELECT`. */
export type RankRow = Pick<ProductRow, "id" | "source" | "externalId" | "title" | "url" | "category" | "inStock" | "stockQuantity" | "stockCheckedAt">;
export const RANK_SELECT = {
  id: true, source: true, externalId: true, title: true, url: true, category: true, inStock: true, stockQuantity: true, stockCheckedAt: true,
} as const satisfies Record<keyof RankRow, true>;
/** A product the Brief writer may link: `id` is its group's representative. */
export type Candidate = { id: string; name: string; category: string | null; state: "in" | "unknown"; score: number };

const MAX_CANDIDATES = 15;
const MIN_SCORED = 5;

/**
 * rankCandidates(active rows, post text (title + angle + idea), now) → up to 15 products, one per variant group,
 * only in stock or unknown. Scored by shared words between the post and the product's name + category; score ≥ 1,
 * in stock first, then score. With fewer than 5 scored, one in-stock product per category (largest first) fills.
 * ponytail: words + categories, not embeddings.
 */
export function rankCandidates(rows: RankRow[], postText: string, now: Date): Candidate[] {
  const groups = new Map<string, RankRow[]>();
  for (const r of rows) groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r]);
  const post = words(postText);
  const all: Candidate[] = [];
  for (const group of groups.values()) {
    const state = stockState(group, now);
    if (state !== "in" && state !== "unknown") continue;
    const rep = [...group].sort(byExternalId)[0]!;
    const name = productName(rep.title);
    all.push({ id: rep.id, name, category: rep.category, state, score: overlap(words(`${name} ${rep.category ?? ""}`), post) });
  }
  const chosen = all
    .filter((c) => c.score >= 1)
    .sort((a, b) => Number(b.state === "in") - Number(a.state === "in") || b.score - a.score)
    .slice(0, MAX_CANDIDATES);
  if (chosen.length >= MIN_SCORED) return chosen;
  const sizes = new Map<string, number>();
  for (const c of all) if (c.category) sizes.set(c.category, (sizes.get(c.category) ?? 0) + 1);
  const taken = new Set(chosen.map((c) => c.id));
  for (const [category] of [...sizes].sort((a, b) => b[1] - a[1])) {
    if (chosen.length >= MAX_CANDIDATES) break;
    const pick = all.find((c) => c.category === category && c.state === "in" && !taken.has(c.id));
    if (pick) chosen.push(pick);
  }
  return chosen;
}
