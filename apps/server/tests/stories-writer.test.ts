import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  contentItem: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })), create: vi.fn(), count: vi.fn(async () => 0) },
  contentVersion: { create: vi.fn() },
  auditEvent: { create: vi.fn() },
  product: { findMany: vi.fn(async () => [] as unknown[]) },
  brandProfile: { findFirst: vi.fn(async () => null) },
  opportunity: { findMany: vi.fn(async () => [] as unknown[]), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const m = vi.hoisted(() => ({ sources: vi.fn(), save: vi.fn(), linked: vi.fn(), refund: vi.fn(), start: vi.fn() }));

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: m.start, NothingToDoError: class NothingToDoError extends Error {} }));
vi.mock("@/server/services/context-docs", () => ({ listContextDocs: vi.fn(async () => []) }));
vi.mock("@/server/catalog/linked", () => ({ linkedProducts: m.linked }));
vi.mock("@/server/catalog/campaigns", () => ({
  campaignsById: vi.fn(async () => ({ campaigns: new Map(), timeZone: "Europe/Paris" })),
  campaignsForPlanning: vi.fn(async () => ({ campaigns: [], timeZone: "Europe/Paris" })),
}));
vi.mock("@/server/stories/sources", () => ({ listStorySources: m.sources }));
vi.mock("@/server/stories/service", () => ({ saveStoryVersion: m.save }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), refundCharge: m.refund }));
vi.mock("@/server/research/brand-assets", async (orig) => ({ ...(await orig<object>()), storeImage: vi.fn(async () => null) }));

import { briefAgent } from "@/server/agents/definitions/brief";
import { creatorAgent } from "@/server/agents/definitions/creator";
import { plannerAgent } from "@/server/agents/definitions/planner";
import { nextSlot } from "@/server/content/calendar";
import { PublishingError } from "@/server/services/publishing";
import type { StoryBody } from "@/server/stories/body";
import { STORY_MEDIA_CHECKS } from "@/server/stories/checks";
import { writeStory } from "@/server/stories/writer";

type Call = { mock: unknown; prompt: string; schema: { parse: (v: unknown) => unknown }; validate?: (v: unknown) => string | null };
let answer: unknown = undefined;
const ai = vi.fn(async (input: Call) => input.schema.parse(answer ?? input.mock));
const ctx = (websiteUrl: string | null = "https://brand.example") =>
  ({ runId: "r1", brand: { workspaceId: "w1", brandId: "b1", displayName: "Brand", websiteUrl }, log: vi.fn(), ai: { generateObject: ai } }) as never;
const item = (over: object = {}) => ({ id: "i1", title: "Nouvelle table Milo", channel: "INSTAGRAM_STORY", status: "BRIEF_READY", brief: { goal: "newArrival" }, productIds: ["p1"], versions: [] as { version: number }[], decisions: [], ...over });
const shared = { knowledge: "k", productsLine: "", campaignLine: "" };
const productRow = { id: "p1", url: "https://shop.example/products/milo" };
const photo = (kind: string, id: string) => ({ ref: { kind, id }, title: id, kind: "photo", previewUrl: `https://signed/${id}` });
const frameText = (headline: string) => ({ label: "Nouveau", headline, body: "Chêne massif huilé.", composition: "La table entière, de face" });
const savedInput = () => m.save.mock.calls[0][3] as { frames: Record<string, unknown>[]; cta: string; link: string; brandMark: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  answer = undefined;
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  m.linked.mockImplementation(async (_db: unknown, _s: unknown, ids: string[]) =>
    ids.map((id) => ({ id, row: id === "p1" ? productRow : null, group: [], name: "Milo", state: "in" })),
  );
  m.sources.mockResolvedValue([
    { tab: "products", items: [photo("product", "p1")] },
    { tab: "library", items: [photo("library", "w1/b1/lib/a.jpg"), photo("upload", "u1"), photo("photoshoot", "w1/b1/shoot/b.jpg")] },
  ]);
  m.save.mockResolvedValue({ status: "saved", version: 1 });
  m.start.mockResolvedValue({ id: "run" });
  m.refund.mockResolvedValue(true);
});

