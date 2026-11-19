import { afterEach, describe, expect, it, vi } from "vitest";
import type { Presenter, ReelDetail, ReelOptions, ReelSummary } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { SIGNED_LINK_STALE_MS, stale } from "@/lib/signed-links";
import { isRepeatClick, makePresser, pressErrorText, refused } from "@/lib/presser";
import * as photoshootPress from "@/components/photoshoot/press";
import { createLinkCache } from "@/components/workspace/use-steady-links";
import { BUILT_STEPS, CHECK_AUTO_MS, CHECK_SLOW_MS, CHECK_WAIT_MS, checksPollDelay, pollChecks, RENDER_SLOW_MS, makeVideoBlock, renderLong, adoptRefusedVersion, awaitingChecks, instagramState, parseHashtags, postLinkWanted, postTextLength, reelHref, renderNews, renderRefusal, renderSteps, retryPriceNote, reviewChecks, sendBlock, toWebVtt, countByStage, droppedRecordings, playableSample, recordedScenes, sampleAction, slotStandIns, takeLanded, editLock, optionBusy, optionsMaking, presenterChoice, presenterName, sceneCount, sceneProblems, swapScenes, defaultStep, durationChips, isReelId, keepReelLinks, reachable, starters, stepFrom, stepState } from "@/components/reels/reel";
import { chipMessage, failureText, presenterState, starterProduct } from "@/components/reels/labels";
import { CHANGED_ELSEWHERE } from "@/components/reels/plan-stream";
import { saveErrorText } from "@/components/reels/use-reel-save";
import { reelOptionsUrl, reelUrl, reelsUrl } from "@/components/reels/api";

afterEach(() => vi.useRealTimers());

const MIN = 60_000;

const plan = { title: "T", presenter: "none", template: "spotlight", voice: "coral", scenes: [{ photoKey: "p1", shot: "s", direction: "d", onScreenText: "", voiceText: "v" }], caption: "c", hashtags: [] };
const detail = (over: Partial<ReelDetail> = {}): ReelDetail => ({
  item: { id: "r1", title: "T", status: "DRAFT_REVIEW", postUrl: null, scheduledFor: null },
  version: 1, plan, price: 10, seconds: 20, sceneSeconds: [10], aiDisclosure: null, caption: null, captions: null,
  videoUrl: null, videoKey: null, checks: null, renders: [], chat: [], credits: 0, photoUrls: {}, ...over,
});
const render = (step: "VOICE" | "CLIPS" | "JOIN" | "DONE" | "FAILED") => ({ id: "x", versionId: "v", attempt: 1, step, failure: null, softened: [], videoKey: null, credits: null, createdAt: "" });
const summary = (over: Partial<ReelSummary> = {}): ReelSummary => ({
  id: "r1", title: "T", status: "DRAFT_REVIEW", version: 1, postUrl: null, createdAt: "", render: null, seconds: 20, price: 10, thumbUrl: null, videoUrl: null, ...over,
});

describe("checksPollDelay", () => {
  it("reads every 5 s for 2 minutes, then every 10 s, and stops at 10 minutes", () => {
    expect([CHECK_AUTO_MS, CHECK_SLOW_MS, CHECK_WAIT_MS]).toEqual([90_000, 150_000, 10 * MIN]);
    expect(checksPollDelay(0)).toBe(5_000);
    expect(checksPollDelay(2 * MIN - 1)).toBe(5_000);
    expect(checksPollDelay(2 * MIN)).toBe(10_000);
    expect(checksPollDelay(10 * MIN - 1)).toBe(10_000);
    expect(checksPollDelay(10 * MIN)).toBeNull();
  });
});

