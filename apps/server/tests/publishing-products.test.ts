import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessDeniedError } from "@/server/auth/errors";

const db = vi.hoisted(() => {
  const d = {
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (arg: unknown): Promise<unknown> => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(d) : Promise.all(arg as unknown[]))),
    contentItem: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
    contentVersion: { create: vi.fn(async ({ data }: { data: object }) => data) },
    approvalDecision: { findFirst: vi.fn(), findMany: vi.fn(async (): Promise<object[]> => []), create: vi.fn(async ({ data }: { data: object }) => ({ id: "d-new", ...data })) },
    auditEvent: { create: vi.fn(async () => ({})) },
    publicationAttempt: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
    integrationConnection: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
    user: { findMany: vi.fn(async () => []) },
  };
  return d;
});
const linked = vi.hoisted(() => vi.fn());
const requirePermission = vi.hoisted(() => vi.fn(async () => undefined));
const autoPublish = vi.hoisted(() => vi.fn());
const accessToken = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/catalog/linked", () => ({ linkedProducts: linked }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission, hasOtherApprover: vi.fn(async () => true) }));
vi.mock("@/server/services/connections", () => ({ accessToken, markReconnect: vi.fn(), ReconnectNeeded: class extends Error {} }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob: vi.fn() }));
vi.mock("@/server/jobs/runner", () => ({ kickRunner: vi.fn() }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: vi.fn(async () => ({})) }));
vi.mock("@/server/services/automations", () => ({ autoPublish }));
vi.mock("@/server/api/brand-route", () => ({ authorizeBrandRoute: vi.fn(async () => ({ workspaceId: "w1", brandId: "b1", userId: "boss" })) }));

import { decide, executePublication, packageHash, releaseState, saveDraft } from "@/server/services/publishing";
import { POST } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/[contentId]/route";

const scope = { workspaceId: "w1", brandId: "b1" };
const latest = { id: "v2", version: 2, body: { caption: "Our Milo sofa", productIds: ["p1", "p2"] }, createdBy: "writer", checks: [{ overall: "PASS", results: [] }] };
const item = (status: string) => ({ id: "i1", ...scope, channel: "INSTAGRAM_POST", status, studio: false, title: "Milo", productIds: ["p1", "p2"], versions: [latest] });
const approval = (over: object = {}) => ({ id: "d1", verdict: "APPROVED", contentVersionId: "v2", packageHash: packageHash({ id: "i1", channel: "INSTAGRAM_POST" }, latest), productOverride: null, ...over });
const product = (id: string, name: string, state: string) => ({ id, row: state === "gone" ? null : { id }, group: [], name, state });
const approveAnyway = () => decide({ ...scope, userId: "boss", itemId: "i1", version: 2, verdict: "APPROVED", note: "Back in stock Monday", override: true });

beforeEach(() => {
  vi.clearAllMocks();
  linked.mockResolvedValue([product("p1", "Milo Sofa", "out"), product("p2", "Oslo Chair", "in")]);
});