describe("writeStory, first write", () => {
  it("saves the picked photo sources, photos only, with the product's URL as the link", async () => {
    answer = {
      frames: [
        { sourceId: "s2", ...frameText("Voici Milo") },
        { sourceId: "s1", ...frameText("Du chêne massif") },
        { sourceId: "", ...frameText("Pour huit") },
      ],
      cta: "Découvrir Milo",
    };
    await writeStory(ctx(), item(), shared);
    expect(m.sources).toHaveBeenCalledWith({ workspaceId: "w1", brandId: "b1", userId: "agent" }, { productIds: ["p1"], photosOnly: true });
    const [scope, itemId, base, input, actor, opts] = m.save.mock.calls[0];
    expect([scope, itemId, base]).toEqual([{ workspaceId: "w1", brandId: "b1", userId: "agent" }, "i1", 0]);
    expect(input.frames.map((f: { source?: unknown }) => f.source)).toEqual([{ kind: "library", id: "w1/b1/lib/a.jpg" }, { kind: "product", id: "p1" }, undefined]);
    expect(input.frames[0]).toMatchObject({ label: "Nouveau", headline: "Voici Milo", composition: "La table entière, de face" });
    expect(input).toMatchObject({ cta: "Découvrir Milo", link: "https://shop.example/products/milo", brandMark: true });
    expect(actor).toMatchObject({ kind: "agent", runId: "r1" });
    expect(opts).toEqual({ photosOnly: true, keepEmpty: true });
    // The prompt lists the offered photos by short id, not their storage keys.
    expect(ai.mock.calls[0][0].prompt).toContain("- s2 | w1/b1/lib/a.jpg");
  });

  it("refuses a reused source, too few frames and a headline too wide to fit", async () => {
    await writeStory(ctx(), item(), shared);
    const validate = ai.mock.calls[0][0].validate!;
    const good = { frames: [{ sourceId: "s1", ...frameText("Un") }, { sourceId: "s2", ...frameText("Deux") }, { sourceId: "", ...frameText("Trois") }], cta: "Voir" };
    expect(validate(good)).toBeNull();
    expect(validate({ ...good, frames: [good.frames[0], { ...good.frames[1], sourceId: "s1" }, good.frames[2]] })).toMatch(/Frame 2: .*twice/);
    expect(validate({ ...good, frames: good.frames.slice(0, 2) })).toMatch(/3 to 5 frames/);
    expect(validate({ ...good, frames: [good.frames[0], { ...good.frames[1], headline: "WWWWWWWWWW WWWWWWWWWW WWWWWWWWWW WWWWWWWWWW WWWWWWWWWW" }, good.frames[2]] })).toMatch(/Frame 2: the headline/);
    expect(validate({ ...good, frames: [{ ...good.frames[0], sourceId: "s9" }, good.frames[1], good.frames[2]] })).toMatch(/Frame 1: use only the listed/);
    expect(validate({ ...good, frames: [{ ...good.frames[0], composition: "x".repeat(101) }, good.frames[1], good.frames[2]] })).toMatch(/Frame 1: composition/);
  });

  it("links the brand website when the story has no product", async () => {
    await writeStory(ctx(), item({ productIds: [] }), shared);
    expect(savedInput().link).toBe("https://brand.example");
    await writeStory(ctx("http://insecure.example"), item({ productIds: [] }), shared);
    expect((m.save.mock.calls[1][3] as { link: string }).link).toBe("");
  });

  it("refunds the prepaid charge when the save is refused, and says so", async () => {
    m.save.mockRejectedValue(new PublishingError("Someone else changed this story.", 409, "story.stale"));
    const c = ctx();
    await expect(writeStory(c, item(), { ...shared, chargeId: "c1" })).resolves.toBeNull();
    expect(m.refund).toHaveBeenCalledWith("w1", "c1");
    expect((c as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith("WARN", expect.stringContaining("Someone else changed"), { type: "ContentItem", id: "i1" });
  });
});

describe("writeStory, rewrite", () => {
  const last: StoryBody = {
    frames: [
      { source: { kind: "product", id: "p1" }, label: "A", headline: "Un", body: "", mediaKind: "photo", mediaKey: "w1/b1/x.jpg", renderedKey: "w1/b1/stories/x.jpg" },
      { source: { kind: "upload", id: "u9" }, label: "B", headline: "Deux", body: "", crop: { x: 0.3, y: 0.6, scale: 1.2 }, clip: { start: 4.5, sound: false }, mediaKind: "video", mediaKey: "w1/b1/c.mp4" },
      { source: { kind: "library", id: "w1/b1/lib/a.jpg" }, label: "C", headline: "Trois", body: "", mediaKind: "photo" },
      { label: "D", headline: "Quatre", body: "" },
    ],
    cta: "Voir", link: "https://old.example/x", hook: "Un", productIds: [], brandMark: false,
  };

  it("keeps the phone clip, its crop and window, and every source; only the text is new", async () => {
    answer = { frames: ["Un bis", "Deux bis", "Trois bis", "Quatre bis"].map((h) => ({ label: "L", headline: h, body: "", composition: "" })), cta: "Voir plus" };
    await writeStory(ctx(), item({ status: "DRAFT_REVIEW", versions: [{ version: 3 }] }), { ...shared, last, reviewer: "Plus court" });
    const [, , base, input, , opts] = m.save.mock.calls[0];
    expect(base).toBe(3);
    expect(input.frames[1]).toEqual({ source: { kind: "upload", id: "u9" }, label: "L", headline: "Deux bis", body: "", composition: "", crop: { x: 0.3, y: 0.6, scale: 1.2 }, clip: { start: 4.5, sound: false } });
    expect(input.frames.map((f: { source?: unknown }) => f.source)).toEqual([...last.frames.map((f) => f.source)]);
    expect(input).toMatchObject({ cta: "Voir plus", link: "https://old.example/x", brandMark: false });
    // A clip can't render in the request: the save goes to the job queue.
    expect(opts).toEqual({ photosOnly: false, keepEmpty: true });
    expect(m.sources).not.toHaveBeenCalled();
    expect(ai.mock.calls[0][0].prompt).toContain("Plus court");
    const validate = ai.mock.calls[0][0].validate!;
    expect(validate({ ...(answer as object) })).toBeNull();
    expect(validate({ frames: (answer as { frames: unknown[] }).frames.slice(0, 3), cta: "Voir" })).toMatch(/exactly 4 frames/);
  });
});

describe("Creator and stories", () => {
  const blocked = (rows: { check: string; status: string }[]) =>
    item({ status: "DRAFT_REVIEW", versions: [{ id: "v1", version: 1, body: { frames: [], cta: "", link: "", hook: "", productIds: ["p1"], brandMark: true }, checks: [{ overall: "BLOCKER", results: rows.map((r) => ({ ...r, note: "n" })) }] }] });

  it("leaves a story whose only blockers are media ones (the writer can't fix those)", async () => {
    expect(STORY_MEDIA_CHECKS).toEqual(["Frames", "Frame files", "Asset rights"]);
    db.contentItem.findMany.mockResolvedValue([blocked([{ check: "Frames", status: "blocker" }, { check: "Brand voice", status: "warn" }])]);
    await expect(creatorAgent.run(ctx(), {})).rejects.toThrow(/Nothing to write/);
    expect(m.save).not.toHaveBeenCalled();
  });

  it("rewrites a story blocked for its text, through writeStory, and checks it when asked for one item", async () => {
    db.contentItem.findMany.mockResolvedValue([blocked([{ check: "Frames", status: "blocker" }, { check: "Brand voice", status: "blocker" }])]);
    await creatorAgent.run({ ...(ctx() as object), chargeId: "c1" } as never, { itemId: "i1" });
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(m.save.mock.calls[0][4]).toMatchObject({ kind: "agent", runId: "r1", chargeId: "c1" });
    expect(String(ai.mock.calls[0][0].prompt)).toContain("Brand voice");
    expect(db.contentVersion.create).not.toHaveBeenCalled();
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "quality", input: { itemId: "i1", version: 1 } }));
  });

  it("leaves a paid New story not yet written to its own run (a calendar run would write it free)", async () => {
    db.contentItem.findMany.mockResolvedValue([item({ brief: { goal: "newArrival", requestId: "req-1" } })]);
    await expect(creatorAgent.run(ctx(), {})).rejects.toThrow(/Nothing to write/);
    expect(m.save).not.toHaveBeenCalled();
  });

  it("still writes a paid New story in its own run", async () => {
    db.contentItem.findMany.mockResolvedValue([item({ brief: { goal: "newArrival", requestId: "req-1" } })]);
    await creatorAgent.run({ ...(ctx() as object), chargeId: "c1" } as never, { itemId: "i1" });
    expect(m.save).toHaveBeenCalledTimes(1);
  });
});

