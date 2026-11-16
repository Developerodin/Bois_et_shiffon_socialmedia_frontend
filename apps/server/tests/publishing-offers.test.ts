import { beforeEach, describe, expect, it, vi } from "vitest";

// The gate's offer issues (docs/superpowers/specs/2026-11-05-offers-campaigns-design.md "The gate", "Approval and
// override", "On the post"), pattern tests/publishing-products.test.ts.
const db = vi.hoisted(() => {
  const d = {
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (arg: unknown): Promise<unknown> => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(d) : Promise.all(arg as unknown[]))),
    contentItem: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
    approvalDecision: { findFirst: vi.fn(), findMany: vi.fn(async (): Promise<object[]> => []), create: vi.fn(async ({ data }: { data: object }) => ({ id: "d-new", ...data })) },
    auditEvent: { create: vi.fn(async () => ({})) },
    publicationAttempt: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: { data: object }) => ({ id: "a-new", ...data })), update: vi.fn(async () => ({})), findMany: vi.fn(async (): Promise<object[]> => []) },
    integrationConnection: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
    user: { findMany: vi.fn(async () => []) },
    brand: { findFirst: vi.fn() },
  };
  return d;
});
const linked = vi.hoisted(() => vi.fn());
const enqueueJob = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/catalog/linked", () => ({ linkedProducts: linked }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: vi.fn(async () => undefined), hasOtherApprover: vi.fn(async () => true) }));
vi.mock("@/server/services/connections", () => ({ accessToken: vi.fn(), markReconnect: vi.fn(), ReconnectNeeded: class extends Error {} }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob }));

import { decide, executePublication, packageHash, releaseState, schedulePublication } from "@/server/services/publishing";

const scope = { workspaceId: "w1", brandId: "b1" };
const TZ = "Europe/Paris";
const ENDS = new Date("2026-11-30T19:00:00Z"); // 20:00 Paris
const STARTS = new Date("2026-11-27T07:00:00Z"); // 08:00 Paris
const sale = (over: object = {}) => ({
  id: "c1", name: "Black Friday", startsAt: STARTS, endsAt: ENDS, productIds: [], categories: [], offer: "-20 % on everything",
  discountPercent: 20, code: null, archivedAt: null, ...over,
});
const terms = (over: object = {}) => ({
  offer: "-20 % on everything", discountPercent: 20, code: null, startsAt: STARTS.toISOString(), endsAt: ENDS.toISOString(), productIds: [], categories: [], state: "live", ...over,
});
const offerRow = (over: object = {}) => ({ check: "Offer: Black Friday", status: "pass", note: "live", kind: "offer", campaignId: "c1", terms: terms(over) });
const version = (productIds: string[], results: object[] = [offerRow()]) => ({ id: "v2", version: 2, body: { caption: "-20 % this weekend", productIds }, createdBy: "writer", checks: [{ overall: "PASS", results }] });
let latest = version([]);
const item = (status: string, over: object = {}) => ({ id: "i1", ...scope, channel: "INSTAGRAM_POST", status, studio: false, title: "Sale", productIds: [], campaignId: "c1", scheduledFor: null, versions: [latest], ...over });
const approval = (over: object = {}) => ({ id: "d1", verdict: "APPROVED", contentVersionId: "v2", packageHash: packageHash({ id: "i1", channel: "INSTAGRAM_POST" }, latest), productOverride: null, ...over });
const product = (id: string, name: string, state: string) => ({ id, row: state === "gone" ? null : { id }, group: [], name, state });
const campaigns = (...rows: object[]) => db.brand.findFirst.mockResolvedValue({ profile: { timeZone: TZ }, campaigns: rows });
const approveAnyway = () => decide({ ...scope, userId: "boss", itemId: "i1", version: 2, verdict: "APPROVED", note: "Fine, it ran", override: true });
const approve = () => decide({ ...scope, userId: "boss", itemId: "i1", version: 2, verdict: "APPROVED" });
const schedule = (runAt: Date) => schedulePublication({ ...scope, userId: "boss", itemId: "i1", version: 2, connectionId: "conn", imageUrl: "https://x.test/a.jpg", runAt });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  latest = version([]);
  linked.mockResolvedValue([]);
  campaigns(sale());
});

