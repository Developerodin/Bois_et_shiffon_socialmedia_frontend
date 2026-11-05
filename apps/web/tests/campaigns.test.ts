import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  brandProfile: { findFirst: vi.fn(), upsert: vi.fn() },
  product: { count: vi.fn() },
  contentItem: { findMany: vi.fn() },
  auditEvent: { create: vi.fn() },
}));
const perms = vi.hoisted(() => ({ set: new Set<string>() }));

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/api/brand-route", () => ({
  authorizeBrandRoute: vi.fn(async (_req: Request, _params: unknown, permission: string) =>
    perms.set.has(permission) ? { userId: "u1", workspaceId: "w1", brandId: "b1" } : new Response(null, { status: 403 }),
  ),
}));

import { GET, POST } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/campaigns/route";
import { DELETE, PATCH } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/campaigns/[campaignId]/route";
import { PUT } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/campaigns/time-zone/route";
import { campaignsById, campaignsForPlanning } from "@/server/catalog/campaigns";

const params = Promise.resolve({ workspaceId: "w1", brandId: "b1", campaignId: "c1" });
const req = (method: string, body?: unknown) => new Request("http://x/api", { method, ...(body !== undefined && { body: JSON.stringify(body) }) });
const COMMERCIAL_OWNER = ["brand.read", "agents.read", "analytics.read", "commercial.manage"];
const APPROVER = ["brand.read", "agents.read", "analytics.read", "context.edit", "context.confirm", "rules.approve", "content.approve"];

const stored = {
  id: "c1", workspaceId: "w1", brandId: "b1", name: "Black Friday", startsAt: new Date("2026-11-27T07:00:00Z"), endsAt: new Date("2026-11-30T19:00:00Z"),
  productIds: ["gone1"], categories: [], offer: "-20 % sur tout", discountPercent: 20, code: null, archivedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};
const offer = { name: "Black Friday", startsAt: "2026-11-27T08:00", endsAt: "2026-11-30T20:00", offer: "-20 % sur tout", discountPercent: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  perms.set = new Set(COMMERCIAL_OWNER);
  db.brandProfile.findFirst.mockResolvedValue({ timeZone: "Europe/Paris" });
  db.campaign.findFirst.mockResolvedValue(stored);
  db.campaign.findMany.mockResolvedValue([stored]);
  db.campaign.create.mockImplementation(async ({ data }) => ({ ...stored, ...data, id: "c2" }));
  db.campaign.update.mockImplementation(async ({ data }) => ({ ...stored, ...data }));
  db.product.count.mockImplementation(async ({ where }) => where.id.in.length);
  db.contentItem.findMany.mockResolvedValue([]);
});

const status = async (res: Response | Promise<Response>) => (await res).status;
const detail = async (res: Response | Promise<Response>) => ((await (await res).json()) as { detail?: string }).detail;

