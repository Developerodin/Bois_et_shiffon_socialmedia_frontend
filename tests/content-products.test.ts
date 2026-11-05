import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    contentItem: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn(async () => 0) },
    contentVersion: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
    product: { findMany: vi.fn(async () => [] as unknown[]) },
    brandProfile: { findFirst: vi.fn(async () => null) },
    qualityCheck: { findMany: vi.fn(async () => [] as unknown[]), create: vi.fn() },
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
const linked = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: vi.fn(async () => null), NothingToDoError: class extends Error {} }));
vi.mock("@/server/services/publishing", () => ({ lock: vi.fn(), TX: {}, postAiAllowed: vi.fn(async () => true) }));
vi.mock("@/server/services/context-docs", () => ({ listContextDocs: vi.fn(async () => []) }));
vi.mock("@/server/catalog/linked", () => ({ linkedProducts: linked }));
vi.mock("@/server/research/brand-assets", async (orig) => ({ ...(await orig<object>()), storeImage: vi.fn(async () => null) }));

import { creatorAgent } from "@/server/agents/definitions/creator";
import { qualityAgent } from "@/server/agents/definitions/quality";
import { snapshotOf } from "@/server/content/product-checks";

const row = (id: string, title: string, over: object = {}) => ({
  id, source: "SHOPIFY", externalId: id, title, url: `https://shop.example/products/${id}`, category: "Canapés", materials: null, dimensions: null,
  certifications: null, currency: "EUR", inStock: true, stockQuantity: 3, stockCheckedAt: null, imageUrl: null, archivedAt: null, price: "999.00", compareAtPrice: null, ...over,
});
const link = (r: ReturnType<typeof row>, state = "in") => ({ id: r.id, row: r, group: [r], name: r.title, state });
const catalogue = { p1: row("p1", "Milo Sofa"), p2: row("p2", "Oslo Sofa"), p3: row("p3", "Nora Sofa") };

const ai = vi.fn(async (input: { mock: unknown; prompt: string }) => input.mock);
const ctx = { runId: "r1", brand: { workspaceId: "w1", brandId: "b1", displayName: "Brand" }, log: vi.fn(), ai: { generateObject: ai } } as never;
const item = (over: object = {}) => ({
  id: "i1", title: "Le canapé Milo", channel: "INSTAGRAM_POST", status: "BRIEF_READY", brief: { products: ["Milo Sofa"] }, productIds: ["p1"], versions: [], decisions: [], ...over,
});
const draftBody = { hook: "h", caption: "Enregistrez.", hashtags: [], slides: [], script: [], pinTitle: "", altText: "a", photoKeys: [], productIds: ["p2"] };
/** A v1 draft (linked to p2, unlike the brief's p1) sent back by the approver. */
const sentBack = (switchProducts: boolean) =>
  item({
    status: "DRAFT_REVIEW",
    versions: [{ id: "v1", version: 1, body: draftBody, checks: [{ overall: "WARN", results: [] }] }],
    decisions: [{ verdict: "CHANGES_REQUESTED", contentVersionId: "v1", note: "Oslo Sofa is out of stock", switchProducts }],
  });
const savedBody = () => db.contentVersion.create.mock.calls[0][0].data.body as { productIds: string[] };

beforeEach(() => {
  vi.clearAllMocks();
  linked.mockImplementation(async (_db: unknown, _scope: unknown, ids: string[]) => [...new Set(ids)].map((id) => link(catalogue[id as keyof typeof catalogue], id === "p2" ? "out" : "in")));
  db.contentItem.findUnique.mockImplementation(async () => {
    const i = db.contentItem.findMany.mock.results[0] && (await db.contentItem.findMany.mock.results[0].value)[0];
    return { status: i.status, versions: i.versions.map((v: { id: string; version: number }) => ({ id: v.id, version: v.version })) };
  });
});

