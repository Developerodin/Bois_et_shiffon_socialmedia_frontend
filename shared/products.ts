/** The name of a gone link whose row was deleted (MANUAL rows are hard-deleted). */
export const REMOVED_PRODUCT_NAME = "a removed product";

/**
 * "Oslo Chair — Oak" → "Oslo Chair": a product's name is its representative's title before the variant, on one line
 * (names go into prompts after the last "---"; a newline could fake a new section).
 */
export const productName = (title: string) => title.split(" — ")[0]!.replace(/\s+/g, " ").trim();

/** `/products/<handle>` of a URL, or null (no URL, not a product page). */
export function handleOf(url: string | null) {
  if (!url) return null;
  try {
    const m = /\/products\/([^/]+)/.exec(new URL(url).pathname);
    return m ? m[1]!.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The key a row groups under: synced rows of one source sharing a product handle; MANUAL or URL-less rows alone. */
export function groupKey(row: { id: string; source: string; url: string | null }) {
  const handle = row.source === "MANUAL" ? null : handleOf(row.url);
  return handle ? `${row.source}:${handle}` : `id:${row.id}`;
}

/** First by externalId (numeric order): a group's representative, the id a link stores. */
export const byExternalId = (a: { externalId: string | null }, b: { externalId: string | null }) =>
  (a.externalId ?? "").localeCompare(b.externalId ?? "", undefined, { numeric: true });

/** Why the last catalogue sync failed, as a kind the apps word themselves. */
export type SyncReason = "not-a-feed" | "partial" | "failed" | "shopify-refused";
/** A brand's last catalogue sync (BrandProfile.catalogSync). `error` is the message the web shows; `reason` lets the app say it in the person's language. */
export type CatalogSync = { at: string; source: "WEBSITE" | "SHOPIFY" | null; count: number; error: string | null; reason?: SyncReason | null };

/**
 * "12 in stock" / "In stock" / "Out of stock" / "Unknown". A count of 0 or less with inStock true is a store that
 * doesn't track that item's inventory or keeps selling it: it's for sale, so "In stock". Shared so the Products table
 * and the chat say the same thing.
 */
export function stockLabel(p: { inStock: boolean | null; stockQuantity: number | null }) {
  if (p.stockQuantity !== null && p.stockQuantity > 0) return `${p.stockQuantity} in stock`;
  if (p.inStock !== null) return p.inStock ? "In stock" : "Out of stock";
  return p.stockQuantity !== null ? "Out of stock" : "Unknown";
}
