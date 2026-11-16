import { describe, expect, it, vi } from "vitest";
import type { ProductRow } from "@/server/content/product-checks";

vi.mock("@/server/db/prisma", () => ({ prisma: {} })); // sync.ts imports it; linkedProducts uses the db it's given
import { linkedProducts } from "@/server/catalog/linked";

type Row = ProductRow & { workspaceId: string; brandId: string };
type Where = {
  workspaceId: string; brandId: string; id?: { in: string[] }; archivedAt?: null;
  OR?: ({ url: { contains: string } } | { source: string; externalId: string })[];
};

/** A product table that answers the two shapes of query linkedProducts sends. */
function fakeDb(rows: Row[]) {
  const findMany = vi.fn(async ({ where }: { where: Where }) =>
    rows.filter((r) =>
      r.workspaceId === where.workspaceId && r.brandId === where.brandId &&
      (!where.id || where.id.in.includes(r.id)) &&
      (where.archivedAt !== null || r.archivedAt === null) &&
      (!where.OR || where.OR.some((c) => ("url" in c ? !!r.url?.toLowerCase().includes(c.url.contains.toLowerCase()) : r.source === c.source && r.externalId === c.externalId))),
    ),
  );
  return { db: { product: { findMany } } as never, findMany };
}

const scope = { workspaceId: "w1", brandId: "b1" };
const now = new Date("2026-11-05T12:00:00Z");
function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id, workspaceId: "w1", brandId: "b1", source: "WEBSITE", externalId: id, title: "Milo Sofa — Linen", url: "https://shop.example/products/milo",
    category: "Sofas", materials: null, dimensions: null, certifications: null, currency: "EUR", inStock: true, stockQuantity: null,
    stockCheckedAt: now, imageUrl: null, archivedAt: null, price: "10.00", compareAtPrice: null, ...over,
  };
}

describe("linkedProducts", () => {
  it("an id from another brand is gone", async () => {
    const { db } = fakeDb([row("p1", { brandId: "b2" })]);
    expect(await linkedProducts(db, scope, ["p1"], now)).toEqual([{ id: "p1", row: null, group: [], name: "a removed product", state: "gone" }]);
  });

  it("maps a store switch both ways by variant number", async () => {
    const archivedWebsite = row("w123", { externalId: "123", archivedAt: now });
    const shopify = row("s123", { source: "SHOPIFY", externalId: "gid://shopify/ProductVariant/123", price: "12.00" });
    const shopifySibling = row("s124", { source: "SHOPIFY", externalId: "gid://shopify/ProductVariant/124", title: "Milo Sofa — Velvet" });
    let { db } = fakeDb([archivedWebsite, shopify, shopifySibling]);
    const [toShopify] = await linkedProducts(db, scope, ["w123"], now);
    expect(toShopify).toMatchObject({ id: "w123", name: "Milo Sofa", state: "in" });
    expect(toShopify!.row?.id).toBe("s123");
    expect(toShopify!.group.map((r) => r.id).sort()).toEqual(["s123", "s124"]);

    const archivedShopify = row("s9", { source: "SHOPIFY", externalId: "gid://shopify/ProductVariant/9", archivedAt: now });
    const website = row("w9", { externalId: "9" });
    ({ db } = fakeDb([archivedShopify, website]));
    expect((await linkedProducts(db, scope, ["s9"], now))[0]!.row?.id).toBe("w9");
  });

  it("a deleted variant of a live product maps to its first live sibling; with none it's gone, named from its row", async () => {
    const deleted = row("v1", { externalId: "1", archivedAt: now });
    const { db, findMany } = fakeDb([deleted, row("v30", { externalId: "30" }), row("v4", { externalId: "4" })]);
    const [linked] = await linkedProducts(db, scope, ["v1", "v1"], now);
    expect(linked!.row?.id).toBe("v4");
    expect(findMany).toHaveBeenCalledTimes(2); // the ids, then the live rows and groups

    const alone = fakeDb([row("m1", { source: "SHOPIFY", externalId: "gid://shopify/ProductVariant/77", url: null, title: "Old Lamp", archivedAt: now })]);
    expect(await linkedProducts(alone.db, scope, ["m1"], now)).toMatchObject([{ row: null, name: "Old Lamp", state: "gone" }]);
  });
});
