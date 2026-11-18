import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shoot, ShootRequest } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { NetworkError } from "@/lib/net";
import { stale } from "@/lib/signed-links";
import { photoshootApi, shootUrl, shootsUrl } from "@/components/photoshoot/api";
import { fetchShared } from "@/components/workspace/use-job";
import { loadPlanCredits } from "@/lib/plan-credits";
import { LABELS, refundLine, shootBadge, shootTitle, stagingSummary, waitLine } from "@/components/photoshoot/labels";
import { REREAD_AFTER_UNKNOWN_MS, isRepeatClick, makePresser, pressAndShow, pressErrorText } from "@/components/photoshoot/press";
import { LIST_RETRY_MS, readListAgain } from "@/components/photoshoot/use-shoots";
import {
  DEFAULT_FASHION,
  DEFAULT_PRODUCT,
  countByKind,
  downloadLink,
  generateBlocker,
  isShootId,
  keepLinks,
  linksFetchedAt,
  prependShoot,
  retryRequest,
  runningBesides,
  shootSteps,
  stepsDone,
  toRequest,
} from "@/components/photoshoot/shoot";

vi.mock("@/components/workspace/use-job", async (orig) => ({ ...(await orig<object>()), fetchShared: vi.fn(async () => undefined) }));
vi.mock("@/lib/plan-credits", async (orig) => ({ ...(await orig<object>()), loadPlanCredits: vi.fn(async () => undefined) }));

afterEach(() => {
  vi.useRealTimers();
});

const PRODUCT: ShootRequest = { kind: "product", tier: "base", sourceKey: "k1", ratio: "1:1", scene: "studio", brief: "" };
const FASHION: ShootRequest = { kind: "fashion", tier: "ultra", sourceKey: "g1", ratio: "4:5", pose: "threeQuarter", background: "urbanStreet" };

const shoot = (over: Partial<Shoot> = {}): Shoot => ({
  id: "ckshoot0000000000000000001",
  kind: "product",
  tier: "base",
  status: "RUNNING",
  input: PRODUCT,
  credits: 4,
  failed: false,
  createdAt: "2026-11-18T10:00:00.000Z",
  sourceUrl: "https://cdn/source?sig=1",
  shots: [],
  ...over,
});

/** A presser whose ids are id-1, id-2, ... and whose send is the given mock. */
function presser(send: ReturnType<typeof vi.fn>) {
  let n = 0;
  return makePresser(send as never, () => `id-${++n}`);
}
const idOf = (send: ReturnType<typeof vi.fn>, call: number) => send.mock.calls[call][1] as string;

