import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  brandAgentConfig: { findUnique: vi.fn(async () => null) },
  agentRun: { findMany: vi.fn(async () => []), create: vi.fn(async (a: { data: { input?: unknown } }) => ({ id: "run1", ...a.data })), findFirstOrThrow: vi.fn(), update: vi.fn() },
  agentEvent: { create: vi.fn() },
  auditEvent: { create: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const m = vi.hoisted(() => ({ spend: vi.fn(), refund: vi.fn(), run: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob: vi.fn() }));
vi.mock("@/server/jobs/claim", () => ({ validateAiWorkflowPayload: vi.fn() }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), spendCredits: m.spend, refundCharge: m.refund }));
vi.mock("@/server/agents/brand-context", () => ({ loadBrandContext: vi.fn(async () => ({ workspaceId: "w1", brandId: "b1" })) }));
vi.mock("@/server/agents/registry", async () => {
  const { z } = await import("zod");
  return { getAgent: () => ({ key: "creator", name: "Creator", inputSchema: z.object({ itemId: z.string().optional() }), run: m.run }) };
});

import { executeAgentRun, startAgentRun } from "@/server/agents/engine";

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe("prepaid charge reaches the Creator", () => {
  it("startAgentRun stores the prepaid charge in the run input, charges nothing itself, and the run's ctx carries it", async () => {
    await startAgentRun({ workspaceId: "w1", brandId: "b1", agentKey: "creator", trigger: "event", input: { itemId: "i1" }, prepaidChargeId: "req-1" });
    expect(m.spend).not.toHaveBeenCalled();
    const stored = db.agentRun.create.mock.calls[0]![0].data.input;
    expect(stored).toEqual({ itemId: "i1", chargeId: "req-1" });

    db.agentRun.findFirstOrThrow.mockResolvedValue({ id: "run1", workspaceId: "w1", brandId: "b1", agentKey: "creator", status: "QUEUED", input: stored, startedAt: null });
    m.run.mockResolvedValue({ summary: "ok" });
    await executeAgentRun({ workspaceId: "w1", brandId: "b1", runId: "run1" });
    expect(m.run.mock.calls[0][0].chargeId).toBe("req-1");
    expect(m.run.mock.calls[0][1]).toEqual({ itemId: "i1" });
  });
});
