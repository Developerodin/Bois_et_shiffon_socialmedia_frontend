import { afterEach, describe, expect, it } from "vitest";
import { nextTier, tierFor } from "@/server/ai/models";

describe("AI_MAX_TIER (cheap test runs)", () => {
  afterEach(() => void delete process.env.AI_MAX_TIER);

  it("leaves tiers alone when unset", () => {
    expect(tierFor("reels.script")).toBe("heavy");
    expect(nextTier("medium")).toBe("heavy");
  });

  it("caps every call and its retries at the set tier", () => {
    process.env.AI_MAX_TIER = "medium";
    expect(tierFor("reels.script")).toBe("medium");
    expect(tierFor("reels.direct")).toBe("medium");
    expect(nextTier("medium")).toBeNull();
    process.env.AI_MAX_TIER = "light";
    expect(tierFor("reels.script")).toBe("light");
    expect(nextTier("light")).toBeNull();
  });
});