describe("press reuses the id only after no answer", () => {
  it("reuses the id after a timeout (ApiError status 0, what request() throws)", async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError(0, "timeout")).mockResolvedValueOnce(shoot());
    const press = presser(send);
    await expect(press(PRODUCT)).rejects.toBeInstanceOf(ApiError);
    await press(PRODUCT);
    expect(idOf(send, 1)).toBe(idOf(send, 0));
  });

  it("reuses the id after a raw NetworkError", async () => {
    const send = vi.fn().mockRejectedValueOnce(new NetworkError("timeout")).mockResolvedValueOnce(shoot());
    const press = presser(send);
    await expect(press(PRODUCT)).rejects.toBeInstanceOf(NetworkError);
    await press(PRODUCT);
    expect(idOf(send, 1)).toBe(idOf(send, 0));
  });

  it("takes a new id after a success", async () => {
    const send = vi.fn().mockResolvedValue(shoot());
    const press = presser(send);
    await press(PRODUCT);
    await press(PRODUCT);
    expect(idOf(send, 1)).not.toBe(idOf(send, 0));
  });

  it.each([500, 502, 503])("reuses the id after a server error %i (the shoot may have been charged)", async (status) => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError(status, "failed")).mockResolvedValueOnce(shoot());
    const press = presser(send);
    await expect(press(PRODUCT)).rejects.toBeInstanceOf(ApiError);
    await press(PRODUCT);
    expect(idOf(send, 1)).toBe(idOf(send, 0));
  });

  it("reuses the id for the same request with its fields in another order (a shoot's stored input)", async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError(0, "timeout")).mockResolvedValueOnce(shoot());
    const press = presser(send);
    await expect(press(PRODUCT)).rejects.toBeInstanceOf(ApiError);
    await press(JSON.parse('{"brief":"","scene":"studio","ratio":"1:1","sourceKey":"k1","tier":"base","kind":"product"}'));
    expect(idOf(send, 1)).toBe(idOf(send, 0));
  });

  it.each([402, 409, 429])("takes a new id after the server answered %i", async (status) => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError(status, "no")).mockResolvedValueOnce(shoot());
    const press = presser(send);
    await expect(press(PRODUCT)).rejects.toBeInstanceOf(ApiError);
    await press(PRODUCT);
    expect(idOf(send, 1)).not.toBe(idOf(send, 0));
  });

  it("takes a new id for a changed request", async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError(0, "timeout")).mockResolvedValueOnce(shoot());
    const press = presser(send);
    await expect(press(PRODUCT)).rejects.toBeInstanceOf(ApiError);
    await press({ ...PRODUCT, scene: "interior" });
    expect(idOf(send, 1)).not.toBe(idOf(send, 0));
  });

  it("retries once with a new id after 409 request.idTaken (a refunded try under the kept id)", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new ApiError(500, "failed"))
      .mockRejectedValueOnce(new ApiError(409, "That request was already tried. Start again.", "request.idTaken"))
      .mockResolvedValueOnce(shoot());
    const press = presser(send);
    await expect(press(PRODUCT)).rejects.toBeInstanceOf(ApiError);
    await expect(press(PRODUCT)).resolves.toEqual(shoot());
    expect(send).toHaveBeenCalledTimes(3);
    expect(idOf(send, 1)).toBe(idOf(send, 0));
    expect(idOf(send, 2)).not.toBe(idOf(send, 1));
  });

  it("retries a 409 request.idTaken only once", async () => {
    const taken = new ApiError(409, "That request id is already used.", "request.idTaken");
    const send = vi.fn().mockRejectedValue(taken);
    const press = presser(send);
    await expect(press(PRODUCT)).rejects.toBe(taken);
    expect(send).toHaveBeenCalledTimes(2);
    expect(idOf(send, 1)).not.toBe(idOf(send, 0));
  });

  it("does not retry another 409", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(409, "full", "library.full"));
    await expect(presser(send)(PRODUCT)).rejects.toBeInstanceOf(ApiError);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("gives two overlapping presses of the same request one id (recorded before the send)", async () => {
    const send = vi.fn(() => new Promise<Shoot>(() => {}));
    const press = presser(send);
    void press(PRODUCT);
    void press(PRODUCT);
    expect(send).toHaveBeenCalledTimes(2);
    expect(idOf(send, 1)).toBe(idOf(send, 0));
  });
});

describe("pressAndShow after a failed press", () => {
  it.each([
    ["no answer", new ApiError(0, "timeout")],
    ["a server error", new ApiError(502, "failed")],
  ])("reads the list and the balance again after %s (the shoot may have started)", async (_, error) => {
    vi.mocked(fetchShared).mockClear();
    vi.mocked(loadPlanCredits).mockClear();
    const create = vi.spyOn(photoshootApi, "create").mockRejectedValueOnce(error);
    await expect(pressAndShow("w-unknown", `b-${error.status}`, PRODUCT)).rejects.toBe(error);
    expect(fetchShared).toHaveBeenCalledWith(shootsUrl("w-unknown", `b-${error.status}`), true);
    expect(loadPlanCredits).toHaveBeenCalledWith("w-unknown", true);
    create.mockRestore();
  });

  it("reads the list and the balance once more later, with one timer for repeated presses", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchShared).mockClear();
    vi.mocked(loadPlanCredits).mockClear();
    const create = vi.spyOn(photoshootApi, "create").mockRejectedValue(new ApiError(504, "gateway"));
    await expect(pressAndShow("w-later", "b1", PRODUCT)).rejects.toBeInstanceOf(ApiError);
    await expect(pressAndShow("w-later", "b1", PRODUCT)).rejects.toBeInstanceOf(ApiError);
    expect(fetchShared).toHaveBeenCalledTimes(2);
    expect(loadPlanCredits).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(REREAD_AFTER_UNKNOWN_MS);
    expect(fetchShared).toHaveBeenCalledTimes(3);
    expect(fetchShared).toHaveBeenLastCalledWith(shootsUrl("w-later", "b1"), true);
    expect(loadPlanCredits).toHaveBeenCalledTimes(3);
    expect(loadPlanCredits).toHaveBeenLastCalledWith("w-later", true);
    create.mockRestore();
  });

  it("reads nothing again after a refusal (nothing was charged)", async () => {
    vi.mocked(fetchShared).mockClear();
    vi.mocked(loadPlanCredits).mockClear();
    const create = vi.spyOn(photoshootApi, "create").mockRejectedValueOnce(new ApiError(402, "no credits"));
    await expect(pressAndShow("w-refused", "b1", PRODUCT)).rejects.toBeInstanceOf(ApiError);
    expect(fetchShared).not.toHaveBeenCalled();
    expect(loadPlanCredits).not.toHaveBeenCalled();
    create.mockRestore();
  });
});

