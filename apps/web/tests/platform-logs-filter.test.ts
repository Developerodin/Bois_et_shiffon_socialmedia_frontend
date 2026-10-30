import { beforeEach, describe, expect, it, vi } from "vitest";
import { platformLogs, type LogKind } from "@/server/services/platform-admin";

const m = vi.hoisted(() => ({ audit: vi.fn(), runs: vi.fn(), events: vi.fn(), calls: vi.fn(), none: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    auditEvent: { findMany: m.audit },
    agentRun: { findMany: m.runs },
    agentEvent: { findMany: m.events },
    aiWorkflowRun: { findMany: m.calls },
    user: { findMany: m.none },
    brand: { findMany: m.none },
    workspace: { findMany: m.none },
  },
}));

beforeEach(() => Object.values(m).forEach((f) => f.mockReset().mockResolvedValue([])));

describe("platformLogs filters every tab by person", () => {
  it.each<[LogKind, keyof typeof m, object]>([
    ["audit", "audit", { actorUserId: "u1" }],
    ["runs", "runs", { triggeredByUserId: "u1" }],
    ["events", "events", { run: { triggeredByUserId: "u1" } }],
    ["calls", "calls", { userId: "u1" }],
  ])("%s", async (kind, source, where) => {
    await platformLogs({ kind, actorId: "u1", workspaceId: "w1" });
    expect(m[source].mock.calls[0][0].where).toEqual(expect.objectContaining({ workspaceId: "w1", ...where }));
  });
});
