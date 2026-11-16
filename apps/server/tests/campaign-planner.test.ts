import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  opportunity: { findMany: vi.fn(), updateMany: vi.fn() },
  contentItem: { findMany: vi.fn(), create: vi.fn() },
  brandProfile: { findFirst: vi.fn(async () => null) },
}));
const planning = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: vi.fn(async () => null), NothingToDoError: class extends Error {} }));
vi.mock("@/server/services/context-docs", () => ({ listContextDocs: vi.fn(async () => []) }));
vi.mock("@/server/catalog/campaigns", () => ({ campaignsForPlanning: planning }));
vi.mock("@/server/catalog/linked", () => ({
  linkedProducts: vi.fn(async (_db: unknown, _s: unknown, ids: string[]) => ids.map((id) => ({ id, row: null, group: [], name: `Product ${id}`, state: "in" }))),
}));

import { plannerAgent } from "@/server/agents/definitions/planner";

const NOW = new Date("2026-11-05T10:00:00Z"); // a Thursday
const H = 3_600_000;
const campaign = (over: object = {}) => ({
  id: "c1", name: "Black Friday", startsAt: new Date("2026-11-27T07:00:00Z"), endsAt: new Date("2026-11-30T19:00:00Z"),
  productIds: ["p1"], categories: [], offer: "-20 % sur tout", discountPercent: 20, code: null, archivedAt: null, ...over,
});
type Post = { opportunityId: string; campaignId: string; title: string; channel: string; pillar: string; angle: string };
const post = (over: Partial<Post> = {}): Post => ({ opportunityId: "", campaignId: "c1", title: "t", channel: "INSTAGRAM_POST", pillar: "p", angle: "a", ...over });
let ai = vi.fn(async (input: { mock: unknown; prompt?: string }) => input.mock);
const ctx = () => ({ runId: "r1", brand: { workspaceId: "w1", brandId: "b1", displayName: "Brand" }, log: vi.fn(), ai: { generateObject: ai } }) as never;
/** contentItem.findMany answers by query: campaign counts, the calendar's taken days, the ideas already planned. */
let counted: { campaignId: string }[] = [];
let existing: { channel: string; scheduledFor: Date }[] = [];
let done: { opportunityId: string }[] = [];
const created = () => db.contentItem.create.mock.calls.map((c) => c[0].data as { campaignId: string | null; opportunityId: string | null; scheduledFor: Date | null; channel: string });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  counted = [];
  existing = [];
  done = [];
  ai = vi.fn(async (input: { mock: unknown; prompt?: string }) => input.mock);
  db.opportunity.findMany.mockResolvedValue([]);
  db.contentItem.create.mockImplementation(async ({ data }) => ({ id: `i${db.contentItem.create.mock.calls.length}`, ...data }));
  db.contentItem.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.campaignId ? counted : where.opportunityId ? done : existing,
  );
  planning.mockResolvedValue({ campaigns: [campaign()], timeZone: "Europe/Paris" });
});
afterEach(() => vi.useRealTimers());