describe("readListAgain", () => {
  it("reads the list once more after a failed read, and only once", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchShared).mockClear();
    vi.mocked(fetchShared).mockRejectedValue(new ApiError(0, "offline"));
    readListAgain("w-again", "b1");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchShared).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LIST_RETRY_MS * 3);
    expect(fetchShared).toHaveBeenCalledTimes(2);
    expect(fetchShared).toHaveBeenLastCalledWith(shootsUrl("w-again", "b1"), true);
    vi.mocked(fetchShared).mockReset();
    vi.mocked(fetchShared).mockResolvedValue(undefined);
  });

  it("does not read again after a read that worked", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchShared).mockClear();
    readListAgain("w-again", "b2");
    await vi.advanceTimersByTimeAsync(LIST_RETRY_MS * 3);
    expect(fetchShared).toHaveBeenCalledTimes(1);
  });
});

describe("generateBlocker", () => {
  it("asks for a photo first", () => {
    expect(generateBlocker("product", DEFAULT_PRODUCT)).toBe("Choose a photo");
    expect(generateBlocker("fashion", DEFAULT_FASHION)).toBe("Upload a garment photo to enable generation");
  });

  it("needs a brief for a custom scene", () => {
    const custom = { ...DEFAULT_PRODUCT, sourceKey: "k1", scene: "custom" as const };
    expect(generateBlocker("product", custom)).toBe("Describe the scene to use Custom.");
    expect(generateBlocker("product", { ...custom, brief: "   " })).toBe("Describe the scene to use Custom.");
    expect(generateBlocker("product", { ...custom, brief: "A sunny loft" })).toBeNull();
  });

  it("blocks a brief over the limit", () => {
    const s = { ...DEFAULT_PRODUCT, sourceKey: "k1", brief: "x".repeat(601) };
    expect(generateBlocker("product", s)).toBe("Keep the brief under 600 characters.");
    expect(generateBlocker("product", { ...s, brief: ` ${"x".repeat(600)} ` })).toBeNull();
  });

  it("passes a set-up shoot", () => {
    expect(generateBlocker("product", { ...DEFAULT_PRODUCT, sourceKey: "k1" })).toBeNull();
    expect(generateBlocker("fashion", { ...DEFAULT_FASHION, sourceKey: "g1" })).toBeNull();
  });
});

describe("toRequest", () => {
  it("trims the brief", () => {
    expect(toRequest("product", { ...DEFAULT_PRODUCT, sourceKey: "k1", brief: "  warm light  " })).toEqual({
      kind: "product",
      tier: "base",
      sourceKey: "k1",
      ratio: "1:1",
      scene: "studio",
      brief: "warm light",
    });
  });

  it("leaves out a model nobody picked", () => {
    const r = toRequest("fashion", { ...DEFAULT_FASHION, sourceKey: "g1" });
    expect(r).toEqual({ kind: "fashion", tier: "base", sourceKey: "g1", ratio: "4:5", pose: "fullBody", background: "studioMinimal" });
    expect("model" in r).toBe(false);
    expect(toRequest("fashion", { ...DEFAULT_FASHION, sourceKey: "g1", model: "casual" })).toMatchObject({ model: "casual" });
  });
});

describe("retryRequest", () => {
  it("sends the shoot's own input, tier included", () => {
    const input: ShootRequest = { ...PRODUCT, tier: "ultra" };
    expect(DEFAULT_PRODUCT.tier).toBe("base");
    expect(retryRequest(shoot({ input, tier: "ultra" }))).toEqual(input);
  });
});

