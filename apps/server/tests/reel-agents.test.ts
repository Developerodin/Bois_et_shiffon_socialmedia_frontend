import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/provider", async (orig) => ({ ...(await orig<object>()), generateObject: vi.fn(async (_ctx: unknown, input: { mock: unknown }) => input.mock) }));

import { directionProblems, directScenes, partialDraft, scriptProblems, writePlan } from "@/server/reels/agents";
import { ReelPlan } from "@/server/reels/plan";

const scope = { workspaceId: "w1", brandId: "b1" };
const photos = [
  { key: "w1/b1/table.jpg", title: "Table Acacia Bunting" },
  { key: "w1/b1/bench.jpg", title: "Banc Bunting" },
];
const scene = (voiceText: string, over: object = {}) => ({ photoKey: photos[0].key, shot: "Wide", direction: "push in", onScreenText: "Votre table ?", voiceText, ...over });
const plan = (scenes: object[]) => ReelPlan.parse({ title: "T", presenter: "none", template: "spotlight", voice: "coral", caption: "c", hashtags: [], scenes });

describe("reel scriptwriter checks", () => {
  it("wants a short hook to open", () => {
    const long = plan([scene("Bienvenue chez nous, aujourd'hui nous allons vous présenter notre toute nouvelle table. Elle est belle."), scene("Découvrez-la.")]);
    expect(scriptProblems(long, photos, scope)).toContain("Scene 1 must open with a hook of at most 10 words.");
    const good = plan([scene("Et si votre table racontait une histoire ? Du bois massif."), scene("Découvrez-la.")]);
    expect(scriptProblems(good, photos, scope)).toEqual([]);
  });

  it("only uses the photos it was given", () => {
    const p = plan([scene("Une question ?", { photoKey: "w1/b1/other.jpg" }), scene("Oui.")]);
    expect(scriptProblems(p, photos, scope)).toContain("Scene 1 must use one of the given photos.");
  });

  it("returns a valid plan", async () => {
    const { plan: p, reply } = await writePlan(scope, { knowledge: "k", photos, idea: { title: "Idée", summary: "s", angle: "a" } });
    expect(p.scenes).toHaveLength(2);
    expect(reply).toBeTruthy();
  });

  it("keeps the person's voice when revising", async () => {
    const current = { ...plan([scene("Une question ?"), scene("Oui.")]), voice: "sage", template: "material" };
    const { plan: p } = await writePlan(scope, { knowledge: "k", photos, current, message: "plus court" });
    expect([p.voice, p.template]).toEqual(["sage", "material"]);
    const { plan: fresh } = await writePlan(scope, { knowledge: "k", photos });
    expect(fresh.voice).toBe("coral");
  });
});

describe("reel director", () => {
  it("routes each scene from its kind and keeps the model-ready prompt", async () => {
    const p = await directScenes(scope, plan([scene("Une question ?"), scene("Oui.")]));
    expect(p.scenes.map((s) => [s.kind, s.model])).toEqual([["detail", "kling-3-std"], ["detail", "kling-3-std"]]);
    expect(p.scenes[0].prompt).toMatch(/Keep the product/);
  });

  it("rejects negative phrasing and the wrong scene count", () => {
    expect(directionProblems([{ prompt: "pan across, no people" }], 1)).toEqual([expect.stringMatching(/^Scene 1: .*positively/)]);
    expect(directionProblems([{ prompt: "pan" }], 2)).toEqual(["Write exactly 2 scenes."]);
  });
});

describe("streamed draft", () => {
  it("reads what the scriptwriter has written so far, scene by scene", () => {
    expect(partialDraft("")).toBeNull();
    expect(partialDraft('{"rep')).toBeNull();
    expect(partialDraft('{"reply":"Voici une')).toEqual({ reply: "Voici une", title: "", scenes: [] });
    expect(partialDraft(String.raw`{"reply":"Il dit \"oui\"","titl`)).toEqual({ reply: 'Il dit "oui"', title: "", scenes: [] });
    expect(partialDraft('{"reply":"Voici.","title":"Dimona","voice":"sage","caption":"c","hashtags":["#a"],"scenes":[{"photoKey":"k","shot":"Wide","direction":"d","onScreenText":"o","voiceText":"Envie d')).toEqual({
      reply: "Voici.", title: "Dimona", scenes: [{ shot: "Wide", voiceText: "Envie d" }],
    });
    expect(partialDraft(String.raw`{"reply":"caf\u00e`)).toEqual({ reply: "caf", title: "", scenes: [] });
  });
});

describe("one subject per reel", () => {
  const catalogue = [
    { key: "w1/b1/table.jpg", title: "Table Bunting", product: "Table Bunting" },
    { key: "w1/b1/bench.jpg", title: "Banc Bunting", product: "Banc Bunting" },
    { key: "w1/b1/upload.jpg", title: "Wide" },
  ];
  const two = (a: string, b: string) => plan([scene("Votre table ?", { photoKey: a }), scene("Découvrez-la.", { photoKey: b })]);
  it("refuses scenes of different products unless the person asked for several", () => {
    expect(scriptProblems(two("w1/b1/table.jpg", "w1/b1/bench.jpg"), catalogue, scope).join(" ")).toMatch(/same product/);
    expect(scriptProblems(two("w1/b1/table.jpg", "w1/b1/bench.jpg"), catalogue, scope, true).join(" ")).not.toMatch(/same product/);
  });
  it("accepts one product, and an uploaded photo alongside it", () => {
    expect(scriptProblems(two("w1/b1/table.jpg", "w1/b1/table.jpg"), catalogue, scope).join(" ")).not.toMatch(/same product/);
    expect(scriptProblems(two("w1/b1/table.jpg", "w1/b1/upload.jpg"), catalogue, scope).join(" ")).not.toMatch(/same product/);
  });
});
