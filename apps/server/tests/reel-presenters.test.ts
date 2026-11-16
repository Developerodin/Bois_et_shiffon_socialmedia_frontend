import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findFirst: vi.fn(), createAsset: vi.fn(), voice: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { reelAsset: { findFirst: m.findFirst }, voice: { findFirst: m.voice } } }));
vi.mock("@/server/reels/assets", () => ({ createAsset: m.createAsset, registerAssetKind: vi.fn(), assetsOf: vi.fn() }));

import { planOwnershipProblems } from "@/server/reels/ownership";
import { clearPresenterFlags, planProblems, presenterCuts, ReelPlan, reelPrice, reelSeconds } from "@/server/reels/plan";
import { createPresenter, PresenterRequest } from "@/server/reels/presenters";
import { MODEL_IDS } from "@/server/reels/router";

const scope = { workspaceId: "w1", brandId: "b1" };
const scene = (over: object = {}) => ({ photoKey: "w1/b1/table.jpg", shot: "Wide", direction: "d", onScreenText: "o", voiceText: "un deux trois quatre", transition: "dissolve" as const, ...over });
const plan = (presenter: string, scenes: object[]) => ReelPlan.parse({ title: "T", presenter, template: "", voice: "coral", caption: "c", hashtags: [], scenes });

beforeEach(() => vi.clearAllMocks());

describe("presenter plan rules", () => {
  it("needs a presenter, keeps them to half the scenes and off stand-ins", () => {
    expect(planProblems(plan("none", [scene({ presenter: true }), scene()]), scope)).toContain("Pick a presenter before giving scenes to one.");
    expect(planProblems(plan("p1", [scene({ presenter: true }), scene({ presenter: true })]), scope)).toContain("The presenter can speak in at most 1 of the 2 scenes.");
    expect(planProblems(plan("p1", [scene({ presenter: true, standIn: true }), scene(), scene()]), scope)).toContain("Scene 1 can't have the presenter: its photo doesn't show what it talks about.");
    expect(planProblems(plan("p1", [scene({ presenter: true }), scene()]), scope)).toEqual([]);
  });

  it("prices a presenter scene at 4 credits a second, for at least 4 seconds", () => {
    const p = plan("p1", [scene({ presenter: true }), scene()]); // 4 words: 2 s → 3 s clip; presenter 4 s
    expect(reelSeconds(p)).toBe(7);
    expect(reelPrice(p)).toBe(4 * 4 + 3 * 2);
  });

  it("clears the flags without a presenter, and makes every join a cut with one", () => {
    expect(clearPresenterFlags(plan("none", [scene({ presenter: true }), scene()])).scenes[0].presenter).toBeUndefined();
    expect(presenterCuts(plan("p1", [scene(), scene()])).scenes.map((s) => s.transition)).toEqual(["cut", "cut"]);
    expect(presenterCuts(plan("none", [scene(), scene()])).scenes[0].transition).toBe("dissolve");
  });

  it("never lets a plan name the presenter model", () => expect(MODEL_IDS).not.toContain("seedance-2.5-ref"));
});

describe("presenter ownership", () => {
  it("refuses a presenter this brand doesn't have finished", async () => {
    m.findFirst.mockResolvedValue(null);
    expect(await planOwnershipProblems(plan("p-other", [scene(), scene()]), scope)).toEqual(["Presenter removed: pick another."]);
    expect(m.findFirst).toHaveBeenCalledWith({ where: { id: "p-other", workspaceId: "w1", brandId: "b1", kind: "presenter", status: "DONE" } });
    m.findFirst.mockResolvedValue({ id: "p1" });
    expect(await planOwnershipProblems(plan("p1", [scene(), scene()]), scope)).toEqual([]);
    expect(await planOwnershipProblems(plan("none", [scene(), scene()]), scope)).toEqual([]);
  });
});

describe("creating a presenter", () => {
  it("charges 2 credits for the AI Influencer body built from known traits", async () => {
    await createPresenter({ ...scope, userId: "u1" }, PresenterRequest.parse({ name: "Léa", traits: { gender: "female", hair: "hair_long" } }));
    expect(m.createAsset.mock.calls[0][1]).toMatchObject({ kind: "presenter", credits: 2, input: { name: "Léa", body: { tier: "normal", selection: { gender: ["female"], hair: ["hair_long"] }, medias: [] } } });
    expect(PresenterRequest.safeParse({ name: "X", traits: { gender: "alien" } }).success).toBe(false);
    expect(PresenterRequest.safeParse({ name: "X", traits: { brief: "anything" } }).success).toBe(false);
  });
});

describe("voice ownership", () => {
  it("refuses a voice outside our list", async () => {
    expect(await planOwnershipProblems({ ...plan("none", [scene(), scene()]), voice: "eleven:someoneElse" }, scope)).toEqual(["Voice not available: pick another."]);
    expect(await planOwnershipProblems({ ...plan("none", [scene(), scene()]), voice: "eleven:EXAVITQu4vr4xnSDxMaL" }, scope)).toEqual([]);
  });

  it("refuses a cloned voice this workspace no longer has", async () => {
    m.voice.mockResolvedValue(null); // archived, or another workspace's
    expect(await planOwnershipProblems({ ...plan("none", [scene(), scene()]), voice: "clone:v1" }, scope)).toEqual(["Voice not available: pick another."]);
    expect(m.voice).toHaveBeenCalledWith({ where: { id: "v1", workspaceId: "w1", archivedAt: null, providerVoiceId: { not: null } } });
    m.voice.mockResolvedValue({ id: "v1", providerVoiceId: "el1" });
    expect(await planOwnershipProblems({ ...plan("none", [scene(), scene()]), voice: "clone:v1" }, scope)).toEqual([]);
  });
});