describe("shootSteps", () => {
  const states = (s: Shoot | null) => shootSteps(s).map((x) => x.state);
  it("labels the three steps", () => {
    expect(shootSteps(null).map((x) => x.label)).toEqual(["Processing catalog asset", "Composing scene & lighting", "Finishing & color calibration"]);
  });
  it("maps each status", () => {
    expect(states(null)).toEqual(["active", "waiting", "waiting"]);
    expect(states(shoot({ status: "RUNNING" }))).toEqual(["done", "active", "waiting"]);
    expect(states(shoot({ status: "DONE" }))).toEqual(["done", "done", "done"]);
    expect(states(shoot({ status: "FAILED" }))).toEqual(["done", "failed", "waiting"]);
  });
});

describe("labels", () => {
  it("names a shoot by kind and style", () => {
    expect(shootTitle(PRODUCT)).toBe("Product · Studio");
    expect(shootTitle(FASHION)).toBe("Fashion · Three-quarter");
    expect(shootTitle({ ...FASHION, pose: "fullBody" })).toBe("Fashion · Full body");
  });
  it("says how long the wait is", () => {
    expect(waitLine("ultra")).toBe("Four photos at Ultra quality, usually ready in a few minutes.");
    expect(waitLine("base")).toBe("Four photos, usually ready in about a minute.");
  });
  it("builds model names from the shared names", () => {
    expect(LABELS.models).toEqual({ natural: "Léa · natural styling", editorial: "Inès · editorial styling", casual: "Hugo · casual styling" });
    expect(LABELS.formats).toEqual({ "4:5": "Feed portrait", "9:16": "Story / Reel" });
    expect(LABELS.tiers.ultra).toEqual({ name: "Ultra", desc: "Our best, for print and ads" });
  });
});

describe("countByKind", () => {
  it("counts all, product and fashion", () => {
    expect(countByKind([shoot(), shoot({ kind: "fashion" }), shoot()])).toEqual({ all: 3, product: 2, fashion: 1 });
    expect(countByKind([])).toEqual({ all: 0, product: 0, fashion: 0 });
  });
});

describe("keepLinks", () => {
  const MIN = 60_000;
  const prev = shoot({ sourceUrl: "src-old", shots: [{ key: "a", url: "a-old", downloadUrl: "a-dl-old" }] });
  const next = shoot({ sourceUrl: "src-new", shots: [{ key: "a", url: "a-new" }, { key: "b", url: "b-new" }] });

  it("keeps fresh links for the same key", () => {
    const kept = keepLinks(prev, next, 0, 10 * MIN);
    expect(kept.sourceUrl).toBe("src-old");
    expect(kept.shots).toEqual([{ key: "a", url: "a-old", downloadUrl: "a-dl-old" }, { key: "b", url: "b-new" }]);
  });

  it("takes the new links once the old ones are stale", () => {
    expect(keepLinks(prev, next, 0, 51 * MIN)).toBe(next);
  });

  it("takes the new link for a new key, and a download link the old answer lacked", () => {
    const listed = shoot({ shots: [{ key: "a", url: "a-old" }] });
    const opened = shoot({ shots: [{ key: "a", url: "a-new", downloadUrl: "a-dl" }, { key: "c", url: "c-new" }] });
    expect(keepLinks(listed, opened, 0, MIN).shots).toEqual([{ key: "a", url: "a-old", downloadUrl: "a-dl" }, { key: "c", url: "c-new" }]);
  });

  it("takes the new answer when there is no earlier one", () => {
    expect(keepLinks(undefined, next, 0, MIN)).toBe(next);
  });

  it("fills the shots the list left unsigned from the shoot read, and keeps them when the list reads again", () => {
    const listed = shoot({ shots: [{ key: "a", url: "a-old" }, { key: "b" }] });
    const opened = shoot({ shots: [{ key: "a", url: "a-new" }, { key: "b", url: "b-new" }] });
    const kept = keepLinks(listed, opened, 0, MIN);
    expect(kept.shots).toEqual([{ key: "a", url: "a-old" }, { key: "b", url: "b-new" }]);
    expect(keepLinks(kept, listed, 0, MIN).shots).toEqual([{ key: "a", url: "a-old" }, { key: "b", url: "b-new" }]);
  });
});

