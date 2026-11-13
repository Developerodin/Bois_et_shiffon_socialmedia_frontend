import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn() },
  contentItem: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })) },
  auditEvent: { create: vi.fn() },
  creditEntry: { count: vi.fn(async () => 0), findFirst: vi.fn(async (_a?: unknown) => null as unknown) },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const m = vi.hoisted(() => ({ spend: vi.fn(), refund: vi.fn(), start: vi.fn(), offer: vi.fn(), allowed: vi.fn(async () => true) }));

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: m.start }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), spendCredits: m.spend, refundCharge: m.refund }));
vi.mock("@/server/content/knowledge", () => ({ liveOfferFor: m.offer, productIdsForPhoto: vi.fn() }));
vi.mock("@/server/jobs/runner", () => ({ kickRunner: vi.fn() }));
vi.mock("@/server/api/brand-route", () => ({ authorizeBrandRoute: vi.fn(async () => ({ workspaceId: "w1", brandId: "b1", userId: "u1" })) }));
vi.mock("@/server/services/publishing", async (orig) => ({ ...(await orig<object>()), postAiAllowed: m.allowed, releaseState: vi.fn(async () => ({ requirements: {} })) }));

import { InsufficientCreditsError } from "@/server/services/credits";
import { createStory, reopenStoryWrite } from "@/server/stories/service";
import { POST } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/route";
import { POST as ITEM_POST } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/[contentId]/route";

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const REQ = "11111111-1111-4111-8111-111111111111";
const input = { goal: "newArrival" as const, productId: "p1", direction: " warm ", requestId: REQ };
const ctx = { params: Promise.resolve({ workspaceId: "w1", brandId: "b1" }) };
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), ctx as never);

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.product.findFirst.mockResolvedValue({ id: "p1", title: "Table Milo" });
  db.contentItem.findFirst.mockResolvedValue(null);
  db.contentItem.create.mockResolvedValue({ id: "i1" });
  db.creditEntry.count.mockResolvedValue(0);
  db.creditEntry.findFirst.mockResolvedValue(null);
  m.spend.mockImplementation(async (i: { refId: string }) => i.refId);
  m.refund.mockResolvedValue(true);
  m.start.mockResolvedValue({ id: "run" });
  m.offer.mockResolvedValue(null);
  m.allowed.mockResolvedValue(true);
});

describe("createStory", () => {
  it("creates the item and charges 5 with the request id as refId", async () => {
    const r = await createStory(scope, input);
    expect(r).toEqual({ id: "i1", chargeId: REQ, repeated: false });
    expect(m.spend).toHaveBeenCalledWith({ workspaceId: "w1", amount: 5, reason: "story-write", refId: REQ, userId: "u1" });
    expect(db.contentItem.create.mock.calls[0][0].data).toMatchObject({
      channel: "INSTAGRAM_STORY", status: "BRIEF_READY", productIds: ["p1"], campaignId: null, title: "Table Milo",
      brief: { goal: "newArrival", products: ["Table Milo"], keyMessage: "warm", angle: "newArrival", requestId: REQ },
    });
    expect(db.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("links the live offer for a special offer", async () => {
    m.offer.mockResolvedValue("camp1");
    await createStory(scope, { ...input, goal: "specialOffer" });
    expect(m.offer).toHaveBeenCalledWith(scope, ["p1"]);
    expect(db.contentItem.create.mock.calls[0][0].data.campaignId).toBe("camp1");
  });

  it("returns the existing item for a repeated request id: one item, no second create", async () => {
    db.contentItem.findFirst.mockResolvedValue({ id: "i1" });
    const r = await createStory(scope, input);
    expect(r).toEqual({ id: "i1", chargeId: REQ, repeated: true });
    expect(db.contentItem.create).not.toHaveBeenCalled();
    expect(db.contentItem.findFirst.mock.calls[0][0].where.brief).toEqual({ path: ["requestId"], equals: REQ });
  });

  it("refuses another brand's product with 400 story.product and charges nothing", async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(createStory(scope, input)).rejects.toMatchObject({ status: 400, code: "story.product" });
    expect(db.product.findFirst.mock.calls[0][0].where).toMatchObject({ workspaceId: "w1", brandId: "b1" });
    expect(m.spend).not.toHaveBeenCalled();
  });

  it("refuses without credits with 402 story.credits and creates no item", async () => {
    m.spend.mockRejectedValue(new InsufficientCreditsError(2, 5));
    await expect(createStory(scope, input)).rejects.toMatchObject({ status: 402, code: "story.credits" });
    expect(db.contentItem.create).not.toHaveBeenCalled();
  });
});

describe("POST content (story)", () => {
  const body = { channel: "INSTAGRAM_STORY", goal: "newArrival", productId: "p1", requestId: REQ };

  it("starts the Creator prepaid with the charge", async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "creator", input: { itemId: "i1" }, prepaidChargeId: REQ }));
  });

  it("does not start a second run for a repeated request", async () => {
    db.contentItem.findFirst.mockResolvedValue({ id: "i1" });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(m.start).not.toHaveBeenCalled();
  });

  it("refunds once and blocks the story when the Creator can't start", async () => {
    m.start.mockRejectedValue(new Error("down"));
    db.contentItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ brief: { goal: "newArrival" } });
    const res = await post(body);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("story.writeStart");
    expect(m.refund).toHaveBeenCalledTimes(1);
    expect(m.refund).toHaveBeenCalledWith("w1", REQ);
    expect((db.contentItem.updateMany.mock.calls[0]![0] as { data: unknown }).data).toMatchObject({ status: "BLOCKED", brief: { goal: "newArrival", note: "Writing didn't start. Try again." } });
  });

  it("rejects a story body without a uuid request id", async () => {
    expect((await post({ ...body, requestId: "x" })).status).toBe(400);
  });
});

