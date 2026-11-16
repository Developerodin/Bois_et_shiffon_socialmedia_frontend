/**
 * Product catalogue pure-logic checks (server/catalog): feed variant → row, price parsing, HTML stripping,
 * variant titles, "archive only after a complete fetch", the row cap, Shopify ids and throttling, the stock label.
 * No network, no database.
 * Run: npx tsx --conditions=react-server --env-file=.env scripts/check-catalog.ts
 */
import assert from "node:assert/strict";
import { stockLabel } from "@/components/products/api";
import { shopDomain, throttleWaitMs } from "@/server/catalog/shopify";
import { archiveWhere, capRows, MAX_ROWS, parsePrice, sameRow, shopifyRows, variantNumericId, variantTitle, websiteRows } from "@/server/catalog/sync";

// Prices: strings and numbers to 2 decimals; empty, negative, NaN, Infinity, junk → null.
assert.equal(parsePrice("12.5"), "12.50");
assert.equal(parsePrice(7), "7.00");
assert.equal(parsePrice("0"), "0.00");
for (const bad of ["", "  ", "abc", "NaN", "-1", "Infinity", "1e12", null, undefined, {}, NaN]) assert.equal(parsePrice(bad), null, String(bad));
// Same cap as ProductInput (fits Decimal(12,2)): just under 1e9 is a price, 1e9 and up isn't.
assert.equal(parsePrice("999999999.99"), "999999999.99");
for (const big of [1e9, "1000000000", "9999999999.99"]) assert.equal(parsePrice(big), null, String(big));

// Variant titles.
assert.equal(variantTitle("Chair", "Default Title"), "Chair");
assert.equal(variantTitle("Chair", "Oak / Large"), "Chair — Oak / Large");
assert.equal(variantTitle("Chair", ""), "Chair");
assert.equal(variantTitle("Chair", null), "Chair");

// Feed → rows.
const feed = [
  {
    title: "Doudou lapin",
    handle: "doudou-lapin",
    product_type: " Doudous ",
    body_html: "<p>Coton <strong>bio</strong> &amp; lin.</p><script>alert(1)</script><p>Lavable</p>",
    images: [{ src: "https://cdn.shopify.com/s/files/1/a.jpg" }],
    variants: [
      { id: 111, title: "Default Title", sku: " DL-01 ", price: "29.90", compare_at_price: null, available: true },
    ],
  },
  {
    title: "Mobile",
    handle: "mobile",
    variants: [
      { id: "222", title: "Rose", sku: "", price: "NaN", compare_at_price: "45", available: false, featured_image: { src: "javascript:alert(1)" } },
      { title: "no id" },
    ],
  },
  { title: "No handle", variants: [{ id: 3 }] },
  null,
  "junk",
];
const rows = websiteRows(feed, "https://www.example.com", "EUR");
assert.equal(rows.length, 2);
assert.deepEqual(rows[0], {
  externalId: "111",
  sku: "DL-01",
  title: "Doudou lapin",
  url: "https://www.example.com/products/doudou-lapin",
  category: "Doudous",
  description: "Coton bio & lin.\n Lavable", // crawl.ts htmlText keeps the space a dropped <script> leaves
  price: "29.90",
  compareAtPrice: null,
  currency: "EUR",
  inStock: true,
  stockQuantity: null,
  imageUrl: "https://cdn.shopify.com/s/files/1/a.jpg?width=1200",
});
assert.equal(rows[1].title, "Mobile — Rose");
assert.equal(rows[1].sku, null);
assert.equal(rows[1].price, null);
assert.equal(rows[1].compareAtPrice, "45.00");
assert.equal(rows[1].inStock, false);
assert.equal(rows[1].imageUrl, null); // only http(s) image links
assert.equal(rows[1].description, null);
assert.equal(websiteRows([{ title: "x", handle: "x", body_html: `<p>${"a".repeat(6000)}</p>`, variants: [{ id: 1 }] }], "https://e.com", null)[0].description?.length, 5000);

// Shopify Admin variants → rows.
const [admin] = shopifyRows(
  [{
    id: "gid://shopify/ProductVariant/1",
    sku: "S1",
    title: "Blue",
    price: "10.00",
    compareAtPrice: null,
    inventoryQuantity: 12,
    availableForSale: true,
    product: { title: "Cape", handle: "cape", onlineStoreUrl: null, productType: "", description: "Soft", status: "ACTIVE", featuredMedia: null },
  }],
  "EUR",
);
assert.equal(admin.title, "Cape — Blue");
assert.equal(admin.stockQuantity, 12);
assert.equal(admin.url, null);
assert.equal(admin.category, null);

