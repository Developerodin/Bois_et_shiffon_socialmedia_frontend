import { describe, expect, it, vi } from "vitest";
import type { Shoot, ShootRequest } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { NetworkError } from "@/lib/net";
import { stale } from "@/components/workspace/use-job";
import { shootUrl, shootsUrl } from "@/components/photoshoot/api";
import { LABELS, shootTitle, waitLine } from "@/components/photoshoot/labels";
import { makePresser } from "@/components/photoshoot/press";
import {
  DEFAULT_FASHION,
  DEFAULT_PRODUCT,
  countByKind,
  generateBlocker,
  isShootId,
  keepLinks,
  linksFetchedAt,
  retryRequest,
  shootSteps,
  toRequest,
} from "@/components/photoshoot/shoot";

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

  it.each([402, 503, 429])("takes a new id after the server answered %i", async (status) => {
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

  it("gives two overlapping presses of the same request one id (recorded before the send)", async () => {
    const send = vi.fn(() => new Promise<Shoot>(() => {}));
    const press = presser(send);
    void press(PRODUCT);
    void press(PRODUCT);
    expect(send).toHaveBeenCalledTimes(2);
    expect(idOf(send, 1)).toBe(idOf(send, 0));
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
