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

/**
 * Rows a person owns: added by hand (MANUAL) or from their spreadsheet (IMPORT). Every field is editable, the row can
 * be deleted, and its stock is always fresh; synced rows take only the person fields and go stale.
 */
export const personOwned = (source: string) => source === "MANUAL" || source === "IMPORT";

/** The key a row groups under: synced rows of one source sharing a product handle; MANUAL or URL-less rows alone. */
export function groupKey(row: { id: string; source: string; url: string | null }) {
  const handle = row.source === "MANUAL" ? null : handleOf(row.url);
  return handle ? `${row.source}:${handle}` : `id:${row.id}`;
}

/** First by externalId (numeric order): a group's representative, the id a link stores. */
export const byExternalId = (a: { externalId: string | null }, b: { externalId: string | null }) =>
  (a.externalId ?? "").localeCompare(b.externalId ?? "", undefined, { numeric: true });

/** Why the last catalogue sync failed, as a kind the apps word themselves. */
export type SyncReason = "not-a-feed" | "blocked" | "partial" | "failed" | "shopify-refused";
/** A brand's last catalogue sync (BrandProfile.catalogSync). `error` is the message the web shows; `reason` lets the app say it in the person's language. */
export type CatalogSync = { at: string; source: "WEBSITE" | "SHOPIFY" | "SITE" | null; count: number; error: string | null; reason?: SyncReason | null };

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

/** What a spreadsheet column can be imported as (the import screen's dropdown); `title` is required. */
export const IMPORT_FIELDS = [
  "title", "sku", "url", "imageUrl", "price", "compareAtPrice", "currency", "category", "description",
  "inStock", "stockQuantity", "materials", "dimensions", "certifications",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
/**
 * A row skipped, or imported with a value left out (an in-stock value that isn't yes or no): its line in the CSV or
 * row number in Excel, and why. `skipped`: the row was not imported (the server always sends it).
 */
export type ImportProblem = { row: number; reason: string; skipped?: boolean };
/**
 * The import preview (?dryRun=1): the file's headers, the mapping (guessed, or the one sent), its first 20 data rows
 * as written, and what importing with that mapping would skip. `needsApproval`: fields this person can't import
 * (stock, prices, facts need rules.approve); empty when they can import every field.
 */
export type ImportPreviewDto = {
  headers: string[];
  mapping: (ImportField | null)[];
  sample: string[][];
  rowCount: number;
  skipped: number;
  duplicates: number;
  problems: ImportProblem[];
  needsApproval: ImportField[];
};
/** What an import did. `problems`: the first 50 (ImportProblem). */
export type ImportResultDto = {
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  skipped: number;
  duplicates: number;
  problems: ImportProblem[];
};
