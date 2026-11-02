import { describe, expect, it } from "vitest";
import { ShootRequest, shootPrompt } from "@/server/photoshoot/shoot";
import { CREDIT_USD, TIERS, underFloor } from "@/server/photoshoot/tiers";

describe("photoshoot tiers", () => {
  it("keeps every tier over the margin floor", () => {
    expect(underFloor()).toEqual([]);
  });

  it("refuses a tier priced under the floor", () => {
    const cheap = { ...TIERS, base: { ...TIERS.base, product: { ...TIERS.base.product, costUsd: TIERS.base.credits * CREDIT_USD } } };
    expect(underFloor(cheap)).toEqual(["base/product: 0%"]);
  });

  it("asks for a description when the scene is custom", () => {
    const base = { kind: "product", tier: "base", sourceKey: "w/b/a.jpg", ratio: "4:5", scene: "custom" } as const;
    expect(ShootRequest.safeParse(base).success).toBe(false);
    expect(ShootRequest.safeParse({ ...base, brief: "Sur une terrasse au soleil" }).success).toBe(true);
  });

  it("keeps the product identical in the prompt", () => {
    const r = ShootRequest.parse({ kind: "product", tier: "ultra", sourceKey: "w/b/a.jpg", ratio: "1:1", scene: "studio" });
    expect(shootPrompt(r)).toContain("Keep the product identical");
  });
});
