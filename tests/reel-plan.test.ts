import { describe, expect, it } from "vitest";
import { clipSeconds, planProblems, ReelPlan, reelPrice, reelSeconds, speechSeconds, toVersionBody } from "@/server/reels/plan";

const scope = { workspaceId: "w1", brandId: "b1" };
const words = (n: number) => Array.from({ length: n }, (_, i) => `mot${i}`).join(" ");
const scene = (n: number, photoKey = "w1/b1/0b4b2c1e-6a1d-4f7e-9a40-0c6f2d8e1a11.jpg") => ({ photoKey, shot: "Wide", direction: "Slow push in", onScreenText: "Acacia", voiceText: words(n) });
const plan = (...voices: number[]) => ReelPlan.parse({ title: "Bunting", presenter: "none", template: "spotlight", voice: "fr-1", scenes: voices.map((n) => scene(n)), caption: "Une table.", hashtags: ["#bois"] });

describe("reel plan", () => {
  it("prices from the voiceover: 15/13/9 words → 8+7+5 s → 40 credits", () => {
    const p = plan(15, 13, 9);
    expect(reelSeconds(p)).toBe(20);
    expect(reelPrice(p)).toBe(40);
  });

  it("clips are whole seconds between 3 and 15", () => {
    expect(clipSeconds(2.1)).toBe(3);
    expect(clipSeconds(7.2)).toBe(8);
    expect(clipSeconds(16)).toBe(15);
  });

  it("reads French at two words a second", () => {
    expect(speechSeconds(words(38))).toBe(19);
  });

  it("flags a scene too long to voice in 15 s", () => {
    expect(planProblems(plan(34, 10), scope)).toEqual(["Scene 1's voiceover runs ~17 s; keep it under 30 words (15 s)."]);
    expect(planProblems(plan(20, 10), scope)).toEqual([]);
  });

  it("refuses another brand's photos", () => {
    const p = { ...plan(10, 10), scenes: [scene(10, "w2/b9/0b4b2c1e-6a1d-4f7e-9a40-0c6f2d8e1a11.jpg"), scene(10, "w1/b1/../x.jpg")] };
    expect(planProblems(p, scope)).toEqual(["Scene 1 uses a photo this brand doesn't have.", "Scene 2 uses a photo this brand doesn't have."]);
  });

  it("needs at least two scenes", () => {
    expect(() => plan(10)).toThrow();
  });

  it("turns into a version body the reel rules accept", () => {
    const b = toVersionBody(plan(10, 12));
    expect(b.script).toHaveLength(2);
    expect(b.hook).toBe("Acacia");
    expect(b.caption).toBe("Une table.");
  });
});
