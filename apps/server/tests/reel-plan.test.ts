import { describe, expect, it } from "vitest";
import { carryStandIns, clipSeconds, planProblems, ReelPlan, reelPrice, reelSeconds, speechSeconds, standInProblems, toVersionBody } from "@/server/reels/plan";

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

  it("won't render a stand-in photo, and only replacing that photo clears it", () => {
    const flagged = ReelPlan.parse({ ...plan(4, 4), scenes: [{ ...scene(4, "w1/b1/dimona.jpg"), standIn: true }, scene(4)] });
    expect(standInProblems(flagged)).toEqual([expect.stringContaining("Scene 1's photo doesn't show")]);
    // The app sending standIn: false (or leaving it out) for the same photo doesn't clear it, nor does a chat revision.
    const sameFalse = ReelPlan.parse({ ...flagged, scenes: [{ ...scene(4, "w1/b1/dimona.jpg"), standIn: false }, scene(4)] });
    expect(carryStandIns(sameFalse, flagged, false).scenes[0].standIn).toBe(true);
    expect(carryStandIns(sameFalse, flagged, true).scenes[0].standIn).toBe(true);
    // Deleting or reordering scenes keeps the flag with the photo.
    const moved = ReelPlan.parse({ ...flagged, scenes: [scene(4), scene(4, "w1/b1/dimona.jpg")] });
    expect(carryStandIns(moved, flagged, false).scenes.map((s) => s.standIn)).toEqual([undefined, true]);
    // A new photo clears it; the app can't add a flag, the scriptwriter can.
    const swapped = ReelPlan.parse({ ...flagged, scenes: [scene(4, "w1/b1/tv.jpg"), { ...scene(4), standIn: true }] });
    expect(carryStandIns(swapped, flagged, true).scenes.map((s) => s.standIn)).toEqual([undefined, true]);
    const carried = carryStandIns(swapped, flagged, false);
    expect(carried.scenes.map((s) => s.standIn)).toEqual([undefined, undefined]);
    expect(standInProblems(carried)).toEqual([]);
  });
});