describe("decide with a product override", () => {
  it("needs rules.approve, checked by decide itself", async () => {
    requirePermission.mockRejectedValueOnce(new AccessDeniedError("Missing permission rules.approve"));
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    await expect(approveAnyway()).rejects.toThrow("rules.approve");
    expect(requirePermission).toHaveBeenCalledWith("w1", "boss", "rules.approve", "b1");
    expect(db.approvalDecision.create).not.toHaveBeenCalled();
  });

  it("a plain approval is refused while a product is out of stock", async () => {
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    await expect(decide({ ...scope, userId: "boss", itemId: "i1", version: 2, verdict: "APPROVED" })).rejects.toThrow("Milo Sofa is out of stock");
  });

  it("on an approved, not scheduled post, adds a decision with the products and their states, and audits it", async () => {
    db.contentItem.findFirst.mockResolvedValue(item("APPROVED"));
    db.approvalDecision.findFirst.mockResolvedValue(approval());
    await approveAnyway();
    expect(db.approvalDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ verdict: "APPROVED", packageHash: approval().packageHash, productOverride: { productIds: ["p1"], states: { p1: "out" } } }),
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "approval.product_override", metadata: { versionId: "v2", productIds: ["p1"], states: { p1: "out" }, note: "Back in stock Monday" } }),
    });
  });

  it("is refused on an approved post whose approval no longer holds", async () => {
    db.contentItem.findFirst.mockResolvedValue(item("APPROVED"));
    db.approvalDecision.findFirst.mockResolvedValue(approval({ packageHash: "old" }));
    await expect(approveAnyway()).rejects.toMatchObject({ status: 409 });
    expect(db.approvalDecision.create).not.toHaveBeenCalled();
  });

  it("is a 400 when there is nothing to override", async () => {
    linked.mockResolvedValue([product("p1", "Milo Sofa", "in")]);
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    await expect(approveAnyway()).rejects.toMatchObject({ status: 400 });
  });

  it("a second override lists every availability issue, so both products stay covered", async () => {
    linked.mockResolvedValue([product("p1", "Milo Sofa", "out"), product("p2", "Oslo Chair", "gone")]);
    db.contentItem.findFirst.mockResolvedValue(item("APPROVED"));
    db.approvalDecision.findFirst.mockResolvedValue(approval({ productOverride: { productIds: ["p1"], states: { p1: "out" } } }));
    await approveAnyway();
    expect(db.approvalDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ productOverride: { productIds: ["p1", "p2"], states: { p1: "out", p2: "gone" } } }),
    });
  });

  it("CHANGES_REQUESTED on an approved post sends it back with the switch flag", async () => {
    db.contentItem.findFirst.mockResolvedValue(item("APPROVED"));
    db.approvalDecision.findFirst.mockResolvedValue(approval());
    await decide({ ...scope, userId: "boss", itemId: "i1", version: 2, verdict: "CHANGES_REQUESTED", note: "Milo Sofa is out of stock", switchProducts: true });
    expect(db.approvalDecision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ verdict: "CHANGES_REQUESTED", switchProducts: true }) });
    expect(db.contentItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "DRAFT_REVIEW" } });
  });

  it("the route skips auto-publish after an override (the person schedules)", async () => {
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    db.approvalDecision.findFirst.mockResolvedValue(null);
    const req = (body: object) => new Request("http://x", { method: "POST", body: JSON.stringify({ action: "decide", version: 2, verdict: "APPROVED", ...body }) });
    const params = { params: Promise.resolve({ workspaceId: "w1", brandId: "b1", contentId: "i1" }) };
    expect((await POST(req({ note: "Back Monday", override: true }), params)).status).toBe(200);
    expect(autoPublish).not.toHaveBeenCalled();
    linked.mockResolvedValue([]);
    expect((await POST(req({}), params)).status).toBe(200);
    expect(autoPublish).toHaveBeenCalledTimes(1);
  });
});