describe("runningBesides", () => {
  it("sees a running shoot other than the one tracked", () => {
    const a = shoot({ id: "a" });
    const b = shoot({ id: "b", status: "DONE" });
    expect(runningBesides([a, b], "a")).toBe(false);
    expect(runningBesides([a, b], null)).toBe(true);
    expect(runningBesides([a, shoot({ id: "c" })], "a")).toBe(true);
  });
});

describe("linksFetchedAt", () => {
  const MIN = 60_000;
  it("dates kept links by the older answer, so a stale next answer + fresh prev still reads again", () => {
    // prev (the list) fetched at 50 min, next (a cached detail with its download link) fetched at 0; now 55 min.
    expect(linksFetchedAt(50 * MIN, 0, 55 * MIN)).toBe(0);
    expect(stale(linksFetchedAt(50 * MIN, 0, 55 * MIN), 55 * MIN)).toBe(true);
  });
  it("keeps the earlier time when the new answer is newer", () => {
    expect(linksFetchedAt(10 * MIN, 30 * MIN, 30 * MIN)).toBe(10 * MIN);
  });
  it("takes the new answer's time when prev is missing or stale", () => {
    expect(linksFetchedAt(undefined, 30 * MIN, 30 * MIN)).toBe(30 * MIN);
    expect(linksFetchedAt(0, 55 * MIN, 55 * MIN)).toBe(55 * MIN);
  });
});

describe("urls and ids", () => {
  it("builds the endpoints with encoded parts", () => {
    expect(shootsUrl("w 1", "b/2")).toBe("/api/v1/workspaces/w%201/brands/b%2F2/photoshoots");
    expect(shootUrl("w", "b", "x/y")).toBe("/api/v1/workspaces/w/brands/b/photoshoots/x%2Fy");
  });
  it("accepts a shoot id (a UUID) and nothing else", () => {
    const id = crypto.randomUUID();
    expect(isShootId(id)).toBe(true);
    expect(isShootId(id.toUpperCase())).toBe(true);
    expect(isShootId(id.slice(1))).toBe(false);
    expect(isShootId("../admin")).toBe(false);
    expect(isShootId("")).toBe(false);
    expect(isShootId(undefined)).toBe(false);
    expect(isShootId([id])).toBe(false);
  });
});

describe("studio text", () => {
  it("badges a shoot by status with its credits", () => {
    expect(shootBadge(shoot({ status: "RUNNING", credits: 4 }), false)).toBe("Processing · 4 credits");
    expect(shootBadge(shoot({ status: "DONE" }), false)).toBe("Ready");
    expect(shootBadge(shoot({ status: "FAILED", credits: 1 }), false)).toBe("Didn't work · 1 credit refunded");
    // Nothing recorded as charged: no amount.
    expect(shootBadge(shoot({ status: "RUNNING", credits: 0 }), false)).toBe("Processing");
    expect(shootBadge(shoot({ status: "FAILED", credits: 0 }), false)).toBe("Didn't work");
  });

  it("shows an unlimited workspace no amount, though the shoot records its tier's price", () => {
    expect(shootBadge(shoot({ status: "RUNNING", credits: 4 }), true)).toBe("Processing");
    expect(shootBadge(shoot({ status: "DONE", credits: 4 }), true)).toBe("Ready");
    expect(shootBadge(shoot({ status: "FAILED", credits: 4 }), true)).toBe("Didn't work");
    expect(refundLine(4, true)).toBe("Try again, or pick another quality.");
  });

  it("says the refund in the phone's words", () => {
    expect(refundLine(24, false)).toBe("Your 24 credits are back. Try again, or pick another quality.");
    expect(refundLine(1, false)).toBe("Your 1 credit is back. Try again, or pick another quality.");
    expect(refundLine(0, false)).toBe("Try again, or pick another quality.");
  });
});

describe("prependShoot", () => {
  it("puts the new shoot first and drops an older copy of it", () => {
    const a = shoot({ id: "a" });
    const b = shoot({ id: "b" });
    const b2 = shoot({ id: "b", status: "DONE" });
    expect(prependShoot([a, b], b2).map((s) => [s.id, s.status])).toEqual([["b", "DONE"], ["a", "RUNNING"]]);
    expect(prependShoot([], a)).toEqual([a]);
  });
});

