import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  creditEntry: { create: vi.fn() },
  auditEvent: { create: vi.fn() },
}));
vi.mock("@/server/db/prisma", () => ({ prisma: db }));

import { PlanRequiredError, renewDuePlans, requirePlan, setPlan } from "@/server/services/subscriptions";

const day = 86_400_000;
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  db.creditEntry.create.mockResolvedValue({});
});

describe("plans", () => {
  it("a workspace without an active plan can't render or generate; unlimited test workspaces can", async () => {
    db.subscription.findUnique.mockResolvedValue(null);
    await expect(requirePlan("w1")).rejects.toBeInstanceOf(PlanRequiredError);
    db.subscription.findUnique.mockResolvedValue({ status: "CANCELED", planId: "starter", periodEnd: new Date() });
    await expect(requirePlan("w1")).rejects.toBeInstanceOf(PlanRequiredError);
    db.subscription.findUnique.mockResolvedValue({ status: "ACTIVE", planId: "starter", periodEnd: new Date() });
    await expect(requirePlan("w1")).resolves.toBeUndefined();
    vi.stubEnv("UNLIMITED_CREDIT_WORKSPACES", "w2");
    db.subscription.findUnique.mockResolvedValue(null);
    await expect(requirePlan("w2")).resolves.toBeUndefined();
  });

  it("activating grants the plan's credits once for the period", async () => {
    db.subscription.findUnique.mockResolvedValue(null);
    db.subscription.upsert.mockImplementation(async (a: { create: { periodStart: Date } }) => ({ id: "s1", ...a.create }));
    db.creditEntry.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(setPlan("w1", "professional")).resolves.toBeTruthy(); // an already-granted period isn't an error
    expect(db.creditEntry.create.mock.calls[0][0].data).toMatchObject({ workspaceId: "w1", delta: 200, reason: "plan-credits" });
    expect(db.creditEntry.create.mock.calls[0][0].data.refId).toContain(":professional:");
    expect(db.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "plan.set" }) }));
  });

  it("setting the plan a workspace already has changes nothing and grants nothing", async () => {
    const live = { id: "s1", status: "ACTIVE", planId: "starter", periodStart: new Date(), periodEnd: new Date() };
    db.subscription.findUnique.mockResolvedValue(live);
    await expect(setPlan("w1", "starter")).resolves.toBe(live);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
    expect(db.creditEntry.create).not.toHaveBeenCalled();
  });

  it("one failed renewal doesn't stop the others", async () => {
    const end = new Date("2026-12-01T00:00:00Z");
    db.subscription.findMany.mockResolvedValue([
      { id: "s1", workspaceId: "w1", planId: "starter", periodEnd: end },
      { id: "s2", workspaceId: "w2", planId: "starter", periodEnd: end },
    ]);
    db.creditEntry.create.mockRejectedValueOnce(new Error("db blip"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await renewDuePlans(new Date("2026-12-02T00:00:00Z"));
    expect(db.subscription.update).toHaveBeenCalledTimes(1);
    expect(db.subscription.update.mock.calls[0][0].where).toEqual({ id: "s2" });
  });

  it("renewal grants each missed period once and moves the period on", async () => {
    const now = new Date("2026-12-20T00:00:00Z");
    const end = new Date(now.getTime() - 35 * day); // two periods behind
    db.subscription.findMany.mockResolvedValue([{ id: "s1", workspaceId: "w1", planId: "starter", periodEnd: end }]);
    await renewDuePlans(now);
    expect(db.creditEntry.create).toHaveBeenCalledTimes(2);
    expect(db.creditEntry.create.mock.calls.map((c) => c[0].data.delta)).toEqual([60, 60]);
    const next = db.subscription.update.mock.calls[0][0].data;
    expect(next.periodEnd.getTime()).toBeGreaterThan(now.getTime());
    expect(next.periodEnd.getTime() - next.periodStart.getTime()).toBe(30 * day);
  });
});