describe("executePublication product gate", () => {
  const attempt = { id: "a1", ...scope, contentItemId: "i1", contentVersionId: "v2", packageHash: approval().packageHash, connectionId: "c1", provider: "INSTAGRAM", createdByUserId: "boss", target: {} };
  beforeEach(() => {
    db.publicationAttempt.updateMany.mockResolvedValue({ count: 1 });
    db.publicationAttempt.findUniqueOrThrow.mockResolvedValue(attempt);
    db.contentItem.findFirst.mockResolvedValue(item("SCHEDULED"));
    db.approvalDecision.findFirst.mockResolvedValue(approval());
  });

  it("a refusal is FAILED with its message, back to APPROVED, before the token refresh", async () => {
    await executePublication({ attemptId: "a1" });
    expect(db.publicationAttempt.updateMany).toHaveBeenCalledWith({ where: { id: "a1", status: "PUBLISHING" }, data: { status: "FAILED", error: "Milo Sofa is out of stock. Nothing was posted." } });
    expect(db.contentItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "APPROVED" } });
    expect(accessToken).not.toHaveBeenCalled();
  });

  it("a slow worker whose attempt was settled meanwhile (PENDING_VERIFY, not posted) writes nothing on it or the item", async () => {
    db.publicationAttempt.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await executePublication({ attemptId: "a1" });
    expect(db.publicationAttempt.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "a1", status: "PUBLISHING" } }));
    expect(db.contentItem.update).not.toHaveBeenCalled();
    expect(db.auditEvent.create).not.toHaveBeenCalled();
  });

  it("an error while checking is FAILED, not PENDING_VERIFY", async () => {
    linked.mockRejectedValue(new Error("db down"));
    await executePublication({ attemptId: "a1" });
    expect(db.publicationAttempt.updateMany).toHaveBeenCalledWith({ where: { id: "a1", status: "PUBLISHING" }, data: { status: "FAILED", error: expect.stringContaining("Nothing was posted") } });
    expect(accessToken).not.toHaveBeenCalled();
  });

  it("an override covering the product lets it through to posting, and the audit says so", async () => {
    db.approvalDecision.findFirst.mockResolvedValue(approval({ productOverride: { productIds: ["p1"], states: { p1: "out" } } }));
    db.integrationConnection.findFirst.mockResolvedValue(null); // stops right after the gate
    await executePublication({ attemptId: "a1" });
    expect(db.publicationAttempt.updateMany).toHaveBeenCalledWith({ where: { id: "a1", status: "PUBLISHING" }, data: { status: "FAILED", error: expect.stringContaining("disconnected") } });
    expect(db.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ metadata: { provider: "INSTAGRAM", overrideUsed: true } }) });
  });
});

describe("saveDraft and linked products", () => {
  const input = { ...scope, userId: "u1", itemId: "i1", body: { hook: "", caption: "Hello", hashtags: [], slides: [], script: [], pinTitle: "", altText: "" } };

  it("copies item.productIds into v1", async () => {
    db.contentItem.findFirst.mockResolvedValue({ ...item("BRIEF_READY"), versions: [] });
    await saveDraft({ ...input, version: 0 });
    expect(db.contentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ version: 1, body: expect.objectContaining({ caption: "Hello", productIds: ["p1", "p2"] }) }) });
  });

  it("later versions keep the previous version's links, not the item's", async () => {
    db.contentItem.findFirst.mockResolvedValue({ ...item("DRAFT_REVIEW"), versions: [{ ...latest, body: { caption: "Old", productIds: ["p9"] } }] });
    await saveDraft({ ...input, version: 2 });
    expect(db.contentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ version: 3, body: expect.objectContaining({ productIds: ["p9"] }) }) });
  });
});

describe("decision history", () => {
  it("an override reads as approved anyway with the product names, and the earlier approval of the same package still holds", async () => {
    db.contentItem.findFirst.mockResolvedValue(item("APPROVED"));
    const override = approval({ id: "d2", productOverride: { productIds: ["p1"], states: { p1: "out" } } });
    db.approvalDecision.findFirst.mockResolvedValue(override);
    db.approvalDecision.findMany.mockResolvedValue([{ ...override, userId: "boss", note: "ok", createdAt: new Date() }, { ...approval(), userId: "boss", note: null, createdAt: new Date() }]);
    const state = await releaseState(scope, "i1");
    expect(state.decisions.map((d) => [d.override, d.current])).toEqual([[["Milo Sofa"], true], [null, true]]);
    expect(state.productIssues).toEqual([expect.objectContaining({ productId: "p1", refuses: false })]);
    expect(linked).toHaveBeenCalledTimes(1); // the override's names come from the gate's read
  });

  it("a published post skips the gate; override names are read on their own", async () => {
    db.contentItem.findFirst.mockResolvedValue(item("PUBLISHED"));
    db.approvalDecision.findFirst.mockResolvedValue(null);
    db.approvalDecision.findMany.mockResolvedValue([{ ...approval({ productOverride: { productIds: ["p1"], states: { p1: "out" } } }), userId: "boss", note: "ok", createdAt: new Date() }]);
    const state = await releaseState(scope, "i1");
    expect(state.productIssues).toEqual([]);
    expect(state.decisions[0]?.override).toEqual(["Milo Sofa"]);
    expect(linked).toHaveBeenCalledWith(db, scope, ["p1"]);
  });
});
