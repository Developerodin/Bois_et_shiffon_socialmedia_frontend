import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  brandProfile: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  contentItem: { findFirst: vi.fn() },
  integrationConnection: { findFirst: vi.fn() },
  agentRun: { count: vi.fn(async () => 0) },
}));
const spend = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());
const start = vi.hoisted(() => vi.fn());
const schedule = vi.hoisted(() => vi.fn());

// Plans are tested in subscriptions.test.ts; here every workspace has one.
vi.mock("@/server/services/subscriptions", () => ({ requirePlan: vi.fn(async () => undefined), PlanRequiredError: class extends Error {} }));
vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: start }));
vi.mock("@/server/services/credits", () => ({
  CREDIT_COSTS: { manualRun: 5 },
  InsufficientCreditsError: class extends Error {},
  spendCredits: spend,
  refundCharge: refund,
}));
vi.mock("@/server/services/publishing", () => ({
  schedulePublication: schedule,
  publishRequirements: (channel: string) => ({ provider: channel === "PINTEREST_PIN" ? "PINTEREST" : "INSTAGRAM", needsBoard: channel === "PINTEREST_PIN" }),
}));

import { AutomationsChange, autoPublish, runMonthlyPlans } from "@/server/services/automations";

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const later = new Date(Date.now() + 86_400_000);

beforeEach(() => vi.clearAllMocks());

describe("monthly content plan", () => {
  it("runs only on the 1st, charges once per brand and month, and starts the chain with that charge", async () => {
    db.brandProfile.findMany.mockResolvedValue([{ workspaceId: "w1", brandId: "b1" }]);
    spend.mockResolvedValue("c1");
    start.mockResolvedValue({ input: { chain: true, chargeId: "c1" } });
    await runMonthlyPlans(new Date("2026-12-02T03:00:00Z"));
    expect(spend).not.toHaveBeenCalled();
    await runMonthlyPlans(new Date("2026-12-01T03:00:00Z"));
    expect(spend).toHaveBeenCalledWith(expect.objectContaining({ amount: 5, refId: "monthly-plan:b1:2026-12" }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "planner", input: { chain: true }, prepaidChargeId: "c1" }));
    expect(refund).not.toHaveBeenCalled();
  });

  it("doesn't run again in a month it already ran (a retried sweep)", async () => {
    db.brandProfile.findMany.mockResolvedValue([{ workspaceId: "w1", brandId: "b1" }]);
    db.agentRun.count.mockResolvedValueOnce(1);
    await runMonthlyPlans(new Date("2026-12-01T09:00:00Z"));
    expect(spend).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("a change carries only the switch sent, so turning one on leaves the other alone", () => {
    expect(AutomationsChange.parse({ autoPublish: true })).toEqual({ autoPublish: true });
    expect(AutomationsChange.safeParse({ autoPublish: true, other: 1 }).success).toBe(false);
  });

  it("gives the credits back when a Planner run was already going", async () => {
    db.brandProfile.findMany.mockResolvedValue([{ workspaceId: "w1", brandId: "b1" }]);
    spend.mockResolvedValue("c1");
    start.mockResolvedValue({ input: { chain: true, chargeId: "other" } });
    await runMonthlyPlans(new Date("2026-12-01T03:00:00Z"));
    expect(refund).toHaveBeenCalledWith("w1", "c1");
  });
});

describe("auto-publish", () => {
  const approved = (over: object = {}) => ({ channel: "INSTAGRAM_POST", scheduledFor: later, versions: [{ version: 2, body: { photoKeys: ["w1/b1/p.jpg"] } }], ...over });

  it("schedules an approved post with a date on the connected account, with its photos", async () => {
    db.brandProfile.findFirst.mockResolvedValue({ automations: { autoPublish: true } });
    db.contentItem.findFirst.mockResolvedValue(approved());
    db.integrationConnection.findFirst.mockResolvedValue({ id: "c1" });
    await autoPublish(scope, "i1");
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ itemId: "i1", version: 2, connectionId: "c1", mediaKeys: ["w1/b1/p.jpg"], runAt: later }));
  });

  it("does nothing when it's off, the date has passed, there's no account or a board to choose", async () => {
    db.integrationConnection.findFirst.mockResolvedValue({ id: "c1" });
    db.brandProfile.findFirst.mockResolvedValue({ automations: { autoPublish: false } });
    db.contentItem.findFirst.mockResolvedValue(approved());
    await autoPublish(scope, "i1");
    db.brandProfile.findFirst.mockResolvedValue({ automations: { autoPublish: true } });
    db.contentItem.findFirst.mockResolvedValue(approved({ scheduledFor: new Date(Date.now() - 1000) }));
    await autoPublish(scope, "i1");
    db.contentItem.findFirst.mockResolvedValue(approved({ channel: "PINTEREST_PIN" }));
    await autoPublish(scope, "i1");
    db.contentItem.findFirst.mockResolvedValue(approved());
    db.integrationConnection.findFirst.mockResolvedValue(null);
    await autoPublish(scope, "i1");
    expect(schedule).not.toHaveBeenCalled();
  });

  it("never throws: a refused schedule leaves the post approved", async () => {
    db.brandProfile.findFirst.mockResolvedValue({ automations: { autoPublish: true } });
    db.contentItem.findFirst.mockResolvedValue(approved());
    db.integrationConnection.findFirst.mockResolvedValue({ id: "c1" });
    schedule.mockRejectedValue(new Error("nope"));
    await expect(autoPublish(scope, "i1")).resolves.toBeUndefined();
  });
});