describe("rewrite of a story", () => {
  const rewrite = () => ITEM_POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "rewrite", version: 0 }) }), { params: Promise.resolve({ workspaceId: "w1", brandId: "b1", contentId: "i1" }) } as never);
  const story = (status = "BLOCKED", versions: unknown[] = []) => ({ id: "i1", channel: "INSTAGRAM_STORY", status, brief: { requestId: REQ }, versions });

  it("charges again with the retry refId when the first charge was refunded", async () => {
    db.contentItem.findFirst.mockResolvedValue(story());
    db.creditEntry.findFirst.mockResolvedValue({ id: "refund" });
    const chargeId = await reopenStoryWrite(scope, "i1");
    expect(chargeId).toBe("i1:retry:1");
    expect(m.spend).toHaveBeenCalledWith(expect.objectContaining({ amount: 5, reason: "story-write", refId: "i1:retry:1" }));
    expect((db.creditEntry.findFirst.mock.calls[0]![0] as { where: unknown }).where).toMatchObject({ reason: "refund", refId: REQ });
  });

  it("counts earlier retries: the second retry is :retry:2 and checks retry 1 was refunded", async () => {
    db.contentItem.findFirst.mockResolvedValue(story());
    db.creditEntry.count.mockResolvedValue(1);
    db.creditEntry.findFirst.mockResolvedValue({ id: "refund" });
    expect(await reopenStoryWrite(scope, "i1")).toBe("i1:retry:2");
    expect((db.creditEntry.findFirst.mock.calls[0]![0] as { where: { refId: string } }).where.refId).toBe("i1:retry:1");
  });

  it("is free while the charge stands, or when the story has a version", async () => {
    db.contentItem.findFirst.mockResolvedValue(story("BRIEF_READY"));
    expect(await reopenStoryWrite(scope, "i1")).toBeNull();
    db.contentItem.findFirst.mockResolvedValue({ ...story(), versions: [{ version: 1, body: {} }] });
    db.creditEntry.findFirst.mockResolvedValue({ id: "refund" });
    expect(await reopenStoryWrite(scope, "i1")).toBeNull();
    expect(m.spend).not.toHaveBeenCalled();
  });

  it("route: reopens a blocked story, prepays the run, and refunds if it can't start", async () => {
    db.contentItem.findFirst.mockImplementation(async (a: { select?: { studio?: boolean; brief?: boolean } }) =>
      a.select?.brief ? { brief: { requestId: REQ } } : { ...story(), versions: [] },
    );
    db.creditEntry.findFirst.mockResolvedValue({ id: "refund" });
    await rewrite();
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "creator", prepaidChargeId: "i1:retry:1" }));
    m.start.mockRejectedValue(new Error("down"));
    expect((await rewrite()).status).toBe(502);
    expect(m.refund).toHaveBeenCalledWith("w1", "i1:retry:1");
  });
});
