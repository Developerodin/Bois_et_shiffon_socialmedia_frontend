import { afterEach, describe, expect, it, vi } from "vitest";
import type { Presenter, ReelDetail, ReelOptions, ReelSummary } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { SIGNED_LINK_STALE_MS, stale } from "@/lib/signed-links";
import { isRepeatClick, makePresser, pressErrorText, refused } from "@/lib/presser";
import * as photoshootPress from "@/components/photoshoot/press";
import { createLinkCache } from "@/components/workspace/use-steady-links";
import { BUILT_STEPS, adoptRefusedVersion, countByStage, droppedRecordings, playableSample, recordedScenes, sampleAction, slotStandIns, takeLanded, editLock, optionBusy, optionsMaking, presenterChoice, presenterName, sceneCount, sceneProblems, swapScenes, defaultStep, durationChips, isReelId, keepReelLinks, reachable, starters, stepFrom, stepState } from "@/components/reels/reel";
import { chipMessage, presenterState, starterProduct } from "@/components/reels/labels";
import { CHANGED_ELSEWHERE } from "@/components/reels/plan-stream";
import { saveErrorText } from "@/components/reels/use-reel-save";
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
    expect(BUILT_STEPS).toEqual(["plan", "presenter", "photos", "script", "storyboard"]);
    expect(reachable("presenter", detail())).toBe("presenter");
    expect(reachable("photos", detail())).toBe("photos");
    expect(reachable("plan", detail())).toBe("plan");
    expect(reachable("storyboard", detail())).toBe("storyboard");
    expect(reachable("video", detail())).toBe("storyboard");
    expect(reachable("video", detail({ plan: null }))).toBe("plan");
    expect(reachable("video", null)).toBe("plan");
  });
  it("reads a URL param, falling back to the default step", () => {
    expect(stepFrom("plan", detail())).toBe("plan");
    expect(stepFrom("photos", detail())).toBe("photos");
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

describe("stepState photos", () => {
  it("words the photos step", () => {
    expect(stepState("photos", detail({ plan: null }))).toBe("None");
    expect(stepState("photos", detail())).toBe("Done");
    expect(stepState("photos", detail({ plan: { ...plan, scenes: [{ ...plan.scenes[0], standIn: true }] } }))).toBe("Needs a photo");
  });
});

describe("stepState script", () => {
  it("is None without a plan, else Done", () => {
    expect(stepState("script", detail({ plan: null }))).toBe("None");
    expect(stepState("script", detail())).toBe("Done");
  });
});

describe("script helpers", () => {
  const scenes = [{ ...plan.scenes[0], voiceText: "Hello", recordingId: "t1" }, { ...plan.scenes[0], voiceText: "Bye" }];
  it("recordedScenes keeps a take only while the trimmed text matches", () => {
    expect(recordedScenes(scenes, [" Hello ", "Bye"])).toEqual([true, false]);
    expect(recordedScenes(scenes, ["Hello!", "Bye"])).toEqual([false, false]);
  });
  it("droppedRecordings gives one line per scene", () => {
    expect(droppedRecordings(undefined)).toEqual([]);
    expect(droppedRecordings([2, 3])).toEqual([
      "Scene 2's recording was removed: its text changed. Record it again if you want.",
      "Scene 3's recording was removed: its text changed. Record it again if you want.",
    ]);
  });
  it("samples play only from https: or blob: links; the playing one stops", () => {
    expect(playableSample("https://x/a.mp3")).toBe(true);
    expect(playableSample("blob:https://x/1")).toBe(true);
    expect(playableSample("http://x/a.mp3")).toBe(false);
    expect(playableSample("javascript:alert(1)")).toBe(false);
    expect(sampleAction("a", "a", "http://x")).toBe("stop");
    expect(sampleAction("a", "b", "https://x")).toBe("play");
    expect(sampleAction(null, "b", "data:audio/mp3;base64,AA")).toBe("refuse");
  });
  it("takeLanded: the saved plan still has this take on the scene, and the scene wasn't dropped", () => {
    const out = (recordingId: string | undefined, droppedRecordings?: number[]) => ({ plan: { ...plan, scenes: [{ ...plan.scenes[0], recordingId }] }, droppedRecordings });
    expect(takeLanded(out("t1"), 0, "t1")).toBe(true);
    expect(takeLanded(out("t1", [1]), 0, "t1")).toBe(false);
    expect(takeLanded(out(undefined), 0, "t1")).toBe(false);
    expect(takeLanded(out("t0"), 0, "t1")).toBe(false);
    expect(takeLanded(out("t1"), 3, "t1")).toBe(false);
  });
});

describe("adoptRefusedVersion", () => {
  const edit = { version: 3, items: ["a", "b"] };
  it("takes the re-read version only after a refusal with the same scene count", () => {
    expect(adoptRefusedVersion(edit, true, 5, 2)).toEqual({ version: 5, items: ["a", "b"] });
    expect(adoptRefusedVersion(edit, false, 5, 2)).toBe(edit);
    expect(adoptRefusedVersion(edit, true, 5, 3)).toBe(edit);
    expect(adoptRefusedVersion(edit, true, 3, 2)).toBe(edit);
  });
});

describe("slotStandIns", () => {
  const two = { ...plan, scenes: [{ ...plan.scenes[0], photoKey: "a", standIn: true }, { ...plan.scenes[0], photoKey: "b", standIn: false }] };
  it("follows the photo: moving a stand-in photo moves the flag, a different photo clears it", () => {
    expect(slotStandIns(["a", "b"], two)).toEqual([true, false]);
    expect(slotStandIns(["b", "a"], two)).toEqual([false, true]);
    expect(slotStandIns(["c", "b"], two)).toEqual([false, false]);
  });
});

describe("stepState presenter", () => {
  it("words the presenter step", () => {
    expect(stepState("presenter", detail({ plan: null }))).toBe("None");
    expect(stepState("presenter", detail())).toBe("No presenter");
    expect(stepState("presenter", detail({ plan: { ...plan, presenter: "pr1" } }))).toBe("Done");
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

const pres = (id: string, status: Presenter["status"]): Presenter => ({ id, name: `N-${id}`, status, sheet: null });
const opts = (presenters: Presenter[] = [], templates: ReelOptions["templates"] = []): ReelOptions => ({ templates, previewCredits: 1, canPreview: true, presenters, traits: [], presenterCredits: 5 });
const tpl = (id: string, making = false) => ({ id, seconds: 10, preview: null, own: false, making, failed: false });
const withPresenter = (presenter: string) => ({ ...plan, presenter });

describe("editLock", () => {
  it("locks a scheduled reel and lets a draft through", () => {
    expect(editLock(detail({ item: { id: "r1", title: "T", status: "SCHEDULED", postUrl: null, scheduledFor: null } }))).toBe("This reel is already scheduled or posted.");
    expect(editLock(detail())).toBeNull();
  });
});
describe("options helpers", () => {
  it("optionsMaking", () => {
    expect(optionsMaking(opts())).toBe(false);
    expect(optionsMaking(opts([pres("a", "RUNNING")]))).toBe(true);
    expect(optionsMaking(opts([], [tpl("t", true)]))).toBe(true);
  });
  it("presenterChoice", () => {
    expect(presenterChoice(withPresenter("a"), opts([pres("a", "DONE")]))).toBe("a");
    expect(presenterChoice(withPresenter("a"), opts([pres("a", "FAILED")]))).toBe("none");
    expect(presenterChoice(withPresenter("a"), opts())).toBe("none");
    expect(presenterChoice(withPresenter("a"), null)).toBe("a");
    expect(presenterChoice(withPresenter("a"), undefined)).toBe("a");
  });
  it("presenterName", () => {
    expect(presenterName(withPresenter("none"), opts())).toBe("No presenter");
    expect(presenterName(withPresenter("a"), opts([pres("a", "DONE")]))).toBe("N-a");
    expect(presenterName(withPresenter("a"), null)).toBe("…");
    expect(presenterName(withPresenter("a"), opts())).toBe("No presenter");
  });
  it("optionBusy", () => {
    expect(optionBusy(null, "presenter")).toBe(true);
    expect(optionBusy(undefined, { templateId: "t" })).toBe(true);
    const o = opts([pres("a", "RUNNING")], [tpl("t", true), tpl("u")]);
    expect(optionBusy(o, "presenter")).toBe(true);
    expect(optionBusy(o, { templateId: "u" })).toBe(false);
    expect(optionBusy(o, { templateId: "t" })).toBe(true);
    expect(optionBusy(opts([], [tpl("t", true)]), "presenter")).toBe(false);
  });
});
describe("presenterState", () => {
  it("words each status", () => {
    expect(presenterState(pres("a", "RUNNING"), 5)).toBe("Being made, about a minute");
    expect(presenterState(pres("a", "DONE"), 5)).toBe("Ready");
    expect(presenterState(pres("a", "FAILED"), 5)).toBe("Didn't work · 5 credits back");
  });
});
describe("scene editing helpers", () => {
  it("swapScenes", () => {
    expect(swapScenes(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(swapScenes(["a"], 0, 1)).toEqual(["a"]);
  });
  it("sceneProblems", () => {
    const long = Array.from({ length: 31 }, () => "w").join(" ");
    expect(sceneProblems(["", "x".repeat(401), long, long], [false, false, false, true])).toEqual([
      "Scene 1 needs text.", "Scene 2 is over 400 characters.", "Scene 3 is over 30 words (15 s). Shorten it.", null,
    ]);
  });
  it("sceneCount", () => {
    expect(sceneCount("one two three")).toBe("3 words · ~2 s");
    expect(sceneCount("one")).toBe("1 word · ~1 s");
  });
});

describe("saveErrorText", () => {
  it("only reel.changed gets the keep-your-text sentence", () => {
    expect(saveErrorText(new ApiError(409, "This plan changed in the meantime. Reload and try again.", "reel.changed"))).toBe(CHANGED_ELSEWHERE);
    expect(saveErrorText(new ApiError(409, "A newer version exists. Review it first."))).toBe("A newer version exists. Review it first.");
    expect(saveErrorText(new ApiError(400, "Scene 2 is too long."))).toBe("Scene 2 is too long.");
  });
});