// Archive only after a complete fetch; never MANUAL; the other synced source goes too.
const scope = { workspaceId: "w", brandId: "b" };
assert.equal(archiveWhere(scope, "WEBSITE", ["1"], false), null);
assert.deepEqual(archiveWhere(scope, "WEBSITE", ["1", "2"], true), {
  workspaceId: "w",
  brandId: "b",
  archivedAt: null,
  OR: [{ source: "SHOPIFY" }, { source: "WEBSITE", externalId: { notIn: ["1", "2"] } }],
});
assert.deepEqual(archiveWhere(scope, "SHOPIFY", [], true)?.OR, [{ source: "WEBSITE" }, { source: "SHOPIFY", externalId: { notIn: [] } }]);

// Shop domains: the token only ever goes to <handle>.myshopify.com.
assert.equal(shopDomain("My-Store"), "my-store.myshopify.com");
assert.equal(shopDomain(" https://my-store.myshopify.com/ "), "my-store.myshopify.com");
for (const bad of ["my-store.myshopify.com.evil.com", "evil.com", "a.b.myshopify.com", "-x.myshopify.com", "http://x.myshopify.com", "x.myshopify.com/admin", "", "x@y.myshopify.com"]) {
  assert.equal(shopDomain(bad), null, bad);
}

// sameRow: unchanged rows are skipped; Decimal "12.5" equals "12.50"; a change or an archived row is written.
{
  const row = { externalId: "1", sku: "A", title: "T", url: null, category: null, description: null, price: "12.50", compareAtPrice: null, currency: "EUR", inStock: true, stockQuantity: null, imageUrl: null };
  const stored = { ...row, price: "12.5", archivedAt: null };
  assert.equal(sameRow(stored, row), true);
  assert.equal(sameRow({ ...stored, inStock: false }, row), false);
  assert.equal(sameRow({ ...stored, price: null }, row), false);
  assert.equal(sameRow({ ...stored, archivedAt: new Date() }, row), false);
}

// Row cap: more than MAX_ROWS rows is cut to MAX_ROWS and becomes partial (nothing archived).
{
  const row = websiteRows([{ title: "x", handle: "x", variants: [{ id: 1 }] }], "https://e.com", null)[0];
  const many = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ ...row, externalId: String(i) }));
  const capped = capRows({ rows: many, complete: true });
  assert.equal(capped.rows.length, MAX_ROWS);
  assert.equal(capped.complete, false);
  assert.equal(capped.note?.reason, "partial");
  const exact = { rows: many.slice(0, MAX_ROWS), complete: true };
  assert.equal(capRows(exact), exact);
}

// Shopify Admin variant GID ↔ the public feed's numeric variant id.
assert.equal(variantNumericId("gid://shopify/ProductVariant/44123456789"), "44123456789");
for (const bad of ["44123456789", "gid://shopify/Product/1", "gid://shopify/ProductVariant/", "gid://shopify/ProductVariant/1x"]) assert.equal(variantNumericId(bad), null, bad);

// Throttling: wait (requested − available) / restoreRate seconds; nothing when the bucket already holds enough.
assert.equal(throttleWaitMs({ requestedQueryCost: 502, actualQueryCost: null, throttleStatus: { currentlyAvailable: 2, restoreRate: 50 } }), 10_000);
assert.equal(throttleWaitMs({ requestedQueryCost: 100, actualQueryCost: 80, throttleStatus: { currentlyAvailable: 900, restoreRate: 50 } }), 0);

// Stock label: a count wins when positive; 0 or less with inStock true (untracked / keep selling) is "In stock".
assert.equal(stockLabel({ stockQuantity: 12, inStock: true }), "12 in stock");
assert.equal(stockLabel({ stockQuantity: 0, inStock: true }), "In stock");
assert.equal(stockLabel({ stockQuantity: -3, inStock: true }), "In stock");
assert.equal(stockLabel({ stockQuantity: 0, inStock: false }), "Out of stock");
assert.equal(stockLabel({ stockQuantity: 0, inStock: null }), "Out of stock");
assert.equal(stockLabel({ stockQuantity: null, inStock: true }), "In stock");
assert.equal(stockLabel({ stockQuantity: null, inStock: null }), "Unknown");

console.log("check-catalog: all checks passed");
