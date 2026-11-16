import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentRun: { findUnique: vi.fn(), update: vi.fn() },
  agentEvent: { create: vi.fn() },
  contentVersion: { findFirst: vi.fn() },
  job: { findFirst: vi.fn() },
}));
const refund = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), refundCharge: refund }));

import { onAgentRunFailure } from "@/server/agents/engine";

const payload = { runId: "r1", workspaceId: "w1", brandId: "b1" };
const run = { id: "r1", workspaceId: "w1", brandId: "b1", agentKey: "creator", input: { itemId: "i1", chargeId: "c1" } };

beforeEach(() => {
  vi.clearAllMocks();
  db.agentRun.findUnique.mockResolvedValue({ status: "RUNNING" });
  db.agentRun.update.mockResolvedValue(run);
  db.contentVersion.findFirst.mockResolvedValue(null);
  db.job.findFirst.mockResolvedValue(null);
});

describe("onAgentRunFailure and paid runs", () => {
  it("refunds a paid run that finally fails without delivering", async () => {
    await onAgentRunFailure(payload, new Error("boom"), true);
    expect(refund).toHaveBeenCalledWith("w1", "c1");
  });

  it("keeps the charge when the run already saved a version (a re-run found nothing left to do)", async () => {
    db.contentVersion.findFirst.mockResolvedValue({ id: "v1" });
    await onAgentRunFailure(payload, new Error("Nothing to write"), true);
    expect(refund).not.toHaveBeenCalled();
    expect(db.contentVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { agentRunId: "r1", item: { workspaceId: "w1" } } }));
  });

  it("keeps the charge when the run queued a story render (that job refunds on its own failure)", async () => {
    db.job.findFirst.mockResolvedValue({ id: "j1" });
    await onAgentRunFailure(payload, new Error("cut off"), true);
    expect(refund).not.toHaveBeenCalled();
  });

  it("leaves a run that already SUCCEEDED as it is: no refund, not marked failed", async () => {
    db.agentRun.findUnique.mockResolvedValue({ status: "SUCCEEDED" });
    await onAgentRunFailure(payload, new Error("Stopped: it was cut off"), true);
    expect(db.agentRun.update).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it("doesn't refund an attempt that will be retried", async () => {
    await onAgentRunFailure(payload, new Error("boom"), false);
    expect(refund).not.toHaveBeenCalled();
  });
});
