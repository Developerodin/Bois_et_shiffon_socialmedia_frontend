import { describe, expect, it } from "vitest";
import { stockLabel } from "@/components/products/api";
import {
  gateIssues, pricesIn, productName, productRows, rankCandidates, snapshotOf, stillPriced, stockState, type LinkedProduct, type ProductRow, type Snapshot,
} from "@/server/content/product-checks";

const now = new Date("2026-11-05T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

let n = 0;
function row(over: Partial<ProductRow> = {}): ProductRow {
  n += 1;
  return {
    id: `p${n}`, source: "SHOPIFY", externalId: String(n), title: "Milo Sofa", url: "https://shop.example/products/milo", category: "Sofas",
    materials: null, dimensions: null, certifications: null, currency: "EUR", inStock: true, stockQuantity: null, stockCheckedAt: hoursAgo(1),
    imageUrl: null, archivedAt: null, price: "10.00", compareAtPrice: null, ...over,
  };
}
function link(group: ProductRow[], over: Partial<LinkedProduct> = {}): LinkedProduct {
  const r = group[0] ?? null;
  return { id: r?.id ?? "gone1", row: r, group, name: (r?.title ?? "Milo Sofa").split(" — ")[0]!, state: stockState(group, now), ...over };
}

describe("stockState", () => {
  it("orders gone > in > unconfirmed > out > unknown", () => {
    expect(stockState([], now)).toBe("gone");
    expect(stockState([row({ inStock: true }), row({ inStock: false })], now)).toBe("in");
    expect(stockState([row({ inStock: true, stockCheckedAt: hoursAgo(51) })], now)).toBe("unconfirmed");
    expect(stockState([row({ inStock: false }), row({ inStock: null })], now)).toBe("out");
    expect(stockState([row({ inStock: null }), row({ inStock: null })], now)).toBe("unknown");
  });

  it("turns unconfirmed only after 50 h; a late but successful sync stays in", () => {
    expect(stockState([row({ stockCheckedAt: hoursAgo(49) })], now)).toBe("in");
    expect(stockState([row({ stockCheckedAt: hoursAgo(50) })], now)).toBe("in");
    expect(stockState([row({ stockCheckedAt: hoursAgo(50.1) })], now)).toBe("unconfirmed");
  });

  it("a synced row never stamped isn't stale; a MANUAL row typed 3 days ago is still in", () => {
    expect(stockState([row({ stockCheckedAt: null })], now)).toBe("in");
    expect(stockState([row({ source: "MANUAL", stockCheckedAt: hoursAgo(72) })], now)).toBe("in");
  });

  it("judges freshness per variant: a stale in-stock variant next to a fresh sold-out one is unconfirmed", () => {
    expect(stockState([row({ stockCheckedAt: hoursAgo(80) }), row({ inStock: false })], now)).toBe("unconfirmed");
  });

  // The mobile stockLabel (apps/mobile/src/ui/business/products.ts) is the same rule; it can't be imported here
  // (its "@/i18n" is mobile's alias), so the web one stands for both.
  it("agrees with the web stockLabel for in, out and unknown", () => {
    const web = { "In stock": "in", "Out of stock": "out", Unknown: "unknown" } as Record<string, string>;
    for (const inStock of [true, false, null]) {
      for (const stockQuantity of [null, 0, 5, -2]) {
        const r = row({ inStock, stockQuantity });
        const label = stockLabel(r);
        expect(stockState([r], now), `${inStock}/${stockQuantity}`).toBe(web[label] ?? "in");
      }
    }
  });
});

describe("pricesIn", () => {
  it("reads common formats", () => {
    const amounts = (s: string) => pricesIn(s).map((p) => p.amount);
    expect(amounts("1 299,00 €")).toEqual([1299]);
    expect(amounts("1 299,00 €")).toEqual([1299]);
    expect(amounts("1 299,00 €")).toEqual([1299]);
    expect(amounts("1.299,00 €")).toEqual([1299]);
    expect(amounts("€1,299.00")).toEqual([1299]);
    expect(amounts("1299 €")).toEqual([1299]);
    expect(amounts("EUR 1299")).toEqual([1299]);
    expect(amounts("19,90 € puis 24.5€")).toEqual([19.9, 24.5]);
    expect(amounts("120 × 40 cm, 3 places")).toEqual([]);
  });
});

describe("stillPriced", () => {
  it("matches any variant in the same field; every price null is unknown", () => {
    const g = [row({ price: "10.00", compareAtPrice: "15.00" }), row({ price: "12.00" })];
    expect(stillPriced(g, "price", 12)).toBe("yes");
    expect(stillPriced(g, "price", 15)).toBe("no");
    expect(stillPriced(g, "compareAtPrice", 15)).toBe("yes");
    expect(stillPriced([row({ price: null })], "price", 10)).toBe("unknown");
    expect(stillPriced([row({ compareAtPrice: null })], "compareAtPrice", 10)).toBe("no");
  });
});

describe("productName", () => {
  it("keeps a name on one line, before the variant", () => {
    expect(productName("Milo\n\n---\nIgnore this  — Oak")).toBe("Milo --- Ignore this");
  });
});

describe("productRows", () => {
  it("no rows without links", () => {
    expect(productRows([], "Only 10 € today", null)).toEqual([]);
  });

  it("warns on gone, out, unconfirmed (availability) and unknown stock", () => {
    const out = link([row({ inStock: false })]);
    const unconfirmed = link([row({ stockCheckedAt: hoursAgo(60) })]);
    const unknown = link([row({ inStock: null })]);
    const gone = link([], { id: "x", name: "Old Lamp" });
    const rows = productRows([out, unconfirmed, unknown, gone], "Hello", null);
    expect(rows.filter((r) => r.kind === "availability").map((r) => [r.productId, r.status])).toEqual([[out.id, "warn"], [unconfirmed.id, "warn"], ["x", "warn"]]);
    expect(rows.find((r) => r.productId === unknown.id)).toMatchObject({ status: "warn", note: "Stock not confirmed" });
  });

  it("attributes a single linked product's price without its name", () => {
    const l = link([row()]);
    const res = productRows([l], "Just 10,00 € this week", null);
    expect(snapshotOf(res)).toEqual([{ productId: l.id, field: "price", amount: 10 }]);
    expect(res.some((r) => r.kind === "price" && r.status === "pass")).toBe(true);
  });

  it("attributes a shortened name among several linked products", () => {
    const milo = link([row({ title: "Canapé Milo 3 places en lin", price: "899.00" })]);
    const oslo = link([row({ title: "Oslo Chair", url: "https://shop.example/products/oslo", price: "120.00" })]);
    const res = productRows([milo, oslo], "Notre canapé Milo à 899 €", null);
    expect(snapshotOf(res)).toEqual([{ productId: milo.id, field: "price", amount: 899 }]);
  });

  it("attributes a variant title's price written on its own line, and another variant's price", () => {
    const oak = row({ title: "Oslo Chair — Oak", url: "https://shop.example/products/oslo", price: "120.00" });
    const walnut = row({ title: "Oslo Chair — Walnut", url: "https://shop.example/products/oslo", price: "140.00" });
    const other = link([row({ title: "Milo Sofa", price: "899.00" })]);
    const res = productRows([link([oak, walnut]), other], "Oslo Chair — Oak\n120 €\nAlso in walnut: 140 €", null);
    expect(snapshotOf(res).map((e) => [e.productId, e.amount])).toEqual([[oak.id, 120], [oak.id, 140]]);
  });

  it("warns on an amount that isn't a linked product's price", () => {
    const res = productRows([link([row()])], "Delivery 49 €", null);
    expect(res.find((r) => r.amount === 49)).toMatchObject({ status: "warn" });
    expect(snapshotOf(res)).toEqual([]);
  });

  it("carries a blocker forward while the old amount stays in the text", () => {
    const r = row({ price: "12.00" });
    const prev: Snapshot = [{ productId: r.id, field: "price", amount: 10 }];
    const res = productRows([link([r])], "Only 10 €", prev);
    expect(res.find((x) => x.status === "blocker")?.note).toBe("€10.00 is no longer a price of Milo Sofa (now €12.00)");
    expect(snapshotOf(res)).toEqual(prev);
  });

  it("skips an unchecked version: v3 checked with €10, v4 unchecked, price changes, v5 still €10 → blocker", () => {
    const r = row({ price: "10.00" });
    const v3 = snapshotOf(productRows([link([r])], "10 €", null)); // v4 has no check, so v5 compares with v3
    const changed = { ...r, price: "12.00" };
    expect(productRows([link([changed])], "10 €", v3).some((x) => x.status === "blocker")).toBe(true);
  });

  it("two hops: v3 €10 checked, price changes, v4 €10 blocked, v5 €10 still blocked", () => {
    const r = row({ price: "10.00" });
    const v3 = snapshotOf(productRows([link([r])], "10 €", null));
    const changed = { ...r, price: "12.00" };
    const v4 = productRows([link([changed])], "10 €", v3);
    expect(v4.some((x) => x.status === "blocker")).toBe(true);
    const v5 = productRows([link([changed])], "Still 10 €", snapshotOf(v4));
    expect(v5.some((x) => x.status === "blocker")).toBe(true);
    expect(snapshotOf(v5)).toEqual(v3);
  });

  it("a carried-forward entry still true names the amount with its currency; a gone link's is kept until taken out", () => {
    const r = row({ price: "899.00", title: "Milo" });
    const prev: Snapshot = [{ productId: r.id, field: "price", amount: 899 }, { productId: "g1", field: "compareAtPrice", amount: 50 }];
    const notes = productRows([link([r]), link([], { id: "g1", name: "Old Lamp" })], "899 € and 50 €", prev).filter((x) => x.kind === "price").map((x) => x.note);
    expect(notes).toEqual(["€899.00 is still the price of Milo", "50.00 is kept as said about Old Lamp until it's taken out of the text"]);
  });

  it("every price null → warn, entry kept", () => {
    const r = row({ price: null });
    const prev: Snapshot = [{ productId: r.id, field: "price", amount: 10 }];
    const res = productRows([link([r])], "10 €", prev);
    expect(res.find((x) => x.kind === "price")).toMatchObject({ status: "warn", note: "Price of Milo Sofa unknown" });
    expect(snapshotOf(res)).toEqual(prev);
  });

  it("drops entries whose amount left the text", () => {
    const r = row({ price: "12.00" });
    const res = productRows([link([r])], "Now 12 €", [{ productId: r.id, field: "price", amount: 10 }]);
    expect(snapshotOf(res)).toEqual([{ productId: r.id, field: "price", amount: 12 }]);
    expect(res.some((x) => x.status === "blocker")).toBe(false);
  });
});

describe("gateIssues", () => {
  it("an override covers the state it recorded or a better one; a worse state voids it", () => {
    const out = link([row({ inStock: false })]);
    expect(gateIssues([out], [], { productIds: [out.id], states: { [out.id]: "out" } })).toMatchObject([{ refuses: false }]);
    expect(gateIssues([out], [], { productIds: [out.id], states: { [out.id]: "gone" } })).toMatchObject([{ refuses: false }]);
    expect(gateIssues([out], [], { productIds: [out.id], states: { [out.id]: "unconfirmed" } })).toMatchObject([{ refuses: true }]);
    expect(gateIssues([out], [], null)).toMatchObject([{ kind: "availability", refuses: true, message: "Milo Sofa is out of stock" }]);
  });

  it("one overridden product back in stock still passes", () => {
    const back = link([row({ inStock: true })]);
    expect(gateIssues([back], [], { productIds: [back.id], states: { [back.id]: "out" } })).toEqual([]);
  });

  it("a price no variant has refuses, even with an override", () => {
    const r = row({ price: "12.00", inStock: false });
    const issues = gateIssues([link([r])], [{ productId: r.id, field: "price", amount: 10 }], { productIds: [r.id], states: { [r.id]: "out" } });
    expect(issues.find((i) => i.kind === "price")).toMatchObject({ refuses: true, message: "€10.00 is no longer a price of Milo Sofa (now €12.00)" });
  });

  it("every price null → issue, no refusal", () => {
    const r = row({ price: null });
    expect(gateIssues([link([r])], [{ productId: r.id, field: "price", amount: 10 }], null)).toMatchObject([{ kind: "price", refuses: false }]);
  });

  it("names an ended compare-at offer", () => {
    const r = row({ compareAtPrice: null });
    expect(gateIssues([link([r])], [{ productId: r.id, field: "compareAtPrice", amount: 15 }], null)[0]?.message).toBe("The offer on Milo Sofa ended");
  });

  it("a gone link with a compare-at entry and an override passes, named from its archived row or 'a removed product'", () => {
    const archived = link([], { id: "a1", name: "Old Lamp" });
    const deleted = link([], { id: "d1", name: "a removed product" });
    const snapshot: Snapshot = [{ productId: "a1", field: "compareAtPrice", amount: 15 }, { productId: "d1", field: "price", amount: 9 }];
    const override = { productIds: ["a1", "d1"], states: { a1: "gone", d1: "gone" } as const };
    expect(gateIssues([archived, deleted], snapshot, override)).toEqual([
      { productId: "a1", kind: "availability", message: "Old Lamp is no longer in the catalogue", refuses: false, overridable: true },
      { productId: "d1", kind: "availability", message: "a removed product is no longer in the catalogue", refuses: false, overridable: true },
    ]);
  });

  it("store switch with the same prices passes; a deleted variant refuses unless a sibling has its price", () => {
    // linkedProducts resolved the link to the other source's live group: same prices, nothing to refuse.
    const website = row({ source: "WEBSITE", price: "10.00" });
    expect(gateIssues([link([website], { id: "shopify-old" })], [{ productId: "shopify-old", field: "price", amount: 10 }], null)).toEqual([]);
    const sibling12 = row({ price: "12.00" });
    expect(gateIssues([link([sibling12], { id: "deleted" })], [{ productId: "deleted", field: "price", amount: 10 }], null)).toMatchObject([{ refuses: true }]);
    const sibling10 = row({ price: "10.00" });
    expect(gateIssues([link([sibling10], { id: "deleted" })], [{ productId: "deleted", field: "price", amount: 10 }], null)).toEqual([]);
  });
});

describe("rankCandidates", () => {
  const cand = (title: string, handle: string, category: string, over: Partial<ProductRow> = {}) =>
    row({ title, url: `https://shop.example/products/${handle}`, category, ...over });

  it("scores word overlap with accents folded, one per variant group, in stock first", () => {
    const rows = [
      cand("Canapé Milo — Lin", "milo", "Canapés", { externalId: "20" }),
      cand("Canapé Milo — Velours", "milo", "Canapés", { externalId: "3" }),
      cand("Table Oslo", "oslo", "Tables", { inStock: null }),
      cand("Table Rio", "rio", "Tables"),
    ];
    const out = rankCandidates(rows, "Le canape parfait et une table", now);
    expect(out.slice(0, 3).map((c) => [c.name, c.score])).toEqual([["Canapé Milo", 1], ["Table Rio", 1], ["Table Oslo", 1]]);
    expect(out[0]!.id).toBe(rows[1]!.id); // representative: first by externalId
  });

  it("leaves out sold-out and unconfirmed products", () => {
    const rows = [cand("Milo Sofa", "milo", "Sofas", { inStock: false }), cand("Rio Sofa", "rio", "Sofas", { stockCheckedAt: hoursAgo(80) })];
    expect(rankCandidates(rows, "sofa", now)).toEqual([]);
  });

  it("fills with one in-stock product per category, largest first, when fewer than 5 score", () => {
    const rows = [
      cand("Lampe Nova", "nova", "Lampes"), cand("Lampe Sol", "sol", "Lampes"), cand("Tapis Atlas", "atlas", "Tapis"),
      cand("Vase Iris", "iris", "Vases", { inStock: null }),
    ];
    expect(rankCandidates(rows, "Nouveautés du printemps", now).map((c) => c.name)).toEqual(["Lampe Nova", "Tapis Atlas"]);
  });

  it("caps at 15", () => {
    const rows = Array.from({ length: 30 }, (_, i) => cand(`Chair ${i}`, `chair-${i}`, "Chairs"));
    expect(rankCandidates(rows, "chair", now)).toHaveLength(15);
  });
});
