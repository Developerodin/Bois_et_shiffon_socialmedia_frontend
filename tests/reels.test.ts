import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReelDetail, ReelSummary } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { SIGNED_LINK_STALE_MS, stale } from "@/lib/signed-links";
import { isRepeatClick, makePresser, pressErrorText, refused } from "@/lib/presser";
import * as photoshootPress from "@/components/photoshoot/press";
import { createLinkCache } from "@/components/workspace/use-steady-links";
import { BUILT_STEPS, countByStage, defaultStep, durationChips, isReelId, keepReelLinks, reachable, starters, stepFrom, stepState } from "@/components/reels/reel";
import { chipMessage, starterProduct } from "@/components/reels/labels";
import { reelOptionsUrl, reelUrl, reelsUrl } from "@/components/reels/api";

afterEach(() => vi.useRealTimers());

const MIN = 60_000;

const plan = { title: "T", presenter: "none", template: "spotlight", voice: "coral", scenes: [{ photoKey: "p1", shot: "s", direction: "d", onScreenText: "", voiceText: "v" }], caption: "c", hashtags: [] };
const detail = (over: Partial<ReelDetail> = {}): ReelDetail => ({
  item: { id: "r1", title: "T", status: "DRAFT_REVIEW", postUrl: null, scheduledFor: null },
  version: 1, plan, price: 10, seconds: 20, sceneSeconds: [10], aiDisclosure: null, caption: null,
  videoUrl: null, videoKey: null, checks: null, renders: [], chat: [], credits: 0, photoUrls: {}, ...over,
});
const render = (step: "VOICE" | "CLIPS" | "JOIN" | "DONE" | "FAILED") => ({ id: "x", versionId: "v", attempt: 1, step, failure: null, softened: [], videoKey: null, credits: null, createdAt: "" });
const summary = (over: Partial<ReelSummary> = {}): ReelSummary => ({
  id: "r1", title: "T", status: "DRAFT_REVIEW", version: 1, postUrl: null, createdAt: "", render: null, seconds: 20, price: 10, thumbUrl: null, videoUrl: null, ...over,
});

describe("defaultStep", () => {
  it("starts at the plan with no reel read yet or no plan", () => {
    expect(defaultStep(null)).toBe("plan");
    expect(defaultStep(detail({ plan: null }))).toBe("plan");
  });
  it("goes to photos for a stand-in scene", () => {
    expect(defaultStep(detail({ plan: { ...plan, scenes: [{ ...plan.scenes[0], standIn: true }] } }))).toBe("photos");
  });
  it("goes to video for a running or failed first render, review for a video, else storyboard", () => {
    expect(defaultStep(detail({ renders: [render("CLIPS")] }))).toBe("video");
    expect(defaultStep(detail({ renders: [render("FAILED")] }))).toBe("video");
    expect(defaultStep(detail({ videoUrl: "u", renders: [render("DONE")] }))).toBe("review");
    expect(defaultStep(detail())).toBe("storyboard");
  });
});

describe("reachable and stepFrom", () => {
  it("keeps a built step, else storyboard with a plan, else plan", () => {
    expect(BUILT_STEPS).toEqual(["plan", "storyboard"]);
    expect(reachable("plan", detail())).toBe("plan");
    expect(reachable("storyboard", detail())).toBe("storyboard");
    expect(reachable("video", detail())).toBe("storyboard");
    expect(reachable("video", detail({ plan: null }))).toBe("plan");
    expect(reachable("video", null)).toBe("plan");
  });
  it("reads a URL param, falling back to the default step", () => {
    expect(stepFrom("plan", detail())).toBe("plan");
    expect(stepFrom("photos", detail())).toBe("storyboard");
    expect(stepFrom(undefined, detail())).toBe("storyboard");
    expect(stepFrom("nonsense", null)).toBe("plan");
  });
});

describe("stepState", () => {
  it("words the plan step", () => {
    expect(stepState("plan", detail())).toBe("Done");
    expect(stepState("plan", detail({ plan: null }))).toBe("None");
  });
  it("words the storyboard step", () => {
    expect(stepState("storyboard", detail({ plan: null }))).toBe("None");
    expect(stepState("storyboard", detail({ plan: { ...plan, scenes: [{ ...plan.scenes[0], standIn: true }] } }))).toBe("Needs a photo");
    expect(stepState("storyboard", detail({ renders: [render("VOICE")] }))).toBe("Making…");
    expect(stepState("storyboard", detail({ videoUrl: "u" }))).toBe("Done");
    expect(stepState("storyboard", detail())).toBe("Ready");
  });
});

describe("durationChips", () => {
  it("drops the chips within 5 seconds of the current length", () => {
    expect(durationChips(22)).toEqual([30]);
    expect(durationChips(null)).toEqual([20, 30]);
    expect(durationChips(30)).toEqual([20]);
  });
});

describe("press helpers", () => {
  it("have one definition, which the photoshoot re-exports", () => {
    expect(photoshootPress.isRepeatClick).toBe(isRepeatClick);
    expect(photoshootPress.pressErrorText).toBe(pressErrorText);
  });
  it("refused: a 4xx refusal charged nothing; no answer or a 5xx may have", () => {
    expect(refused(new ApiError(400, "no"))).toBe(true);
    expect(refused(new ApiError(0, "offline"))).toBe(false);
    expect(refused(new ApiError(502, "gateway"))).toBe(false);
    expect(refused(new Error("x"))).toBe(false);
  });
});