describe("decide with offer issues", () => {
  it("a post linking no product with an ended whole-catalogue offer is refused", async () => {
    vi.useFakeTimers({ now: new Date("2026-12-01T10:00:00Z"), toFake: ["Date"] });
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    await expect(approve()).rejects.toThrow('"Black Friday" ended 2026-11-30 20:00 (Paris). Approve anyway or ask for changes.');
    expect(linked).not.toHaveBeenCalled();
  });

  it("the override lists product and ended-offer issues together, and audits the offers", async () => {
    vi.useFakeTimers({ now: new Date("2026-12-01T10:00:00Z"), toFake: ["Date"] });
    latest = version(["p1"]);
    linked.mockResolvedValue([product("p1", "Milo Sofa", "out")]);
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    await approveAnyway();
    expect(db.approvalDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ productOverride: { productIds: ["p1"], states: { p1: "out" }, offers: ["c1"] } }),
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "approval.product_override", metadata: expect.objectContaining({ offers: ["c1"] }) }) });
    expect(linked).toHaveBeenCalledTimes(1); // one linkedProducts call per gate
  });

  it("a changed offer alone: the override is a 400 and a plain approval is refused", async () => {
    campaigns(sale({ discountPercent: 15 }));
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    await expect(approveAnyway()).rejects.toMatchObject({ status: 400 });
    await expect(approve()).rejects.toThrow('"Black Friday" changed since this post was checked: -15 % (was -20 %)');
  });

  it("a withdrawn offer can't be approved past, even with an overridable product issue", async () => {
    latest = version(["p1"]);
    linked.mockResolvedValue([product("p1", "Milo Sofa", "out")]);
    campaigns(sale({ archivedAt: new Date() }));
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    await expect(approveAnyway()).rejects.toThrow('"Black Friday" was withdrawn');
    expect(db.approvalDecision.create).not.toHaveBeenCalled();
  });

  it("an out-of-stock campaign product the post doesn't link raises no issue", async () => {
    campaigns(sale({ productIds: ["p9"] }));
    latest = version([], [offerRow({ productIds: ["p9"] })]);
    db.contentItem.findFirst.mockResolvedValue(item("AWAITING_APPROVAL"));
    db.approvalDecision.findFirst.mockResolvedValue(null);
    vi.useFakeTimers({ now: new Date("2026-11-28T10:00:00Z"), toFake: ["Date"] });
    await approve();
    expect(linked).not.toHaveBeenCalled();
    expect(db.approvalDecision.create).toHaveBeenCalled();
  });
});

