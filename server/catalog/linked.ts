import type { Prisma, PrismaClient } from "@prisma/client";
import { variantNumericId } from "@/server/catalog/sync";
import {
  REMOVED_PRODUCT_NAME, byExternalId, groupKey, handleOf, productName, stockState, type LinkedProduct, type ProductRow,
} from "@/server/content/product-checks";

type Scope = { workspaceId: string; brandId: string };
type Db = Pick<PrismaClient, "product"> | Prisma.TransactionClient;

/** The live row of the other synced source holding the same Shopify variant (WEBSITE "123" ↔ SHOPIFY gid). */
function otherSourceId(row: ProductRow) {
  if (!row.externalId) return null;
  if (row.source === "SHOPIFY") {
    const n = variantNumericId(row.externalId);
    return n ? { source: "WEBSITE" as const, externalId: n } : null;
  }
  return row.source === "WEBSITE" ? { source: "SHOPIFY" as const, externalId: `gid://shopify/ProductVariant/${row.externalId}` } : null;
}

/**
 * linkedProducts(db, scope, ids) → one LinkedProduct per distinct id, in order: the live row the link reads (null =
 * gone), its variant group (live rows), its name and its stockState. The only way content code reads products.
 * Ids outside the workspace + brand are gone. An archived id maps to the other synced source's live row of the
 * same variant, else to the first live row (by externalId) of its own source with the same /products/<handle>.
 * A gone link is named from its archived row, or "a removed product" when the row was deleted.
 * Queries: the ids, then the live rows they map to and their groups (a third only when a store switch lands on
 * a handle the first two didn't ask for). `db` may be a transaction.
 */
export async function linkedProducts(db: Db, scope: Scope, ids: string[], now = new Date()): Promise<LinkedProduct[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const where = { workspaceId: scope.workspaceId, brandId: scope.brandId };
  const own = new Map((await db.product.findMany({ where: { ...where, id: { in: unique } }, omit: { description: true } })).map((r) => [r.id, r]));

  const live: ProductRow[] = [];
  const fetchLive = async (handles: string[], others: { source: "WEBSITE" | "SHOPIFY"; externalId: string }[]) => {
    const or = [...handles.map((h) => ({ url: { contains: `/products/${h}`, mode: "insensitive" as const } })), ...others];
    if (or.length) live.push(...(await db.product.findMany({ where: { ...where, archivedAt: null, OR: or }, omit: { description: true } })));
  };
  const handles = (rows: ProductRow[]) => [...new Set(rows.flatMap((r) => (r.source === "MANUAL" ? [] : handleOf(r.url) ?? [])))];
  const rows = [...own.values()];
  await fetchLive(handles(rows), rows.flatMap((r) => (r.archivedAt ? otherSourceId(r) ?? [] : [])));

  const resolve = (row: ProductRow): ProductRow | null => {
    if (!row.archivedAt) return row;
    const other = otherSourceId(row);
    const switched = other && live.find((r) => r.source === other.source && r.externalId === other.externalId);
    if (switched) return switched;
    const key = groupKey(row);
    return key.startsWith("id:") ? null : live.filter((r) => groupKey(r) === key).sort(byExternalId)[0] ?? null;
  };
  const resolved = new Map(rows.map((r) => [r.id, resolve(r)]));
  const asked = new Set(handles(rows));
  const missing = handles([...resolved.values()].flatMap((r) => r ?? [])).filter((h) => !asked.has(h));
  await fetchLive(missing, []);

  return unique.map((id) => {
    const mine = own.get(id);
    const row = mine ? resolved.get(id) ?? null : null;
    const key = row && groupKey(row);
    const group = !row ? [] : key!.startsWith("id:") ? [row] : [...new Map([row, ...live.filter((r) => groupKey(r) === key)].map((r) => [r.id, r])).values()];
    return { id, row, group, name: row ? productName(row.title) : mine ? productName(mine.title) : REMOVED_PRODUCT_NAME, state: stockState(group, now) };
  });
}