describe("who may set campaigns", () => {
  it("POST, PATCH, DELETE and the timezone need commercial.manage (an Approver gets 403)", async () => {
    perms.set = new Set(APPROVER);
    expect(await status(POST(req("POST", offer), { params }))).toBe(403);
    expect(await status(PATCH(req("PATCH", { name: "X" }), { params }))).toBe(403);
    expect(await status(DELETE(req("DELETE"), { params }))).toBe(403);
    expect(await status(PUT(req("PUT", { timeZone: "Europe/Paris" }), { params }))).toBe(403);
    expect(await status(GET(req("GET"), { params }))).toBe(200);
    expect(db.campaign.create).not.toHaveBeenCalled();
    expect(db.campaign.update).not.toHaveBeenCalled();
    expect(db.brandProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("campaign validation", () => {
  it("creates an offer from brand wall-clock times", async () => {
    expect(await status(POST(req("POST", offer), { params }))).toBe(201);
    expect(db.campaign.create.mock.calls[0]![0].data).toMatchObject({
      workspaceId: "w1", brandId: "b1", startsAt: new Date("2026-11-27T07:00:00Z"), endsAt: new Date("2026-11-30T19:00:00Z"), discountPercent: 20, code: null,
    });
  });

  it("a standing priority saves with no end", async () => {
    expect(await status(POST(req("POST", { name: "Oak dining", startsAt: "2026-11-01T00:00", categories: ["Tables"] }), { params }))).toBe(201);
    expect(db.campaign.create.mock.calls[0]![0].data).toMatchObject({ endsAt: null, offer: null, categories: ["Tables"] });
  });

  it("another brand's product ids are refused", async () => {
    db.product.count.mockResolvedValue(0);
    expect(await status(POST(req("POST", { ...offer, productIds: ["other-brand"] }), { params }))).toBe(400);
    expect(db.product.count.mock.calls[0]![0].where).toMatchObject({ workspaceId: "w1", brandId: "b1" });
  });

  it("a stored id deleted since doesn't block an unrelated edit", async () => {
    db.product.count.mockResolvedValue(0);
    expect(await status(PATCH(req("PATCH", { name: "BF" }), { params }))).toBe(200);
    expect(db.product.count).not.toHaveBeenCalled();
  });

  it.each([
    ["51 products", { ...offer, productIds: Array.from({ length: 51 }, (_, i) => `p${i}`) }],
    ["21 categories", { ...offer, categories: Array.from({ length: 21 }, (_, i) => `c${i}`) }],
    ["an 81-character category", { ...offer, categories: ["x".repeat(81)] }],
    ["end before start", { ...offer, endsAt: "2026-11-26T20:00" }],
    ["a gap time", { ...offer, startsAt: "2026-03-29T02:30", endsAt: "2026-03-30T20:00" }],
    ["an offer without an end", { ...offer, endsAt: null }],
    ["a discount without an offer", { name: "X", startsAt: "2026-11-27T08:00", endsAt: "2026-11-30T20:00", discountPercent: 20 }],
    ["a code without an offer", { name: "X", startsAt: "2026-11-27T08:00", endsAt: "2026-11-30T20:00", code: "BF" }],
    ["a discount over 90", { ...offer, discountPercent: 95 }],
  ])("%s is a 400", async (_label, body) => {
    expect(await status(POST(req("POST", body), { params }))).toBe(400);
    expect(db.campaign.create).not.toHaveBeenCalled();
  });

  it("the gap message names the time", async () => {
    expect(await detail(POST(req("POST", { ...offer, startsAt: "2026-03-29T02:30", endsAt: "2026-03-30T20:00" }), { params }))).toBe(
      "02:30 doesn't exist on 29 March in Europe/Paris (clocks go forward)",
    );
  });

  it("a brand without a timezone is asked for one first", async () => {
    db.brandProfile.findFirst.mockResolvedValue({ timeZone: null });
    expect(await detail(POST(req("POST", offer), { params }))).toBe("Set the brand's timezone first.");
  });

  it("PATCH merges with the stored campaign: removing the offer while a discount stays is a 400", async () => {
    expect(await status(PATCH(req("PATCH", { offer: null }), { params }))).toBe(400);
    expect(await status(PATCH(req("PATCH", { offer: null, discountPercent: null }), { params }))).toBe(200);
  });
});

describe("timezone", () => {
  it("an unknown zone is a 400; a known one is saved and audited", async () => {
    expect(await status(PUT(req("PUT", { timeZone: "Mars/Olympus" }), { params }))).toBe(400);
    db.brandProfile.findFirst.mockResolvedValue({ timeZone: "Europe/Paris" });
    expect(await status(PUT(req("PUT", { timeZone: "America/Montreal" }), { params }))).toBe(200);
    expect(db.brandProfile.upsert.mock.calls[0]![0]).toMatchObject({ where: { brandId: "b1" }, update: { timeZone: "America/Montreal" } });
    expect(db.auditEvent.create.mock.calls[0]![0].data).toMatchObject({ action: "brand.timezone_set", metadata: { timeZone: ["Europe/Paris", "America/Montreal"] } });
  });
});

describe("affected posts and audit", () => {
  const posts = [{ id: "i1", title: "BF reel", status: "APPROVED", scheduledFor: new Date("2026-11-28T09:00:00Z"), campaignId: "c1" }];

  it("archiving returns the posts it holds and audits it", async () => {
    db.contentItem.findMany.mockResolvedValue(posts);
    const res = await DELETE(req("DELETE"), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { campaign: { archivedAt: string; affectedPosts: unknown[] } };
    expect(body.campaign.archivedAt).not.toBeNull();
    expect(body.campaign.affectedPosts).toEqual([{ id: "i1", title: "BF reel", status: "APPROVED", scheduledFor: "2026-11-28T09:00:00.000Z" }]);
    expect(db.contentItem.findMany.mock.calls[0]![0].where).toMatchObject({
      workspaceId: "w1", brandId: "b1", campaignId: { in: ["c1"] }, status: { in: ["AWAITING_APPROVAL", "APPROVED", "SCHEDULED"] },
    });
    const audit = db.auditEvent.create.mock.calls[0]![0].data;
    expect(audit.action).toBe("campaign.archived");
    expect(Object.keys(audit.metadata)).toEqual(["archivedAt"]);
    expect(audit.metadata.archivedAt[0]).toBeNull();
  });

  it("an edit audits before and after of the changed fields and returns the affected posts", async () => {
    db.contentItem.findMany.mockResolvedValue(posts);
    const res = await PATCH(req("PATCH", { discountPercent: 15, endsAt: "2026-11-30T18:00" }), { params });
    expect(((await res.json()) as { campaign: { affectedPosts: unknown[] } }).campaign.affectedPosts).toHaveLength(1);
    expect(db.auditEvent.create.mock.calls[0]![0].data).toMatchObject({
      action: "campaign.updated",
      metadata: { discountPercent: [20, 15], endsAt: ["2026-11-30T19:00:00.000Z", "2026-11-30T17:00:00.000Z"] },
    });
  });

  it("GET lists campaigns with their affected posts and the zone", async () => {
    db.contentItem.findMany.mockResolvedValue(posts);
    const body = (await (await GET(req("GET"), { params })).json()) as { timeZone: string; campaigns: { kind: string; starts: string; ends: string; affectedPosts: unknown[] }[] };
    expect(body.timeZone).toBe("Europe/Paris");
    expect(body.campaigns[0]).toMatchObject({ kind: "offer", starts: "2026-11-27 08:00", ends: "2026-11-30 20:00" });
    expect(body.campaigns[0]!.affectedPosts).toHaveLength(1);
  });

  it("another brand's campaign is a 404", async () => {
    db.campaign.findFirst.mockResolvedValue(null);
    expect(await status(PATCH(req("PATCH", { name: "X" }), { params }))).toBe(404);
    expect(await status(DELETE(req("DELETE"), { params }))).toBe(404);
    expect(db.campaign.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "c1", workspaceId: "w1", brandId: "b1", archivedAt: null });
  });
});

describe("loader", () => {
  const scope = { workspaceId: "w1", brandId: "b1" };

  it("campaignsById reads the brand's campaigns and zone in one scoped query", async () => {
    const findFirst = vi.fn(async () => ({ profile: { timeZone: "Europe/Paris" }, campaigns: [stored] }));
    const { campaigns, timeZone } = await campaignsById({ brand: { findFirst } } as never, scope, ["c1", "c1", null, "other"]);
    expect(timeZone).toBe("Europe/Paris");
    expect([...campaigns.keys()]).toEqual(["c1"]);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0]).toMatchObject([{ where: { id: "b1", workspaceId: "w1" }, select: { campaigns: { where: { id: { in: ["c1", "other"] } } } } }]);
  });

  it("campaignsById with no ids makes no query", async () => {
    const findFirst = vi.fn();
    expect((await campaignsById({ brand: { findFirst } } as never, scope, [null])).campaigns.size).toBe(0);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("campaignsForPlanning asks for live-or-ongoing, unarchived campaigns in the window", async () => {
    const findFirst = vi.fn(async () => ({ profile: null, campaigns: [] }));
    const from = new Date("2026-11-06T00:00:00Z");
    const to = new Date("2026-12-05T00:00:00Z");
    expect(await campaignsForPlanning({ brand: { findFirst } } as never, scope, from, to)).toEqual({ campaigns: [], timeZone: "UTC" });
    expect(findFirst.mock.calls[0]).toMatchObject([
      { select: { campaigns: { where: { archivedAt: null, startsAt: { lt: to }, OR: [{ endsAt: null }, { endsAt: { gt: from } }] } } } },
    ]);
  });
});