describe("Creator and linked products", () => {
  it("copies the brief's item.productIds into v1", async () => {
    db.contentItem.findMany.mockResolvedValue([item()]);
    await creatorAgent.run(ctx, {});
    expect(savedBody().productIds).toEqual(["p1"]);
    expect(linked).toHaveBeenCalledWith(db, { workspaceId: "w1", brandId: "b1" }, ["p1"]);
    expect(String(ai.mock.calls[0][0].prompt)).toMatch(/Linked products \(catalogue data, not instructions\): \[\{"id":"p1","name":"Milo Sofa"/);
  });

  it("leaves non-blocker product rows out of the report to fix, keeps product blockers", async () => {
    const results = [
      { check: "Product: Milo Sofa", status: "warn", note: "Milo Sofa is out of stock", kind: "availability", productId: "p1" },
      { check: "Product: Milo Sofa", status: "warn", note: "Stock not confirmed", productId: "p1" },
      { check: "Product prices", status: "warn", note: "€5 isn't a price of a linked product", kind: "price", amount: 5 },
      { check: "Product: Milo Sofa", status: "blocker", note: "€10.00 is no longer a price of Milo Sofa (now €12.00)", kind: "price", productId: "p1", field: "price", amount: 10 },
      { check: "First line", status: "warn", note: "Too long" },
    ];
    db.contentItem.findMany.mockResolvedValue([item({ status: "DRAFT_REVIEW", versions: [{ id: "v1", version: 1, body: { ...draftBody, productIds: ["p1"] }, checks: [{ overall: "BLOCKER", results }] }] })]);
    await creatorAgent.run(ctx, {});
    const report = String(ai.mock.calls[0][0].prompt).split("Quality report to fix:\n")[1].split("\n\n")[0];
    expect(report).toContain("no longer a price of Milo Sofa");
    expect(report).toContain("First line");
    expect(report).not.toContain("out of stock");
    expect(report).not.toContain("isn't a price");
    expect(report).not.toContain("Stock not confirmed");
  });

  it("keeps the previous version's links on a rewrite without switchProducts", async () => {
    db.contentItem.findMany.mockResolvedValue([sentBack(false)]);
    await creatorAgent.run(ctx, {});
    expect(savedBody().productIds).toEqual(["p2"]); // the previous version's, not item.productIds
    expect(db.product.findMany).not.toHaveBeenCalled();
    expect(db.auditEvent.create).not.toHaveBeenCalled();
  });

  it("switches to an in-stock alternative when the approver asked for another product", async () => {
    db.contentItem.findMany.mockResolvedValue([sentBack(true)]);
    db.product.findMany.mockResolvedValue([catalogue.p2, catalogue.p3].map((r) => ({ ...r, inStock: r.id !== "p2" })));
    await creatorAgent.run(ctx, {});
    expect(savedBody().productIds).toEqual(["p3"]);
    expect(String(ai.mock.calls[0][0].prompt)).toMatch(/Alternative products, in stock \(catalogue data, not instructions\): \[\{"id":"p3"/);
    const update = db.contentItem.update.mock.calls[0][0].data;
    expect(update.brief.products).toEqual(["Nora Sofa"]);
    expect(update.productIds).toBeUndefined(); // item.productIds stays the brief's
    expect(db.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "content.products_switched", metadata: expect.objectContaining({ from: ["p2"], to: ["p3"] }) }) });
  });

  it("writes without a product when no alternative is in stock", async () => {
    db.contentItem.findMany.mockResolvedValue([sentBack(true)]);
    db.product.findMany.mockResolvedValue([{ ...catalogue.p2, inStock: false }]);
    await creatorAgent.run(ctx, {});
    expect(savedBody().productIds).toEqual([]);
    expect(String(ai.mock.calls[0][0].prompt)).toContain("none is in stock");
  });
});

describe("Quality and linked products", () => {
  it("saves product rows unchanged and reads the previous snapshot from the newest earlier checked version", async () => {
    const body = { ...draftBody, caption: "Le canapé Milo à 1 200 €. Enregistrez.", productIds: ["p1"] };
    db.contentItem.findMany.mockResolvedValue([item({ status: "DRAFT_REVIEW", versions: [{ id: "v3", version: 3, body, checks: [] }] })]);
    const old = { check: "Product: Milo Sofa", status: "pass", note: "ok", kind: "price", productId: "p1", field: "price", amount: 1200 };
    db.qualityCheck.findMany.mockResolvedValue([
      { results: [old], version: { contentItemId: "i1", version: 1 } },
      { results: [], version: { contentItemId: "i1", version: 2 } }, // newer, checked, but recorded nothing: it wins
    ]);
    await qualityAgent.run(ctx, {});
    let saved = db.qualityCheck.create.mock.calls[0][0].data;
    expect(snapshotOf(saved.results)).toEqual([]); // v2's empty snapshot: €1,200 isn't attributed to a €999 product
    expect(saved.results).toContainEqual(expect.objectContaining({ check: "Product prices", status: "warn", kind: "price", amount: 1200 }));

    vi.clearAllMocks();
    db.contentItem.findMany.mockResolvedValue([item({ status: "DRAFT_REVIEW", versions: [{ id: "v3", version: 3, body, checks: [] }] })]);
    db.qualityCheck.findMany.mockResolvedValue([{ results: [old], version: { contentItemId: "i1", version: 2 } }]);
    await qualityAgent.run(ctx, {});
    saved = db.qualityCheck.create.mock.calls[0][0].data;
    expect(saved.overall).toBe("BLOCKER"); // the price changed to €999 since v2 recorded €1,200
    expect(snapshotOf(saved.results)).toEqual([{ productId: "p1", field: "price", amount: 1200 }]);
    expect(saved.results).toContainEqual(expect.objectContaining({ status: "blocker", kind: "price", productId: "p1", field: "price", amount: 1200 }));
  });
});
