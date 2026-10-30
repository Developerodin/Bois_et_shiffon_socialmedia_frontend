import { beforeEach, describe, expect, it, vi } from "vitest";
import { personSummary, personTimeline } from "@/server/services/activity";
import { pageNumber } from "@/server/services/platform-admin";

const m = vi.hoisted(() => ({
  visits: vi.fn(), audit: vi.fn(), runs: vi.fn(), calls: vi.fn(), runCost: vi.fn(),
  aiSum: vi.fn(), apiSum: vi.fn(), user: vi.fn(), none: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    pageView: { findMany: m.visits },
    auditEvent: { findMany: m.audit },
    agentRun: { findMany: m.runs },
    aiWorkflowRun: { findMany: m.calls, groupBy: m.runCost, aggregate: m.aiSum },
    apiCall: { aggregate: m.apiSum },
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
    expect(m.audit.mock.calls[0][0].where).toEqual({ actorUserId: "u1", workspaceId: null });
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

describe("pageNumber", () => {
  it.each([[undefined, 1], ["3", 3], ["0", 1], ["-2", 1], ["1.5", 1], ["Infinity", 1], ["abc", 1], ["100000", 1000]])("%s → %s", (v, n) => {
    expect(pageNumber(v)).toBe(n);
  });
});
