import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityList, personSummary, personTimeline } from "@/server/services/activity";
import { pageNumber } from "@/server/services/platform-admin";

const m = vi.hoisted(() => ({
  visits: vi.fn(), audit: vi.fn(), runs: vi.fn(), calls: vi.fn(), runCost: vi.fn(), auditGroups: vi.fn(), groups: vi.fn(),
  aiSum: vi.fn(), apiSum: vi.fn(), user: vi.fn(), none: vi.fn(), count: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    pageView: { findMany: m.visits, groupBy: m.groups, count: m.count },
    auditEvent: { findMany: m.audit, groupBy: m.auditGroups, count: m.count },
    agentRun: { findMany: m.runs, groupBy: m.groups, count: m.count },
    aiWorkflowRun: { findMany: m.calls, groupBy: m.runCost, aggregate: m.aiSum, count: m.count },
    apiCall: { aggregate: m.apiSum, groupBy: m.groups },
    user: { findUnique: m.user, findMany: m.none },
    brand: { findMany: m.none },
    workspace: { findMany: m.none },
  },
}));

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset().mockResolvedValue([]));
  m.aiSum.mockResolvedValue({ _sum: { costUsd: 2 } });
  m.apiSum.mockResolvedValue({ _sum: { costUsd: 1 } });
  m.user.mockResolvedValue({ id: "u1", name: null, email: "a@x.com" });
  m.count.mockResolvedValue(0);
});

/** A timeline query's filter, without the (absent) cursor. */
const filter = (f: typeof m.visits) => f.mock.calls[0][0].where.AND[0];

describe("activity outside any workspace (workspaceId: null)", () => {
  it("timeline keeps only rows with no workspace; agent tasks and AI calls always have one", async () => {
    await personTimeline({ userId: "u1", workspaceId: null });
    expect(filter(m.visits)).toEqual({ userId: "u1", workspaceId: null });
    expect(filter(m.audit)).toEqual({ actorUserId: "u1", workspaceId: null, NOT: { action: { startsWith: "platform." } } });
    expect(m.runs).not.toHaveBeenCalled();
    expect(m.calls).not.toHaveBeenCalled();
  });

  it("spend counts only other paid APIs with no workspace", async () => {
    const s = await personSummary({ userId: "u1", workspaceId: null });
    expect(m.aiSum).not.toHaveBeenCalled();
    expect(m.apiSum.mock.calls[0][0].where).toEqual({ userId: "u1", workspaceId: null });
    expect(s).toMatchObject({ aiUsd: 0, apiUsd: 1 });
  });

  it("no workspace given still means everywhere", async () => {
    await personTimeline({ userId: "u1" });
    expect(filter(m.visits)).toEqual({ userId: "u1" });
    expect(m.runs).toHaveBeenCalled();
  });
});

describe("admin console actions stay in Logs, not Activity", () => {
  it("the list leaves out platform.* audit events", async () => {
    await activityList({});
    expect(m.auditGroups.mock.calls[0][0].where).toEqual(expect.objectContaining({ NOT: { action: { startsWith: "platform." } } }));
  });

  it("the timeline leaves them out too", async () => {
    await personTimeline({ userId: "u1" });
    expect(filter(m.audit)).toEqual(expect.objectContaining({ NOT: { action: { startsWith: "platform." } } }));
  });
});

describe("unattributed activity on the list", () => {
  it("everyone: counts rows with no person too, but not the test runs", async () => {
    await activityList({});
    const ai = m.runCost.mock.calls[0][0].where;
    expect(ai).not.toHaveProperty("userId");
    expect(ai).toMatchObject({ NOT: { workspaceId: "eval" } });
  });

  it("never filters visits, actions or other API calls in a way that drops rows with no workspace", async () => {
    await activityList({});
    // NOT (workspaceId = 'eval') is unknown, so false, for NULL in SQL: those nullable columns must not use it bare.
    expect(m.groups.mock.calls.find(([q]) => q.by.includes("userId") && !("_sum" in q))![0].where).not.toHaveProperty("NOT");
    expect(m.auditGroups.mock.calls[0][0].where).not.toHaveProperty("workspaceId");
    expect(m.groups.mock.calls.find(([q]) => q.by.includes("userId") && "_sum" in q)![0].where).toMatchObject({ OR: [{ workspaceId: null }, { NOT: { workspaceId: "eval" } }] });
  });

  it("a person search: only the people it matched", async () => {
    await activityList({ userIds: ["u1", "u2"] });
    expect(m.runCost.mock.calls[0][0].where).toMatchObject({ userId: { in: ["u1", "u2"] } });
  });

  it("a period bounds every source", async () => {
    await activityList({ days: 7 });
    const wheres = [...m.groups.mock.calls, ...m.auditGroups.mock.calls, ...m.runCost.mock.calls].map(([q]) => q.where);
    expect(wheres).toHaveLength(5);
    for (const w of wheres) expect(+w.createdAt.gte).toBeGreaterThan(Date.now() - 7.01 * 86_400_000);
  });
});

describe("accounts removed from the database (smoke-test users)", () => {
  it("fold into the workspace's unattributed row instead of their own nameless rows", async () => {
    const last = { _max: { createdAt: new Date(1) } };
    m.auditGroups.mockResolvedValue([
      { workspaceId: "w1", actorUserId: "gone", _count: { _all: 1 }, ...last },
      { workspaceId: "w1", actorUserId: null, _count: { _all: 5 }, ...last },
      { workspaceId: "w1", actorUserId: "u1", _count: { _all: 2 }, ...last },
    ]);
    m.none.mockImplementation(async (q: { where: { id: { in: string[] } } }) => q.where.id.in.filter((id) => id === "u1").map((id) => ({ id, email: "a@x.com" })));
    const { rows } = await activityList({});
    expect(rows.map((r) => [r.userId, r.actions])).toEqual([[null, 6], ["u1", 2]]);
  });
});

describe("a deleted account's activity", () => {
  it("still has a summary, with no user", async () => {
    m.user.mockResolvedValue(null);
    expect(await personSummary({ userId: "gone" })).toEqual({ user: null, aiUsd: 2, apiUsd: 1 });
  });
});

describe("pageNumber", () => {
  it.each([[undefined, 1], ["3", 3], ["0", 1], ["-2", 1], ["1.5", 1], ["Infinity", 1], ["abc", 1], ["100000", 1000]])("%s → %s", (v, n) => {
    expect(pageNumber(v)).toBe(n);
  });
});
