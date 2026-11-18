import { describe, expect, it } from "vitest";
import { SIGNED_LINK_STALE_MS, stale } from "@/lib/signed-links";

describe("stale", () => {
  it("is true once an answer's signed links are 50 minutes old", () => {
    const MIN = 60_000;
    expect(SIGNED_LINK_STALE_MS).toBe(50 * MIN);
    expect(stale(0, 49 * MIN)).toBe(false);
    expect(stale(0, 51 * MIN)).toBe(true);
  });
});