describe("Planner and Brief writer", () => {
  it("plans a story with a date on the story cadence", async () => {
    db.opportunity.findMany.mockResolvedValue([{ id: "o1", title: "Milo", angle: "a", channels: [], timing: null }]);
    db.contentItem.findMany.mockResolvedValue([]);
    db.contentItem.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "n1", ...data }));
    answer = { posts: [{ opportunityId: "o1", campaignId: "", title: "Milo en story", channel: "INSTAGRAM_STORY", pillar: "Produit", angle: "a" }] };
    await plannerAgent.run(ctx(), {});
    const data = db.contentItem.create.mock.calls[0][0].data;
    expect(data.channel).toBe("INSTAGRAM_STORY");
    expect(data.scheduledFor).toBeInstanceOf(Date);
    expect(nextSlot("INSTAGRAM_STORY", new Date("2026-11-16T00:00:00Z"), new Set())).not.toBeNull();
  });

  it("gives a story's brief a frame plan", async () => {
    db.contentItem.findMany.mockResolvedValue([{ ...item({ status: "PLANNED", brief: { angle: "a" } }), pillar: null, scheduledFor: null, campaignId: null, opportunity: null }]);
    await briefAgent.run(ctx(), {});
    const brief = (db.contentItem.updateMany.mock.calls as unknown as [{ data: { brief: unknown } }][])[0][0].data.brief as { frames?: { purpose: string; composition: string }[] };
    expect(brief.frames?.length).toBeGreaterThanOrEqual(3);
    expect(brief.frames?.[0]).toEqual({ purpose: expect.any(String), composition: expect.any(String) });
  });

  it("leaves a planned item that already has a version (a duplicated story) unbriefed", async () => {
    db.contentItem.findMany.mockResolvedValue([{ ...item({ status: "PLANNED", brief: { angle: "a" } }), pillar: null, scheduledFor: null, campaignId: null, opportunity: null }]);
    await briefAgent.run(ctx(), {});
    const [find] = db.contentItem.findMany.mock.calls.at(-1) as unknown as [{ where: { versions?: unknown } }];
    const [upd] = db.contentItem.updateMany.mock.calls.at(-1) as unknown as [{ where: { versions?: unknown } }];
    expect(find.where.versions).toEqual({ none: {} });
    expect(upd.where.versions).toEqual({ none: {} });
  });
});