describe("pressErrorText", () => {
  it("is silent on a 402 the paywall shows, and says everything else", () => {
    const paywall = new ApiError(402, "Not enough credits", undefined, { insufficientCredits: true, balance: 1, needed: 4 });
    expect(pressErrorText(paywall)).toBeNull();
    // A 402 that isn't ours opened no paywall: say it.
    expect(pressErrorText(new ApiError(402, "Payment required"))).toBe("Payment required");
    expect(pressErrorText(new ApiError(503, "Photoshoots are paused for now."))).toBe("Photoshoots are paused for now.");
    expect(pressErrorText(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});

describe("stagingSummary", () => {
  it("lists a product shoot's format, scene, brief and cost", () => {
    expect(stagingSummary({ ...PRODUCT, brief: "  " }, 4, false)).toEqual([
      { label: "Format", value: "1:1 format" },
      { label: "Scene style", value: "Studio" },
      { label: "Creative brief", value: "No art direction: staged as the scene style describes." },
      { label: "Creation cost", value: "4 credits" },
    ]);
    expect(stagingSummary({ ...PRODUCT, scene: "custom", brief: "Marble, morning light" }, 1, false)[1].value).toBe("Custom");
    expect(stagingSummary({ ...PRODUCT, scene: "custom", brief: "Marble, morning light" }, 1, false).slice(2)).toEqual([
      { label: "Creative brief", value: "Marble, morning light" },
      { label: "Creation cost", value: "1 credit" },
    ]);
  });
  it("lists a fashion shoot's format, model, pose, background and cost", () => {
    expect(stagingSummary(FASHION, 24, false)).toEqual([
      { label: "Format", value: "4:5 format" },
      { label: "Model & styling", value: "A model chosen for the garment" },
      { label: "Pose", value: "Three-quarter" },
      { label: "Background setting", value: "Urban street" },
      { label: "Creation cost", value: "24 credits" },
    ]);
    expect(stagingSummary({ ...FASHION, model: "editorial" }, 24, false)[1].value).toBe("Inès · editorial styling");
  });
});

describe("stagingSummary, unlimited", () => {
  it("leaves out the cost for a workspace that paid nothing", () => {
    expect(stagingSummary(PRODUCT, 4, true).map((r) => r.label)).toEqual(["Format", "Scene style", "Creative brief"]);
    expect(stagingSummary(FASHION, 24, true).map((r) => r.label)).toEqual(["Format", "Model & styling", "Pose", "Background setting"]);
  });
});

describe("stepsDone", () => {
  it("fills the bar by the steps done: a third while running, full when done", () => {
    expect(stepsDone(shootSteps(null))).toBe(0);
    expect(Math.round(stepsDone(shootSteps(shoot({ status: "RUNNING" }))))).toBe(33);
    expect(Math.round(stepsDone(shootSteps(shoot({ status: "FAILED" }))))).toBe(33);
    expect(stepsDone(shootSteps(shoot({ status: "DONE" })))).toBe(100);
  });
});

describe("isRepeatClick", () => {
  it("ignores the second click of a double-click, not a single click or a keyboard press", () => {
    expect(isRepeatClick({ detail: 2 })).toBe(true);
    expect(isRepeatClick({ detail: 3 })).toBe(true);
    expect(isRepeatClick({ detail: 1 })).toBe(false);
    // Enter or Space on a button fires a click with detail 0.
    expect(isRepeatClick({ detail: 0 })).toBe(false);
  });
});

describe("downloadLink", () => {
  it("downloads the attachment link when the shoot read gave one", () => {
    expect(downloadLink({ key: "k", url: "https://cdn/a", downloadUrl: "https://cdn/a?dl=1" })).toEqual({ href: "https://cdn/a?dl=1", label: "Download photo", newTab: false });
  });
  it("opens the image in a new tab without one", () => {
    expect(downloadLink({ key: "k", url: "https://cdn/a" })).toEqual({ href: "https://cdn/a", label: "Open full size", newTab: true });
  });
  it("has nothing to offer for a shot the list left unsigned", () => {
    expect(downloadLink({ key: "k" })).toBeNull();
  });
});
