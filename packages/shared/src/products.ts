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
