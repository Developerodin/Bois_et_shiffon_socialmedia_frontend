import { describe, expect, it } from "vitest";
import { pressLabel, rereadDelay } from "@/components/reels/paid-press";

describe("pressLabel", () => {
  it("waits for the plan before showing a price", () => {
    expect(pressLabel("Create presenter", { loaded: false, unlimited: false }, 5)).toBe("Reading prices…");
  });
  it("shows the price, singular for one", () => {
    expect(pressLabel("Create presenter", { loaded: true, unlimited: false }, 5)).toBe("Create presenter · 5 credits");
    expect(pressLabel("Make a preview with my photos", { loaded: true, unlimited: false }, 1)).toBe("Make a preview with my photos · 1 credit");
  });
  it("shows no price on an unlimited plan", () => {
    expect(pressLabel("Create presenter", { loaded: true, unlimited: true }, 5)).toBe("Create presenter");
  });
});

describe("rereadDelay", () => {
  it("backs off, then gives up so the button stays off", () => {
    expect([0, 1, 2].map(rereadDelay)).toEqual([2000, 5000, 15000]);
    expect(rereadDelay(3)).toBeNull();
  });
});
