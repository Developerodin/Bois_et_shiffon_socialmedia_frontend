import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    contentItem: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    qualityCheck: { findMany: vi.fn(async () => [] as unknown[]), create: vi.fn() },
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: vi.fn(async () => null), NothingToDoError: class extends Error {} }));
vi.mock("@/server/services/publishing", () => ({ lock: vi.fn(), TX: {}, postAiAllowed: vi.fn(async () => true) }));
vi.mock("@/server/catalog/linked", () => ({ linkedProducts: vi.fn(async () => []) }));
vi.mock("@/server/catalog/campaigns", () => ({ campaignsById: vi.fn(async () => ({ campaigns: new Map(), timeZone: "UTC" })) }));
vi.mock("@/server/content/knowledge", async (orig) => ({ ...(await orig<object>()), brandKnowledge: vi.fn(async () => ({ text: "" })) }));

import { qualityAgent } from "@/server/agents/definitions/quality";
import { checkStory } from "@/server/stories/checks";
import { storySlides, type StoryBody, type StoryFrame } from "@/server/stories/body";

const frame = (over: Partial<StoryFrame> = {}): StoryFrame => ({
  label: "New", headline: "Milo sofa", body: "Soft and deep.", renderedKey: "r.jpg", mediaKind: "photo",
  file: { width: 1080, height: 1920, bytes: 500_000 }, rights: { kind: "owned" }, ...over,
});
const story = (over: Partial<StoryBody> = {}): StoryBody => ({
  frames: [frame(), frame(), frame(), frame()], cta: "Shop now", link: "https://shop.example/milo", hook: "Milo", productIds: [], brandMark: true, ...over,
});
const row = (b: StoryBody, name: string) => checkStory(b).find((r) => r.check === name)!;

describe("checkStory", () => {
  it("passes a complete story and always warns about visual review", () => {
    const rows = checkStory(story());
    expect(rows.map((r) => r.check)).toEqual(["Frames", "Frame files", "Text fits", "Link and CTA", "Asset rights", "Visual review"]);
    expect(rows.filter((r) => r.status !== "pass").map((r) => [r.check, r.status])).toEqual([["Visual review", "warn"]]);
    expect(row(story(), "Visual review").note).toBe("Not checked: the photos and clips weren't reviewed by AI.");
  });
  it("blocks on frame count and on frames without a render or file", () => {
    expect(row(story({ frames: [frame(), frame()] }), "Frames").status).toBe("blocker");
    expect(row(story({ frames: Array(6).fill(frame()) }), "Frames").status).toBe("blocker");
    expect(row(story({ frames: [frame(), frame(), frame({ renderedKey: undefined })] }), "Frames").status).toBe("blocker");
    expect(row(story({ frames: [frame(), frame(), frame({ file: undefined })] }), "Frames").status).toBe("blocker");
  });
  it("blocks on file size, dimensions and clip length", () => {
    const bad = (file: StoryFrame["file"], mediaKind: "photo" | "video" = "photo") => row(story({ frames: [frame(), frame(), frame({ file, mediaKind })] }), "Frame files").status;
    expect(bad({ width: 1080, height: 1350, bytes: 1 })).toBe("blocker");
    expect(bad({ width: 1080, height: 1920, bytes: 8 * 1024 * 1024 + 1 })).toBe("blocker");
    expect(bad({ width: 1080, height: 1920, bytes: 1, durationSec: 15.6 }, "video")).toBe("blocker");
    expect(bad({ width: 1080, height: 1920, bytes: 1, durationSec: 15.5 }, "video")).toBe("pass");
  });
  it("blocks when text does not fit, naming the frame", () => {
    const r = row(story({ frames: [frame(), frame({ body: "word ".repeat(60) }), frame()] }), "Text fits");
    expect(r.status).toBe("blocker");
    expect(r.note).toContain("Frame 2");
  });
  it("warns on an empty link or CTA", () => {
    expect(row(story({ link: "" }), "Link and CTA").status).toBe("warn");
    expect(row(story({ cta: "" }), "Link and CTA").status).toBe("warn");
  });
  it("lists rights per frame and blocks a frame without them", () => {
    const b = story({ frames: [frame(), frame({ rights: { kind: "confirmed", by: "u1", name: "Ana" } }), frame({ rights: { kind: "confirmed", by: "u2", name: "" } })] });
    const r = row(b, "Asset rights");
    expect(r.status).toBe("pass");
    expect(r.note).toContain("Brand's own");
    expect(r.note).toContain("Confirmed by Ana");
    expect(r.note).toContain("Confirmed by a team member");
    expect(row(story({ frames: [frame(), frame(), frame({ rights: undefined })] }), "Asset rights").status).toBe("blocker");
  });
});

describe("Quality on a story", () => {
  const ai = vi.fn(async (input: { mock: unknown; prompt: string }) => input.mock);
  const ctx = { runId: "r1", brand: { workspaceId: "w1", brandId: "b1", displayName: "Brand" }, log: vi.fn(), ai: { generateObject: ai } } as never;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env.LANGUAGETOOL_URL;
    const item = { id: "i1", title: "Milo story", channel: "INSTAGRAM_STORY", status: "DRAFT_REVIEW", brief: {}, campaignId: null, scheduledFor: null, productIds: [], versions: [{ id: "v1", version: 1, body: story(), checks: [] }] };
    db.contentItem.findMany.mockResolvedValue([item]);
    db.contentItem.findUnique.mockResolvedValue({ status: "DRAFT_REVIEW", versions: [{ id: "v1" }] });
  });
  it("runs story rules, not post rules, and tells the AI about stories", async () => {
    await qualityAgent.run(ctx, {});
    const results = db.qualityCheck.create.mock.calls[0][0].data.results as { check: string }[];
    const names = results.map((r) => r.check);
    for (const n of ["Caption", "Hashtags", "First line", "Alt text"]) expect(names).not.toContain(n);
    expect(names).toContain("Frames");
    expect(String(ai.mock.calls[0][0].prompt)).toContain("Stories have no caption and no clickable link when scheduled.");
  });
  it("sends the story's slides to LanguageTool", async () => {
    process.env.LANGUAGETOOL_URL = "http://lt.test";
    const fetchMock = vi.fn(async () => ({ json: async () => ({ matches: [] }) }));
    vi.stubGlobal("fetch", fetchMock);
    await qualityAgent.run(ctx, {});
    const init = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1];
    expect(init.body.get("text")).toBe(storySlides(story()).join("\n"));
  });
});
