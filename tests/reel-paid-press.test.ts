import { describe, expect, it } from "vitest";
import { pressLabel } from "@/components/reels/paid-press";

describe("pressLabel", () => {
  it("waits for the plan before showing a price", () => {
    expect(pressLabel("Create presenter", { loaded: false, unlimited: false }, 5)).toBe("Reading prices…");
  });
  it("shows the price, singular for one", () => {
    expect(pressLabel("Create presenter", { loaded: true, unlimited: false }, 5)).toBe("Create presenter · 5 credits");
    expect(pressLabel("Preview with my photos", { loaded: true, unlimited: false }, 1)).toBe("Preview with my photos · 1 credit");
  });
  it("shows no price on an unlimited plan", () => {
    expect(pressLabel("Create presenter", { loaded: true, unlimited: true }, 5)).toBe("Create presenter");
  });
});
