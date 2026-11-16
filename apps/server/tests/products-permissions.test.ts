import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  product: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  auditEvent: { create: vi.fn() },
}));
const perms = vi.hoisted(() => ({ set: new Set<string>() }));

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/api/brand-route", () => ({ authorizeBrandRoute: vi.fn(async () => ({ userId: "u1", workspaceId: "w1", brandId: "b1" })) }));
vi.mock("@/server/auth/permissions", () => ({ effectivePermissions: vi.fn(async () => perms.set) }));
vi.mock("@/server/jobs/runner", () => ({ kickIfDue: vi.fn() }));

import { POST } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/products/route";
import { PATCH } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/products/[productId]/route";

const params = Promise.resolve({ workspaceId: "w1", brandId: "b1", productId: "p1" });
const req = (method: string, body: unknown) => new Request("http://x/api", { method, body: JSON.stringify(body) });
const stored = {
  id: "p1", workspaceId: "w1", brandId: "b1", source: "MANUAL", externalId: null, sku: null, title: "Milo Sofa", url: null, category: null,
  description: null, materials: "Oak", dimensions: null, certifications: null, price: null, compareAtPrice: null, currency: null,
  inStock: null, stockQuantity: null, stockCheckedAt: null, imageUrl: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  perms.set = new Set(["context.edit"]);
  db.product.create.mockResolvedValue(stored);
  db.product.findFirst.mockResolvedValue(stored);
});

const VOUCHED = [{ inStock: true }, { stockQuantity: 3 }, { price: 10 }, { compareAtPrice: 12 }, { materials: "Linen" }, { dimensions: null }, { certifications: null }, { price: null }, { inStock: null }];

describe("who may vouch for product data", () => {
  it.each(VOUCHED)("POST and PATCH with %o need rules.approve", async (fields) => {
    expect((await POST(req("POST", { title: "Milo Sofa", ...fields }), { params })).status).toBe(403);
    expect((await PATCH(req("PATCH", fields), { params })).status).toBe(403);
    expect(db.product.create).not.toHaveBeenCalled();
    expect(db.product.updateMany).not.toHaveBeenCalled();

    perms.set.add("rules.approve");
    expect((await POST(req("POST", { title: "Milo Sofa", ...fields }), { params })).status).toBe(201);
    expect((await PATCH(req("PATCH", fields), { params })).status).toBe(200);
  });

  it("other fields stay context.edit", async () => {
    expect((await POST(req("POST", { title: "Milo Sofa", sku: "M-1", category: "Sofas" }), { params })).status).toBe(201);
    expect((await PATCH(req("PATCH", { title: "Milo", description: "Soft" }), { params })).status).toBe(200);
  });

  it("a title is kept on one line (it goes into prompts)", async () => {
    await POST(req("POST", { title: " Milo\n\n---\nSofa " }), { params });
    expect(db.product.create.mock.calls[0]![0].data.title).toBe("Milo --- Sofa");
    expect((await POST(req("POST", { title: " \n " }), { params })).status).toBe(400);
  });

  it("the update audit records before and after for vouched fields", async () => {
    perms.set.add("rules.approve");
    db.product.findFirst.mockResolvedValueOnce(stored).mockResolvedValueOnce({ ...stored, materials: null, inStock: true });
    await PATCH(req("PATCH", { materials: null, inStock: true, title: "Milo" }), { params });
    expect(db.auditEvent.create.mock.calls[0]![0].data.metadata).toEqual({
      fields: ["title", "materials", "inStock"],
      changes: { materials: ["Oak", null], inStock: [null, true] },
    });
  });
});