describe("Planner and campaigns", () => {
  it("plans a campaign needing posts inside its window with no ideas shortlisted, from tomorrow to 30 days", async () => {
    await plannerAgent.run(ctx(), {});
    expect(planning).toHaveBeenCalledWith(db, { workspaceId: "w1", brandId: "b1" }, new Date(NOW.getTime() + 24 * H), new Date(NOW.getTime() + 30 * 24 * H));
    const posts = created();
    expect(posts).toHaveLength(2);
    for (const p of posts) {
      expect(p.campaignId).toBe("c1");
      expect(p.opportunityId).toBeNull();
      expect(p.scheduledFor!.getTime()).toBeGreaterThanOrEqual(campaign().startsAt.getTime());
      expect(p.scheduledFor!.getTime()).toBeLessThan(campaign().endsAt.getTime());
    }
    expect(posts[0]!.scheduledFor!.toISOString()).toBe("2026-11-27T09:00:00.000Z"); // a Friday, any weekday inside a window
    const prompt = String(ai.mock.calls[0]![0].prompt);
    expect(prompt).toContain('"name":"Black Friday","starts":"2026-11-27 08:00","ends":"2026-11-30 20:00","products":["Product p1"]');
    expect(prompt).toContain('"posts":2');
    expect(db.opportunity.updateMany).not.toHaveBeenCalled();
  });

  it("counts only live posts dated from now to the 30-day end", async () => {
    await plannerAgent.run(ctx(), {});
    const where = db.contentItem.findMany.mock.calls.find((c) => c[0].where.campaignId)![0].where;
    expect(where.scheduledFor).toEqual({ gte: NOW, lt: new Date(NOW.getTime() + 30 * 24 * H) });
    expect(where.status).toEqual({ notIn: ["CANCELLED", "REJECTED"] });
  });

  it("keeps 2 of 4 posts the model returns for a campaign that needs 2", async () => {
    ai = vi.fn(async () => ({ posts: [post(), post({ channel: "FACEBOOK_POST" }), post({ channel: "PINTEREST_PIN" }), post({ channel: "THREADS_POST" })] }));
    await plannerAgent.run(ctx(), {});
    expect(created()).toHaveLength(2);
  });

  it("plans 1 for a campaign with 1 post coming, none for a priority with 2", async () => {
    planning.mockResolvedValue({ campaigns: [campaign(), campaign({ id: "c2", name: "Oak dining", endsAt: null, offer: null, discountPercent: null })], timeZone: "Europe/Paris" });
    counted = [{ campaignId: "c1" }, { campaignId: "c2" }, { campaignId: "c2" }];
    ai = vi.fn(async () => ({ posts: [post(), post({ channel: "FACEBOOK_POST" }), post({ campaignId: "c2" })] }));
    await plannerAgent.run(ctx(), {});
    expect(created().map((p) => p.campaignId)).toEqual(["c1"]);
  });

  it("drops an already planned idea even with a campaignId, and an invalid campaignId", async () => {
    db.opportunity.findMany.mockResolvedValue([{ id: "o1", title: "Idea", angle: "a", channels: [], timing: null }]);
    done = [{ opportunityId: "o1" }];
    ai = vi.fn(async () => ({ posts: [post({ opportunityId: "o1" }), post({ campaignId: "nope" }), post({ opportunityId: "invented" })] }));
    await plannerAgent.run(ctx(), {});
    expect(created()).toEqual([]);
  });

  it("drops a dated campaign post with no free slot and gives its need back", async () => {
    const day = campaign({ startsAt: new Date("2026-11-29T13:00:00Z"), endsAt: new Date("2026-11-29T19:00:00Z") }); // a Sunday flash sale
    planning.mockResolvedValue({ campaigns: [day], timeZone: "Europe/Paris" });
    ai = vi.fn(async () => ({ posts: [post(), post(), post({ channel: "FACEBOOK_POST" })] }));
    const c = ctx();
    await plannerAgent.run(c, {});
    expect(created().map((p) => [p.channel, p.scheduledFor!.toISOString()])).toEqual([
      ["INSTAGRAM_POST", "2026-11-29T13:00:00.000Z"],
      ["FACEBOOK_POST", "2026-11-29T13:00:00.000Z"], // the second Instagram post found no slot; its need went to this one
    ]);
    expect((c as unknown as { log: { mock: { calls: unknown[][] } } }).log.mock.calls).toContainEqual(["WARN", "No free slot for Black Friday"]);
  });

  it("puts a standing priority post on its channel's cadence day, and drops it with no free slot", async () => {
    planning.mockResolvedValue({ campaigns: [campaign({ endsAt: null, offer: null, discountPercent: null, startsAt: new Date("2026-01-01T00:00:00Z") })], timeZone: "Europe/Paris" });
    ai = vi.fn(async () => ({ posts: [post({ channel: "INSTAGRAM_CAROUSEL" })] }));
    await plannerAgent.run(ctx(), {});
    expect(created()[0]!.scheduledFor!.toISOString()).toBe("2026-11-11T09:00:00.000Z"); // the first Wednesday from tomorrow

    vi.clearAllMocks();
    db.contentItem.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (where.campaignId ? [] : where.opportunityId ? [] : existing));
    existing = Array.from({ length: 6 }, (_, n) => ({ channel: "INSTAGRAM_CAROUSEL", scheduledFor: new Date(Date.UTC(2026, 10, 11 + 7 * n, 9)) }));
    await plannerAgent.run(ctx(), {});
    expect(db.contentItem.create).not.toHaveBeenCalled();
  });

  it("has nothing to do with no ideas and no campaign needs", async () => {
    counted = [{ campaignId: "c1" }, { campaignId: "c1" }];
    await expect(plannerAgent.run(ctx(), {})).rejects.toThrow("No ideas to plan");
    expect(ai).not.toHaveBeenCalled();
  });
});