describe("scheduling and publishing against the offer's window", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-28T10:00:00Z"), toFake: ["Date"] });
    db.contentItem.findFirst.mockResolvedValue(item("APPROVED"));
    db.approvalDecision.findFirst.mockResolvedValue(approval());
    db.integrationConnection.findFirst.mockResolvedValue({ id: "conn", provider: "INSTAGRAM" });
  });

  it("at or after a live offer's end refuses, naming the end in the brand zone", async () => {
    await expect(schedule(ENDS)).rejects.toThrow('"Black Friday" ends 2026-11-30 20:00 (Paris): pick an earlier time');
    await expect(schedule(new Date(ENDS.getTime() - 60_000))).resolves.toBeTruthy();
  });

  it("before the start refuses when the post was judged live, not when judged a teaser", async () => {
    vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
    await expect(schedule(new Date("2026-11-26T10:00:00Z"))).rejects.toThrow('"Black Friday" starts 2026-11-27 08:00 (Paris): pick a later time');
    latest = version([], [offerRow({ state: "upcoming" })]);
    db.contentItem.findFirst.mockResolvedValue(item("APPROVED"));
    db.approvalDecision.findFirst.mockResolvedValue(approval());
    await expect(schedule(new Date("2026-11-26T10:00:00Z"))).resolves.toBeTruthy();
  });

  it("once it has ended, an ended override lets it schedule", async () => {
    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    db.approvalDecision.findFirst.mockResolvedValue(approval({ productOverride: { productIds: [], states: {}, offers: ["c1"] } }));
    await expect(schedule(new Date("2026-12-02T10:00:00Z"))).resolves.toBeTruthy();
  });

  it("executePublication one minute after the end is FAILED with the message", async () => {
    vi.setSystemTime(new Date(ENDS.getTime() + 60_000));
    db.publicationAttempt.updateMany.mockResolvedValue({ count: 1 });
    db.publicationAttempt.findUniqueOrThrow.mockResolvedValue({ id: "a1", ...scope, contentItemId: "i1", contentVersionId: "v2", packageHash: approval().packageHash, connectionId: "conn", provider: "INSTAGRAM", createdByUserId: "boss", target: {} });
    db.contentItem.findFirst.mockResolvedValue(item("SCHEDULED"));
    await executePublication({ attemptId: "a1" });
    expect(db.publicationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: "a1", status: "PUBLISHING" }, data: { status: "FAILED", error: '"Black Friday" ended 2026-11-30 20:00 (Paris). Approve anyway or ask for changes. Nothing was posted.' },
    });
  });
});

describe("releaseState", () => {
  it("returns the campaign in brand time and names an ended-offer override", async () => {
    vi.useFakeTimers({ now: new Date("2026-12-01T10:00:00Z"), toFake: ["Date"] });
    db.contentItem.findFirst.mockResolvedValue(item("APPROVED"));
    const override = approval({ productOverride: { productIds: [], states: {}, offers: ["c1"] } });
    db.approvalDecision.findFirst.mockResolvedValue(override);
    db.approvalDecision.findMany.mockResolvedValue([{ ...override, userId: "boss", note: "ok", createdAt: new Date() }]);
    const state = await releaseState(scope, "i1");
    expect(state.campaign).toEqual({
      kind: "offer", name: "Black Friday", offer: "-20 % on everything", discountPercent: 20, code: null,
      starts: "2026-11-27 08:00", ends: "2026-11-30 20:00", timeZone: TZ, withdrawn: false,
    });
    expect(state.decisions[0]?.override).toEqual(["Black Friday (offer ended)"]);
    expect(state.productIssues).toEqual([expect.objectContaining({ kind: "offer", state: "ended", refuses: false, overridable: true })]);
  });

  it("judges a scheduled post at its run time", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-28T10:00:00Z"), toFake: ["Date"] });
    db.contentItem.findFirst.mockResolvedValue(item("SCHEDULED"));
    db.approvalDecision.findFirst.mockResolvedValue(approval());
    db.publicationAttempt.findMany.mockResolvedValue([{ id: "a1", status: "SCHEDULED", runAt: new Date("2026-12-01T10:00:00Z"), createdByUserId: "boss", connectionId: "conn", updatedAt: new Date() }]);
    const state = await releaseState(scope, "i1");
    expect(state.productIssues).toEqual([expect.objectContaining({ state: "ended", refuses: true })]);
  });

  it("a standing priority reads as a priority with no end", async () => {
    latest = version([], []);
    db.contentItem.findFirst.mockResolvedValue(item("PUBLISHED"));
    db.approvalDecision.findFirst.mockResolvedValue(null);
    campaigns(sale({ name: "Oak dining", offer: null, discountPercent: null, endsAt: null }));
    const state = await releaseState(scope, "i1");
    expect(state.campaign).toMatchObject({ kind: "priority", name: "Oak dining", ends: null });
  });
});