describe("pollChecks", () => {
  it("starts the next wait only once the read settles", async () => {
    vi.useFakeTimers();
    let settle: () => void = () => undefined;
    const read = vi.fn(() => new Promise<void>((r) => { settle = r; }));
    const stop = pollChecks(read, () => undefined);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); // the read is still out: no second one
    expect(read).toHaveBeenCalledTimes(1);
    settle();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    stop();
  });
  it("keeps going after a failed read, and skips a read when told to", async () => {
    vi.useFakeTimers();
    let hidden = false;
    const read = vi.fn(() => Promise.reject(new Error("x")));
    const stop = pollChecks(read, () => undefined, () => hidden);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(2);
    hidden = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(2);
    stop();
  });
  it("counts its 10 minutes from the start, not stretched by slow reads, and ends when the read out then settles", async () => {
    vi.useFakeTimers();
    const onEnd = vi.fn();
    // 3-minute reads: out at 0:05, 3:15, 6:25 and 9:35 (5 s, then 10 s, after each settles); the last settles at 12:35.
    const read = vi.fn(() => new Promise<void>((r) => setTimeout(r, 3 * MIN)));
    pollChecks(read, onEnd);
    await vi.advanceTimersByTimeAsync(12 * MIN + 34_999);
    expect(read).toHaveBeenCalledTimes(4);
    expect(onEnd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(read).toHaveBeenCalledTimes(4);
  });
  it("does nothing after stop, even when a read settles later", async () => {
    vi.useFakeTimers();
    let settle: () => void = () => undefined;
    const onEnd = vi.fn();
    const read = vi.fn(() => new Promise<void>((r) => { settle = r; }));
    const stop = pollChecks(read, onEnd);
    await vi.advanceTimersByTimeAsync(5_000);
    stop();
    settle();
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });
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
  it("keeps every step now that all are built", () => {
    expect(BUILT_STEPS).toEqual(["plan", "presenter", "photos", "script", "storyboard", "video", "review", "publish"]);
    expect(reachable("presenter", detail())).toBe("presenter");
    expect(reachable("photos", detail())).toBe("photos");
    expect(reachable("plan", detail())).toBe("plan");
    expect(reachable("storyboard", detail())).toBe("storyboard");
    expect(reachable("video", detail())).toBe("video");
    expect(reachable("review", detail())).toBe("review");
    expect(reachable("publish", detail())).toBe("publish");
    expect(reachable("publish", detail({ plan: null }))).toBe("publish");
    expect(reachable("publish", null)).toBe("publish");
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
  const edit = { version: 3, caption: "x" };
  it("takes the re-read version only after a refusal that moved it", () => {
    expect(adoptRefusedVersion(edit, true, 5)).toEqual({ version: 5, caption: "x" });
    expect(adoptRefusedVersion(edit, false, 5)).toBe(edit);
    expect(adoptRefusedVersion(edit, true, 3)).toBe(edit);
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
    // A caption save moves the version, not the file: the video link stays, the photos are re-read.
    expect(keepReelLinks(prev, { ...next, version: 2 }, 0, MIN)).toMatchObject({ videoUrl: "old-v", photoUrls: { a: "new-a" } });
    expect(keepReelLinks(prev, { ...next, version: 2, videoKey: "k2" }, 0, MIN).videoUrl).toBe("new-v");
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
describe("renderLong", () => {
  const started = Date.parse("2026-11-19T10:00:00Z");
  const running = (step: "CLIPS" | "DONE" | "FAILED") => detail({ renders: [{ ...render(step), createdAt: new Date(started).toISOString() }] });
  it("counts from the render's start, so a reload late into a render says so at once", () => {
    expect(RENDER_SLOW_MS).toBe(15 * MIN);
    expect(renderLong(running("CLIPS"), started + 20 * MIN)).toBe(true);
    expect(renderLong(running("CLIPS"), started + 15 * MIN)).toBe(false);
    expect(renderLong(running("CLIPS"), started + MIN)).toBe(false);
  });
  it("is false with no running render or an unreadable start", () => {
    expect(renderLong(running("DONE"), started + 20 * MIN)).toBe(false);
    expect(renderLong(running("FAILED"), started + 20 * MIN)).toBe(false);
    expect(renderLong(detail(), started + 20 * MIN)).toBe(false);
    expect(renderLong(detail({ renders: [render("CLIPS")] }), started + 20 * MIN)).toBe(false);
  });
});

describe("makeVideoBlock", () => {
  const standIn = detail({ plan: { ...plan, scenes: [{ ...plan.scenes[0], standIn: true }] } });
  it("says why Make video is off: stand-ins, a lock, then a chat or save in flight", () => {
    expect(makeVideoBlock(standIn, false, false)).toBe("A scene's photo shows something else. Pick the right one before making the video.");
    expect(makeVideoBlock(detail({ item: { id: "r1", title: "T", status: "SCHEDULED", postUrl: null, scheduledFor: null } }), false, false)).toBe("This reel is already scheduled or posted.");
    expect(makeVideoBlock(detail(), true, false)).toBe("Wait for the plan to finish saving.");
    expect(makeVideoBlock(detail(), false, true)).toBe("Wait for the plan to finish saving.");
    expect(makeVideoBlock(detail(), false, false)).toBeNull();
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
    expect(saveErrorText(new ApiError(409, "Someone changed this.", "draft.changed"))).toBe(CHANGED_ELSEWHERE);
    expect(saveErrorText(new ApiError(409, "A newer version exists. Review it first."))).toBe("A newer version exists. Review it first.");
    expect(saveErrorText(new ApiError(400, "Scene 2 is too long."))).toBe("Scene 2 is too long.");
  });
});

describe("reelHref", () => {
  it("opens a reel, on a step when given", () => {
    expect(reelHref("r1", "b1")).toBe("/reels/r1?b=b1");
    expect(reelHref("r1", "b1", "review")).toBe("/reels/r1?b=b1&step=review");
  });
});

describe("stepState video, review, publish", () => {
  const withStatus = (status: ReelDetail["item"]["status"], over: Partial<ReelDetail> = {}) => detail({ item: { ...detail().item, status }, ...over });
  it("words the video step, the video first", () => {
    expect(stepState("video", detail({ renders: [render("CLIPS")] }))).toBe("Making…");
    expect(stepState("video", detail({ videoUrl: "u", renders: [render("DONE")] }))).toBe("Done");
    expect(stepState("video", detail({ renders: [render("FAILED")] }))).toBe("Didn't work");
    expect(stepState("video", detail({ videoUrl: "u", renders: [render("FAILED")] }))).toBe("Done");
    expect(stepState("video", detail())).toBe("None");
  });
  it("words the review step", () => {
    expect(stepState("review", detail())).toBe("None");
    for (const status of ["APPROVED", "SCHEDULED", "PUBLISHED"] as const) {
      expect(stepState("review", withStatus(status, { videoUrl: "u" }))).toBe("Done");
    }
    expect(stepState("review", detail({ videoUrl: "u" }))).toBe("Ready");
  });
  it("words the publish step", () => {
    expect(stepState("publish", withStatus("PUBLISHED", { videoUrl: "u" }))).toBe("Posted");
    expect(stepState("publish", withStatus("SCHEDULED", { videoUrl: "u" }))).toBe("Scheduled");
    expect(stepState("publish", detail({ videoUrl: "u" }))).toBe("Ready");
    expect(stepState("publish", detail())).toBe("None");
  });
});

describe("awaitingChecks", () => {
  const checks = { overall: "PASS" as const, results: [] };
  it("is a video in review with no checks yet", () => {
    expect(awaitingChecks(detail({ videoUrl: "u" }))).toBe(true);
    expect(awaitingChecks(detail({ videoUrl: "u", checks }))).toBe(false);
    expect(awaitingChecks(detail({ videoUrl: "u", item: { ...detail().item, status: "AWAITING_APPROVAL" } }))).toBe(false);
    expect(awaitingChecks(detail())).toBe(false);
  });
});

describe("renderSteps", () => {
  it("marks the running stage", () => {
    expect(renderSteps(detail({ renders: [render("CLIPS")] }))).toEqual([
      { label: "Preparing 1 scene", state: "done" },
      { label: "Rendering video frames", state: "active" },
      { label: "Adding audio", state: "waiting" },
    ]);
    expect(renderSteps(detail({ renders: [render("VOICE")] })).map((s) => s.state)).toEqual(["active", "waiting", "waiting"]);
    expect(renderSteps(detail({ renders: [render("JOIN")] })).map((s) => s.state)).toEqual(["done", "done", "active"]);
  });
  it("says scenes for other counts", () => {
    const two = { ...plan, scenes: [plan.scenes[0]!, plan.scenes[0]!] };
    expect(renderSteps(detail({ plan: two, renders: [render("VOICE")] }))[0]!.label).toBe("Preparing 2 scenes");
  });
});

describe("renderRefusal", () => {
  it("sends a finished version to review, re-reads any other 409", () => {
    expect(renderRefusal(new ApiError(409, "x", "render.alreadyDone"))).toEqual({ reread: true, review: true });
    expect(renderRefusal(new ApiError(409, "x"))).toEqual({ reread: true, review: false });
    for (const e of [new ApiError(400, "x"), new ApiError(0, "x"), new Error("x"), null]) {
      expect(renderRefusal(e)).toEqual({ reread: false, review: false });
    }
  });
});

describe("renderNews", () => {
  it("speaks only when a running render ends", () => {
    expect(renderNews(detail({ renders: [render("CLIPS")] }), detail({ renders: [render("DONE")] }))).toBe("Your reel is ready.");
    expect(renderNews(detail({ renders: [render("JOIN")] }), detail({ renders: [render("FAILED")] }))).toBe("The video couldn't be made. Your credits are back.");
    expect(renderNews(detail({ renders: [render("DONE")] }), detail({ renders: [render("DONE")] }))).toBeNull();
    expect(renderNews(null, detail({ renders: [render("DONE")] }))).toBeNull();
  });
});

describe("retryPriceNote", () => {
  const failed = (credits: number | null) => detail({ price: 24, renders: [{ ...render("FAILED"), credits }] });
  it("notes a changed price only", () => {
    expect(retryPriceNote(failed(20), false)).toBe("Making it again costs 24 credits now; the last try cost 20 credits.");
    expect(retryPriceNote(failed(24), false)).toBeNull();
    expect(retryPriceNote(failed(null), false)).toBeNull();
    expect(retryPriceNote(failed(20), true)).toBeNull();
    expect(retryPriceNote(detail({ price: null, renders: [{ ...render("FAILED"), credits: 20 }] }), false)).toBeNull();
  });
});

describe("sendBlock", () => {
  const checking = "Checking the reel… Download and Publish open when the checks are done.";
  const withStatus = (status: string, over: Partial<ReelDetail> = {}) => detail({ videoUrl: "u", item: { ...detail().item, status: status as ReelDetail["item"]["status"] }, ...over });
  const pass = { overall: "PASS" as const, results: [] };
  it("names why Download and Publish are off", () => {
    expect(sendBlock(withStatus("AWAITING_APPROVAL", { checks: { overall: "BLOCKER", results: [] } }))).toBe("A check found a problem (see Checks). Fix it in the caption, or ask for changes.");
    expect(sendBlock(withStatus("DRAFT_REVIEW"))).toBe(checking);
    expect(sendBlock(withStatus("DRAFT_REVIEW", { checks: pass }))).toBe("Changes were asked for (see the history under Publish). Change the caption or the plan and it's checked again.");
    expect(sendBlock(withStatus("REJECTED", { checks: pass }))).toBe("This reel was rejected. Change the caption or the plan to send it through review again.");
    expect(sendBlock(withStatus("AWAITING_APPROVAL", { checks: pass }))).toBeNull();
    expect(sendBlock(withStatus("APPROVED", { checks: pass }))).toBeNull();
  });
  it("never says checking when no check can be running", () => {
    expect(sendBlock(detail())).toBe("Make the video first. Download and Publish open once it's made.");
    expect(sendBlock(withStatus("BLOCKED", { checks: pass }))).toBe("A check found a problem (see Checks). Fix it in the caption, or ask for changes.");
    for (const status of ["CANCELLED", "REVIEWED", "PLANNED", "BRIEF_READY"]) {
      expect(sendBlock(withStatus(status, { checks: pass }))).toBe("This reel can't be sent in its current state.");
    }
  });
});

describe("reviewChecks", () => {
  const checks = { overall: "WARN" as const, results: [{ check: "Caption", status: "pass" as const, note: "ok" }] };
  it("adds a warning per softened join of the video's own render", () => {
    const own = { ...render("DONE"), videoKey: "k1", softened: [2] };
    const rows = reviewChecks(detail({ checks, videoKey: "k1", renders: [own] }));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ check: "Scene 2 → 3", status: "warn", note: "The two shots didn't quite match, so they blend with a dissolve" });
  });
  it("ignores another video's render", () => {
    const other = { ...render("DONE"), videoKey: "k0", softened: [2] };
    expect(reviewChecks(detail({ checks, videoKey: "k1", renders: [other] }))).toHaveLength(1);
  });
  it("is empty without checks", () => {
    expect(reviewChecks(detail())).toEqual([]);
  });
});

describe("parseHashtags and postTextLength", () => {
  it("splits, strips, dedupes and prefixes", () => {
    expect(parseHashtags("#oak, wood  #oak ##table")).toEqual(["#oak", "#wood", "#table"]);
    expect(parseHashtags("")).toEqual([]);
    expect(parseHashtags("a b c d e f")).toHaveLength(6);
  });
  it("measures the post as the server joins it", () => {
    expect(postTextLength("Hi", "Made with AI.", ["#a", "#b"])).toBe(24);
    expect(postTextLength("Hi", null, [])).toBe(2);
    expect(postTextLength("  Hi  ", null, [])).toBe(2);
  });
});

describe("toWebVtt", () => {
  it("writes escaped cues with timestamps", () => {
    expect(toWebVtt([{ start: 0, end: 4, text: "Hi & <b>\nthere" }, { start: 61.5, end: 3725, text: "x" }]))
      .toBe("WEBVTT\n\n1\n00:00:00.000 --> 00:00:04.000\nHi &amp; &lt;b&gt; there\n\n2\n00:01:01.500 --> 01:02:05.000\nx\n\n");
  });
  it("can't be made to forge a timing line", () => {
    const out = toWebVtt([{ start: 0, end: 1, text: "a --> 00:00:00.000 --> 99:00:00.000" }]);
    expect(out.match(/-->/g)).toHaveLength(1);
  });
});

describe("postLinkWanted", () => {
  it("wants a link for an approved reel with none", () => {
    expect(postLinkWanted(summary({ status: "APPROVED" }))).toBe(true);
    expect(postLinkWanted(summary({ status: "APPROVED", postUrl: "https://x" }))).toBe(false);
    expect(postLinkWanted(summary({ status: "PUBLISHED" }))).toBe(false);
  });
});

describe("failureText", () => {
  it("words each failure kind, filling the scene", () => {
    expect(failureText({ kind: "scene", scene: 3, stoppedAt: "CLIPS" })).toBe("Scene 3 couldn't be animated. Your credits are back. Try again, or pick another photo for it.");
    expect(failureText({ kind: "slow", stoppedAt: "JOIN" })).toBe("The video took too long to make. Your credits are back. Try again.");
    expect(failureText({ kind: "unavailable", stoppedAt: "VOICE" })).toContain("unavailable");
    expect(failureText({ kind: "voiceDeleted", stoppedAt: "VOICE" })).toContain("voice");
    expect(failureText({ kind: "other", stoppedAt: "VOICE" })).toContain("Something went wrong");
  });
});

describe("instagramState", () => {
  it("finds the active Instagram account, else expired, else none", () => {
    expect(instagramState([{ provider: "INSTAGRAM", status: "ACTIVE", displayName: "Shop" }])).toEqual({ state: "active", name: "Shop" });
    expect(instagramState([{ provider: "INSTAGRAM", status: "ERROR", displayName: "Shop" }, { provider: "INSTAGRAM", status: "ACTIVE", displayName: "Two" }])).toEqual({ state: "active", name: "Two" });
    expect(instagramState([{ provider: "INSTAGRAM", status: "ERROR", displayName: "Shop" }])).toEqual({ state: "expired" });
    expect(instagramState([{ provider: "META", status: "ACTIVE", displayName: "FB" }])).toEqual({ state: "none" });
    expect(instagramState([])).toEqual({ state: "none" });
  });
});
