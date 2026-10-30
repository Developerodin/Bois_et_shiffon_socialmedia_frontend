import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityList, personSummary, personTimeline } from "@/server/services/activity";
import { pageNumber } from "@/server/services/platform-admin";

const m = vi.hoisted(() => ({
  visits: vi.fn(), audit: vi.fn(), runs: vi.fn(), calls: vi.fn(), runCost: vi.fn(), auditGroups: vi.fn(), groups: vi.fn(),
  aiSum: vi.fn(), apiSum: vi.fn(), user: vi.fn(), none: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    pageView: { findMany: m.visits, groupBy: m.groups },
    auditEvent: { findMany: m.audit, groupBy: m.auditGroups },
    agentRun: { findMany: m.runs, groupBy: m.groups },
    aiWorkflowRun: { findMany: m.calls, groupBy: m.runCost, aggregate: m.aiSum },
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
});

describe("activity outside any workspace (workspaceId: null)", () => {
  it("timeline keeps only rows with no workspace; agent tasks and AI calls always have one", async () => {
    await personTimeline({ userId: "u1", workspaceId: null });
    expect(m.visits.mock.calls[0][0].where).toEqual({ userId: "u1", workspaceId: null });
    expect(m.audit.mock.calls[0][0].where).toEqual({ actorUserId: "u1", workspaceId: null, NOT: { action: { startsWith: "platform." } } });
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
    expect(m.visits.mock.calls[0][0].where).toEqual({ userId: "u1" });
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
    expect(m.audit.mock.calls[0][0].where).toEqual(expect.objectContaining({ NOT: { action: { startsWith: "platform." } } }));
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

  it("one person: only theirs", async () => {
    await activityList({ userId: "u1" });
    expect(m.runCost.mock.calls[0][0].where).toMatchObject({ userId: "u1" });
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