describe("starters", () => {
  const ideas = [1, 2, 3, 4].map((n) => ({ id: `o${n}`, title: `Idea ${n}` }));
  it("takes at most three, ideas first", () => {
    const s = starters(ideas, ["Lamp"]);
    expect(s).toHaveLength(3);
    expect(s.map((x) => x.opportunityId)).toEqual(["o1", "o2", "o3"]);
  });
  it("fills the rest with products", () => {
    const s = starters(ideas.slice(0, 1), ["Lamp", "Chair", "Desk"]);
    expect(s.map((x) => x.label)).toEqual(["Idea 1", "Lamp", "Chair"]);
    expect(s[1]).toEqual({ label: "Lamp", message: starterProduct("Lamp") });
    expect(starterProduct("Lamp")).toBe("A reel about Lamp");
  });
});

describe("countByStage and chipMessage", () => {
  it("counts all, ready and processing", () => {
    const reels = [summary(), summary({ videoUrl: "u" }), summary({ render: { step: "CLIPS", attempt: 1, failure: null } })];
    expect(countByStage(reels)).toEqual({ all: 3, ready: 1, processing: 1 });
    expect(chipMessage(30)).toBe("Make it about 30 seconds.");
  });
});

describe("isReelId", () => {
  it("accepts a cuid and a UUID, refuses path-ish input", () => {
    expect(isReelId("cm1abcdefghijklmnopqrstuv")).toBe(true);
    expect(isReelId("0b6c1f0e-5d44-4b0e-9d0a-2f6a3c0f9e11")).toBe(true);
    for (const bad of ["", "../admin", "a/b", undefined, ["x"]]) expect(isReelId(bad)).toBe(false);
  });
});

describe("urls", () => {
  it("encodes the ids", () => {
    expect(reelsUrl("w", "b")).toBe("/api/v1/workspaces/w/brands/b/reels");
    expect(reelUrl("w", "b", "a/b")).toBe("/api/v1/workspaces/w/brands/b/reels/a%2Fb");
    expect(reelOptionsUrl("w", "b")).toBe("/api/v1/workspaces/w/brands/b/reels/options");
  });
});

describe("keepReelLinks", () => {
  it("keeps a fresh summary's links for the same id and version", () => {
    const prev = summary({ thumbUrl: "old-t", videoUrl: "old-v" });
    const next = summary({ thumbUrl: "new-t", videoUrl: "new-v" });
    expect(keepReelLinks(prev, next, 0, 10 * MIN)).toMatchObject({ thumbUrl: "old-t", videoUrl: "old-v" });
  });
  it("takes the new links when stale, or the version changed", () => {
    const prev = summary({ thumbUrl: "old-t", videoUrl: "old-v" });
    const next = summary({ thumbUrl: "new-t", videoUrl: "new-v" });
    expect(keepReelLinks(prev, next, 0, SIGNED_LINK_STALE_MS)).toBe(next);
    expect(keepReelLinks(prev, { ...next, version: 2 }, 0, MIN)).toMatchObject({ thumbUrl: "new-t", videoUrl: "new-v" });
  });
  it("keeps a detail's photo and video links by key, replaces a new key or video", () => {
    const prev = detail({ videoUrl: "old-v", videoKey: "k1", photoUrls: { a: "old-a", b: "old-b" } });
    const next = detail({ videoUrl: "new-v", videoKey: "k1", photoUrls: { a: "new-a", c: "new-c" } });
    expect(keepReelLinks(prev, next, 0, MIN)).toMatchObject({ videoUrl: "old-v", photoUrls: { a: "old-a", c: "new-c" } });
    expect(keepReelLinks(prev, { ...next, videoKey: "k2" }, 0, MIN).videoUrl).toBe("new-v");
    expect(keepReelLinks(prev, { ...next, version: 2 }, 0, MIN)).toMatchObject({ videoUrl: "new-v", photoUrls: { a: "new-a" } });
  });
});

describe("the link cache", () => {
  it("keeps a link through a re-read 40 minutes on, dated from the first read, and reports it stale at 50", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const c = createLinkCache<ReelSummary>((r) => r.id, keepReelLinks);
    expect(c.steady(summary({ thumbUrl: "t0" }), 0).thumbUrl).toBe("t0");
    vi.setSystemTime(40 * MIN);
    expect(c.steady(summary({ thumbUrl: "t40" }), 40 * MIN).thumbUrl).toBe("t0");
    expect(c.linksAt([summary()])).toBe(0);
    vi.setSystemTime(49 * MIN);
    expect(stale(c.linksAt([summary()]))).toBe(false);
    vi.setSystemTime(50 * MIN);
    expect(stale(c.linksAt([summary()]))).toBe(true);
  });
});

describe("the generic presser with a text key", () => {
  const make = (send: (r: string, id: string) => Promise<string>) => {
    let n = 0;
    return makePresser(send, (r) => r, () => `id-${++n}`);
  };
  it("reuses the id after no answer, then uses a new one after success", async () => {
    const ids: string[] = [];
    let fail = true;
    const press = make(async (_r, id) => {
      ids.push(id);
      if (fail) throw new ApiError(0, "offline");
      return "ok";
    });
    await expect(press("a")).rejects.toBeInstanceOf(ApiError);
    fail = false;
    await press("a");
    await press("a");
    expect(ids).toEqual(["id-1", "id-1", "id-2"]);
  });
  it("uses a new id after a 400", async () => {
    const ids: string[] = [];
    let fail = true;
    const press = make(async (_r, id) => {
      ids.push(id);
      if (fail) throw new ApiError(400, "no");
      return "ok";
    });
    await expect(press("a")).rejects.toBeInstanceOf(ApiError);
    fail = false;
    await press("a");
    expect(ids).toEqual(["id-1", "id-2"]);
  });
});
